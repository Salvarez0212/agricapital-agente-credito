import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Instancia única de PrismaClient para toda la app.
 * Prisma 7 se conecta a Postgres a través de un "driver adapter" (node-postgres).
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
