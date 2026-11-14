import './Filtros.css';

interface Props {
  cedula: string;
  telefono: string;
  onCedula: (valor: string) => void;
  onTelefono: (valor: string) => void;
  onLimpiar: () => void;
}

/**
 * Búsqueda por cédula y teléfono. Filtra mientras se escribe (no hay botón "Buscar"):
 * el componente padre espera a que la persona deje de teclear antes de consultar la API.
 */
export function Filtros({ cedula, telefono, onCedula, onTelefono, onLimpiar }: Props) {
  const hayFiltros = cedula !== '' || telefono !== '';
  return (
    <search>
      <form className="filtros" onSubmit={(e) => e.preventDefault()}>
        <div className="filtros__campo">
          <label htmlFor="filtro-cedula">Cédula</label>
          <input
            id="filtro-cedula"
            type="search"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej. 1010101010"
            value={cedula}
            onChange={(e) => onCedula(e.target.value)}
          />
        </div>
        <div className="filtros__campo">
          <label htmlFor="filtro-telefono">Teléfono</label>
          <input
            id="filtro-telefono"
            type="search"
            inputMode="tel"
            autoComplete="off"
            placeholder="Ej. 300 123 4567"
            value={telefono}
            onChange={(e) => onTelefono(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="boton boton--secundario"
          onClick={onLimpiar}
          disabled={!hayFiltros}
        >
          Limpiar filtros
        </button>
        <p className="filtros__ayuda">Puedes escribir solo una parte del número.</p>
      </form>
    </search>
  );
}
