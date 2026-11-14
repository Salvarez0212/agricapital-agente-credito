import type { CanalSolicitud, EstadoSolicitud, TipoCliente } from '../api/solicitudes';

export const NOMBRE_TIPO: Record<TipoCliente, string> = {
  PREFERENCIAL: 'Preferencial',
  ANTIGUO: 'Antiguo',
  NUEVO: 'Nuevo',
};

export const NOMBRE_ESTADO: Record<EstadoSolicitud, string> = {
  EN_REVISION: 'En revisión',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
};

export const NOMBRE_CANAL: Record<CanalSolicitud, string> = {
  WHATSAPP: 'WhatsApp',
  WEB: 'Web',
};

/** 1010101010 → 1.010.101.010 (agrupa por miles sin convertir a número: conserva ceros). */
export function formatearCedula(cedula: string): string {
  return cedula.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** +573001234567 → +57 300 123 4567. Otros formatos se muestran tal cual. */
export function formatearTelefono(telefono: string): string {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(telefono);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : telefono;
}

const fecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** Fecha y hora de Colombia, sin importar la zona horaria del navegador. */
export function formatearFecha(iso: string): string {
  return fecha.format(new Date(iso));
}

const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatearMonto(monto: number | null): string {
  return monto === null ? 'No indicado' : pesos.format(monto);
}

/** Lo que se envía al filtro: solo dígitos (la persona puede escribir puntos, espacios o +57). */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}
