import { z } from 'zod';
import {
  cedulaSchema,
  filtroDigitosSchema,
  municipioSchema,
  nombreCompletoSchema,
  paginacionSchema,
  telefonoSchema,
  uuidSchema,
} from './common.schema.js';

/**
 * Cuerpo para crear una solicitud. Es estricto: campos como `estado` o
 * `tipoCliente` NO se aceptan del cliente; los decide el servidor.
 */
export const crearSolicitudSchema = z.strictObject(
  {
    cedula: cedulaSchema,
    nombreCompleto: nombreCompletoSchema,
    telefono: telefonoSchema,
    municipio: municipioSchema,
    montoSolicitado: z
      .number({ error: 'El monto debe ser numérico' })
      .positive({ error: 'El monto debe ser mayor que cero' })
      .max(500_000_000, { error: 'El monto supera el máximo permitido' })
      .optional(),
    canal: z.enum(['WHATSAPP', 'WEB']).default('WEB'),
    /** Autorización de tratamiento de datos (Ley 1581 de 2012). Debe ser true. */
    aceptaTratamientoDatos: z.literal(true, {
      error: 'Se requiere la autorización de tratamiento de datos personales',
    }),
  },
  {
    error: (issue) => (issue.code === 'unrecognized_keys' ? 'Hay campos no permitidos' : undefined),
  },
);

export type CrearSolicitudInput = z.infer<typeof crearSolicitudSchema>;

export const solicitudIdParamsSchema = z.object({ id: uuidSchema });

export const listarSolicitudesQuerySchema = paginacionSchema.extend({
  cedula: filtroDigitosSchema,
  telefono: filtroDigitosSchema,
});

export type ListarSolicitudesQuery = z.infer<typeof listarSolicitudesQuerySchema>;
