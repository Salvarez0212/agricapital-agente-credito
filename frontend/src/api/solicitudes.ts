/** Cliente de la API de solicitudes. Los tipos reflejan `serializarSolicitud` del backend. */

export type TipoCliente = 'PREFERENCIAL' | 'ANTIGUO' | 'NUEVO';
export type EstadoSolicitud = 'EN_REVISION' | 'APROBADA' | 'RECHAZADA';
export type CanalSolicitud = 'WHATSAPP' | 'WEB';

export interface Solicitud {
  id: string;
  cedula: string;
  nombreCompleto: string;
  /** E.164, p. ej. +573001234567 */
  telefono: string;
  municipio: string;
  tipoCliente: TipoCliente;
  estado: EstadoSolicitud;
  canal: CanalSolicitud;
  montoSolicitado: number | null;
  /** La identidad no cuadra con el registro (teléfono o nombre distinto): un asesor debe validarla. */
  requiereVerificacion: boolean;
  consentimientoDatosAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginaSolicitudes {
  data: Solicitud[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface FiltroSolicitudes {
  cedula?: string;
  telefono?: string;
  page?: number;
  pageSize?: number;
}

/** Error con el formato estándar de la API: { error: { code, message } }. */
export class ErrorApi extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ErrorApi';
    this.status = status;
    this.code = code;
  }
}

export async function listarSolicitudes(
  filtro: FiltroSolicitudes,
  signal?: AbortSignal,
): Promise<PaginaSolicitudes> {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtro)) {
    if (valor !== undefined && valor !== '') params.set(clave, String(valor));
  }
  const res = await fetch(`/api/solicitudes?${params}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ErrorApi(
      res.status,
      cuerpo?.error?.code ?? 'ERROR_DESCONOCIDO',
      cuerpo?.error?.message ?? 'No se pudieron cargar las solicitudes',
    );
  }
  return (await res.json()) as PaginaSolicitudes;
}
