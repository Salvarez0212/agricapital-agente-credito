/**
 * Mutex por clave en memoria: serializa el trabajo de una misma clave (aquí, un
 * teléfono) para que dos mensajes seguidos de la misma persona no procesen la
 * conversación al mismo tiempo.
 * Limitación: funciona dentro de un solo proceso. Con varias instancias habría
 * que usar un lock distribuido (p. ej. advisory lock de Postgres o Redis).
 */
export class MutexPorClave {
  private colas = new Map<string, Promise<unknown>>();

  async ejecutar<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = this.colas.get(clave) ?? Promise.resolve();
    const actual = anterior.then(tarea, tarea);
    const cola = actual.catch(() => undefined);
    this.colas.set(clave, cola);
    try {
      return await actual;
    } finally {
      if (this.colas.get(clave) === cola) this.colas.delete(clave);
    }
  }
}
