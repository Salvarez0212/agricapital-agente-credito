import type { Request, Response } from 'express';
import type { Agente } from '../agent/agent.service.js';
import { simularChatSchema } from '../schemas/chat.schema.js';

export function crearChatController(obtenerAgente: () => Agente) {
  return {
    async simular(req: Request, res: Response) {
      const { telefono, mensaje } = simularChatSchema.parse(req.body);
      const salida = await obtenerAgente().procesarMensaje({ telefono, texto: mensaje });
      res.json({ data: salida });
    },
  };
}
