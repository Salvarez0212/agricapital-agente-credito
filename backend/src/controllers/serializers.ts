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

/**
 * `intentosBloqueados`: mensajes que la guardia de entrada bloqueó en la conversación
 * que radicó la solicitud. Es solo el número, nunca el texto (ver issue #10).
 */
export function serializarSolicitud(solicitud: Solicitud, intentosBloqueados = 0) {
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
    intentosBloqueados,
    consentimientoDatosAt: solicitud.consentimientoDatosAt.toISOString(),
    createdAt: solicitud.createdAt.toISOString(),
    updatedAt: solicitud.updatedAt.toISOString(),
  };
}

export function meta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
