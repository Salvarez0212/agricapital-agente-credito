import type { Request, RequestHandler } from 'express';
import { rateLimit, type RateLimitInfo } from 'express-rate-limit';
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
    handler: (req, res, next) => {
      // Segundos que faltan de verdad para que se reinicie el contador de esta IP.
      const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
      const reinicio = info?.resetTime?.getTime() ?? Date.now() + ventanaMs;
      res.setHeader('Retry-After', Math.max(1, Math.ceil((reinicio - Date.now()) / 1000)));
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

/** Cabeceras que agrega un proxy o túnel (cloudflared, un balanceador) al reenviar. */
const CABECERAS_DE_PROXY = ['x-forwarded-for', 'cf-connecting-ip', 'forwarded', 'x-real-ip'];

/**
 * La API REST solo atiende peticiones directas desde esta máquina (el panel en
 * desarrollo, curl, el chat de terminal). Lo que llega reenviado por un proxy o túnel se
 * rechaza con 403.
 *
 * Por qué: el túnel de WhatsApp (`cloudflared --url`) reenvía TODO el puerto, no solo
 * /webhooks. Sin esto, quien conociera la URL del túnel podría leer las solicitudes (la
 * API no tiene login) o gastar tokens con el simulador. El proxy de Vite no agrega estas
 * cabeceras, así que el panel sigue funcionando.
 *
 * `permitirRemoto` lo desactiva para un despliegue en el que la API sí deba servirse
 * detrás de un proxy (con autenticación delante): API_ACCESO_REMOTO=true.
 */
export function soloAccesoLocal(permitirRemoto: boolean): RequestHandler {
  return (req, _res, next) => {
    if (permitirRemoto) return next();
    const reenviada = CABECERAS_DE_PROXY.some((cabecera) => req.headers[cabecera] !== undefined);
    if (!reenviada) return next();
    next(
      new AppError(
        403,
        'ACCESO_SOLO_LOCAL',
        'La API solo está disponible desde la red interna del equipo.',
      ),
    );
  };
}
