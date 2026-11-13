import { Router } from 'express';
import { solicitudController } from '../controllers/solicitud.controller.js';

export const solicitudRouter = Router();

solicitudRouter.get('/', solicitudController.listar);
solicitudRouter.post('/', solicitudController.crear);
solicitudRouter.get('/:id', solicitudController.obtener);
