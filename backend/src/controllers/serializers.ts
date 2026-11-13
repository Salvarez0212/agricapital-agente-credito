import type { Cliente, Solicitud } from '../generated/prisma/client.js';
import type { TipoCliente } from '../generated/prisma/enums.js';

/**
 * Convierte entidades de la BD al JSON público de la API.
 * Los Decimal de Prisma se exponen como number (montos en COP).
 */
export function serializarCliente(cliente: Cliente, tipo: TipoCliente) {
  return {
    id: cliente.id,
    cedula: cliente.cedula,
    nombreCompleto: cliente.nombreCompleto,
    telefono: cliente.telefono,
    municipio: cliente.municipio,
    tipo,
    cupoPreaprobado: cliente.cupoPreaprobado?.toNumber() ?? null,
  };
}

export function serializarSolicitud(solicitud: Solicitud) {
  return {
    id: solicitud.id,
    cedula: solicitud.cedula,
    nombreCompleto: solicitud.nombreCompleto,
    telefono: solicitud.telefono,
    municipio: solicitud.municipio,
    tipoCliente: solicitud.tipoCliente,
    estado: solicitud.estado,
    canal: solicitud.canal,
    montoSolicitado: solicitud.montoSolicitado?.toNumber() ?? null,
    requiereVerificacion: solicitud.requiereVerificacion,
    consentimientoDatosAt: solicitud.consentimientoDatosAt.toISOString(),
    createdAt: solicitud.createdAt.toISOString(),
    updatedAt: solicitud.updatedAt.toISOString(),
  };
}

export function meta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
