import { describe, expect, it } from 'vitest';
import {
  formatearCedula,
  formatearFecha,
  formatearMonto,
  formatearTelefono,
  soloDigitos,
  textoIntentos,
} from './formato';

describe('formato', () => {
  it('agrupa la cédula por miles con puntos', () => {
    expect(formatearCedula('1010101010')).toBe('1.010.101.010');
    expect(formatearCedula('123456')).toBe('123.456');
  });

  it('muestra el celular colombiano en bloques y deja otros formatos igual', () => {
    expect(formatearTelefono('+573001234567')).toBe('+57 300 123 4567');
    expect(formatearTelefono('+16505551234')).toBe('+16505551234');
  });

  it('muestra la fecha en hora de Colombia', () => {
    // 2026-11-14 03:30 UTC = 13 de nov., 10:30 p. m. en Bogotá (UTC-5).
    expect(formatearFecha('2026-11-14T03:30:00.000Z')).toMatch(/13\/11\/2026.*10:30/);
  });

  it('formatea pesos sin decimales y avisa cuando no hay monto', () => {
    expect(formatearMonto(5_000_000).replace(/\s/g, ' ')).toMatch(/\$ ?5\.000\.000/);
    expect(formatearMonto(null)).toBe('No indicado');
  });

  it('deja solo los dígitos de lo que escribe la persona', () => {
    expect(soloDigitos('+57 300-123.45')).toBe('5730012345');
    expect(soloDigitos('abc')).toBe('');
  });

  it('concuerda el número de intentos bloqueados', () => {
    expect(textoIntentos(1)).toBe('1 intento bloqueado');
    expect(textoIntentos(4)).toBe('4 intentos bloqueados');
  });
});
