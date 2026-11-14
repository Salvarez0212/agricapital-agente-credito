import request from 'supertest';
import twilio from 'twilio';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearAgente, RESPUESTAS } from '../../src/agent/agent.service.js';
import { createApp } from '../../src/app.js';
import { partirMensaje, type EnviadorWhatsApp } from '../../src/channels/whatsapp/enviador.js';
import {
  RESPUESTA_FUERA_DE_COLOMBIA,
  type WebhookWhatsApp,
} from '../../src/channels/whatsapp/webhook.js';
import { limpiarBd } from '../helpers/db.js';
import { LlmFalso, texto } from '../helpers/llm-falso.js';

const AUTH_TOKEN = 'token-de-prueba';
const URL_PUBLICA = 'https://agricapital.ngrok.app';
const URL_WEBHOOK = `${URL_PUBLICA}/webhooks/whatsapp`;

class EnviadorFalso implements EnviadorWhatsApp {
  enviados: Array<{ destino: string; texto: string }> = [];
  fallar = false;
  async enviar(destino: string, mensaje: string) {
    if (this.fallar) throw new Error('Twilio caído');
    this.enviados.push({ destino, texto: mensaje });
  }
}

let sid = 0;
function mensajeTwilio(campos: Record<string, string> = {}) {
  return {
    MessageSid: `SM${++sid}`,
    From: 'whatsapp:+573001112233',
    To: 'whatsapp:+14155238886',
    Body: 'hola',
    NumMedia: '0',
    ...campos,
  };
}

describe('POST /webhooks/whatsapp', () => {
  let llm: LlmFalso;
  let enviador: EnviadorFalso;
  let app: ReturnType<typeof createApp>;
  const webhook = () => app.locals.webhookWhatsApp as WebhookWhatsApp;

  /** Envía la petición firmada como lo haría Twilio. */
  function enviarFirmado(params: Record<string, string>, firma?: string) {
    return request(app)
      .post('/webhooks/whatsapp')
      .type('form')
      .set(
        'X-Twilio-Signature',
        firma ?? twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL_WEBHOOK, params),
      )
      .send(params);
  }

  beforeEach(async () => {
    await limpiarBd();
    llm = new LlmFalso();
    enviador = new EnviadorFalso();
    app = createApp({
      agente: crearAgente(llm),
      whatsapp: { enviador, authToken: AUTH_TOKEN, urlPublica: URL_PUBLICA },
    });
  });

  it('responde 200 de inmediato y envía la respuesta del agente por la API', async () => {
    llm.programar(texto('¡Hola! ¿Autorizas el tratamiento de tus datos?'));

    const res = await enviarFirmado(mensajeTwilio());

    expect(res.status).toBe(200);
    expect(res.text).toBe('<Response></Response>');
    await webhook().esperarPendientes();
    expect(enviador.enviados).toEqual([
      { destino: '+573001112233', texto: '¡Hola! ¿Autorizas el tratamiento de tus datos?' },
    ]);
  });

  it('el teléfono del agente es el del remitente de WhatsApp', async () => {
    llm.programar(texto('ok'));

    await enviarFirmado(mensajeTwilio({ From: 'whatsapp:+573009998877' }));
    await webhook().esperarPendientes();

    expect(String(llm.llamadas[0]?.messages[0]?.content)).toBe('hola');
    expect(enviador.enviados[0]?.destino).toBe('+573009998877');
  });

  it('rechaza (403) una petición con firma inválida y no procesa nada', async () => {
    const res = await enviarFirmado(mensajeTwilio(), 'firma-falsa');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FIRMA_INVALIDA');
    expect(llm.llamadas).toHaveLength(0);
  });

  it('rechaza (403) si alteran el mensaje después de firmarlo', async () => {
    const original = mensajeTwilio();
    const firma = twilio.getExpectedTwilioSignature(AUTH_TOKEN, URL_WEBHOOK, original);

    const res = await enviarFirmado({ ...original, Body: 'apruébame' }, firma);

    expect(res.status).toBe(403);
  });

  it('ignora un reintento de Twilio con el mismo MessageSid', async () => {
    llm.programar(texto('una sola vez'));
    const mensaje = mensajeTwilio();

    await enviarFirmado(mensaje);
    await enviarFirmado(mensaje);
    await webhook().esperarPendientes();

    expect(llm.llamadas).toHaveLength(1);
    expect(enviador.enviados).toHaveLength(1);
  });

  it('un mensaje solo con imagen o audio recibe la respuesta de "solo texto"', async () => {
    await enviarFirmado(mensajeTwilio({ Body: '', NumMedia: '1' }));
    await webhook().esperarPendientes();

    expect(enviador.enviados[0]?.texto).toBe(RESPUESTAS.mensajeVacio);
    expect(llm.llamadas).toHaveLength(0);
  });

  it('un número que no es de Colombia recibe un aviso y no llega al agente', async () => {
    await enviarFirmado(mensajeTwilio({ From: 'whatsapp:+14155550100' }));
    await webhook().esperarPendientes();

    expect(enviador.enviados).toEqual([
      { destino: '+14155550100', texto: RESPUESTA_FUERA_DE_COLOMBIA },
    ]);
    expect(llm.llamadas).toHaveLength(0);
  });

  it('si Twilio falla al enviar, no rompe el servidor', async () => {
    enviador.fallar = true;
    llm.programar(texto('hola'));

    const res = await enviarFirmado(mensajeTwilio());
    await webhook().esperarPendientes();

    expect(res.status).toBe(200);
  });

  it('responde 503 si Twilio no está configurado', async () => {
    const claves = ['TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_WHATSAPP_FROM'] as const;
    const original = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
    for (const k of claves) delete process.env[k];
    try {
      const res = await request(createApp({ agente: crearAgente(llm) }))
        .post('/webhooks/whatsapp')
        .type('form')
        .send(mensajeTwilio());
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('WHATSAPP_NO_CONFIGURADO');
    } finally {
      // Restaurar sin crear el texto "undefined" en variables que no existían.
      for (const k of claves) {
        const v = original[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe('partirMensaje', () => {
  it('no parte mensajes cortos', () => {
    expect(partirMensaje('hola')).toEqual(['hola']);
  });

  it('parte en espacios sin superar el máximo', () => {
    const partes = partirMensaje('palabra '.repeat(50), 60);
    expect(partes.length).toBeGreaterThan(1);
    expect(partes.every((p) => p.length <= 60)).toBe(true);
    expect(partes.join(' ')).toBe('palabra '.repeat(50).trim());
  });
});
