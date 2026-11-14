import type { Agente } from '../../agent/agent.service.js';
import { logger } from '../../lib/logger.js';
import { telefonoSchema } from '../../schemas/common.schema.js';
import type { EnviadorWhatsApp } from './enviador.js';

export const RESPUESTA_FUERA_DE_COLOMBIA =
  'Hola. Por ahora solo podemos atender celulares de Colombia. Gracias por escribirnos.';

/** Mensaje entrante ya normalizado, venga de Twilio o de Meta. */
export interface MensajeEntrante {
  /** Id del proveedor (MessageSid de Twilio, wamid de Meta): sirve para descartar reintentos. */
  id: string;
  /** Número del remitente en E.164, p. ej. +573001234567. */
  numero: string;
  /** Texto del mensaje; vacío si solo trae adjuntos. */
  texto: string;
}

export interface OpcionesProcesador {
  obtenerAgente: () => Agente;
  enviador: EnviadorWhatsApp;
  /** Nombre del canal para los logs. */
  canal: string;
}

const VENTANA_DUPLICADOS_MS = 60 * 60 * 1000;

/**
 * Lógica común a los canales de WhatsApp: descarta reintentos del proveedor, pasa el
 * mensaje al agente en segundo plano y envía la respuesta. El webhook responde al
 * proveedor de inmediato y no depende de cuánto tarde el agente.
 */
export function crearProcesadorMensajes({ obtenerAgente, enviador, canal }: OpcionesProcesador) {
  const pendientes = new Set<Promise<void>>();
  const vistos = new Map<string, number>();

  function yaProcesado(id: string): boolean {
    const ahora = Date.now();
    for (const [visto, t] of vistos) if (ahora - t > VENTANA_DUPLICADOS_MS) vistos.delete(visto);
    if (vistos.has(id)) return true;
    vistos.set(id, ahora);
    return false;
  }

  async function procesar({ id, numero, texto }: MensajeEntrante): Promise<void> {
    try {
      const telefono = telefonoSchema.safeParse(numero);
      if (!telefono.success) {
        await enviador.enviar(numero, RESPUESTA_FUERA_DE_COLOMBIA);
        return;
      }
      // Un mensaje solo con adjuntos llega sin texto: el agente responde que solo lee texto.
      const { respuesta } = await obtenerAgente().procesarMensaje({
        telefono: telefono.data,
        texto,
      });
      await enviador.enviar(telefono.data, respuesta);
    } catch (err) {
      logger.error({ err, canal, mensajeId: id }, 'WhatsApp: no se pudo procesar el mensaje');
    }
  }

  return {
    /** Encola el mensaje; devuelve false si es un reintento ya visto. */
    recibir(mensaje: MensajeEntrante): boolean {
      logger.info({ canal, mensajeId: mensaje.id }, 'WhatsApp: mensaje recibido');
      if (yaProcesado(mensaje.id)) {
        logger.info({ canal, mensajeId: mensaje.id }, 'WhatsApp: mensaje duplicado ignorado');
        return false;
      }
      const tarea = procesar(mensaje).finally(() => pendientes.delete(tarea));
      pendientes.add(tarea);
      return true;
    },
    /** Espera a que terminen los mensajes en proceso (tests y apagado ordenado). */
    async esperarPendientes(): Promise<void> {
      await Promise.all([...pendientes]);
    },
  };
}

export type ProcesadorMensajes = ReturnType<typeof crearProcesadorMensajes>;
