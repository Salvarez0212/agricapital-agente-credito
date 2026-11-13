import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { clasificarCliente } from '../../src/services/cliente.service.js';

describe('clasificarCliente', () => {
  it('sin registro en la BD → NUEVO', () => {
    expect(clasificarCliente(null)).toBe('NUEVO');
  });

  it('con cupo preaprobado > 0 → PREFERENCIAL', () => {
    expect(clasificarCliente({ cupoPreaprobado: new Prisma.Decimal(5_000_000) })).toBe(
      'PREFERENCIAL',
    );
  });

  it('sin cupo (null) → ANTIGUO', () => {
    expect(clasificarCliente({ cupoPreaprobado: null })).toBe('ANTIGUO');
  });

  it('con cupo en 0 → ANTIGUO', () => {
    expect(clasificarCliente({ cupoPreaprobado: new Prisma.Decimal(0) })).toBe('ANTIGUO');
  });
});
