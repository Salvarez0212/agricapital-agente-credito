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
    expect(res.headers['retry-after']).toBe('60');
    expect(res.headers['ratelimit']).toBeDefined();
  });

  it('cuenta por separado a cada cliente que llega por el túnel (X-Forwarded-For)', async () => {
    const app = createApp({ limites: { api: 1 } });
    const desde = (ip: string) =>
      request(app).get('/api/clientes/1010101010').set('X-Forwarded-For', ip);

    expect((await desde('203.0.113.1')).status).not.toBe(429);
    expect((await desde('203.0.113.1')).status).toBe(429);
    expect((await desde('203.0.113.2')).status).not.toBe(429);
  });

  it('los webhooks tienen su propio límite', async () => {
    const app = createApp({ limites: { webhooks: 1 } });

    await request(app).get('/webhooks/meta');
    const res = await request(app).get('/webhooks/meta');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('DEMASIADAS_PETICIONES');
  });

  it('/health no tiene límite (lo consultan los monitores)', async () => {
    const app = createApp({ limites: { api: 1, webhooks: 1 } });

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });
});
