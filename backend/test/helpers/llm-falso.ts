import type Anthropic from '@anthropic-ai/sdk';
import type { ClienteLlm, MensajeLlm, ParametrosLlm } from '../../src/agent/llm.js';

type Bloque = Anthropic.Beta.BetaContentBlock;
type Paso = MensajeLlm | ((params: ParametrosLlm) => MensajeLlm | Promise<MensajeLlm>);

let contador = 0;

function mensaje(content: Bloque[], stop_reason: MensajeLlm['stop_reason']): MensajeLlm {
  return {
    id: `msg_falso_${++contador}`,
    type: 'message',
    role: 'assistant',
    model: 'modelo-falso',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as MensajeLlm;
}

/** El modelo responde con texto y termina su turno. */
export function texto(t: string): MensajeLlm {
  return mensaje([{ type: 'text', text: t, citations: null } as Bloque], 'end_turn');
}

/** El modelo pide ejecutar una herramienta. */
export function herramienta(name: string, input: object): MensajeLlm {
  return mensaje(
    [{ type: 'tool_use', id: `toolu_${++contador}`, name, input } as unknown as Bloque],
    'tool_use',
  );
}

/** El modelo se quedó sin tokens justo mientras pedía una herramienta. */
export function cortadoEnHerramienta(name: string, input: object): MensajeLlm {
  return mensaje(
    [
      { type: 'text', text: 'Voy a registrar', citations: null } as Bloque,
      { type: 'tool_use', id: `toolu_${++contador}`, name, input } as unknown as Bloque,
    ],
    'max_tokens',
  );
}

export function rechazo(): MensajeLlm {
  return mensaje([], 'refusal');
}

/**
 * Reglas que la API real exige al historial. El LLM falso las verifica para que
 * los tests detecten historiales que en producción provocarían un 400.
 */
export function validarHistorial(messages: ParametrosLlm['messages']) {
  messages.forEach((m, i) => {
    const vacio =
      typeof m.content === 'string' ? m.content.trim() === '' : (m.content?.length ?? 0) === 0;
    if (vacio) throw new Error(`400 invalid_request_error: messages.${i} tiene contenido vacío`);

    // Cada tool_use del asistente debe tener su tool_result en el mensaje siguiente.
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const siguiente = messages[i + 1]?.content;
      const respondidos = new Set(
        Array.isArray(siguiente)
          ? siguiente.flatMap((b) => (b.type === 'tool_result' ? [b.tool_use_id] : []))
          : [],
      );
      for (const b of m.content) {
        if (b.type === 'tool_use' && !respondidos.has(b.id)) {
          throw new Error(`400 invalid_request_error: tool_use ${b.id} sin tool_result`);
        }
      }
    }
  });
}

/**
 * LLM falso: devuelve respuestas programadas en orden y registra cada llamada
 * para que los tests inspeccionen qué recibió (historial, resultados de tools…).
 */
export class LlmFalso implements ClienteLlm {
  readonly llamadas: ParametrosLlm[] = [];
  private pasos: Paso[] = [];

  programar(...pasos: Paso[]) {
    this.pasos.push(...pasos);
    return this;
  }

  async crearMensaje(params: ParametrosLlm): Promise<MensajeLlm> {
    validarHistorial(params.messages);
    // Copia profunda: el agente sigue agregando mensajes al mismo arreglo.
    this.llamadas.push(structuredClone(params));
    const paso = this.pasos.shift();
    if (!paso) throw new Error('LlmFalso: no hay más respuestas programadas');
    return typeof paso === 'function' ? paso(params) : paso;
  }

  /** Último resultado de herramienta que el agente le devolvió al modelo, ya parseado. */
  ultimoResultado(): { contenido: Record<string, unknown>; esError: boolean } {
    const ultima = this.llamadas.at(-1);
    const msg = ultima?.messages.at(-1);
    const bloque = Array.isArray(msg?.content) ? msg.content.at(-1) : undefined;
    if (!bloque || bloque.type !== 'tool_result') throw new Error('No hay tool_result');
    return {
      contenido: JSON.parse(String(bloque.content)),
      esError: bloque.is_error === true,
    };
  }
}
