interface Props {
  pagina: number;
  totalPaginas: number;
  onCambiar: (pagina: number) => void;
}

export function Paginacion({ pagina, totalPaginas, onCambiar }: Props) {
  if (totalPaginas <= 1) return null;
  return (
    <nav className="paginacion" aria-label="Paginación">
      <button
        type="button"
        className="boton boton--secundario"
        onClick={() => onCambiar(pagina - 1)}
        disabled={pagina <= 1}
      >
        Anterior
      </button>
      <span aria-current="page">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        type="button"
        className="boton boton--secundario"
        onClick={() => onCambiar(pagina + 1)}
        disabled={pagina >= totalPaginas}
      >
        Siguiente
      </button>
    </nav>
  );
}
