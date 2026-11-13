import { prisma } from '../../src/lib/prisma.js';

/** Deja las tablas vacías entre tests. */
export async function limpiarBd() {
  await prisma.$executeRaw`TRUNCATE TABLE solicitudes, clientes RESTART IDENTITY CASCADE`;
}

export function crearCliente(
  datos: Partial<{
    cedula: string;
    nombreCompleto: string;
    telefono: string;
    municipio: string;
    cupoPreaprobado: number | null;
  }> = {},
) {
  return prisma.cliente.create({
    data: {
      cedula: '1010101010',
      nombreCompleto: 'María Fernanda Rojas Gil',
      telefono: '+573000000101',
      municipio: 'Villavicencio',
      cupoPreaprobado: null,
      ...datos,
    },
  });
}

export const solicitudValida = {
  cedula: '3010101010',
  nombreCompleto: 'Camila Andrea Torres Niño',
  telefono: '300 000 0301',
  municipio: 'Zipaquirá',
  aceptaTratamientoDatos: true,
};
