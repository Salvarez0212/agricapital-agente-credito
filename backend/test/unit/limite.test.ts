import { describe, expect, it } from 'vitest';
import { LimitadorPorClave } from '../../src/agent/guardrails/limite.js';

describe('LimitadorPorClave', () => {
  it('permite hasta el máximo dentro de la ventana y luego bloquea', () => {
    const l = new LimitadorPorClave(2, 1000);
    expect([l.permitir('a', 0), l.permitir('a', 10), l.permitir('a', 20)]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('libera cuando pasa la ventana y no mezcla claves', () => {
    const l = new LimitadorPorClave(1, 1000);
    l.permitir('a', 0);
    expect(l.permitir('b', 10)).toBe(true);
    expect(l.permitir('a', 500)).toBe(false);
    expect(l.permitir('a', 1001)).toBe(true);
  });
});
