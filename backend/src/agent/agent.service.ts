import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { MutexPorClave } from '../lib/mutex.js';
import { conversacionModel } from '../models/conversacion.model.js';
import { MODELO_AGENTE, type ClienteLlm, type ParametrosLlm } from './llm.js';
import { SYSTEM_PROMPT } from './prompts/system-prompt.js';
import { ejecutarHerramienta, HERRAMIENTAS, type ContextoConversacion } from './tools.js';

type Mensaje = Anthropic.Beta.BetaMessageParam;

/** Máximo de vueltas modelo → herramientas por cada mensaje de la persona. */
export const MAX_ITERACIONES = 6;
export const MAX_LONGITUD_MENSAJE = 1000;

export const RESPUESTAS = {
  errorTecnico:
    'Lo siento, tuvimos un problema técnico. Por favor intenta de nuevo en unos minutos.',
  noPuedoAyudar:
    'Disculpa, con eso no te puedo ayudar. Puedo darte información sobre nuestro crédito o ayudarte a radicar una solicitud.',
  mensajeLargo: `Tu mensaje es muy largo. ¿Me lo puedes resumir en menos de ${MAX_LONGITUD_MENSAJE} caracteres?`,
  mensajeVacio: 'Por ahora solo puedo leer mensajes de texto. ¿Me escribes tu consulta?',
} as const;

export interface EntradaAgente {
  /** Teléfono del canal en E.164 (lo da WhatsApp, no la persona). */
  telefono: string;
  texto: string;
}

export interface SalidaAgente {
  respuesta: string;
  conversacionId: string | null;
}

function parametros(messages: Mensaje[]): ParametrosLlm {
  return {
    model: MODELO_AGENTE,
    max_tokens: 2048,
    // Prompt y herramientas fijos + caché: los tokens repetidos cuestan ~10 %.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: HERRAMIENTAS,
    cache_control: { type: 'ephemeral' },
    messages,
    // Chat: effort bajo = respuestas rápidas; casi no "piensa" en mensajes simples.
    output_config: { effort: 'low' },
    // Si el modelo declina por seguridad, la API reintenta con un modelo de respaldo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  };
}

function textoDe(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Crea el agente con un cliente LLM inyectado (real o falso en tests).
 */
export function crearAgente(llm: ClienteLlm) {
  const mutex = new MutexPorClave();

  async function turno(entrada: EntradaAgente): Promise<SalidaAgente> {
    const conversacion =
      (await conversacionModel.findActivaPorTelefono(entrada.telefono)) ??
      (await conversacionModel.create(entrada.telefono));

    const historial = conversacion.mensajes as unknown as Mensaje[];
    const ctx: ContextoConversacion = {
      telefono: conversacion.telefono,
      cedula: conversacion.cedula,
      tipoCliente: conversacion.tipoCliente,
      consentimientoAt: conversacion.consentimientoAt,
      solicitudId: conversacion.solicitudId,
    };

    // Mensajes nuevos de este turno. El historial es append-only: nunca se edita.
    const nuevos: Mensaje[] = [{ role: 'user', content: entrada.texto }];
    let respuesta: string = RESPUESTAS.errorTecnico;

    const guardar = (conMensajes: boolean) =>
      conversacionModel.update(conversacion.id, {
        cedula: ctx.cedula,
        tipoCliente: ctx.tipoCliente,
        consentimientoAt: ctx.consentimientoAt,
        solicitudId: ctx.solicitudId,
        ultimoMensajeAt: new Date(),
        ...(conMensajes && {
          mensajes: [...historial, ...nuevos] as unknown as Prisma.InputJsonValue,
        }),
      });

    try {
      for (let i = 0; i < MAX_ITERACIONES; i++) {
        const mensaje = await llm.crearMensaje(parametros([...historial, ...nuevos]));
        // Se guarda el contenido completo (incluye bloques de thinking) sin modificarlo.
        // Excepción: la API rechaza mensajes vacíos en el historial; un rechazo sin
        // texto no se guarda, o la conversación quedaría bloqueada en cada turno.
        if (mensaje.content.length > 0) {
          nuevos.push({ role: 'assistant', content: mensaje.content });
        }

        logger.debug(
          { stop: mensaje.stop_reason, usage: mensaje.usage, iteracion: i },
          'Respuesta del modelo',
        );

        if (mensaje.stop_reason === 'tool_use') {
          const llamadas = mensaje.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
          );
          // Todas las respuestas de herramientas van juntas en un solo mensaje.
          const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const llamada of llamadas) {
            const r = await ejecutarHerramienta(llamada.name, llamada.input, ctx);
            resultados.push({
              type: 'tool_result',
              tool_use_id: llamada.id,
              content: r.contenido,
              is_error: r.esError,
            });
          }
          nuevos.push({ role: 'user', content: resultados });
          continue;
        }

        if (mensaje.stop_reason === 'refusal') {
          logger.warn({ categoria: mensaje.stop_details?.category }, 'El modelo declinó');
          respuesta = RESPUESTAS.noPuedoAyudar;
          break;
        }

        // end_turn, stop_sequence o max_tokens: se responde con el texto disponible.
        respuesta = textoDe(mensaje.content) || RESPUESTAS.errorTecnico;
        break;
      }

      await guardar(true);
      return { respuesta, conversacionId: conversacion.id };
    } catch (err) {
      logger.error({ err }, 'Error procesando el mensaje del agente');
      // Se guarda el estado (p. ej. si ya se creó la solicitud) pero no un historial a medias.
      await guardar(false).catch(() => undefined);
      return { respuesta: RESPUESTAS.errorTecnico, conversacionId: conversacion.id };
    }
  }

  return {
    /** Procesa un mensaje entrante y devuelve la respuesta para la persona. */
    async procesarMensaje(entrada: EntradaAgente): Promise<SalidaAgente> {
      const texto = entrada.texto.trim();
      if (!texto) return { respuesta: RESPUESTAS.mensajeVacio, conversacionId: null };
      if (texto.length > MAX_LONGITUD_MENSAJE) {
        return { respuesta: RESPUESTAS.mensajeLargo, conversacionId: null };
      }
      // Un mensaje a la vez por teléfono.
      return mutex.ejecutar(entrada.telefono, () => turno({ ...entrada, texto }));
    },
  };
}

export type Agente = ReturnType<typeof crearAgente>;
