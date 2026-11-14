import { describe, expect, it } from 'vitest';
import { nombresCoinciden } from '../../src/lib/nombres.js';

const REGISTRADO = 'María Fernanda Rojas Gil';

describe('nombresCoinciden', () => {
  it.each([
    'María Fernanda Rojas Gil',
    'maria fernanda rojas gil', // sin tildes ni mayúsculas
    'Rojas Gil María Fernanda', // otro orden
    'María Rojas', // omite segundo nombre y segundo apellido
    'MARIA  FERNANDA ROJAS', // espacios extra
  ])('"%s" es compatible', (dado) => {
    expect(nombresCoinciden(dado, REGISTRADO)).toBe(true);
  });

  it.each([
    'Camila Torres', // otra persona
    'María López', // apellido que no está registrado
    'María Fernanda Rojas Gil Pérez', // agrega un apellido
  ])('"%s" NO es compatible', (dado) => {
    expect(nombresCoinciden(dado, REGISTRADO)).toBe(false);
  });

  it('trata la ñ como n (en el celular mucha gente escribe sin ñ)', () => {
    expect(nombresCoinciden('Julián Niño', 'Julián David Niño Soto')).toBe(true);
    expect(nombresCoinciden('Julian Nino', 'Julián David Niño Soto')).toBe(true);
  });
});
