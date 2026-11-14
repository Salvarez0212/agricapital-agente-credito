import { z } from 'zod';
import { telefonoSchema } from './common.schema.js';

/** Mensaje del simulador: el teléfono simula el número de WhatsApp de quien escribe. */
export const simularChatSchema = z.strictObject({
  telefono: telefonoSchema,
  mensaje: z.string({ error: 'El mensaje es obligatorio' }).max(5000),
});
