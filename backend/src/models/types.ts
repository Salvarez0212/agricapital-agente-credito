import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Cliente de BD: la instancia global o el `tx` de una transacción. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface Paginacion {
  page: number;
  pageSize: number;
}

export interface Pagina<T> {
  data: T[];
  total: number;
}
