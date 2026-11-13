import { describe, expect, it } from 'vitest';
import {
  cedulaSchema,
  nombreCompletoSchema,
  telefonoSchema,
} from '../../src/schemas/common.schema.js';

describe('telefonoSchema', () => {
  it.each(['3001234567', '300 123 4567', '573001234567', '+57 300 123 4567', '(300) 123-4567'])(
    'normaliza "%s" a E.164',
    (entrada) => {
      expect(telefonoSchema.parse(entrada)).toBe('+573001234567');
    },
  );

  it.each(['12345', '6011234567', '+1 300 123 4567', 'abc'])('rechaza "%s"', (entrada) => {
    expect(telefonoSchema.safeParse(entrada).success).toBe(false);
  });
});

describe('cedulaSchema', () => {
  it('acepta puntos y espacios', () => {
    expect(cedulaSchema.parse(' 1.010.101.010 ')).toBe('1010101010');
  });

  it.each(['12345', '12345678901', '10a0101010'])('rechaza "%s"', (entrada) => {
    expect(cedulaSchema.safeParse(entrada).success).toBe(false);
  });
});

describe('nombreCompletoSchema', () => {
  it('normaliza espacios y acepta tildes', () => {
    expect(nombreCompletoSchema.parse('  Óscar   Iván Peña ')).toBe('Óscar Iván Peña');
  });

  it('exige nombre y apellido', () => {
    expect(nombreCompletoSchema.safeParse('Camila').success).toBe(false);
  });

  it('rechaza números y símbolos', () => {
    expect(nombreCompletoSchema.safeParse('Camila 123').success).toBe(false);
    expect(nombreCompletoSchema.safeParse('<script> Torres').success).toBe(false);
  });
});
