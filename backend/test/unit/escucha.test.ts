import { describe, expect, it } from 'vitest';
import { advertenciaExposicion, apiAccesoRemoto, direccionEscucha } from '../../src/lib/escucha.js';

describe('direccionEscucha', () => {
  it('por defecto escucha solo en la máquina local, en el puerto 3000', () => {
    expect(direccionEscucha({})).toEqual({ host: '127.0.0.1', port: 3000 });
  });

  it('un HOST vacío no abre la API a la red', () => {
    expect(direccionEscucha({ HOST: '  ' }).host).toBe('127.0.0.1');
  });

  it('permite abrirla a propósito con HOST y cambiar el puerto con PORT', () => {
    expect(direccionEscucha({ HOST: '0.0.0.0', PORT: '8080' })).toEqual({
      host: '0.0.0.0',
      port: 8080,
    });
  });

  it('un PORT vacío usa el 3000 en vez de un puerto al azar', () => {
    expect(direccionEscucha({ PORT: '' }).port).toBe(3000);
  });

  it('un PORT inválido falla con un mensaje claro', () => {
    expect(() => direccionEscucha({ PORT: 'abc' })).toThrow('PORT inválido: "abc"');
    expect(() => direccionEscucha({ PORT: '70000' })).toThrow('PORT inválido');
  });
});

describe('apiAccesoRemoto', () => {
  it.each(['true', 'TRUE', ' True ', '1'])('"%s" la activa', (valor) => {
    expect(apiAccesoRemoto({ API_ACCESO_REMOTO: valor })).toBe(true);
  });

  it.each([undefined, '', 'false', 'no', 'si'])('"%s" la deja apagada', (valor) => {
    expect(apiAccesoRemoto({ API_ACCESO_REMOTO: valor })).toBe(false);
  });
});

describe('advertenciaExposicion', () => {
  it('no avisa si solo escucha en esta máquina', () => {
    expect(advertenciaExposicion('127.0.0.1', false)).toBeNull();
  });

  it('avisa si la API queda abierta a la red sin decidirlo explícitamente', () => {
    expect(advertenciaExposicion('0.0.0.0', false)).toContain('API_ACCESO_REMOTO=true');
  });

  it('no avisa si se abrió a propósito', () => {
    expect(advertenciaExposicion('0.0.0.0', true)).toBeNull();
  });
});
