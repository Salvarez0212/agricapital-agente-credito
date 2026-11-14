import './EsqueletoTabla.css';

/** Ancho de cada barra por columna (nombre, cédula, teléfono, municipio, tipo, fecha). */
const COLUMNAS = ['70%', '60%', '75%', '55%', '45%', '80%'];
/** Variación entre filas para que no parezca una cuadrícula perfecta. */
const AJUSTE_FILA = [1, 0.8, 0.9, 0.75, 0.95, 0.85];

interface Props {
  filas?: number;
}

/**
 * Silueta de la tabla mientras llega la primera página: la persona ve dónde va a
 * aparecer la información y la página no "salta" cuando llega.
 *
 * Es solo visual (aria-hidden): a los lectores de pantalla el estado de carga se les
 * anuncia con la región viva del resumen ("Cargando solicitudes…").
 */
export function EsqueletoTabla({ filas = 6 }: Props) {
  return (
    <div className="tabla-contenedor esqueleto" aria-hidden="true">
      <div className="esqueleto__fila esqueleto__fila--encabezado">
        {COLUMNAS.map((_, i) => (
          <span key={i} className="esqueleto__barra" style={{ width: '50%' }} />
        ))}
      </div>
      {Array.from({ length: filas }, (_, fila) => (
        <div key={fila} className="esqueleto__fila">
          {COLUMNAS.map((ancho, columna) => (
            <span
              key={columna}
              className="esqueleto__barra"
              style={{
                width: `calc(${ancho} * ${AJUSTE_FILA[(fila + columna) % AJUSTE_FILA.length]})`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
