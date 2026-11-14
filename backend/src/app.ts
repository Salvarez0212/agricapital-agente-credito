import express from 'express';
import type { Agente } from './agent/agent.service.js';
import { crearAgenteProduccion } from './agent/produccion.js';
import { AppError } from './lib/app-error.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import {
  cabecerasSeguridad,
  limitarPeticiones,
  LIMITES_POR_DEFECTO,
  type LimitesPeticiones,
} from './middlewares/seguridad.js';
import { healthRouter } from './routes/health.routes.js';
import { crearApiRouter } from './routes/index.js';
import {
  crearWebhookRouter,
  type OpcionesMeta,
  type OpcionesWhatsApp,
} from './routes/webhook.routes.js';

export interface OpcionesApp {
  /** Agente a usar (los tests inyectan uno con un LLM falso). */
  agente?: Agente;
  /** Canal de WhatsApp (los tests inyectan un enviador falso y un auth token). */
  whatsapp?: OpcionesWhatsApp;
  /** Canal de WhatsApp con la Cloud API de Meta (los tests inyectan enviador y secretos). */
  meta?: OpcionesMeta;
  /** Límites de peticiones por IP (los tests los bajan para probar el 429). */
  limites?: Partial<LimitesPeticiones>;
}

/** Construye la app de Express (separado de server.ts para poder testearla). */
export function createApp({ agente, whatsapp, meta, limites }: OpcionesApp = {}) {
  const app = express();
  const limite = { ...LIMITES_POR_DEFECTO, ...limites };

  let agenteReal: Agente | undefined = agente;
  const obtenerAgente = () => {
    if (agenteReal) return agenteReal;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AppError(503, 'AGENTE_NO_CONFIGURADO', 'Falta configurar ANTHROPIC_API_KEY');
    }
    agenteReal = crearAgenteProduccion();
    return agenteReal;
  };

  app.disable('x-powered-by');
  app.use(cabecerasSeguridad());
  // La API solo escucha en 127.0.0.1: lo que llega por loopback viene del túnel de
  // WhatsApp (que envía la IP real en X-Forwarded-For) o del proxy del panel. Así el
  // límite por IP cuenta a cada cliente real y no a "el túnel" como si fuera uno solo.
  // No se puede falsear desde fuera: solo se confía en X-Forwarded-For si la conexión
  // viene de esta misma máquina.
  app.set('trust proxy', 'loopback');

  // Los webhooks van antes de express.json: cada uno lee el cuerpo a su manera
  // (Twilio: formulario; Meta: bytes crudos para validar la firma).
  const webhooks = crearWebhookRouter(obtenerAgente, whatsapp, meta);
  app.use('/webhooks', limitarPeticiones(limite.webhooks, limite.ventanaMs), webhooks.router);
  // Acceso a los webhooks para esperar mensajes en proceso (tests y apagado ordenado).
  app.locals.webhookWhatsApp = webhooks.webhook;
  app.locals.webhookMeta = webhooks.webhookMeta;

  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);
  app.use(
    '/api',
    limitarPeticiones(limite.api, limite.ventanaMs),
    crearApiRouter({
      obtenerAgente,
      simuladorHabilitado:
        process.env.NODE_ENV !== 'production' || process.env.ENABLE_SIMULATOR === 'true',
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
