import Anthropic from '@anthropic-ai/sdk';

export type MensajeLlm = Anthropic.Beta.BetaMessage;
export type ParametrosLlm = Anthropic.Beta.MessageCreateParamsNonStreaming;

/**
 * Contrato mínimo que el agente necesita de un LLM. En producción lo cumple la
 * API de Claude; en los tests, un LLM falso con respuestas programadas (sin
 * costo ni red).
 */
export interface ClienteLlm {
  crearMensaje(params: ParametrosLlm): Promise<MensajeLlm>;
}

export const MODELO_AGENTE = process.env.AGENT_MODEL ?? 'claude-sonnet-5-5';

/** Cliente real. Lee ANTHROPIC_API_KEY del entorno. */
export function crearClienteAnthropic(): ClienteLlm {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return {
    crearMensaje: (params) => client.beta.messages.create(params),
  };
}
