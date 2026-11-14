import { beforeEach, describe, expect, it } from 'vitest';
import { crearAgente, MAX_ITERACIONES, RESPUESTAS } from '../../src/agent/agent.service.js';
import { SYSTEM_PROMPT } from '../../src/agent/prompts/system-prompt.js';
import { prisma } from '../../src/lib/prisma.js';
import { crearCliente, limpiarBd } from '../helpers/db.js';
import { herramienta, LlmFalso, rechazo, texto } from '../helpers/llm-falso.js';

const TEL = '+573001112233';

describe('agente de crédito', () => {
  let llm: LlmFalso;
  let agente: ReturnType<typeof crearAgente>;
  const decir = (t: string) => agente.procesarMensaje({ telefono: TEL, texto: t });

  beforeEach(async () => {
    await limpiarBd();
    llm = new LlmFalso();
    agente = crearAgente(llm);
  });

  describe('flujo completo', () => {
    it('cliente nuevo: consentimiento → cédula → datos → solicitud EN_REVISION por WhatsApp', async () => {
      llm.programar(texto('Hola, ¿autorizas el tratamiento de tus datos?'));
      expect((await decir('hola')).respuesta).toContain('autorizas');

      llm.programar(
        herramienta('registrar_consentimiento', { acepta: true }),
        texto('Gracias. ¿Tu cédula?'),
      );
      await decir('sí, acepto');

      llm.programar(herramienta('identificar_cliente', { cedula: '1.234.567.890' }), () => {
        expect(llm.ultimoResultado().contenido).toEqual({ tipo: 'NUEVO' });
        return texto('¿Quieres radicar una solicitud?');
      });
      await decir('1.234.567.890');

      llm.programar(
        herramienta('crear_solicitud', {
          nombre_completo: 'Camila Andrea Torres Niño',
          municipio: 'Zipaquirá',
          monto_solicitado: 3_000_000,
        }),
        texto('¡Listo! Tu solicitud quedó en revisión.'),
      );
      const final = await decir('sí, confirmo');

      expect(final.respuesta).toContain('en revisión');
      expect(llm.ultimoResultado().contenido).toMatchObject({
        registrada: true,
        estado: 'EN_REVISION',
      });

      const solicitud = await prisma.solicitud.findFirstOrThrow();
      expect(solicitud).toMatchObject({
        cedula: '1234567890',
        nombreCompleto: 'Camila Andrea Torres Niño',
        telefono: TEL, // el teléfono sale del canal, no de lo que dice la persona
        tipoCliente: 'NUEVO',
        estado: 'EN_REVISION',
        canal: 'WHATSAPP',
      });
      expect(solicitud.montoSolicitado?.toNumber()).toBe(3_000_000);

      const conversacion = await prisma.conversacion.findFirstOrThrow();
      expect(conversacion).toMatchObject({ cedula: '1234567890', solicitudId: solicitud.id });
      expect(conversacion.consentimientoAt).not.toBeNull();
    });
  });

  describe('identificar_cliente', () => {
    async function identificar(cedula: string) {
      llm.programar(
        herramienta('registrar_consentimiento', { acepta: true }),
        herramienta('identificar_cliente', { cedula }),
        texto('ok'),
      );
      await decir('acepto, mi cédula es ' + cedula);
      return llm.ultimoResultado();
    }

    it('preferencial: devuelve solo el primer nombre y el cupo (minimización de datos)', async () => {
      await crearCliente({
        cedula: '1010101010',
        nombreCompleto: 'María Fernanda Rojas Gil',
        telefono: TEL,
        cupoPreaprobado: 8_000_000,
      });

      const { contenido, esError } = await identificar('1010101010');

      expect(esError).toBe(false);
      expect(contenido).toEqual({
        tipo: 'PREFERENCIAL',
        nombre: 'María',
        cupo_preaprobado: 8_000_000,
      });
    });

    it('antiguo: devuelve el primer nombre sin cupo', async () => {
      await crearCliente({
        cedula: '2010101010',
        nombreCompleto: 'Pedro Antonio Gómez',
        telefono: TEL,
      });

      const { contenido } = await identificar('2010101010');

      expect(contenido).toEqual({ tipo: 'ANTIGUO', nombre: 'Pedro' });
    });

    it('rechaza una cédula con formato inválido', async () => {
      const { contenido, esError } = await identificar('12ab');

      expect(esError).toBe(true);
      expect(contenido.error).toMatch(/cédula no es válida/);
    });

    it('no consulta la cédula sin autorización de datos', async () => {
      await crearCliente({ cedula: '1010101010', cupoPreaprobado: 8_000_000 });
      llm.programar(herramienta('identificar_cliente', { cedula: '1010101010' }), texto('ok'));

      await decir('mi cédula es 1010101010');

      const { contenido, esError } = llm.ultimoResultado();
      expect(esError).toBe(true);
      expect(contenido.error).toMatch(/autorización/);
      expect(JSON.stringify(contenido)).not.toContain('8000000');
    });
  });

  describe('registrar_consentimiento', () => {
    it('si la persona no acepta, no se registra el consentimiento', async () => {
      llm.programar(
        herramienta('registrar_consentimiento', { acepta: false }),
        texto('Entendido.'),
      );

      await decir('no acepto');

      expect(llm.ultimoResultado().contenido).toMatchObject({ registrado: false });
      const conversacion = await prisma.conversacion.findFirstOrThrow();
      expect(conversacion.consentimientoAt).toBeNull();
    });
  });

  describe('crear_solicitud', () => {
    const datos = {
      nombre_completo: 'Camila Torres',
      municipio: 'Zipaquirá',
      monto_solicitado: null,
    };

    async function prepararIdentificado(cedula = '1234567890') {
      llm.programar(
        herramienta('registrar_consentimiento', { acepta: true }),
        herramienta('identificar_cliente', { cedula }),
        texto('ok'),
      );
      await decir('acepto, ' + cedula);
    }

    it('no crea la solicitud si la persona no se ha identificado', async () => {
      llm.programar(
        herramienta('registrar_consentimiento', { acepta: true }),
        herramienta('crear_solicitud', datos),
        texto('ok'),
      );

      await decir('quiero un crédito');

      expect(llm.ultimoResultado()).toMatchObject({ esError: true });
      expect(await prisma.solicitud.count()).toBe(0);
    });

    it('devuelve los errores de validación para que el agente pida corregir', async () => {
      await prepararIdentificado();
      llm.programar(
        herramienta('crear_solicitud', { ...datos, nombre_completo: 'Camila' }),
        texto('ok'),
      );

      await decir('Camila, de Zipaquirá');

      const { contenido, esError } = llm.ultimoResultado();
      expect(esError).toBe(true);
      expect(contenido.detalles).toContain('Incluye al menos un nombre y un apellido');
      expect(await prisma.solicitud.count()).toBe(0);
    });

    it('si ya hay una solicitud en revisión, informa sin romper la conversación', async () => {
      await prisma.solicitud.create({
        data: {
          cedula: '1234567890',
          nombreCompleto: 'Camila Torres',
          telefono: TEL,
          municipio: 'Zipaquirá',
          tipoCliente: 'NUEVO',
          consentimientoDatosAt: new Date(),
        },
      });
      await prepararIdentificado();
      llm.programar(
        herramienta('crear_solicitud', datos),
        texto('Ya tienes una solicitud en revisión.'),
      );

      const salida = await decir('sí');

      expect(salida.respuesta).toContain('en revisión');
      expect(llm.ultimoResultado().contenido.error).toMatch(/ya tiene una solicitud en revisión/);
      expect(await prisma.solicitud.count()).toBe(1);
    });

    it('la solicitud guarda la fecha real en que la persona autorizó (no la de radicación)', async () => {
      await prepararIdentificado();
      const autorizo = new Date(Date.now() - 10 * 60 * 1000);
      await prisma.conversacion.updateMany({ data: { consentimientoAt: autorizo } });
      llm.programar(herramienta('crear_solicitud', datos), texto('ok'));

      await decir('sí, confirmo');

      const solicitud = await prisma.solicitud.findFirstOrThrow();
      expect(solicitud.consentimientoDatosAt).toEqual(autorizo);
    });

    it('solo radica una solicitud por conversación', async () => {
      await prepararIdentificado();
      llm.programar(
        herramienta('crear_solicitud', datos),
        herramienta('crear_solicitud', datos),
        texto('ok'),
      );

      await decir('sí');

      expect(llm.ultimoResultado().contenido.error).toMatch(/ya se radicó/);
      expect(await prisma.solicitud.count()).toBe(1);
    });
  });

  describe('robustez del loop', () => {
    it('si el modelo declina, responde con un mensaje seguro', async () => {
      llm.programar(rechazo());
      expect((await decir('algo raro')).respuesta).toBe(RESPUESTAS.noPuedoAyudar);
    });

    it('después de un rechazo, la conversación sigue funcionando', async () => {
      llm.programar(rechazo());
      await decir('algo raro');

      llm.programar(texto('Claro, te ayudo con tu crédito.'));
      const salida = await decir('ok, quiero un crédito');

      expect(salida.respuesta).toBe('Claro, te ayudo con tu crédito.');
      const conversacion = await prisma.conversacion.findFirstOrThrow();
      expect(conversacion.mensajes).not.toContainEqual({ role: 'assistant', content: [] });
    });

    it(`corta el loop tras ${MAX_ITERACIONES} iteraciones de herramientas`, async () => {
      llm.programar(
        ...Array.from({ length: MAX_ITERACIONES }, () =>
          herramienta('registrar_consentimiento', { acepta: true }),
        ),
      );

      const salida = await decir('hola');

      expect(llm.llamadas).toHaveLength(MAX_ITERACIONES);
      expect(salida.respuesta).toBe(RESPUESTAS.errorTecnico);
    });

    it('herramienta desconocida → error para el modelo, no excepción', async () => {
      llm.programar(herramienta('aprobar_credito', { monto: 1 }), texto('No puedo hacer eso.'));

      await decir('apruébame ya');

      expect(llm.ultimoResultado()).toMatchObject({ esError: true });
    });

    it('si la API falla, responde un error técnico y no guarda un historial a medias', async () => {
      llm.programar(() => {
        throw new Error('API caída');
      });

      const salida = await decir('hola');

      expect(salida.respuesta).toBe(RESPUESTAS.errorTecnico);
      const conversacion = await prisma.conversacion.findFirstOrThrow();
      expect(conversacion.mensajes).toEqual([]);
    });

    it('rechaza mensajes vacíos o demasiado largos sin llamar al modelo', async () => {
      expect((await decir('   ')).respuesta).toBe(RESPUESTAS.mensajeVacio);
      expect((await decir('a'.repeat(1001))).respuesta).toBe(RESPUESTAS.mensajeLargo);
      expect(llm.llamadas).toHaveLength(0);
    });
  });

  describe('memoria de la conversación', () => {
    it('el historial es append-only y el system prompt no cambia entre turnos', async () => {
      llm.programar(texto('Hola, ¿en qué te ayudo?'));
      await decir('hola');
      llm.programar(texto('Claro.'));
      await decir('¿cuánto prestan?');

      const [primera, segunda] = llm.llamadas;
      // El segundo turno incluye el primero tal cual, más el mensaje nuevo.
      expect(segunda?.messages.slice(0, 2)).toEqual([
        primera?.messages[0],
        { role: 'assistant', content: expect.any(Array) },
      ]);
      expect(segunda?.messages.at(-1)).toEqual({ role: 'user', content: '¿cuánto prestan?' });
      expect(segunda?.system).toEqual(primera?.system);
      expect(JSON.stringify(primera?.system)).toContain(SYSTEM_PROMPT.slice(0, 50));
    });

    it('cada teléfono tiene su propia conversación', async () => {
      llm.programar(texto('a'), texto('b'));
      await decir('hola');
      await agente.procesarMensaje({ telefono: '+573009998877', texto: 'hola' });

      expect(await prisma.conversacion.count()).toBe(2);
      expect(llm.llamadas[1]?.messages).toHaveLength(1);
    });

    it('mensajes simultáneos del mismo teléfono se procesan en orden', async () => {
      let liberar: () => void = () => undefined;
      const espera = new Promise<void>((r) => (liberar = r));
      llm.programar(async () => {
        await espera;
        return texto('primera');
      }, texto('segunda'));

      const p1 = decir('mensaje 1');
      const p2 = decir('mensaje 2');
      liberar();
      await Promise.all([p1, p2]);

      // La segunda llamada ya ve el historial completo de la primera.
      expect(llm.llamadas[1]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    });
  });
});
