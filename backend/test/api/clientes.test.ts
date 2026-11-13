import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { crearCliente, limpiarBd } from '../helpers/db.js';

const app = createApp();

describe('API de clientes', () => {
  beforeEach(limpiarBd);

  describe('GET /api/clientes/:cedula', () => {
    it('devuelve un cliente preferencial con su cupo', async () => {
      await crearCliente({ cedula: '1010101010', cupoPreaprobado: 8_000_000 });

      const res = await request(app).get('/api/clientes/1010101010');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        cedula: '1010101010',
        tipo: 'PREFERENCIAL',
        cupoPreaprobado: 8_000_000,
      });
    });

    it('devuelve un cliente antiguo sin cupo', async () => {
      await crearCliente({ cedula: '2010101010', cupoPreaprobado: null });

      const res = await request(app).get('/api/clientes/2010101010');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ tipo: 'ANTIGUO', cupoPreaprobado: null });
    });

    it('responde 404 si la cédula no existe (cliente nuevo)', async () => {
      const res = await request(app).get('/api/clientes/9999999999');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CLIENTE_NO_ENCONTRADO');
    });

    it('responde 400 si la cédula tiene formato inválido', async () => {
      const res = await request(app).get('/api/clientes/12ab');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].campo).toBe('cedula');
    });
  });

  describe('GET /api/clientes', () => {
    it('filtra por coincidencia parcial de teléfono y pagina', async () => {
      await crearCliente({ cedula: '1111111111', telefono: '+573001110000' });
      await crearCliente({ cedula: '2222222222', telefono: '+573002220000' });

      const res = await request(app).get('/api/clientes?telefono=300 111');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].cedula).toBe('1111111111');
      expect(res.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    });

    it('responde 400 si pageSize excede el máximo', async () => {
      const res = await request(app).get('/api/clientes?pageSize=1000');
      expect(res.status).toBe(400);
    });
  });
});
