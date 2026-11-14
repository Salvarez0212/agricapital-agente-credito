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
  const port = Number(env.PORT ?? 3000);
  return { host, port };
}
