import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('Seguridad HTTP', () => {
  it('responde con las cabeceras de seguridad de Helmet', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('limita las peticiones por IP a la API con un 429 claro', async () => {
    const app = createApp({ limites: { api: 2 } });

    await request(app).get('/api/clientes/1010101010');
    await request(app).get('/api/clientes/1010101010');
    const res = await request(app).get('/api/clientes/1010101010');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: 'DEMASIADAS_PETICIONES',
        message: 'Demasiadas peticiones. Intenta de nuevo en un momento.',
      },
    });
    const espera = Number(res.headers['retry-after']);
    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThanOrEqual(60);
    expect(res.headers['ratelimit']).toBeDefined();
  });

  it('cuenta por separado a cada cliente que llega por un proxy (X-Forwarded-For)', async () => {
    // Con la API abierta a propósito detrás de un proxy (API_ACCESO_REMOTO=true).
    const app = createApp({ limites: { api: 1 }, apiAccesoRemoto: true });
    const desde = (ip: string) =>
      request(app).get('/api/clientes/1010101010').set('X-Forwarded-For', ip);

    expect((await desde('203.0.113.1')).status).not.toBe(429);
    expect((await desde('203.0.113.1')).status).toBe(429);
    expect((await desde('203.0.113.2')).status).not.toBe(429);
  });

  it('los webhooks tienen su propio límite, que corta antes de llegar al canal', async () => {
    // Sin credenciales de Meta, el canal responde 503: si llega un 503, el canal se ejecutó.
    const app = createApp({ limites: { webhooks: 1 } });

    const primera = await request(app).post('/webhooks/meta').send({});
    const segunda = await request(app).post('/webhooks/meta').send({});

    expect(primera.status).toBe(503);
    expect(segunda.status).toBe(429);
    expect(segunda.body.error.code).toBe('DEMASIADAS_PETICIONES');
  });

  it('/health no tiene límite (lo consultan los monitores)', async () => {
    const app = createApp({ limites: { api: 1, webhooks: 1 } });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });
});

describe('API solo desde esta máquina', () => {
  // cloudflared envía estas cabeceras al reenviar una petición de internet.
  const porElTunel = { 'X-Forwarded-For': '203.0.113.7', 'Cf-Connecting-Ip': '203.0.113.7' };

  it('rechaza con 403 lo que llega por el túnel, sin revelar datos', async () => {
    const res = await request(createApp()).get('/api/solicitudes').set(porElTunel);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 'ACCESO_SOLO_LOCAL',
        message: 'La API solo está disponible desde la red interna del equipo.',
      },
    });
  });

  it.each(['X-Forwarded-For', 'Cf-Connecting-Ip', 'Forwarded', 'X-Real-Ip'])(
    'detecta el reenvío por la cabecera %s',
    async (cabecera) => {
      const res = await request(createApp())
        .get('/api/clientes/1010101010')
        .set(cabecera, cabecera === 'Forwarded' ? 'for=203.0.113.7' : '203.0.113.7');

      expect(res.status).toBe(403);
    },
  );

  it('una cabecera de reenvío vacía también cuenta como reenviada', async () => {
    const res = await request(createApp()).get('/api/solicitudes').set('X-Forwarded-For', '');

    expect(res.status).toBe(403);
  });

  it('también protege el simulador del chat (gasta tokens del modelo)', async () => {
    const res = await request(createApp())
      .post('/api/chat/simulate')
      .set(porElTunel)
      .send({ telefono: '+573001112233', mensaje: 'Hola' });

    expect(res.status).toBe(403);
  });

  it('atiende las peticiones directas, como las del panel y curl', async () => {
    const res = await request(createApp()).get('/api/solicitudes');

    expect(res.status).toBe(200);
  });

  it('el túnel sigue llegando a los webhooks y a /health', async () => {
    const app = createApp();

    expect((await request(app).get('/health').set(porElTunel)).status).toBe(200);
    // Sin credenciales de Meta el canal responde 503: llegó al webhook, no lo bloqueó.
    expect((await request(app).post('/webhooks/meta').set(porElTunel).send({})).status).toBe(503);
  });

  it('API_ACCESO_REMOTO=true la abre a propósito detrás de un proxy', async () => {
    const res = await request(createApp({ apiAccesoRemoto: true }))
      .get('/api/solicitudes')
      .set(porElTunel);

    expect(res.status).toBe(200);
  });
});
