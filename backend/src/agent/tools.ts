import type Anthropic from '@anthropic-ai/sdk';
import type { TipoCliente } from '../generated/prisma/enums.js';
import { AppError } from '../lib/app-error.js';
import { clienteModel } from '../models/cliente.model.js';
import { cedulaSchema } from '../schemas/common.schema.js';
import { crearSolicitudSchema } from '../schemas/solicitud.schema.js';
import { clasificarCliente } from '../services/cliente.service.js';
import { solicitudService } from '../services/solicitud.service.js';

/**
 * Estado de la conversación que las herramientas leen y actualizan.
 * El teléfono viene del canal (WhatsApp), nunca de lo que escribe la persona.
 */
export interface ContextoConversacion {
  telefono: string;
  cedula: string | null;
  tipoCliente: TipoCliente | null;
  consentimientoAt: Date | null;
  solicitudId: string | null;
}

export interface ResultadoHerramienta {
  /** Contenido que se le devuelve al modelo (JSON serializado). */
  contenido: string;
  esError: boolean;
}

/**
 * Definición de las herramientas para la API de Claude. El orden y el texto son
 * fijos (cambiarlos invalida el caché de prompt). `strict: true` garantiza que
 * los argumentos cumplan el esquema; aun así el servidor vuelve a validar todo.
 */
export const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'registrar_consentimiento',
    description:
      'Registra si la persona autoriza el tratamiento de sus datos personales (Ley 1581 de 2012). Llámala cuando la persona responda a la solicitud de autorización. Es obligatoria antes de pedir o consultar la cédula.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        acepta: {
          type: 'boolean',
          description: 'true si la persona aceptó explícitamente; false si no aceptó.',
        },
      },
      required: ['acepta'],
      additionalProperties: false,
    },
  },
  {
    name: 'identificar_cliente',
    description:
      'Busca la cédula de la persona con la que conversas para saber si es cliente PREFERENCIAL (tiene cupo preaprobado), ANTIGUO o NUEVO. Devuelve solo su primer nombre y, si aplica, el cupo preaprobado. Úsala con la cédula que la persona te dé, una vez tenga la autorización de datos.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        cedula: { type: 'string', description: 'Número de cédula, solo dígitos.' },
      },
      required: ['cedula'],
      additionalProperties: false,
    },
  },
  {
    name: 'crear_solicitud',
    description:
      'Radica la solicitud de crédito de la persona identificada. Úsala solo después de que la persona confirme su nombre completo y municipio. La solicitud siempre queda en revisión.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        nombre_completo: {
          type: 'string',
          description: 'Nombre completo tal como lo confirmó la persona (nombres y apellidos).',
        },
        municipio: { type: 'string', description: 'Municipio de residencia.' },
        monto_solicitado: {
          type: ['number', 'null'],
          description: 'Monto en COP si la persona lo mencionó; null si no lo dijo.',
        },
      },
      required: ['nombre_completo', 'municipio', 'monto_solicitado'],
      additionalProperties: false,
    },
  },
];

const ok = (datos: object): ResultadoHerramienta => ({
  contenido: JSON.stringify(datos),
  esError: false,
});

const error = (mensaje: string, datos: object = {}): ResultadoHerramienta => ({
  contenido: JSON.stringify({ error: mensaje, ...datos }),
  esError: true,
});

function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] ?? '';
}

function registrarConsentimiento(input: { acepta?: unknown }, ctx: ContextoConversacion) {
  if (input.acepta !== true) {
    return ok({
      registrado: false,
      instruccion:
        'La persona no autorizó el tratamiento de datos. Solo responde preguntas generales.',
    });
  }
  ctx.consentimientoAt ??= new Date();
  return ok({ registrado: true });
}

async function identificarCliente(input: { cedula?: unknown }, ctx: ContextoConversacion) {
  if (!ctx.consentimientoAt) {
    return error('Primero se necesita la autorización de tratamiento de datos.');
  }

  const cedula = cedulaSchema.safeParse(input.cedula);
  if (!cedula.success) {
    return error('La cédula no es válida: debe tener entre 6 y 10 dígitos.');
  }

  const cliente = await clienteModel.findByCedula(cedula.data);
  const tipo = clasificarCliente(cliente);

  ctx.cedula = cedula.data;
  ctx.tipoCliente = tipo;

  // Minimización: el modelo solo recibe lo necesario para el saludo.
  if (!cliente) return ok({ tipo });
  return ok({
    tipo,
    nombre: primerNombre(cliente.nombreCompleto),
    ...(tipo === 'PREFERENCIAL' && { cupo_preaprobado: cliente.cupoPreaprobado?.toNumber() }),
  });
}

async function crearSolicitud(
  input: { nombre_completo?: unknown; municipio?: unknown; monto_solicitado?: unknown },
  ctx: ContextoConversacion,
) {
  if (!ctx.consentimientoAt) {
    return error('Primero se necesita la autorización de tratamiento de datos.');
  }
  if (!ctx.cedula) {
    return error('Primero hay que identificar a la persona con su cédula (identificar_cliente).');
  }
  if (ctx.solicitudId) {
    return error('En esta conversación ya se radicó una solicitud.');
  }

  // Se reutiliza la misma validación que la API REST.
  const parsed = crearSolicitudSchema.safeParse({
    cedula: ctx.cedula,
    telefono: ctx.telefono,
    nombreCompleto: input.nombre_completo,
    municipio: input.municipio,
    montoSolicitado: input.monto_solicitado ?? undefined,
    canal: 'WHATSAPP',
    aceptaTratamientoDatos: true,
  });
  if (!parsed.success) {
    return error('Hay datos por corregir.', {
      detalles: parsed.error.issues.map((i) => i.message),
    });
  }

  try {
    const solicitud = await solicitudService.crear(parsed.data);
    ctx.solicitudId = solicitud.id;
    return ok({
      registrada: true,
      estado: 'EN_REVISION',
      numero_radicado: solicitud.id.slice(0, 8).toUpperCase(),
    });
  } catch (e) {
    if (e instanceof AppError && e.code === 'SOLICITUD_EN_REVISION') {
      return error(
        'Esta persona ya tiene una solicitud en revisión. No se puede radicar otra hasta que se resuelva; un asesor la contactará.',
      );
    }
    throw e;
  }
}

/** Ejecuta una herramienta por nombre. Herramientas desconocidas devuelven error. */
export async function ejecutarHerramienta(
  nombre: string,
  input: unknown,
  ctx: ContextoConversacion,
): Promise<ResultadoHerramienta> {
  const args = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;

  switch (nombre) {
    case 'registrar_consentimiento':
      return registrarConsentimiento(args, ctx);
    case 'identificar_cliente':
      return identificarCliente(args, ctx);
    case 'crear_solicitud':
      return crearSolicitud(args, ctx);
    default:
      return error(`Herramienta desconocida: ${nombre}`);
  }
}
