import express from 'express';
import type { Agente } from './agent/agent.service.js';
import { crearAgenteProduccion } from './agent/produccion.js';
import { AppError } from './lib/app-error.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
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
}

/** Construye la app de Express (separado de server.ts para poder testearla). */
export function createApp({ agente, whatsapp, meta }: OpcionesApp = {}) {
  const app = express();

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

  // Los webhooks van antes de express.json: cada uno lee el cuerpo a su manera
  // (Twilio: formulario; Meta: bytes crudos para validar la firma).
  const webhooks = crearWebhookRouter(obtenerAgente, whatsapp, meta);
  app.use('/webhooks', webhooks.router);
  // Acceso a los webhooks para esperar mensajes en proceso (tests y apagado ordenado).
  app.locals.webhookWhatsApp = webhooks.webhook;
  app.locals.webhookMeta = webhooks.webhookMeta;

  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);
  app.use(
    '/api',
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
