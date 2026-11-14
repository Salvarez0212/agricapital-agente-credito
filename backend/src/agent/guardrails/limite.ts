/**
 * Límite de mensajes por clave (teléfono) en una ventana deslizante. Frena abusos
 * y el gasto en el modelo si alguien envía mensajes en ráfaga.
 * Limitación: en memoria, por proceso (con varias instancias: Redis).
 */
export class LimitadorPorClave {
  private registros = new Map<string, number[]>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  /** Registra un intento y devuelve false si la clave superó el límite. */
  permitir(clave: string, ahora = Date.now()): boolean {
    if (this.registros.size > 10_000) this.purgar(ahora);
    const recientes = (this.registros.get(clave) ?? []).filter((t) => ahora - t < this.ventanaMs);
    if (recientes.length >= this.maximo) {
      this.registros.set(clave, recientes);
      return false;
    }
    recientes.push(ahora);
    this.registros.set(clave, recientes);
    return true;
  }

  /** Elimina las claves sin intentos dentro de la ventana (evita que el mapa crezca sin límite). */
  purgar(ahora = Date.now()): void {
    for (const [clave, tiempos] of this.registros) {
      if (tiempos.every((t) => ahora - t >= this.ventanaMs)) this.registros.delete(clave);
    }
  }

  get claves(): number {
    return this.registros.size;
  }
}
