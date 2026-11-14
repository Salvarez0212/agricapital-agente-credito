import { describe, expect, it } from 'vitest';
import { direccionEscucha } from '../../src/lib/escucha.js';

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
});
