/**
 * Interfaz de red en la que escucha la API.
 *
 * Por defecto solo 127.0.0.1: la API no tiene autenticación y devuelve datos personales,
 * así que no debe quedar expuesta a la red local (p. ej. la Wi-Fi de un café). El túnel de
 * WhatsApp (cloudflared) y el proxy del panel se conectan por 127.0.0.1, así que siguen
 * funcionando. Para escuchar en todas las interfaces (p. ej. dentro de un contenedor,
 * detrás de un proxy con autenticación) se define HOST=0.0.0.0 a propósito.
 */
export function direccionEscucha(env: NodeJS.ProcessEnv = process.env): {
  host: string;
  port: number;
} {
  const host = env.HOST?.trim() || '127.0.0.1';
  // Un PORT vacío daría 0 (Node elegiría un puerto al azar): se toma como no definido.
  const textoPuerto = env.PORT?.trim() || '3000';
  const port = Number(textoPuerto);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT inválido: "${textoPuerto}". Debe ser un entero entre 1 y 65535.`);
  }
  return { host, port };
}

/** API_ACCESO_REMOTO: acepta "true" o "1" sin importar mayúsculas; cualquier otra cosa es no. */
export function apiAccesoRemoto(env: NodeJS.ProcessEnv = process.env): boolean {
  const valor = env.API_ACCESO_REMOTO?.trim().toLowerCase();
  return valor === 'true' || valor === '1';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * Aviso para el arranque si la API queda expuesta a la red sin una decisión explícita:
 * con HOST distinto de loopback, el bloqueo de /api depende solo de las cabeceras de
 * proxy, y una conexión directa desde la red no las trae.
 */
export function advertenciaExposicion(host: string, accesoRemoto: boolean): string | null {
  if (LOOPBACK.has(host) || accesoRemoto) return null;
  return (
    `La API escucha en ${host}: cualquiera en la red puede llegar a /api con una conexión ` +
    'directa (sin login). Úsalo solo detrás de algo que la proteja y, si es a propósito, ' +
    'define API_ACCESO_REMOTO=true.'
  );
}
