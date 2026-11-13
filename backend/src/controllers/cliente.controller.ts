import type { Request, Response } from 'express';
import { buscarClientesQuerySchema, cedulaParamsSchema } from '../schemas/cliente.schema.js';
import { clienteService } from '../services/cliente.service.js';
import { meta, serializarCliente } from './serializers.js';

/** Los controladores validan la entrada, llaman al servicio y arman la respuesta HTTP. */
export const clienteController = {
  async obtenerPorCedula(req: Request, res: Response) {
    const { cedula } = cedulaParamsSchema.parse(req.params);
    const { cliente, tipo } = await clienteService.obtenerPorCedula(cedula);
    res.json({ data: serializarCliente(cliente, tipo) });
  },

  async buscar(req: Request, res: Response) {
    const { page, pageSize, cedula, telefono } = buscarClientesQuerySchema.parse(req.query);
    const { data, total } = await clienteService.buscar({ cedula, telefono }, { page, pageSize });
    res.json({
      data: data.map(({ cliente, tipo }) => serializarCliente(cliente, tipo)),
      meta: meta(page, pageSize, total),
    });
  },
};
