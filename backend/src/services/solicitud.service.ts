import { EstadoSolicitud } from '../generated/prisma/enums.js';
import { AppError } from '../lib/app-error.js';
import { prisma } from '../lib/prisma.js';
import { clienteModel } from '../models/cliente.model.js';
import { solicitudModel, type FiltroSolicitudes } from '../models/solicitud.model.js';
import type { Paginacion } from '../models/types.js';
import type { CrearSolicitudInput } from '../schemas/solicitud.schema.js';
import { clasificarCliente } from './cliente.service.js';

export const solicitudService = {
  /**
   * Radica una solicitud. Reglas:
   * 1. Toda solicitud nace EN_REVISION (nadie la aprueba al crearla).
   * 2. El tipo de cliente lo decide el servidor según la BD, nunca quien llama.
   * 3. No se permite una segunda solicitud de la misma cédula mientras otra siga en revisión (409).
   * 4. Si la cédula existe pero el teléfono no coincide con el registrado, se marca
   *    `requiereVerificacion` para que el equipo valide identidad.
   */
  async crear(input: CrearSolicitudInput) {
    return prisma.$transaction(async (tx) => {
      await solicitudModel.lockPorCedula(input.cedula, tx);

      const pendiente = await solicitudModel.findEnRevisionByCedula(input.cedula, tx);
      if (pendiente) {
        throw new AppError(
          409,
          'SOLICITUD_EN_REVISION',
          'Ya existe una solicitud en revisión para esta cédula',
        );
      }

      const cliente = await clienteModel.findByCedula(input.cedula, tx);

      return solicitudModel.create(
        {
          clienteId: cliente?.id ?? null,
          cedula: input.cedula,
          nombreCompleto: input.nombreCompleto,
          telefono: input.telefono,
          municipio: input.municipio,
          montoSolicitado: input.montoSolicitado ?? null,
          canal: input.canal,
          tipoCliente: clasificarCliente(cliente),
          estado: EstadoSolicitud.EN_REVISION,
          requiereVerificacion: cliente !== null && cliente.telefono !== input.telefono,
          consentimientoDatosAt: new Date(),
        },
        tx,
      );
    });
  },

  async obtener(id: string) {
    const solicitud = await solicitudModel.findById(id);
    if (!solicitud) {
      throw new AppError(404, 'SOLICITUD_NO_ENCONTRADA', 'No existe una solicitud con ese id');
    }
    return solicitud;
  },

  listar(filtro: FiltroSolicitudes, paginacion: Paginacion) {
    return solicitudModel.list(filtro, paginacion);
  },
};
