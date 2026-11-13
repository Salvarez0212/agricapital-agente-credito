import type { Cliente } from '../generated/prisma/client.js';
import { TipoCliente } from '../generated/prisma/enums.js';
import { AppError } from '../lib/app-error.js';
import { clienteModel, type FiltroClientes } from '../models/cliente.model.js';
import type { Paginacion } from '../models/types.js';

/**
 * Regla de negocio central: el tipo de cliente se DERIVA, no se almacena.
 * - No existe en la BD            → NUEVO
 * - Existe y tiene cupo > 0       → PREFERENCIAL
 * - Existe sin cupo (null o 0)    → ANTIGUO
 */
export function clasificarCliente(cliente: Pick<Cliente, 'cupoPreaprobado'> | null): TipoCliente {
  if (!cliente) return TipoCliente.NUEVO;
  if (cliente.cupoPreaprobado && cliente.cupoPreaprobado.gt(0)) return TipoCliente.PREFERENCIAL;
  return TipoCliente.ANTIGUO;
}

export const clienteService = {
  async obtenerPorCedula(cedula: string) {
    const cliente = await clienteModel.findByCedula(cedula);
    if (!cliente) {
      throw new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'No existe un cliente con esa cédula');
    }
    return { cliente, tipo: clasificarCliente(cliente) };
  },

  async buscar(filtro: FiltroClientes, paginacion: Paginacion) {
    const { data, total } = await clienteModel.search(filtro, paginacion);
    return { data: data.map((cliente) => ({ cliente, tipo: clasificarCliente(cliente) })), total };
  },
};
