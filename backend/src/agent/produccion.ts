import { crearAgente } from './agent.service.js';
import { crearGuardiaEntrada } from './guardrails/entrada.js';
import { crearClienteAnthropic } from './llm.js';

/** Agente real: Sonnet 5.5 + guardia de entrada con heurísticas y clasificador Haiku 5.5. */
export function crearAgenteProduccion() {
  const llm = crearClienteAnthropic();
  return crearAgente(llm, { guardia: crearGuardiaEntrada({ llm }) });
}
