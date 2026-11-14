import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Agente } from '../../agent/agent.service.js';
import { AppError } from '../../lib/app-error.js';
import { logger } from '../../lib/logger.js';
import { partirMensaje, type EnviadorWhatsApp } from './enviador.js';
import { crearProcesadorMensajes, type MensajeEntrante } from './procesador.js';

/**
 * Canal de WhatsApp con la Cloud API de Meta (sin intermediario).
 * Docs: developers.facebook.com/docs/whatsapp/cloud-api
 */

/** Límite de Meta por mensaje de texto (4096); se deja margen. */
const MAX_CARACTERES_META = 4000;

export interface ConfigEnviadorMeta {
  /** Token de acceso (temporal del panel de Meta o permanente de un usuario del sistema). */
  token: string;
  /** Id del número de WhatsApp Business (no es el número de teléfono). */
  phoneNumberId: string;
  /** Versión de la Graph API, p. ej. v23.0. */
  version: string;
  /** Inyectable para tests. */
  fetch?: typeof fetch;
}

export function crearEnviadorMeta({
  token,
  phoneNumberId,
  version,
  fetch: hacerFetch = fetch,
}: ConfigEnviadorMeta): EnviadorWhatsApp {
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  return {
    async enviar(destino, texto) {
      for (const parte of partirMensaje(texto, MAX_CARACTERES_META)) {
        const res = await hacerFetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: destino,
            type: 'text',
            text: { preview_url: false, body: parte },
          }),
        });
        if (!res.ok) {
          // Solo el código de Meta: el mensaje de error puede traer el número del destinatario.
          const cuerpo = (await res.json().catch(() => ({}))) as {
            error?: { code?: number; error_subcode?: number };
          };
          throw new Error(
            `Meta API respondió ${res.status} (código ${cuerpo.error?.code ?? '?'}` +
              `${cuerpo.error?.error_subcode ? `/${cuerpo.error.error_subcode}` : ''})`,
          );
        }
      }
    },
  };
}

/** Lo que usamos del webhook de Meta. Meta envía mucho más y lo ignoramos. */
const notificacionMetaSchema = z.looseObject({
  object: z.string(),
  entry: z.array(
    z.looseObject({
      changes: z.array(
        z.looseObject({
          field: z.string(),
          value: z.looseObject({
            messages: z
              .array(
                z.looseObject({
                  id: z.string().min(1),
                  from: z.string().min(1),
                  type: z.string(),
                  text: z.looseObject({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

/** Extrae los mensajes entrantes; ignora estados de entrega (sent/delivered/read/failed). */
export function extraerMensajes(cuerpo: unknown): MensajeEntrante[] {
  const datos = notificacionMetaSchema.safeParse(cuerpo);
  if (!datos.success || datos.data.object !== 'whatsapp_business_account') return [];
  return datos.data.entry.flatMap((entrada) =>
    entrada.changes
      .filter((cambio) => cambio.field === 'messages')
      .flatMap((cambio) => cambio.value.messages ?? [])
      .map((m) => ({
        id: m.id,
        // Meta envía el número sin "+" (p. ej. 573001234567).
        numero: `+${m.from.replace(/^\+/, '')}`,
        // Imagen, audio, sticker…: sin texto, el agente responde que solo lee texto.
        texto: m.type === 'text' ? (m.text?.body ?? '') : '',
      })),
  );
}

/** Compara la firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con el App Secret). */
export function firmaMetaValida(cuerpoCrudo: Buffer, firma: string, appSecret: string): boolean {
  const esperada = `sha256=${createHmac('sha256', appSecret).update(cuerpoCrudo).digest('hex')}`;
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface OpcionesWebhookMeta {
  obtenerAgente: () => Agente;
  enviador: EnviadorWhatsApp;
  /** App Secret de la app de Meta: verifica la firma de cada notificación. */
  appSecret: string;
  /** Token que se escribe en el panel de Meta al registrar el webhook. */
  verifyToken: string;
}

export function crearWebhookMeta({
  obtenerAgente,
  enviador,
  appSecret,
  verifyToken,
}: OpcionesWebhookMeta) {
  const procesador = crearProcesadorMensajes({ obtenerAgente, enviador, canal: 'meta' });

  /** GET: Meta verifica el webhook una sola vez, al registrarlo en el panel. */
  const verificar: RequestHandler = (req, res) => {
    const modo = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const reto = req.query['hub.challenge'];
    if (modo !== 'subscribe' || token !== verifyToken || typeof reto !== 'string') {
      logger.warn('WhatsApp (Meta): verificación del webhook rechazada');
      throw new AppError(403, 'VERIFICACION_INVALIDA', 'Token de verificación incorrecto');
    }
    res.type('text/plain').send(reto);
  };

  /** POST: notificaciones. Requiere el cuerpo crudo (express.raw) para validar la firma. */
  const recibir: RequestHandler = (req, res) => {
    const crudo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const firma = req.header('X-Hub-Signature-256') ?? '';
    if (!firmaMetaValida(crudo, firma, appSecret)) {
      logger.warn({ conFirma: Boolean(firma) }, 'WhatsApp (Meta): firma inválida');
      throw new AppError(403, 'FIRMA_INVALIDA', 'La petición no viene de Meta');
    }

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(crudo.toString('utf8'));
    } catch {
      throw new AppError(400, 'INVALID_JSON', 'El cuerpo no es JSON válido');
    }

    // Se responde 200 de inmediato: Meta reintenta cualquier otra respuesta durante días.
    res.sendStatus(200);
    for (const mensaje of extraerMensajes(cuerpo)) procesador.recibir(mensaje);
  };

  return { verificar, recibir, esperarPendientes: procesador.esperarPendientes };
}

export type WebhookMeta = ReturnType<typeof crearWebhookMeta>;
