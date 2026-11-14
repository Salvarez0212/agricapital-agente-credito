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
 */
export function TablaSolicitudes({ solicitudes, cargando, onSeleccionar }: Props) {
  return (
    // Se desplaza en horizontal en pantallas angostas (los navegadores actuales le dan foco
    // de teclado a los contenedores con scroll).
    <div className="tabla-contenedor">
      <table className="tabla" aria-busy={cargando}>
        <caption id="titulo-tabla" className="solo-lectores">
          Solicitudes de crédito radicadas, de la más reciente a la más antigua
        </caption>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Cédula</th>
            <th scope="col">Teléfono</th>
            <th scope="col">Municipio</th>
            <th scope="col">Tipo de cliente</th>
            <th scope="col">Radicada</th>
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => (
            <tr key={s.id} className="tabla__fila" onClick={() => onSeleccionar(s)}>
              <th scope="row">
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
              <td className="numerico">{formatearCedula(s.cedula)}</td>
              <td className="numerico">{formatearTelefono(s.telefono)}</td>
              <td>{s.municipio}</td>
              <td>
                <EtiquetaTipo tipo={s.tipoCliente} />
              </td>
              <td>
                <time dateTime={s.createdAt}>{formatearFecha(s.createdAt)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
