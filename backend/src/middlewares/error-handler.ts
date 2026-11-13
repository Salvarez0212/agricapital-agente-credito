import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/app-error.js';

/** 404 para cualquier ruta no registrada. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Ruta no encontrada: ${req.method} ${req.path}`));
};

/**
 * Middleware central de errores: toda respuesta de error tiene la forma
 * { error: { code, message, details? } }. Los errores inesperados se
 * responden como 500 sin filtrar el stack al cliente.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // JSON mal formado en el body
  if (err instanceof SyntaxError && 'body' in err) {
    res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'El cuerpo no es JSON válido' } });
    return;
  }

  res.locals.unexpectedError = err;
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
};
