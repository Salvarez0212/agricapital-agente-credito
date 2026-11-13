import type { Cliente, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { Db, Pagina, Paginacion } from './types.js';

export interface FiltroClientes {
  cedula?: string;
  telefono?: string;
}

/** Acceso a datos de clientes. Solo consultas: sin reglas de negocio. */
export const clienteModel = {
  findByCedula(cedula: string, db: Db = prisma): Promise<Cliente | null> {
    return db.cliente.findUnique({ where: { cedula } });
  },

  async search(filtro: FiltroClientes, { page, pageSize }: Paginacion): Promise<Pagina<Cliente>> {
    const where: Prisma.ClienteWhereInput = {
      ...(filtro.cedula && { cedula: { contains: filtro.cedula } }),
      ...(filtro.telefono && { telefono: { contains: filtro.telefono } }),
    };

    const [data, total] = await prisma.$transaction([
      prisma.cliente.findMany({
        where,
        orderBy: { nombreCompleto: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cliente.count({ where }),
    ]);

    return { data, total };
  },
};
