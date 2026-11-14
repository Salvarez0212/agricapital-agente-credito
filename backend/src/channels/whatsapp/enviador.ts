import twilio from 'twilio';

/** Envía mensajes de WhatsApp. Se abstrae para poder usar uno falso en los tests. */
export interface EnviadorWhatsApp {
  /** `destino` en formato E.164, p. ej. +573001234567 */
  enviar(destino: string, texto: string): Promise<void>;
}

/** Límite de Twilio por mensaje (1600); se deja margen. */
export const MAX_CARACTERES_MENSAJE = 1500;

/** Parte un texto largo en trozos, cortando preferiblemente en saltos de línea o espacios. */
export function partirMensaje(texto: string, max = MAX_CARACTERES_MENSAJE): string[] {
  const partes: string[] = [];
  let resto = texto.trim();
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max);
    if (corte < max / 2) corte = resto.lastIndexOf(' ', max);
    if (corte < max / 2) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

export interface ConfigTwilio {
  accountSid: string;
  authToken: string;
  /** Número remitente, p. ej. whatsapp:+14155238886 (sandbox de Twilio). */
  remitente: string;
}

export function crearEnviadorTwilio({
  accountSid,
  authToken,
  remitente,
}: ConfigTwilio): EnviadorWhatsApp {
  const cliente = twilio(accountSid, authToken);
  return {
    async enviar(destino, texto) {
      for (const parte of partirMensaje(texto)) {
        await cliente.messages.create({ from: remitente, to: `whatsapp:${destino}`, body: parte });
      }
    },
  };
}
