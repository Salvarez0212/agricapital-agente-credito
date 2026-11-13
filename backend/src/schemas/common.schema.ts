import { z } from 'zod';

/** Cédula de ciudadanía colombiana: solo dígitos, entre 6 y 10. */
export const cedulaSchema = z
  .string({ error: 'La cédula es obligatoria' })
  .trim()
  .transform((v) => v.replace(/[.\s-]/g, '')) // acepta "1.010.101.010"
  .pipe(z.string().regex(/^\d{6,10}$/, { error: 'La cédula debe tener entre 6 y 10 dígitos' }));

/**
 * Celular colombiano normalizado a E.164 (+57 + 10 dígitos que empiezan por 3).
 * Acepta "3001234567", "300 123 4567", "573001234567" y "+57 300 123 4567".
 */
export const telefonoSchema = z
  .string({ error: 'El teléfono es obligatorio' })
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, '').replace(/^\+?57(?=3\d{9}$)/, ''))
  .pipe(
    z.string().regex(/^3\d{9}$/, { error: 'El teléfono debe ser un celular colombiano válido' }),
  )
  .transform((v) => `+57${v}`);

/** Nombre completo: al menos nombre y apellido, solo letras, espacios, apóstrofes y guiones. */
export const nombreCompletoSchema = z
  .string({ error: 'El nombre completo es obligatorio' })
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(5, { error: 'El nombre completo es demasiado corto' })
      .max(120, { error: 'El nombre completo es demasiado largo' })
      .regex(/^[\p{L}' -]+$/u, { error: 'El nombre solo puede contener letras' })
      .refine((v) => v.split(' ').length >= 2, {
        error: 'Incluye al menos un nombre y un apellido',
      }),
  );

export const municipioSchema = z
  .string({ error: 'El municipio es obligatorio' })
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2, { error: 'El municipio es demasiado corto' })
      .max(80, { error: 'El municipio es demasiado largo' })
      .regex(/^[\p{L}' .-]+$/u, { error: 'El municipio solo puede contener letras' }),
  );

export const uuidSchema = z.uuid({ error: 'El identificador no es válido' });

/** Paginación por query string: ?page=1&pageSize=20 */
export const paginacionSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Filtro parcial por dígitos (para búsqueda en tiempo real). Ignora espacios, puntos y "+". */
export const filtroDigitosSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().max(13))
  .optional()
  .transform((v) => (v ? v : undefined));
