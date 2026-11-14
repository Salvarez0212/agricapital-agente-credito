import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { AppError } from '../lib/app-error.js';

/** Máximo de peticiones por IP en cada ventana. */
export interface LimitesPeticiones {
  /** API REST (panel y simulador). El panel espera 300 ms entre teclas: 300/min sobra. */
  api: number;
  /** Webhooks de Meta y Twilio. Más alto: un proveedor puede enviar ráfagas desde una IP. */
  webhooks: number;
  /** Duración de la ventana en milisegundos. */
  ventanaMs: number;
}

export const LIMITES_POR_DEFECTO: LimitesPeticiones = {
  api: 300,
  webhooks: 600,
  ventanaMs: 60_000,
};

/**
 * Cabeceras de seguridad HTTP (Helmet): nosniff, frame-ancestors/X-Frame-Options,
 * Content-Security-Policy, Referrer-Policy, HSTS, etc. La API solo devuelve JSON, así que
 * la CSP por defecto (muy restrictiva) no rompe nada y protege si un navegador abre una
 * respuesta directamente.
 */
export function cabecerasSeguridad() {
  return helmet();
}

/**
 * Límite de peticiones por IP: frena fuerza bruta (p. ej. recorrer cédulas en
 * /api/clientes/:cedula) y abuso del simulador, que gasta tokens del modelo.
 * Al superarlo responde 429 con el formato de error de siempre y Retry-After.
 * (El agente tiene además su propio límite por teléfono: 15 mensajes cada 5 min.)
 */
export function limitarPeticiones(maximo: number, ventanaMs: number) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    standardHeaders: 'draft-8', // cabecera RateLimit con lo que queda
    legacyHeaders: false,
    handler: (_req, res, next) => {
      res.setHeader('Retry-After', Math.ceil(ventanaMs / 1000));
      next(
        new AppError(
          429,
          'DEMASIADAS_PETICIONES',
          'Demasiadas peticiones. Intenta de nuevo en un momento.',
        ),
      );
    },
  });
}
