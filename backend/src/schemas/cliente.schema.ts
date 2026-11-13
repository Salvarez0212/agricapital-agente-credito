import { z } from 'zod';
import { cedulaSchema, filtroDigitosSchema, paginacionSchema } from './common.schema.js';

export const cedulaParamsSchema = z.object({ cedula: cedulaSchema });

export const buscarClientesQuerySchema = paginacionSchema.extend({
  cedula: filtroDigitosSchema,
  telefono: filtroDigitosSchema,
});

export type BuscarClientesQuery = z.infer<typeof buscarClientesQuerySchema>;
