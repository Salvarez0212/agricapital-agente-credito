import express from 'express';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { apiRouter } from './routes/index.js';

/** Construye la app de Express (separado de server.ts para poder testearla). */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
