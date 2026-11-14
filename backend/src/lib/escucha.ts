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
