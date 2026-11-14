import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearAgente } from '../../src/agent/agent.service.js';
import { createApp } from '../../src/app.js';
import { limpiarBd } from '../helpers/db.js';
import { LlmFalso, texto } from '../helpers/llm-falso.js';

describe('POST /api/chat/simulate', () => {
  let llm: LlmFalso;
  beforeEach(async () => {
    await limpiarBd();
    llm = new LlmFalso();
  });

  it('procesa el mensaje con el agente y devuelve la respuesta', async () => {
    llm.programar(texto('¡Hola! ¿Autorizas el tratamiento de tus datos?'));
    const app = createApp({ agente: crearAgente(llm) });

    const res = await request(app)
      .post('/api/chat/simulate')
      .send({ telefono: '300 111 2233', mensaje: 'hola' });

    expect(res.status).toBe(200);
    expect(res.body.data.respuesta).toContain('Autorizas');
    expect(res.body.data.conversacionId).toBeTruthy();
  });

  it('valida el teléfono', async () => {
    const app = createApp({ agente: crearAgente(llm) });

    const res = await request(app)
      .post('/api/chat/simulate')
      .send({ telefono: '123', mensaje: 'hola' });

    expect(res.status).toBe(400);
  });

  it('responde 503 si no hay API key configurada', async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await request(createApp())
        .post('/api/chat/simulate')
        .send({ telefono: '3001112233', mensaje: 'hola' });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('AGENTE_NO_CONFIGURADO');
    } finally {
      if (original) process.env.ANTHROPIC_API_KEY = original;
    }
  });
});
