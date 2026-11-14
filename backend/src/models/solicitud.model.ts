import type { Prisma, Solicitud } from '../generated/prisma/client.js';
import { EstadoSolicitud } from '../generated/prisma/enums.js';
import { prisma } from '../lib/prisma.js';
import type { Db, Pagina, Paginacion } from './types.js';

export interface FiltroSolicitudes {
  cedula?: string;
  telefono?: string;
}

/** Acceso a datos de solicitudes. Solo consultas: sin reglas de negocio. */
export const solicitudModel = {
  create(data: Prisma.SolicitudUncheckedCreateInput, db: Db = prisma): Promise<Solicitud> {
    return db.solicitud.create({ data });
  },

  findById(id: string): Promise<Solicitud | null> {
    return prisma.solicitud.findUnique({ where: { id } });
  },

  /** Solicitudes de esa cédula que aún están en revisión (de cualquier teléfono). */
  findEnRevisionByCedula(cedula: string, db: Db = prisma): Promise<Solicitud[]> {
    return db.solicitud.findMany({
      where: { cedula, estado: EstadoSolicitud.EN_REVISION },
    });
  },

  /** Marca para verificación de identidad las solicitudes indicadas. */
  async marcarParaVerificacion(ids: string[], db: Db = prisma): Promise<void> {
    if (ids.length === 0) return;
    await db.solicitud.updateMany({
      where: { id: { in: ids } },
      data: { requiereVerificacion: true },
    });
  },

  async list(
    filtro: FiltroSolicitudes,
    { page, pageSize }: Paginacion,
  ): Promise<Pagina<Solicitud>> {
    const where: Prisma.SolicitudWhereInput = {
      ...(filtro.cedula && { cedula: { contains: filtro.cedula } }),
      ...(filtro.telefono && { telefono: { contains: filtro.telefono } }),
    };

    const [data, total] = await prisma.$transaction([
      prisma.solicitud.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.solicitud.count({ where }),
    ]);

    return { data, total };
  },

  /**
   * Bloqueo transaccional por cédula (advisory lock de Postgres). Evita que dos
   * peticiones simultáneas de la misma cédula creen dos solicitudes en revisión.
   * Se libera solo al terminar la transacción.
   */
  async lockPorCedula(cedula: string, db: Db): Promise<void> {
    await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${cedula}))::text`;
  },
};
