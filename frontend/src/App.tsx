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
  const [pagina, setPagina] = useState(1);
  const [version, setVersion] = useState(0);
  const [seleccionada, setSeleccionada] = useState<Solicitud | null>(null);

  // Se esperan los textos (primitivos), no un objeto: un objeto nuevo en cada render
  // reiniciaría la espera sin fin.
  const filtro = {
    cedula: useDebouncedValue(soloDigitos(cedula), ESPERA_FILTRO_MS),
    telefono: useDebouncedValue(soloDigitos(telefono), ESPERA_FILTRO_MS),
  };
  const {
    pagina: resultado,
    cargando,
    error,
  } = useSolicitudes({ ...filtro, page: pagina, pageSize: POR_PAGINA }, version);

  // Un filtro nuevo siempre empieza en la primera página.
  const cambiarCedula = (valor: string) => {
    setCedula(valor);
    setPagina(1);
  };
  const cambiarTelefono = (valor: string) => {
    setTelefono(valor);
    setPagina(1);
  };
  const limpiar = () => {
    setCedula('');
    setTelefono('');
    setPagina(1);
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
          onCedula={cambiarCedula}
          onTelefono={cambiarTelefono}
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
            <Paginacion
              pagina={pagina}
              totalPaginas={resultado?.meta.totalPages ?? 1}
              onCambiar={setPagina}
            />
          </>
        )}
      </main>

      <DetalleSolicitud solicitud={seleccionada} onCerrar={() => setSeleccionada(null)} />
    </>
  );
}

export default App;
