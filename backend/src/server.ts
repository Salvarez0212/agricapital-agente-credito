import { createApp } from './app.js';
import type { WebhookMeta } from './channels/whatsapp/meta.js';
import type { WebhookWhatsApp } from './channels/whatsapp/webhook.js';
import { direccionEscucha } from './lib/escucha.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const { host, port } = direccionEscucha();
const app = createApp();

const server = app.listen(port, host, () => {
  logger.info(`API escuchando en http://${host}:${port}`);
});

/**
 * Apagado ordenado: deja de aceptar peticiones, espera a que se envíen las
 * respuestas de WhatsApp en proceso y cierra la conexión a la BD.
 */
async function apagar(senal: string) {
  logger.info(`${senal} recibido: apagando…`);
  server.close();
  await Promise.all([
    (app.locals.webhookWhatsApp as WebhookWhatsApp | undefined)?.esperarPendientes(),
    (app.locals.webhookMeta as WebhookMeta | undefined)?.esperarPendientes(),
  ]);
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => void apagar('SIGINT'));
process.once('SIGTERM', () => void apagar('SIGTERM'));
