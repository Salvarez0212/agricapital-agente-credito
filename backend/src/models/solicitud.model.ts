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

  /** Solicitud de esa cédula que aún está en revisión (si existe). */
  findEnRevisionByCedula(cedula: string, db: Db = prisma): Promise<Solicitud | null> {
    return db.solicitud.findFirst({
      where: { cedula, estado: EstadoSolicitud.EN_REVISION },
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
