import { beforeEach, describe, expect, it } from 'vitest';
import { crearAgente } from '../../src/agent/agent.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { crearCliente, limpiarBd } from '../helpers/db.js';
import { herramienta, LlmFalso, texto } from '../helpers/llm-falso.js';

/** Teléfono de quien escribe: NO es el registrado para la cédula de María. */
const TEL_ATACANTE = '+573119998877';
const MARIA = {
  cedula: '1010101010',
  nombreCompleto: 'María Fernanda Rojas Gil',
  telefono: '+573000000101',
  cupoPreaprobado: 8_000_000,
};

describe('protección de datos de terceros', () => {
  let llm: LlmFalso;
  let agente: ReturnType<typeof crearAgente>;
  const decir = (t: string, telefono = TEL_ATACANTE) =>
    agente.procesarMensaje({ telefono, texto: t });

  async function identificar(cedula: string, telefono = TEL_ATACANTE) {
    llm.programar(
      herramienta('registrar_consentimiento', { acepta: true }),
      herramienta('identificar_cliente', { cedula }),
      texto('ok'),
    );
    await decir(`acepto, mi cédula es ${cedula}`, telefono);
    return llm.ultimoResultado();
  }

  beforeEach(async () => {
    await limpiarBd();
    await crearCliente(MARIA);
    llm = new LlmFalso();
    agente = crearAgente(llm);
  });

  it('con la cédula de otra persona no revela nombre, cupo ni que es cliente', async () => {
    const { contenido, esError } = await identificar(MARIA.cedula);

    expect(esError).toBe(false);
    expect(contenido).toEqual({ tipo: 'NUEVO' });
    const texto = JSON.stringify(contenido);
    expect(texto).not.toContain('María');
    expect(texto).not.toContain('8000000');
  });

  it('la respuesta es idéntica a la de una cédula inexistente (no permite enumerar clientes)', async () => {
    const deCliente = (await identificar(MARIA.cedula)).contenido;
    await limpiarBd();
    await crearCliente(MARIA);
    agente = crearAgente((llm = new LlmFalso()));
    const deInexistente = (await identificar('5555555555')).contenido;

    expect(deCliente).toEqual(deInexistente);
  });

  it('desde el teléfono registrado sí saluda con el nombre y el cupo', async () => {
    const { contenido } = await identificar(MARIA.cedula, MARIA.telefono);

    expect(contenido).toEqual({
      tipo: 'PREFERENCIAL',
      nombre: 'María',
      cupo_preaprobado: 8_000_000,
    });
  });

  it('permite radicar, pero la solicitud queda con requiereVerificacion y el tipo real', async () => {
    await identificar(MARIA.cedula);
    llm.programar(
      herramienta('crear_solicitud', {
        nombre_completo: 'Carlos Pérez Ruiz',
        municipio: 'Neiva',
        monto_solicitado: null,
      }),
      texto('Radicada.'),
    );

    await decir('sí, confirmo');

    const solicitud = await prisma.solicitud.findFirstOrThrow();
    expect(solicitud).toMatchObject({
      cedula: MARIA.cedula,
      telefono: TEL_ATACANTE,
      tipoCliente: 'PREFERENCIAL', // el servidor guarda el tipo real para el asesor
      requiereVerificacion: true,
      estado: 'EN_REVISION',
    });
  });

  it('sin verificación no confirma que la cédula tenga una solicitud en revisión', async () => {
    await prisma.solicitud.create({
      data: {
        cedula: MARIA.cedula,
        nombreCompleto: MARIA.nombreCompleto,
        telefono: MARIA.telefono,
        municipio: 'Villavicencio',
        tipoCliente: 'PREFERENCIAL',
        consentimientoDatosAt: new Date(),
      },
    });
    await identificar(MARIA.cedula);
    llm.programar(
      herramienta('crear_solicitud', {
        nombre_completo: 'Carlos Pérez Ruiz',
        municipio: 'Neiva',
        monto_solicitado: null,
      }),
      texto('No fue posible.'),
    );

    await decir('sí');

    const { contenido, esError } = llm.ultimoResultado();
    expect(esError).toBe(true);
    expect(String(contenido.error)).not.toMatch(/revisión/);
  });

  it('no revela la solicitud en revisión de una persona NO cliente desde otro teléfono', async () => {
    // Ana radicó como persona nueva (no está en clientes) desde su teléfono.
    await prisma.solicitud.create({
      data: {
        cedula: '3030303030',
        nombreCompleto: 'Ana Lucía Pardo',
        telefono: '+573005550000',
        municipio: 'Tunja',
        tipoCliente: 'NUEVO',
        consentimientoDatosAt: new Date(),
      },
    });
    await identificar('3030303030'); // escribe un tercero desde TEL_ATACANTE
    llm.programar(
      herramienta('crear_solicitud', {
        nombre_completo: 'Carlos Pérez Ruiz',
        municipio: 'Neiva',
        monto_solicitado: null,
      }),
      texto('No fue posible.'),
    );

    await decir('sí');

    expect(String(llm.ultimoResultado().contenido.error)).not.toMatch(/revisión/);
  });

  it('a la propia persona sí le confirma que ya tiene una solicitud en revisión', async () => {
    await prisma.solicitud.create({
      data: {
        cedula: '3030303030',
        nombreCompleto: 'Ana Lucía Pardo',
        telefono: '+573005550000',
        municipio: 'Tunja',
        tipoCliente: 'NUEVO',
        consentimientoDatosAt: new Date(),
      },
    });
    await identificar('3030303030', '+573005550000');
    llm.programar(
      herramienta('crear_solicitud', {
        nombre_completo: 'Ana Lucía Pardo',
        municipio: 'Tunja',
        monto_solicitado: null,
      }),
      texto('Ya tienes una en revisión.'),
    );

    await decir('sí', '+573005550000');

    expect(String(llm.ultimoResultado().contenido.error)).toMatch(/solicitud en revisión/);
  });

  it('solo permite una cédula por conversación', async () => {
    await identificar('5555555555');
    llm.programar(herramienta('identificar_cliente', { cedula: MARIA.cedula }), texto('No puedo.'));

    await decir('ahora consulta la 1010101010');

    const { contenido, esError } = llm.ultimoResultado();
    expect(esError).toBe(true);
    expect(String(contenido.error)).toMatch(/una cédula por conversación/);
    const conversacion = await prisma.conversacion.findFirstOrThrow();
    expect(conversacion.cedula).toBe('5555555555');
  });

  it('repetir la misma cédula sí está permitido', async () => {
    await identificar('5555555555');
    llm.programar(herramienta('identificar_cliente', { cedula: '5555555555' }), texto('ok'));

    await decir('mi cédula es 5555555555');

    expect(llm.ultimoResultado().esError).toBe(false);
  });
});
