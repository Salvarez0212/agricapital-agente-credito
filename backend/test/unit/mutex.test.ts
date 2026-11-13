import { describe, expect, it } from 'vitest';
import { MutexPorClave } from '../../src/lib/mutex.js';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('MutexPorClave', () => {
  it('serializa tareas de la misma clave', async () => {
    const mutex = new MutexPorClave();
    const orden: string[] = [];

    await Promise.all([
      mutex.ejecutar('a', async () => {
        await dormir(20);
        orden.push('a1');
      }),
      mutex.ejecutar('a', async () => {
        orden.push('a2');
      }),
    ]);

    expect(orden).toEqual(['a1', 'a2']);
  });

  it('no bloquea claves distintas y sigue funcionando tras un error', async () => {
    const mutex = new MutexPorClave();
    const orden: string[] = [];

    await Promise.allSettled([
      mutex.ejecutar('a', async () => {
        await dormir(20);
        throw new Error('falla');
      }),
      mutex.ejecutar('b', async () => {
        orden.push('b');
      }),
    ]);
    await mutex.ejecutar('a', async () => {
      orden.push('a');
    });

    expect(orden).toEqual(['b', 'a']);
  });
});
