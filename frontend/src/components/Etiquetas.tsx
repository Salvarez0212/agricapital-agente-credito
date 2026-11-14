import type { TipoCliente } from '../api/solicitudes';
import { NOMBRE_TIPO } from '../lib/formato';
import './Etiquetas.css';

/** El color acompaña al texto, nunca lo reemplaza (WCAG 1.4.1). */
export function EtiquetaTipo({ tipo }: { tipo: TipoCliente }) {
  return <span className={`etiqueta etiqueta--${tipo.toLowerCase()}`}>{NOMBRE_TIPO[tipo]}</span>;
}

export function EtiquetaVerificacion() {
  return (
    <span className="etiqueta etiqueta--alerta" title="La identidad no coincide con el registro">
      Verificar identidad
    </span>
  );
}
