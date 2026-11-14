import express, { Router } from 'express';
import type { Agente } from '../agent/agent.service.js';
import { crearEnviadorTwilio, type EnviadorWhatsApp } from '../channels/whatsapp/enviador.js';
import {
  crearEnviadorMeta,
  crearWebhookMeta,
  type WebhookMeta,
} from '../channels/whatsapp/meta.js';
import { crearWebhookWhatsApp, type WebhookWhatsApp } from '../channels/whatsapp/webhook.js';
import { AppError } from '../lib/app-error.js';

export interface OpcionesWhatsApp {
  enviador?: EnviadorWhatsApp;
  authToken?: string;
  urlPublica?: string;
}

export interface OpcionesMeta {
  enviador?: EnviadorWhatsApp;
  appSecret?: string;
  verifyToken?: string;
}

/** Versión de la Graph API si no se define META_GRAPH_VERSION. */
const VERSION_GRAPH_POR_DEFECTO = 'v23.0';

/**
 * Router de webhooks (montado en /webhooks). Twilio envía los mensajes como
 * application/x-www-form-urlencoded. Sin credenciales de Twilio responde 503.
 */
export function crearWebhookRouter(
  obtenerAgente: () => Agente,
  opciones: OpcionesWhatsApp = {},
  opcionesMeta: OpcionesMeta = {},
) {
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

  // --- Canal Meta (Cloud API) ---
  const appSecret = opcionesMeta.appSecret ?? process.env.META_APP_SECRET;
  const verifyToken = opcionesMeta.verifyToken ?? process.env.META_VERIFY_TOKEN;
  const tokenMeta = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const enviadorMeta =
    opcionesMeta.enviador ??
    (tokenMeta && phoneNumberId
      ? crearEnviadorMeta({
          token: tokenMeta,
          phoneNumberId,
          version: process.env.META_GRAPH_VERSION ?? VERSION_GRAPH_POR_DEFECTO,
        })
      : undefined);
  const webhookMeta: WebhookMeta | undefined =
    appSecret && verifyToken && enviadorMeta
      ? crearWebhookMeta({ obtenerAgente, enviador: enviadorMeta, appSecret, verifyToken })
      : undefined;

  const metaConfigurado: express.RequestHandler = (_req, _res, next) => {
    if (!webhookMeta) {
      throw new AppError(
        503,
        'WHATSAPP_META_NO_CONFIGURADO',
        'Faltan META_APP_SECRET, META_VERIFY_TOKEN, META_WHATSAPP_TOKEN o META_PHONE_NUMBER_ID',
      );
    }
    next();
  };
  router.get('/meta', metaConfigurado, (req, res, next) => webhookMeta!.verificar(req, res, next));
  router.post(
    '/meta',
    metaConfigurado,
    // Cuerpo crudo: la firma de Meta se calcula sobre los bytes exactos.
    express.raw({ type: '*/*', limit: '3mb' }),
    (req, res, next) => webhookMeta!.recibir(req, res, next),
  );

  return { router, webhook, webhookMeta };
}
