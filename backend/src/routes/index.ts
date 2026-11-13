import { Router } from 'express';
import { clienteRouter } from './cliente.routes.js';
import { solicitudRouter } from './solicitud.routes.js';

/** Router de la API REST (montado en /api). */
export const apiRouter = Router();

apiRouter.use('/clientes', clienteRouter);
apiRouter.use('/solicitudes', solicitudRouter);
