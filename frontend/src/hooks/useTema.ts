import { useState } from 'react';

export type Tema = 'sistema' | 'claro' | 'oscuro';

/** Misma clave que lee el script de index.html antes de pintar (evita el parpadeo). */
export const CLAVE_TEMA = 'agricapital:tema';

function esTema(valor: unknown): valor is Tema {
  return valor === 'sistema' || valor === 'claro' || valor === 'oscuro';
}

/** El tema ya aplicado en <html> (lo pone el script de index.html al cargar). */
function temaInicial(): Tema {
  const actual = document.documentElement.dataset.tema;
  return esTema(actual) ? actual : 'sistema';
}

/**
 * Tema elegido por la persona. "Sistema" quita el atributo y deja que el CSS siga a
 * prefers-color-scheme; "claro" y "oscuro" lo fijan con data-tema en <html>.
 * La elección se guarda en este navegador; si el almacenamiento no está disponible
 * (modo privado, bloqueado), el tema igual cambia, solo que no se recuerda.
 */
export function useTema(): [Tema, (tema: Tema) => void] {
  const [tema, setTema] = useState<Tema>(temaInicial);

  const elegir = (nuevo: Tema) => {
    const raiz = document.documentElement;
    if (nuevo === 'sistema') delete raiz.dataset.tema;
    else raiz.dataset.tema = nuevo;
    try {
      if (nuevo === 'sistema') localStorage.removeItem(CLAVE_TEMA);
      else localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin almacenamiento: el cambio vale solo para esta visita.
    }
    setTema(nuevo);
  };

  return [tema, elegir];
}
