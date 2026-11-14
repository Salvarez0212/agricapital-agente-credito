import { createApp } from './app.js';
import type { WebhookWhatsApp } from './channels/whatsapp/webhook.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

const server = app.listen(port, () => {
  logger.info(`API escuchando en http://localhost:${port}`);
});

/**
 * Apagado ordenado: deja de aceptar peticiones, espera a que se envíen las
 * respuestas de WhatsApp en proceso y cierra la conexión a la BD.
 */
async function apagar(senal: string) {
  logger.info(`${senal} recibido: apagando…`);
  server.close();
  await (app.locals.webhookWhatsApp as WebhookWhatsApp | undefined)?.esperarPendientes();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => void apagar('SIGINT'));
process.once('SIGTERM', () => void apagar('SIGTERM'));
