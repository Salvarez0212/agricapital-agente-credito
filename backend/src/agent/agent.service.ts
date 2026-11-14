import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { MutexPorClave } from '../lib/mutex.js';
import { conversacionModel } from '../models/conversacion.model.js';
import { crearGuardiaEntrada, type GuardiaEntrada } from './guardrails/entrada.js';
import { LimitadorPorClave } from './guardrails/limite.js';
import { revisarSalida, variantesPermitidas, type MotivoSalida } from './guardrails/salida.js';
import { MODELO_AGENTE, type ClienteLlm, type ParametrosLlm } from './llm.js';
import { SYSTEM_PROMPT } from './prompts/system-prompt.js';
import { ejecutarHerramienta, HERRAMIENTAS, type ContextoConversacion } from './tools.js';
import { MARCADOR_BLOQUEADO } from '../lib/marcadores.js';

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
  bloqueado:
    'Solo puedo ayudarte con información sobre nuestro crédito o con la radicación de tu solicitud. ¿En qué te ayudo?',
  limite:
    'Recibimos muchos mensajes seguidos. Por favor espera unos minutos y vuelve a escribirnos.',
  promesa:
    'Tu solicitud queda en revisión: el equipo de crédito la evaluará y un asesor te contactará. Por este chat no puedo confirmar aprobaciones ni desembolsos.',
  datosPersonales:
    'Disculpa, no puedo compartir esa información. ¿Te ayudo con algo más sobre tu crédito?',
} as const;

export { MARCADOR_BLOQUEADO };

const RESPUESTA_POR_MOTIVO: Record<MotivoSalida, string> = {
  PROMESA: RESPUESTAS.promesa,
  DATOS_PERSONALES: RESPUESTAS.datosPersonales,
};

/** Límite por defecto: 15 mensajes cada 5 minutos por teléfono. */
export const LIMITE_MENSAJES = { maximo: 15, ventanaMs: 5 * 60 * 1000 };

const NUMEROS = /\d[\d.,]*\d/g;
/** Números legítimos de la FAQ (montos, plazos): el filtro de salida no los trata como datos personales. */
const NUMEROS_FAQ = SYSTEM_PROMPT.match(NUMEROS) ?? [];

/**
 * Números que ya conoce la conversación: los que escribió la propia persona y los
 * que devolvieron las herramientas. Repetirlos no revela nada nuevo.
 */
function numerosConocidos(mensajes: Mensaje[]): string[] {
  return mensajes.flatMap((m) => {
    if (typeof m.content === 'string') {
      return m.role === 'user' ? (m.content.match(NUMEROS) ?? []) : [];
    }
    return (m.content ?? []).flatMap((b) =>
      b.type === 'tool_result' && typeof b.content === 'string'
        ? (b.content.match(NUMEROS) ?? [])
        : [],
    );
  });
}

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

export interface OpcionesAgente {
  /** Guardia de entrada. Por defecto: solo heurísticas (sin llamada extra al modelo). */
  guardia?: GuardiaEntrada;
  limitador?: LimitadorPorClave;
}

/**
 * Crea el agente con un cliente LLM inyectado (real o falso en tests).
 */
export function crearAgente(llm: ClienteLlm, opciones: OpcionesAgente = {}) {
  const mutex = new MutexPorClave();
  const guardia = opciones.guardia ?? crearGuardiaEntrada();
  const limitador =
    opciones.limitador ?? new LimitadorPorClave(LIMITE_MENSAJES.maximo, LIMITE_MENSAJES.ventanaMs);

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
      // Guardia de entrada: un intento de manipulación no llega al modelo principal,
      // y en el historial queda un marcador en vez del texto del ataque.
      const veredicto = await guardia.evaluar(entrada.texto);
      if (veredicto.bloquear) {
        logger.warn(
          { motivo: veredicto.motivo, categoria: veredicto.categoria },
          'Mensaje bloqueado por la guardia de entrada',
        );
        nuevos.splice(
          0,
          nuevos.length,
          { role: 'user', content: MARCADOR_BLOQUEADO },
          { role: 'assistant', content: [{ type: 'text', text: RESPUESTAS.bloqueado }] },
        );
        await guardar(true);
        return { respuesta: RESPUESTAS.bloqueado, conversacionId: conversacion.id };
      }

      for (let i = 0; i < MAX_ITERACIONES; i++) {
        const mensaje = await llm.crearMensaje(parametros([...historial, ...nuevos]));
        const cortadaEnHerramienta =
          mensaje.stop_reason === 'max_tokens' &&
          mensaje.content.some((b) => b.type === 'tool_use');

        // Se guarda el contenido completo (incluye bloques de thinking) sin modificarlo.
        // Excepciones, porque la API rechazaría el historial en el siguiente turno:
        // - un rechazo sin texto (mensaje vacío);
        // - una respuesta cortada a mitad de una herramienta (tool_use sin tool_result).
        if (mensaje.content.length > 0 && !cortadaEnHerramienta) {
          nuevos.push({ role: 'assistant', content: mensaje.content });
        }

        if (cortadaEnHerramienta) {
          logger.warn({ iteracion: i }, 'Respuesta cortada a mitad de una herramienta');
          respuesta = RESPUESTAS.errorTecnico;
          break;
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

        // end_turn, stop_sequence o max_tokens: se responde con el texto disponible,
        // pasando antes por el filtro de salida.
        const texto = textoDe(mensaje.content);
        const motivo = texto
          ? revisarSalida(
              texto,
              variantesPermitidas([
                ctx.cedula,
                ctx.telefono,
                ...NUMEROS_FAQ,
                ...numerosConocidos([...historial, ...nuevos]),
              ]),
            )
          : null;
        if (motivo) {
          logger.warn({ motivo }, 'Filtro de salida: respuesta del modelo reemplazada');
          respuesta = RESPUESTA_POR_MOTIVO[motivo];
          // El historial refleja lo que la persona realmente recibió.
          nuevos[nuevos.length - 1] = {
            role: 'assistant',
            content: [{ type: 'text', text: respuesta }],
          };
          break;
        }
        respuesta = texto || RESPUESTAS.errorTecnico;
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
      if (!limitador.permitir(entrada.telefono)) {
        logger.warn('Límite de mensajes alcanzado');
        return { respuesta: RESPUESTAS.limite, conversacionId: null };
      }
      // Un mensaje a la vez por teléfono.
      return mutex.ejecutar(entrada.telefono, () => turno({ ...entrada, texto }));
    },
  };
}

export type Agente = ReturnType<typeof crearAgente>;
