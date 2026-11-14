import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { MARCADOR_BLOQUEADO } from '../../src/lib/marcadores.js';
import { prisma } from '../../src/lib/prisma.js';
import { crearCliente, limpiarBd, solicitudValida } from '../helpers/db.js';

const app = createApp();

function crear(body: object) {
  return request(app).post('/api/solicitudes').send(body);
}

describe('API de solicitudes', () => {
  beforeEach(limpiarBd);

  describe('POST /api/solicitudes', () => {
    it('crea la solicitud de un cliente nuevo EN_REVISION y normaliza el teléfono', async () => {
      const res = await crear(solicitudValida);

      expect(res.status).toBe(201);
      expect(res.headers.location).toBe(`/api/solicitudes/${res.body.data.id}`);
      expect(res.body.data).toMatchObject({
        tipoCliente: 'NUEVO',
        estado: 'EN_REVISION',
        telefono: '+573000000301',
        requiereVerificacion: false,
      });
      expect(res.body.data.consentimientoDatosAt).toBeTruthy();
    });

    it('clasifica según la BD: un preferencial queda como PREFERENCIAL', async () => {
      await crearCliente({
        cedula: '1010101010',
        telefono: '+573000000101',
        cupoPreaprobado: 5_000_000,
      });

      const res = await crear({
        ...solicitudValida,
        cedula: '1010101010',
        telefono: '3000000101',
        nombreCompleto: 'María Fernanda Rojas Gil',
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        tipoCliente: 'PREFERENCIAL',
        requiereVerificacion: false,
      });
    });

    it('marca requiereVerificacion si el teléfono no coincide con el registrado', async () => {
      await crearCliente({ cedula: '1010101010', telefono: '+573000000101' });

      const res = await crear({ ...solicitudValida, cedula: '1010101010', telefono: '3119998888' });

      expect(res.status).toBe(201);
      expect(res.body.data.requiereVerificacion).toBe(true);
    });

    it('marca requiereVerificacion si el nombre no coincide con el registrado', async () => {
      await crearCliente({
        cedula: '1010101010',
        nombreCompleto: 'María Fernanda Rojas Gil',
        telefono: '+573000000101',
      });

      const res = await crear({
        ...solicitudValida,
        cedula: '1010101010',
        telefono: '3000000101', // mismo teléfono
        nombreCompleto: 'Camila Andrea Torres', // otro nombre
      });

      expect(res.status).toBe(201);
      expect(res.body.data.requiereVerificacion).toBe(true);
    });

    it('no marca verificación si el nombre es compatible (sin tildes, abreviado)', async () => {
      await crearCliente({
        cedula: '1010101010',
        nombreCompleto: 'María Fernanda Rojas Gil',
        telefono: '+573000000101',
      });

      const res = await crear({
        ...solicitudValida,
        cedula: '1010101010',
        telefono: '3000000101',
        nombreCompleto: 'maria rojas',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.requiereVerificacion).toBe(false);
    });

    it('responde 409 si ya hay una solicitud en revisión para esa cédula', async () => {
      await crear(solicitudValida);

      const res = await crear(solicitudValida);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('SOLICITUD_EN_REVISION');
    });

    it('la misma cédula desde otro teléfono sí se radica y ambas quedan para verificación', async () => {
      const primera = await crear(solicitudValida);

      const segunda = await crear({ ...solicitudValida, telefono: '3119998877' });

      expect(segunda.status).toBe(201);
      expect(segunda.body.data.requiereVerificacion).toBe(true);
      const detalle = await request(app).get(`/api/solicitudes/${primera.body.data.id}`);
      expect(detalle.body.data.requiereVerificacion).toBe(true);
    });

    it('con peticiones simultáneas de la misma cédula solo crea una', async () => {
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => crear(solicitudValida)));
      const codigos = respuestas.map((r) => r.status).sort();

      expect(codigos).toEqual([201, 409, 409, 409, 409]);
    });

    it('rechaza (400) que el cliente intente fijar el estado', async () => {
      const res = await crear({ ...solicitudValida, estado: 'APROBADA' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rechaza (400) si no se acepta el tratamiento de datos', async () => {
      const res = await crear({ ...solicitudValida, aceptaTratamientoDatos: false });

      expect(res.status).toBe(400);
      expect(res.body.error.details[0].campo).toBe('aceptaTratamientoDatos');
    });

    it('devuelve el detalle de cada campo inválido', async () => {
      const res = await crear({ cedula: 'abc', aceptaTratamientoDatos: true });

      expect(res.status).toBe(400);
      const campos = res.body.error.details.map((d: { campo: string }) => d.campo);
      expect(campos).toEqual(
        expect.arrayContaining(['cedula', 'nombreCompleto', 'telefono', 'municipio']),
      );
    });

    it('responde 400 con JSON mal formado', async () => {
      const res = await request(app)
        .post('/api/solicitudes')
        .set('content-type', 'application/json')
        .send('{"cedula": ');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('GET /api/solicitudes', () => {
    it('lista de la más reciente a la más antigua y filtra por cédula parcial', async () => {
      await crear({ ...solicitudValida, cedula: '1111111111' });
      await crear({ ...solicitudValida, cedula: '1111122222' });
      await crear({ ...solicitudValida, cedula: '9999999999' });

      const res = await request(app).get('/api/solicitudes?cedula=11111');

      expect(res.status).toBe(200);
      expect(res.body.data.map((s: { cedula: string }) => s.cedula)).toEqual([
        '1111122222',
        '1111111111',
      ]);
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('GET /api/solicitudes/:id', () => {
    it('devuelve el detalle completo', async () => {
      const { body } = await crear(solicitudValida);

      const res = await request(app).get(`/api/solicitudes/${body.data.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(body.data.id);
    });

    it('responde 404 si no existe', async () => {
      const res = await request(app).get('/api/solicitudes/2f1d8b9e-7c1a-4d5e-9f3a-1b2c3d4e5f60');
      expect(res.status).toBe(404);
    });

    it('responde 400 si el id no es un UUID', async () => {
      const res = await request(app).get('/api/solicitudes/123');
      expect(res.status).toBe(400);
    });
  });

  describe('intentos bloqueados por la guardia', () => {
    /** Conversación del agente que radicó la solicitud, con los mensajes indicados. */
    function conversacion(solicitudId: string, mensajes: object[]) {
      return prisma.conversacion.create({
        data: { telefono: '+573000000301', solicitudId, mensajes },
      });
    }

    it('cuenta los mensajes bloqueados en la conversación que radicó la solicitud', async () => {
      const conBloqueos = (await crear(solicitudValida)).body.data;
      const sinBloqueos = (
        await crear({ ...solicitudValida, cedula: '79888777', telefono: '3109998877' })
      ).body.data;
      await conversacion(conBloqueos.id, [
        { role: 'user', content: 'Hola' },
        { role: 'user', content: MARCADOR_BLOQUEADO },
        { role: 'assistant', content: [{ type: 'text', text: 'No puedo ayudarte con eso.' }] },
        { role: 'user', content: MARCADOR_BLOQUEADO },
      ]);
      await conversacion(sinBloqueos.id, [{ role: 'user', content: 'Hola' }]);

      const lista = await request(app).get('/api/solicitudes');
      const intentos = Object.fromEntries(
        lista.body.data.map((s: { id: string; intentosBloqueados: number }) => [
          s.id,
          s.intentosBloqueados,
        ]),
      );
      expect(intentos).toEqual({ [conBloqueos.id]: 2, [sinBloqueos.id]: 0 });

      const detalle = await request(app).get(`/api/solicitudes/${conBloqueos.id}`);
      expect(detalle.body.data.intentosBloqueados).toBe(2);
    });

    it('nunca expone el texto bloqueado, solo el número', async () => {
      const { id } = (await crear(solicitudValida)).body.data;
      await conversacion(id, [{ role: 'user', content: MARCADOR_BLOQUEADO }]);

      const res = await request(app).get(`/api/solicitudes/${id}`);

      expect(JSON.stringify(res.body)).not.toContain(MARCADOR_BLOQUEADO);
      expect(res.body.data.intentosBloqueados).toBe(1);
    });

    it('una solicitud radicada por la API (sin conversación) tiene 0', async () => {
      const res = await crear(solicitudValida);

      expect(res.body.data.intentosBloqueados).toBe(0);
    });
  });
});
