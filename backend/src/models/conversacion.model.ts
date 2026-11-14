import type { Conversacion, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

/** Una conversación expira tras 24 h sin mensajes (ventana de servicio de WhatsApp). */
export const VENTANA_CONVERSACION_MS = 24 * 60 * 60 * 1000;

export const conversacionModel = {
  findActivaPorTelefono(telefono: string): Promise<Conversacion | null> {
    return prisma.conversacion.findFirst({
      where: {
        telefono,
        ultimoMensajeAt: { gt: new Date(Date.now() - VENTANA_CONVERSACION_MS) },
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
