import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, () => {
  logger.info(`API escuchando en http://localhost:${port}`);
});
