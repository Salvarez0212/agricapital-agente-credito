import type { RequestHandler } from 'express';
import twilio from 'twilio';
import { z } from 'zod';
import type { Agente } from '../../agent/agent.service.js';
import { AppError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { telefonoSchema } from '../../schemas/common.schema.js';
import type { EnviadorWhatsApp } from './enviador.js';

/** Campos del webhook de Twilio que usamos (Twilio envía muchos más). */
const mensajeTwilioSchema = z.looseObject({
  MessageSid: z.string().min(1),
  From: z.string().min(1),
  Body: z.string().default(''),
  NumMedia: z.coerce.number().int().default(0),
});

export const RESPUESTA_FUERA_DE_COLOMBIA =
  'Hola. Por ahora solo podemos atender celulares de Colombia. Gracias por escribirnos.';

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
  const pendientes = new Set<Promise<void>>();
  // Twilio puede reintentar un webhook: se ignora un MessageSid ya visto.
  const vistos = new Map<string, number>();
  const VENTANA_DUPLICADOS_MS = 60 * 60 * 1000;

  function yaProcesado(sid: string): boolean {
    const ahora = Date.now();
    for (const [id, t] of vistos) if (ahora - t > VENTANA_DUPLICADOS_MS) vistos.delete(id);
    if (vistos.has(sid)) return true;
    vistos.set(sid, ahora);
    return false;
  }

  async function procesar(datos: z.infer<typeof mensajeTwilioSchema>): Promise<void> {
    const numero = datos.From.replace(/^whatsapp:/, '');
    try {
      const telefono = telefonoSchema.safeParse(numero);
      if (!telefono.success) {
        await enviador.enviar(numero, RESPUESTA_FUERA_DE_COLOMBIA);
        return;
      }
      // Un mensaje solo con adjuntos llega con Body vacío: el agente responde que solo lee texto.
      const { respuesta } = await obtenerAgente().procesarMensaje({
        telefono: telefono.data,
        texto: datos.Body,
      });
      await enviador.enviar(telefono.data, respuesta);
    } catch (err) {
      logger.error(
        { err, messageSid: datos.MessageSid },
        'WhatsApp: no se pudo procesar el mensaje',
      );
    }
  }

  const handler: RequestHandler = (req, res) => {
    const firma = req.header('X-Twilio-Signature') ?? '';
    const url = urlPublica
      ? new URL(req.originalUrl, urlPublica).toString()
      : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = (req.body ?? {}) as Record<string, string>;

    if (!twilio.validateRequest(authToken, firma, url, params)) {
      throw new AppError(403, 'FIRMA_INVALIDA', 'La petición no viene de Twilio');
    }

    const datos = mensajeTwilioSchema.parse(params);

    // Respuesta inmediata con TwiML vacío: el mensaje real se envía después por la API.
    res.type('text/xml').send('<Response></Response>');

    if (yaProcesado(datos.MessageSid)) {
      logger.info({ messageSid: datos.MessageSid }, 'WhatsApp: mensaje duplicado ignorado');
      return;
    }
    const tarea = procesar(datos).finally(() => pendientes.delete(tarea));
    pendientes.add(tarea);
  };

  return {
    handler,
    /** Espera a que terminen los mensajes en proceso (tests y apagado ordenado). */
    async esperarPendientes(): Promise<void> {
      await Promise.all([...pendientes]);
    },
  };
}

export type WebhookWhatsApp = ReturnType<typeof crearWebhookWhatsApp>;
