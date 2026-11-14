import { useEffect, useRef } from 'react';
import type { Solicitud } from '../api/solicitudes';
import {
  formatearCedula,
  formatearFecha,
  formatearMonto,
  formatearTelefono,
  NOMBRE_CANAL,
  NOMBRE_ESTADO,
} from '../lib/formato';
import { EtiquetaTipo } from './Etiquetas';
import './DetalleSolicitud.css';

interface Props {
  solicitud: Solicitud | null;
  onCerrar: () => void;
}

/**
 * Detalle en un <dialog> nativo con showModal(): el navegador ya resuelve el foco
 * atrapado, la tecla Escape, el fondo inerte y devolver el foco al botón que lo abrió.
 * Se cierra con el botón o con Escape (no con clic en el fondo: un clic accidental
 * haría perder lo que el asesor estaba revisando).
 */
export function DetalleSolicitud({ solicitud, onCerrar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (solicitud && !dialogo.open) dialogo.showModal();
    if (!solicitud && dialogo.open) dialogo.close();
  }, [solicitud]);

  return (
    <dialog ref={ref} className="detalle" aria-labelledby="detalle-titulo" onClose={onCerrar}>
      {solicitud && (
        <article className="detalle__tarjeta">
          <header className="detalle__encabezado">
            <div>
              <h2 id="detalle-titulo">{solicitud.nombreCompleto}</h2>
              <p className="detalle__subtitulo">
                Solicitud radicada el{' '}
                <time dateTime={solicitud.createdAt}>{formatearFecha(solicitud.createdAt)}</time>
              </p>
            </div>
            <button
              type="button"
              className="boton boton--secundario"
              aria-label="Cerrar detalle"
              onClick={() => ref.current?.close()}
            >
              Cerrar
            </button>
          </header>

          {solicitud.requiereVerificacion && (
            <p className="detalle__alerta" role="note">
              <strong>Verificar identidad.</strong> El teléfono o el nombre no coinciden con el
              registro del cliente. Un asesor debe confirmar que es el titular antes de avanzar.
            </p>
          )}

          <section aria-labelledby="detalle-persona">
            <h3 id="detalle-persona">Solicitante</h3>
            <dl className="detalle__datos">
              <dt>Nombre completo</dt>
              <dd>{solicitud.nombreCompleto}</dd>
              <dt>Cédula</dt>
              <dd className="numerico">{formatearCedula(solicitud.cedula)}</dd>
              <dt>Teléfono</dt>
              <dd className="numerico">{formatearTelefono(solicitud.telefono)}</dd>
              <dt>Municipio</dt>
              <dd>{solicitud.municipio}</dd>
              <dt>Tipo de cliente</dt>
              <dd>
                <EtiquetaTipo tipo={solicitud.tipoCliente} />
              </dd>
            </dl>
          </section>

          <section aria-labelledby="detalle-solicitud">
            <h3 id="detalle-solicitud">Solicitud</h3>
            <dl className="detalle__datos">
              <dt>Estado</dt>
              <dd>{NOMBRE_ESTADO[solicitud.estado]}</dd>
              <dt>Canal</dt>
              <dd>{NOMBRE_CANAL[solicitud.canal]}</dd>
              <dt>Monto solicitado</dt>
              <dd>{formatearMonto(solicitud.montoSolicitado)}</dd>
              <dt>Autorización de datos</dt>
              <dd>
                <time dateTime={solicitud.consentimientoDatosAt}>
                  {formatearFecha(solicitud.consentimientoDatosAt)}
                </time>
              </dd>
              <dt>Última actualización</dt>
              <dd>
                <time dateTime={solicitud.updatedAt}>{formatearFecha(solicitud.updatedAt)}</time>
              </dd>
              <dt>Identificador</dt>
              <dd className="detalle__id">{solicitud.id}</dd>
            </dl>
          </section>
        </article>
      )}
    </dialog>
  );
}
