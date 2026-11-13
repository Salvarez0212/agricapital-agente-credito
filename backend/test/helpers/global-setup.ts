import { execSync } from 'node:child_process';
import { Client } from 'pg';

/**
 * Se ejecuta una vez antes de todos los tests:
 * 1. Crea la BD de pruebas si no existe.
 * 2. Aplica las migraciones (prisma migrate deploy).
 */
export default async function globalSetup() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const nombreBd = url.pathname.slice(1);

  const admin = new Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString(),
  });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    nombreBd,
  ]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${nombreBd}"`);
  await admin.end();

  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
}
