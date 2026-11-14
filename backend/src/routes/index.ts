import { Router } from 'express';
import type { Agente } from '../agent/agent.service.js';
import { crearChatRouter } from './chat.routes.js';
import { clienteRouter } from './cliente.routes.js';
import { solicitudRouter } from './solicitud.routes.js';

export interface OpcionesApi {
  /** Devuelve el agente (perezoso: solo se crea si se usa). */
  obtenerAgente: () => Agente;
  /** El simulador de chat se habilita fuera de producción o con ENABLE_SIMULATOR=true. */
  simuladorHabilitado: boolean;
}

/** Router de la API REST (montado en /api). */
export function crearApiRouter({ obtenerAgente, simuladorHabilitado }: OpcionesApi) {
  const api = Router();
  api.use('/clientes', clienteRouter);
  api.use('/solicitudes', solicitudRouter);
  if (simuladorHabilitado) api.use('/chat', crearChatRouter(obtenerAgente));
  return api;
}
