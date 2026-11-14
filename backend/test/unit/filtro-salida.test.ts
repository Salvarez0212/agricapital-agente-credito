import { describe, expect, it } from 'vitest';
import { revisarSalida, variantesPermitidas } from '../../src/agent/guardrails/salida.js';

const sinPermitidos = new Set<string>();

describe('filtro de salida: promesas', () => {
  it.each([
    '¡Felicitaciones! Tu crédito está aprobado.',
    'Tu solicitud fue aprobada, mañana recibes el dinero.',
    'Te desembolsamos el jueves.',
    'Te garantizo que te lo aprueban.',
    'Quedaste aprobado para 8 millones.',
    'El desembolso está garantizado.',
    // Negaciones engañosas: la negación no se refiere a la promesa.
    'No te preocupes, tu crédito está aprobado.',
    'Sin duda, te aprobamos el crédito.',
    'Ni lo pienses: quedaste aprobado.',
  ])('bloquea: "%s"', (texto) => {
    expect(revisarSalida(texto, sinPermitidos)).toBe('PROMESA');
  });

  it.each([
    'Tienes un cupo preaprobado de $8.000.000.',
    'Un cupo preaprobado no es una aprobación: tu solicitud pasa por revisión.',
    'No puedo garantizar la aprobación, eso lo decide el equipo de crédito.',
    'Tu solicitud quedó registrada y está en revisión.',
    'Si tu crédito es aprobado, el desembolso tarda 1 a 2 días hábiles.',
    'No te garantizo el resultado: lo decide el equipo de crédito.',
    'Nunca te aprobamos ni rechazamos por este chat.',
  ])('permite: "%s"', (texto) => {
    expect(revisarSalida(texto, sinPermitidos)).toBeNull();
  });
});

describe('filtro de salida: datos personales', () => {
  const propios = variantesPermitidas(['1234567890', '+573001112233']);

  it('bloquea una cédula ajena', () => {
    expect(revisarSalida('La cédula 1020202020 tiene cupo.', propios)).toBe('DATOS_PERSONALES');
  });

  it('bloquea un teléfono ajeno', () => {
    expect(revisarSalida('Escríbele al 310 555 6677.', propios)).toBe('DATOS_PERSONALES');
  });

  it('permite la cédula y el teléfono de la propia persona, con o sin formato', () => {
    expect(revisarSalida('Registré la cédula 1.234.567.890.', propios)).toBeNull();
    expect(revisarSalida('Te contactaremos al 300 111 2233.', propios)).toBeNull();
    expect(revisarSalida('Tu número +57 300 111 2233 quedó registrado.', propios)).toBeNull();
  });

  it('permite montos de dinero', () => {
    expect(revisarSalida('Prestamos hasta $50.000.000.', propios)).toBeNull();
    expect(revisarSalida('Solicitas 2.000.000 pesos.', propios)).toBeNull();
  });

  it('no confunde fechas con cédulas', () => {
    expect(revisarSalida('Radicada el 2026-11-13.', propios)).toBeNull();
    expect(revisarSalida('Te llamamos el 13/11/2026.', propios)).toBeNull();
  });

  it('permite números que vienen de las herramientas (p. ej. el cupo sin $)', () => {
    const conCupo = variantesPermitidas(['1234567890', '8000000']);
    expect(revisarSalida('Tu cupo es de 8.000.000.', conCupo)).toBeNull();
  });
});
