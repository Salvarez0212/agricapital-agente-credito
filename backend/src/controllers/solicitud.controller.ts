import type { Request, Response } from 'express';
import {
  crearSolicitudSchema,
  listarSolicitudesQuerySchema,
  solicitudIdParamsSchema,
} from '../schemas/solicitud.schema.js';
import { solicitudService } from '../services/solicitud.service.js';
import { meta, serializarSolicitud } from './serializers.js';

export const solicitudController = {
  async crear(req: Request, res: Response) {
    const input = crearSolicitudSchema.parse(req.body);
    const solicitud = await solicitudService.crear(input);
    res
      .status(201)
      .location(`/api/solicitudes/${solicitud.id}`)
      .json({
        data: serializarSolicitud(solicitud),
      });
  },

  async obtener(req: Request, res: Response) {
    const { id } = solicitudIdParamsSchema.parse(req.params);
    const { solicitud, intentosBloqueados } = await solicitudService.obtener(id);
    res.json({ data: serializarSolicitud(solicitud, intentosBloqueados) });
  },

  async listar(req: Request, res: Response) {
    const { page, pageSize, cedula, telefono } = listarSolicitudesQuerySchema.parse(req.query);
    const { data, total } = await solicitudService.listar({ cedula, telefono }, { page, pageSize });
    res.json({
      data: data.map(({ solicitud, intentosBloqueados }) =>
        serializarSolicitud(solicitud, intentosBloqueados),
      ),
      meta: meta(page, pageSize, total),
    });
  },
};
