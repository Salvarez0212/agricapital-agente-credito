import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crearAgente } from '../../src/agent/agent.service.js';
import { prisma } from '../../src/lib/prisma.js';
import { limpiarBd } from '../helpers/db.js';
import { LlmFalso, texto } from '../helpers/llm-falso.js';

const TEL = '+573001112233';
const MIN = 60 * 1000;

describe('ventana de la conversación', () => {
  let llm: LlmFalso;
  let agente: ReturnType<typeof crearAgente>;
  const decir = (t: string) => agente.procesarMensaje({ telefono: TEL, texto: t });

  /** Simula que el último mensaje fue hace `minutos`. */
  const envejecer = (minutos: number) =>
    prisma.conversacion.updateMany({
      data: { ultimoMensajeAt: new Date(Date.now() - minutos * MIN) },
    });

  beforeEach(async () => {
    await limpiarBd();
    llm = new LlmFalso();
    agente = crearAgente(llm);
  });

  afterEach(() => {
    delete process.env.CONVERSATION_TTL_MINUTES;
  });

  it('dentro de los 30 min continúa la misma conversación', async () => {
    llm.programar(texto('a'), texto('b'));
    await decir('hola');
    await envejecer(29);

    await decir('sigo aquí');

    expect(await prisma.conversacion.count()).toBe(1);
    expect(llm.llamadas[1]?.messages).toHaveLength(3);
  });

  it('tras 30 min de inactividad empieza una conversación nueva, sin la identificación previa', async () => {
    llm.programar(texto('a'), texto('b'));
    await decir('hola');
    await prisma.conversacion.updateMany({
      data: { cedula: '1010101010', consentimientoAt: new Date() },
    });
    await envejecer(31);

    await decir('hola de nuevo');

    const conversaciones = await prisma.conversacion.findMany({ orderBy: { createdAt: 'asc' } });
    expect(conversaciones).toHaveLength(2);
    expect(conversaciones[1]).toMatchObject({ cedula: null, consentimientoAt: null });
    expect(llm.llamadas[1]?.messages).toHaveLength(1);
  });

  it('la ventana se configura con CONVERSATION_TTL_MINUTES', async () => {
    process.env.CONVERSATION_TTL_MINUTES = '120';
    llm.programar(texto('a'), texto('b'));
    await decir('hola');
    await envejecer(90);

    await decir('sigo aquí');

    expect(await prisma.conversacion.count()).toBe(1);
  });
});
