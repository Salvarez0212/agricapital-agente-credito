import express from 'express';
import { crearAgente, type Agente } from './agent/agent.service.js';
import { crearClienteAnthropic } from './agent/llm.js';
import { AppError } from './lib/app-error.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { crearApiRouter } from './routes/index.js';

export interface OpcionesApp {
  /** Agente a usar (los tests inyectan uno con un LLM falso). */
  agente?: Agente;
}

/** Construye la app de Express (separado de server.ts para poder testearla). */
export function createApp({ agente }: OpcionesApp = {}) {
  const app = express();

  let agenteReal: Agente | undefined = agente;
  const obtenerAgente = () => {
    if (agenteReal) return agenteReal;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AppError(503, 'AGENTE_NO_CONFIGURADO', 'Falta configurar ANTHROPIC_API_KEY');
    }
    agenteReal = crearAgente(crearClienteAnthropic());
    return agenteReal;
  };

  app.disable('x-powered-by');
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
