import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearAgente, RESPUESTAS } from '../../src/agent/agent.service.js';
import { createApp } from '../../src/app.js';
import type { EnviadorWhatsApp } from '../../src/channels/whatsapp/enviador.js';
import {
  crearEnviadorMeta,
  extraerFallosEntrega,
  extraerMensajes,
  firmaMetaValida,
  type WebhookMeta,
} from '../../src/channels/whatsapp/meta.js';
import { RESPUESTA_FUERA_DE_COLOMBIA } from '../../src/channels/whatsapp/procesador.js';
import { logger } from '../../src/lib/logger.js';
import { limpiarBd } from '../helpers/db.js';
import { LlmFalso, texto } from '../helpers/llm-falso.js';

const APP_SECRET = 'secreto-de-prueba';
const VERIFY_TOKEN = 'token-verificacion';

class EnviadorFalso implements EnviadorWhatsApp {
  enviados: Array<{ destino: string; texto: string }> = [];
  async enviar(destino: string, mensaje: string) {
    this.enviados.push({ destino, texto: mensaje });
  }
}

let id = 0;
/** Notificación de Meta con un mensaje entrante, como la documenta la Cloud API. */
function notificacion(mensaje: Record<string, unknown> = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550783881', phone_number_id: '106540352242922' },
              contacts: [{ profile: { name: 'Cliente' }, wa_id: '573001112233' }],
              messages: [
                {
                  from: '573001112233',
                  id: `wamid.${++id}`,
                  timestamp: '1749416383',
                  type: 'text',
                  text: { body: 'hola' },
                  ...mensaje,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/** Estado de entrega fallido, como el que envía Meta con la cuenta bloqueada (131031). */
const estadoFallido = {
  id: 'wamid.fallido',
  status: 'failed',
  timestamp: '1794678078',
  recipient_id: '573001112233',
  errors: [
    {
      code: 131031,
      title: 'Business Account locked',
      error_data: { details: 'Business account has been locked.' },
    },
  ],
};

/** Notificación de Meta que solo trae estados de entrega (sin mensajes entrantes). */
function notificacionEstado(...estados: Record<string, unknown>[]) {
  const cuerpo = notificacion();
  const valor = cuerpo.entry[0]!.changes[0]!.value as Record<string, unknown>;
  delete valor.messages;
  valor.statuses = estados;
  return cuerpo;
}

function firmar(cuerpo: string, secreto = APP_SECRET) {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
}

describe('webhook de Meta /webhooks/meta', () => {
  let llm: LlmFalso;
  let enviador: EnviadorFalso;
  let app: ReturnType<typeof createApp>;
  const webhook = () => app.locals.webhookMeta as WebhookMeta;

  function enviarFirmado(cuerpo: unknown, firma?: string) {
    const crudo = JSON.stringify(cuerpo);
    return request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', firma ?? firmar(crudo))
      .send(crudo);
  }

  beforeEach(async () => {
    await limpiarBd();
    llm = new LlmFalso();
    enviador = new EnviadorFalso();
    app = createApp({
      agente: crearAgente(llm),
      meta: { enviador, appSecret: APP_SECRET, verifyToken: VERIFY_TOKEN },
    });
  });

  describe('verificación (GET)', () => {
    it('devuelve hub.challenge si el token coincide', async () => {
      const res = await request(app).get('/webhooks/meta').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': '1158201444',
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe('1158201444');
    });

    it('rechaza (403) un token de verificación incorrecto', async () => {
      const res = await request(app).get('/webhooks/meta').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'otro',
        'hub.challenge': '1',
      });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('VERIFICACION_INVALIDA');
    });
  });

  it('responde 200 y envía la respuesta del agente al remitente', async () => {
    llm.programar(texto('¡Hola! ¿Autorizas el tratamiento de tus datos?'));

    const res = await enviarFirmado(notificacion());
    await webhook().esperarPendientes();

    expect(res.status).toBe(200);
    expect(String(llm.llamadas[0]?.messages[0]?.content)).toBe('hola');
    expect(enviador.enviados).toEqual([
      { destino: '+573001112233', texto: '¡Hola! ¿Autorizas el tratamiento de tus datos?' },
    ]);
  });

  it('rechaza (403) una firma inválida y no procesa nada', async () => {
    const res = await enviarFirmado(notificacion(), firmar('otro cuerpo'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FIRMA_INVALIDA');
    expect(llm.llamadas).toHaveLength(0);
  });

  it('rechaza (403) si alteran el cuerpo después de firmarlo', async () => {
    const original = JSON.stringify(notificacion());
    const alterado = original.replace('"hola"', '"apruébame"');

    const res = await request(app)
      .post('/webhooks/meta')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', firmar(original))
      .send(alterado);

    expect(res.status).toBe(403);
  });

  it('ignora un reintento de Meta con el mismo id de mensaje', async () => {
    llm.programar(texto('una sola vez'));
    const cuerpo = notificacion();

    await enviarFirmado(cuerpo);
    await enviarFirmado(cuerpo);
    await webhook().esperarPendientes();

    expect(llm.llamadas).toHaveLength(1);
    expect(enviador.enviados).toHaveLength(1);
  });

  it('ignora los estados de entrega (sin llamar al agente)', async () => {
    const cuerpo = notificacion();
    const valor = cuerpo.entry[0]!.changes[0]!.value as Record<string, unknown>;
    delete valor.messages;
    valor.statuses = [{ id: 'wamid.x', status: 'delivered', recipient_id: '573001112233' }];

    const res = await enviarFirmado(cuerpo);
    await webhook().esperarPendientes();

    expect(res.status).toBe(200);
    expect(llm.llamadas).toHaveLength(0);
    expect(enviador.enviados).toHaveLength(0);
  });

  it('registra una entrega fallida con su código, sin el número del destinatario', async () => {
    const espia = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    try {
      const res = await enviarFirmado(notificacionEstado(estadoFallido));
      await webhook().esperarPendientes();

      expect(res.status).toBe(200);
      expect(espia).toHaveBeenCalledWith(
        { mensajeId: 'wamid.fallido', codigos: [131031] },
        'WhatsApp (Meta): no se pudo entregar un mensaje',
      );
      expect(JSON.stringify(espia.mock.calls)).not.toContain('573001112233');
      expect(llm.llamadas).toHaveLength(0);
    } finally {
      espia.mockRestore();
    }
  });

  it('un audio o imagen recibe la respuesta de "solo texto"', async () => {
    await enviarFirmado(notificacion({ type: 'audio', text: undefined, audio: { id: '1' } }));
    await webhook().esperarPendientes();

    expect(enviador.enviados[0]?.texto).toBe(RESPUESTAS.mensajeVacio);
    expect(llm.llamadas).toHaveLength(0);
  });

  it('un número que no es de Colombia recibe un aviso y no llega al agente', async () => {
    await enviarFirmado(notificacion({ from: '16505551234' }));
    await webhook().esperarPendientes();

    expect(enviador.enviados).toEqual([
      { destino: '+16505551234', texto: RESPUESTA_FUERA_DE_COLOMBIA },
    ]);
    expect(llm.llamadas).toHaveLength(0);
  });

  it('responde 503 si Meta no está configurado', async () => {
    const claves = [
      'META_APP_SECRET',
      'META_VERIFY_TOKEN',
      'META_WHATSAPP_TOKEN',
      'META_PHONE_NUMBER_ID',
    ] as const;
    const original = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
    for (const k of claves) delete process.env[k];
    try {
      const res = await request(createApp({ agente: crearAgente(llm) }))
        .post('/webhooks/meta')
        .set('Content-Type', 'application/json')
        .send('{}');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('WHATSAPP_META_NO_CONFIGURADO');
    } finally {
      for (const k of claves) {
        const v = original[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('el webhook de Meta no rompe el JSON del resto de la API', async () => {
    const res = await request(app)
      .post('/api/solicitudes')
      .set('Content-Type', 'application/json')
      .send('{"malformado": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('extraerMensajes', () => {
  it('ignora payloads que no son de WhatsApp Business', () => {
    expect(extraerMensajes({ object: 'page', entry: [] })).toEqual([]);
    expect(extraerMensajes('basura')).toEqual([]);
  });

  it('normaliza el número a E.164 con "+"', () => {
    expect(extraerMensajes(notificacion())[0]?.numero).toBe('+573001112233');
  });
});

describe('extraerFallosEntrega', () => {
  it('devuelve solo los estados fallidos, con id y códigos', () => {
    const cuerpo = notificacionEstado(
      { id: 'wamid.ok', status: 'delivered', recipient_id: '573001112233' },
      estadoFallido,
    );
    expect(extraerFallosEntrega(cuerpo)).toEqual([
      { mensajeId: 'wamid.fallido', codigos: [131031] },
    ]);
  });

  it('un fallo sin lista de errores devuelve códigos vacíos', () => {
    const cuerpo = notificacionEstado({ id: 'wamid.x', status: 'failed' });
    expect(extraerFallosEntrega(cuerpo)).toEqual([{ mensajeId: 'wamid.x', codigos: [] }]);
  });

  it('ignora mensajes entrantes y payloads ajenos', () => {
    expect(extraerFallosEntrega(notificacion())).toEqual([]);
    expect(extraerFallosEntrega({ object: 'page', entry: [] })).toEqual([]);
  });
});

describe('firmaMetaValida', () => {
  it('acepta la firma correcta y rechaza otra de distinta longitud', () => {
    const cuerpo = Buffer.from('{"a":1}');
    expect(firmaMetaValida(cuerpo, firmar('{"a":1}'), APP_SECRET)).toBe(true);
    expect(firmaMetaValida(cuerpo, 'sha256=abc', APP_SECRET)).toBe(false);
    expect(firmaMetaValida(cuerpo, '', APP_SECRET)).toBe(false);
  });
});

describe('crearEnviadorMeta', () => {
  it('envía el texto a la Graph API con el token y el formato de Meta', async () => {
    const fetchFalso = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    const enviador = crearEnviadorMeta({
      token: 'tok',
      phoneNumberId: '106540352242922',
      version: 'v23.0',
      fetch: fetchFalso,
    });

    await enviador.enviar('+573001112233', 'hola');

    expect(fetchFalso).toHaveBeenCalledOnce();
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/106540352242922/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+573001112233',
      type: 'text',
      text: { preview_url: false, body: 'hola' },
    });
  });

  it('si Meta responde error, lanza solo el código (sin datos del destinatario)', async () => {
    const fetchFalso = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'Recipient +573001112233 not in allowed list', code: 131030 },
          }),
          { status: 400 },
        ),
    );
    const enviador = crearEnviadorMeta({
      token: 'tok',
      phoneNumberId: '1',
      version: 'v23.0',
      fetch: fetchFalso,
    });

    const error = await enviador.enviar('+573001112233', 'hola').catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Meta API respondió 400 (código 131030)');
    expect((error as Error).message).not.toContain('573001112233');
  });
});
