import type { RequestHandler } from 'express';
import twilio from 'twilio';
import { z } from 'zod';
import type { Agente } from '../../agent/agent.service.js';
import { AppError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import type { EnviadorWhatsApp } from './enviador.js';
import { crearProcesadorMensajes } from './procesador.js';

/** Campos del webhook de Twilio que usamos (Twilio envía muchos más). */
const mensajeTwilioSchema = z.looseObject({
  MessageSid: z.string().min(1),
  From: z.string().min(1),
  Body: z.string().default(''),
  NumMedia: z.coerce.number().int().default(0),
});

// Se re-exporta para no romper a quien ya lo importaba desde aquí.
export { RESPUESTA_FUERA_DE_COLOMBIA } from './procesador.js';

export interface OpcionesWebhook {
  obtenerAgente: () => Agente;
  enviador: EnviadorWhatsApp;
  /** Auth token de Twilio: con él se verifica la firma de cada petición. */
  authToken: string;
  /**
   * URL pública con la que Twilio llama al webhook (p. ej. la de ngrok). La firma se
   * calcula sobre esa URL exacta; detrás de un proxy, la que ve Express es otra.
   */
  urlPublica?: string;
}

/**
 * Webhook de mensajes entrantes de WhatsApp (Twilio).
 * Twilio espera respuesta en ~15 s y el agente puede tardar más, así que se responde
 * 200 de inmediato y el mensaje se procesa en segundo plano; la respuesta se envía
 * después con la API REST de Twilio.
 */
export function crearWebhookWhatsApp({
  obtenerAgente,
  enviador,
  authToken,
  urlPublica,
}: OpcionesWebhook) {
  const procesador = crearProcesadorMensajes({ obtenerAgente, enviador, canal: 'twilio' });

  const handler: RequestHandler = (req, res) => {
    const firma = req.header('X-Twilio-Signature') ?? '';
    const url = urlPublica
      ? new URL(req.originalUrl, urlPublica).toString()
      : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = (req.body ?? {}) as Record<string, string>;

    if (!twilio.validateRequest(authToken, firma, url, params)) {
      // Sin datos del mensaje: solo lo necesario para depurar la configuración del webhook.
      logger.warn({ url, conFirma: Boolean(firma) }, 'WhatsApp: firma de Twilio inválida');
      throw new AppError(403, 'FIRMA_INVALIDA', 'La petición no viene de Twilio');
    }

    const datos = mensajeTwilioSchema.parse(params);

    // Respuesta inmediata con TwiML vacío: el mensaje real se envía después por la API.
    res.type('text/xml').send('<Response></Response>');

    procesador.recibir({
      id: datos.MessageSid,
      numero: datos.From.replace(/^whatsapp:/, ''),
      texto: datos.Body,
    });
  };

  return { handler, esperarPendientes: procesador.esperarPendientes };
}

export type WebhookWhatsApp = ReturnType<typeof crearWebhookWhatsApp>;
