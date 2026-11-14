import { useState } from 'react';
import type { Solicitud } from './api/solicitudes';
import { DetalleSolicitud } from './components/DetalleSolicitud';
import { Filtros } from './components/Filtros';
import { Paginacion } from './components/Paginacion';
import { TablaSolicitudes } from './components/TablaSolicitudes';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useSolicitudes } from './hooks/useSolicitudes';
import { soloDigitos } from './lib/formato';
import './App.css';

/** Tiempo sin teclear antes de consultar: filtra "en vivo" sin una petición por tecla. */
export const ESPERA_FILTRO_MS = 300;
const POR_PAGINA = 20;
/** La API rechaza filtros de más de 13 dígitos; ninguna cédula ni celular los tiene. */
export const MAX_DIGITOS_FILTRO = 13;

const paraFiltrar = (texto: string) => soloDigitos(texto).slice(0, MAX_DIGITOS_FILTRO);

/** "1 solicitud coincide…" / "3 solicitudes coinciden…": sustantivo y verbo concuerdan. */
function resumen(total: number, hayFiltros: boolean): string {
  const uno = total === 1;
  const cuantas = uno ? '1 solicitud' : `${total} solicitudes`;
  if (!hayFiltros) return cuantas;
  return `${cuantas} ${uno ? 'coincide' : 'coinciden'} con la búsqueda`;
}

function App() {
  const [cedula, setCedula] = useState('');
  const [telefono, setTelefono] = useState('');
  const [paginaElegida, setPaginaElegida] = useState({ filtro: '', pagina: 1 });
  const [version, setVersion] = useState(0);
  const [seleccionada, setSeleccionada] = useState<Solicitud | null>(null);

  // Se esperan los textos (primitivos), no un objeto: un objeto nuevo en cada render
  // reiniciaría la espera sin fin.
  const filtro = {
    cedula: useDebouncedValue(paraFiltrar(cedula), ESPERA_FILTRO_MS),
    telefono: useDebouncedValue(paraFiltrar(telefono), ESPERA_FILTRO_MS),
  };

  // La página elegida vale solo para el filtro con el que se eligió: un filtro nuevo empieza
  // en la página 1. Se cambia cuando el filtro ya se aplicó (tras la espera), no con cada
  // tecla; si no, se pediría la página 1 con el filtro viejo antes de la búsqueda real.
  const claveFiltro = `${filtro.cedula}|${filtro.telefono}`;
  const pagina = paginaElegida.filtro === claveFiltro ? paginaElegida.pagina : 1;
  const setPagina = (nueva: number) => setPaginaElegida({ filtro: claveFiltro, pagina: nueva });

  const {
    pagina: resultado,
    cargando,
    error,
  } = useSolicitudes({ ...filtro, page: pagina, pageSize: POR_PAGINA }, version);

  // Si la lista se acortó (p. ej. al "Actualizar" estando en la última página), la página
  // actual puede quedar vacía: se salta a la última que existe. Se ajusta durante el render,
  // como recomienda React para estado derivado de props/datos, y solo con datos vigentes.
  const ultimaPagina = Math.max(resultado?.meta.totalPages ?? 1, 1);
  if (resultado && !cargando && !error && pagina > ultimaPagina) {
    setPagina(ultimaPagina);
  }

  const limpiar = () => {
    setCedula('');
    setTelefono('');
  };

  const solicitudes = resultado?.data ?? [];
  const total = resultado?.meta.total ?? 0;
  const hayFiltros = filtro.cedula !== '' || filtro.telefono !== '';

  return (
    <>
      <header className="encabezado">
        <div className="contenedor encabezado__contenido">
          <div>
            <p className="encabezado__marca">AgriCapital</p>
            <h1>Panel de solicitudes</h1>
          </div>
          <button
            type="button"
            className="boton"
            onClick={() => setVersion((v) => v + 1)}
            disabled={cargando}
          >
            Actualizar
          </button>
        </div>
      </header>

      <main className="contenedor principal">
        <p className="principal__intro">
          Solicitudes de crédito que radica el agente de WhatsApp. Todas quedan en revisión hasta
          que el equipo de crédito las evalúe.
        </p>

        <Filtros
          cedula={cedula}
          telefono={telefono}
          onCedula={setCedula}
          onTelefono={setTelefono}
          onLimpiar={limpiar}
        />

        {/* Región viva: anuncia el número de resultados al filtrar, sin mover el foco. */}
        <output className="principal__resumen">{resultado && resumen(total, hayFiltros)}</output>

        {error && (
          <div className="aviso aviso--error" role="alert">
            <p>{error}</p>
            <button type="button" className="boton" onClick={() => setVersion((v) => v + 1)}>
              Reintentar
            </button>
          </div>
        )}

        {!resultado && cargando && <p className="aviso">Cargando solicitudes…</p>}

        {resultado && solicitudes.length === 0 && !error && (
          <div className="aviso">
            {hayFiltros ? (
              <p>
                Ninguna solicitud coincide con la búsqueda. Revisa los números o limpia los filtros.
              </p>
            ) : (
              <p>
                Todavía no hay solicitudes. Aparecerán aquí cuando el agente radique la primera.
              </p>
            )}
          </div>
        )}

        {solicitudes.length > 0 && (
          <>
            <TablaSolicitudes
              solicitudes={solicitudes}
              cargando={cargando}
              onSeleccionar={setSeleccionada}
            />
            <Paginacion pagina={pagina} totalPaginas={ultimaPagina} onCambiar={setPagina} />
          </>
        )}
      </main>

      <DetalleSolicitud solicitud={seleccionada} onCerrar={() => setSeleccionada(null)} />
    </>
  );
}

export default App;
