import type { Conversacion, Prisma } from '../generated/prisma/client.js';
import { MARCADOR_BLOQUEADO } from '../lib/marcadores.js';
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

  /**
   * Cuántos mensajes bloqueó la guardia de entrada en la conversación que radicó cada
   * solicitud. Solo cuenta los marcadores: el texto bloqueado nunca se guarda aquí.
   * Las solicitudes sin bloqueos (o radicadas por la API) no aparecen en el mapa.
   */
  async contarBloqueadosPorSolicitud(solicitudIds: string[]): Promise<Map<string, number>> {
    if (solicitudIds.length === 0) return new Map();
    const filas = await prisma.$queryRaw<{ solicitudId: string; bloqueados: number }[]>`
      SELECT c.solicitud_id::text AS "solicitudId", count(*)::int AS bloqueados
      FROM conversaciones c, jsonb_array_elements(c.mensajes) AS m
      WHERE c.solicitud_id = ANY(${solicitudIds}::uuid[])
        AND m->>'role' = 'user'
        AND m->>'content' = ${MARCADOR_BLOQUEADO}
      GROUP BY c.solicitud_id`;
    return new Map(filas.map((f) => [f.solicitudId, f.bloqueados]));
  },
};
