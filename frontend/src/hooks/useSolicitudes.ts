import { useEffect, useState } from 'react';
import {
  ErrorApi,
  listarSolicitudes,
  type FiltroSolicitudes,
  type PaginaSolicitudes,
} from '../api/solicitudes';

export interface EstadoSolicitudes {
  /** Última página cargada. Se conserva mientras llega la siguiente, para que la tabla no parpadee. */
  pagina: PaginaSolicitudes | null;
  cargando: boolean;
  error: string | null;
}

interface Respuesta {
  /** Búsqueda a la que corresponde esta respuesta. */
  clave: string;
  pagina: PaginaSolicitudes | null;
  error: string | null;
}

/**
 * Carga las solicitudes cada vez que cambia el filtro o `version` (para "Actualizar").
 *
 * - Si llega una búsqueda nueva antes de que termine la anterior, la anterior se aborta:
 *   una respuesta lenta nunca pisa los resultados de lo último que escribió el usuario.
 * - "Cargando" no es un estado aparte: se deriva de que la última respuesta no sea de la
 *   búsqueda actual. Así el effect solo actualiza el estado cuando responde la API.
 */
export function useSolicitudes(filtro: FiltroSolicitudes, version: number): EstadoSolicitudes {
  const { cedula, telefono, page, pageSize } = filtro;
  const clave = JSON.stringify([cedula, telefono, page, pageSize, version]);
  const [respuesta, setRespuesta] = useState<Respuesta>({ clave: '', pagina: null, error: null });

  useEffect(() => {
    const control = new AbortController();
    listarSolicitudes({ cedula, telefono, page, pageSize }, control.signal)
      .then((pagina) => setRespuesta({ clave, pagina, error: null }))
      .catch((err: unknown) => {
        if (control.signal.aborted) return;
        // Un fallo de red llega como TypeError en inglés ("Failed to fetch"): se traduce.
        const error = err instanceof ErrorApi ? err.message : 'No se pudo conectar con el servidor';
        setRespuesta((previa) => ({ clave, pagina: previa.pagina, error }));
      });
    return () => control.abort();
  }, [clave, cedula, telefono, page, pageSize]);

  const vigente = respuesta.clave === clave;
  return {
    pagina: respuesta.pagina,
    cargando: !vigente,
    error: vigente ? respuesta.error : null,
  };
}
