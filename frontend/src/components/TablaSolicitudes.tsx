/*
 * Los roles de tabla se declaran aunque coincidan con los implícitos: con la vista de
 * tarjetas en móvil (display: block), Safari deja de exponer la tabla a los lectores de
 * pantalla si no están explícitos. Ver el comentario del componente.
 */
/* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
import type { Solicitud } from '../api/solicitudes';
import { formatearCedula, formatearFecha, formatearTelefono } from '../lib/formato';
import { EtiquetaTipo, EtiquetaVerificacion } from './Etiquetas';
import './TablaSolicitudes.css';

interface Props {
  solicitudes: Solicitud[];
  cargando: boolean;
  onSeleccionar: (solicitud: Solicitud) => void;
}

/**
 * Listado de solicitudes. Cada fila se abre con el botón del nombre: así funciona con
 * teclado y lector de pantalla; el clic en cualquier parte de la fila es un atajo de ratón.
 *
 * En pantallas angostas cada fila se muestra como una tarjeta (solo con CSS) y cada dato
 * lleva su título desde `data-label`. Los roles ARIA son explícitos a propósito: al cambiar
 * el `display` de una tabla, Safari deja de anunciarla como tabla; con los roles la
 * conserva.
 */
export function TablaSolicitudes({ solicitudes, cargando, onSeleccionar }: Props) {
  return (
    <div className="tabla-contenedor">
      <table className="tabla" role="table" aria-busy={cargando}>
        <caption id="titulo-tabla" className="solo-lectores">
          Solicitudes de crédito radicadas, de la más reciente a la más antigua
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              Nombre
            </th>
            <th scope="col" role="columnheader">
              Cédula
            </th>
            <th scope="col" role="columnheader">
              Teléfono
            </th>
            <th scope="col" role="columnheader">
              Municipio
            </th>
            <th scope="col" role="columnheader">
              Tipo de cliente
            </th>
            <th scope="col" role="columnheader">
              Radicada
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {solicitudes.map((s) => (
            <tr key={s.id} className="tabla__fila" role="row" onClick={() => onSeleccionar(s)}>
              <th scope="row" role="rowheader" className="tabla__nombre">
                <button
                  type="button"
                  className="tabla__abrir"
                  // El clic sube hasta la fila, que es la que abre el detalle (una sola vez).
                  aria-haspopup="dialog"
                >
                  {s.nombreCompleto}
                </button>
                {s.requiereVerificacion && <EtiquetaVerificacion />}
              </th>
              <td role="cell" data-label="Cédula" className="numerico">
                {formatearCedula(s.cedula)}
              </td>
              <td role="cell" data-label="Teléfono" className="numerico">
                {formatearTelefono(s.telefono)}
              </td>
              <td role="cell" data-label="Municipio">
                {s.municipio}
              </td>
              <td role="cell" data-label="Tipo de cliente">
                <EtiquetaTipo tipo={s.tipoCliente} />
              </td>
              <td role="cell" data-label="Radicada">
                <time dateTime={s.createdAt}>{formatearFecha(s.createdAt)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
