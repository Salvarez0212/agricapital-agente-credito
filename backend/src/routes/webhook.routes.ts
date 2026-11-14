import express, { Router } from 'express';
import type { Agente } from '../agent/agent.service.js';
import { crearEnviadorTwilio, type EnviadorWhatsApp } from '../channels/whatsapp/enviador.js';
import { crearWebhookWhatsApp, type WebhookWhatsApp } from '../channels/whatsapp/webhook.js';
import { AppError } from '../lib/app-error.js';

export interface OpcionesWhatsApp {
  enviador?: EnviadorWhatsApp;
  authToken?: string;
  urlPublica?: string;
}

/**
 * Router de webhooks (montado en /webhooks). Twilio envía los mensajes como
 * application/x-www-form-urlencoded. Sin credenciales de Twilio responde 503.
 */
export function crearWebhookRouter(obtenerAgente: () => Agente, opciones: OpcionesWhatsApp = {}) {
  const router = Router();
  const authToken = opciones.authToken ?? process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const remitente = process.env.TWILIO_WHATSAPP_FROM;

  let webhook: WebhookWhatsApp | undefined;
  const enviador =
    opciones.enviador ??
    (authToken && accountSid && remitente
      ? crearEnviadorTwilio({ accountSid, authToken, remitente })
      : undefined);

  if (authToken && enviador) {
    webhook = crearWebhookWhatsApp({
      obtenerAgente,
      enviador,
      authToken,
      urlPublica: opciones.urlPublica ?? process.env.PUBLIC_BASE_URL,
    });
  }

  router.post(
    '/whatsapp',
    express.urlencoded({ extended: false, limit: '50kb' }),
    (req, res, next) => {
      if (!webhook) {
        throw new AppError(
          503,
          'WHATSAPP_NO_CONFIGURADO',
          'Faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_WHATSAPP_FROM',
        );
      }
      webhook.handler(req, res, next);
    },
  );

  return { router, webhook };
}
