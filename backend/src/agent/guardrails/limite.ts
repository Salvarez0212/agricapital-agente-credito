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
    const recientes = (this.registros.get(clave) ?? []).filter((t) => ahora - t < this.ventanaMs);
    if (recientes.length >= this.maximo) {
      this.registros.set(clave, recientes);
      return false;
    }
    recientes.push(ahora);
    this.registros.set(clave, recientes);
    return true;
  }
}
