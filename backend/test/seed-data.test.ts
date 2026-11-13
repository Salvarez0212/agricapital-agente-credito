import { describe, expect, it } from 'vitest';
import { antiguos, clientesDemo, preferenciales } from '../prisma/seed-data.js';

const todos = [...preferenciales, ...antiguos, ...clientesDemo('+573009999999')];

describe('datos del seed', () => {
  it('las cédulas son únicas y tienen entre 6 y 10 dígitos', () => {
    const cedulas = todos.map((c) => c.cedula);
    expect(new Set(cedulas).size).toBe(cedulas.length);
    for (const cedula of cedulas) expect(cedula).toMatch(/^\d{6,10}$/);
  });

  it('los teléfonos están en formato E.164 de Colombia', () => {
    for (const c of todos) expect(c.telefono).toMatch(/^\+57\d{10}$/);
  });

  it('los preferenciales tienen cupo > 0 y los antiguos no', () => {
    for (const c of preferenciales) expect(c.cupoPreaprobado).toBeGreaterThan(0);
    for (const c of antiguos) expect(c.cupoPreaprobado ?? 0).toBe(0);
  });
});
