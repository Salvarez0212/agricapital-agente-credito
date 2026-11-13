import pino from 'pino';

/**
 * Logger estructurado. Redacta datos personales (cédula, teléfono, nombre) para
 * que nunca queden en los logs en claro (principio de minimización, Ley 1581).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      '*.cedula',
      '*.telefono',
      '*.nombreCompleto',
      '*.*.cedula',
      '*.*.telefono',
      '*.*.nombreCompleto',
      'req.headers.authorization',
    ],
    censor: '[REDACTADO]',
  },
  transport:
    process.env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: {} } : undefined,
});
