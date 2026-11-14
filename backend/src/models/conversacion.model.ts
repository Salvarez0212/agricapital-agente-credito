import type { Conversacion, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

/**
 * Minutos de inactividad tras los cuales la conversación empieza de cero
 * (saludo, autorización y cédula). Cada mensaje reinicia el reloj.
 * Corto a propósito: evita arrastrar contexto viejo y que otra persona con el
 * mismo celular herede una sesión ya identificada.
 */
export function ventanaConversacionMs(): number {
  const minutos = Number(process.env.CONVERSATION_TTL_MINUTES);
  return (Number.isFinite(minutos) && minutos > 0 ? minutos : 30) * 60 * 1000;
}

export const conversacionModel = {
  findActivaPorTelefono(telefono: string): Promise<Conversacion | null> {
    return prisma.conversacion.findFirst({
      where: {
        telefono,
        ultimoMensajeAt: { gt: new Date(Date.now() - ventanaConversacionMs()) },
      },
      orderBy: { ultimoMensajeAt: 'desc' },
    });
  },

  create(telefono: string): Promise<Conversacion> {
    return prisma.conversacion.create({ data: { telefono } });
  },

  update(id: string, data: Prisma.ConversacionUpdateInput): Promise<Conversacion> {
    return prisma.conversacion.update({ where: { id }, data });
  },
};
