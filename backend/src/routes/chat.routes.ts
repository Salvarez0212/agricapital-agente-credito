import { Router } from 'express';
import type { Agente } from '../agent/agent.service.js';
import { crearChatController } from '../controllers/chat.controller.js';

export function crearChatRouter(obtenerAgente: () => Agente) {
  const router = Router();
  const controller = crearChatController(obtenerAgente);
  router.post('/simulate', controller.simular);
  return router;
}
