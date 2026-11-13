import { Router } from 'express';
import { clienteController } from '../controllers/cliente.controller.js';

export const clienteRouter = Router();

clienteRouter.get('/', clienteController.buscar);
clienteRouter.get('/:cedula', clienteController.obtenerPorCedula);
