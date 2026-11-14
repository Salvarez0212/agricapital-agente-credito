import { useEffect, useState } from 'react';

/** Devuelve `valor` cuando deja de cambiar durante `ms`. Evita una petición por tecla. */
export function useDebouncedValue<T>(valor: T, ms: number): T {
  const [estable, setEstable] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setEstable(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return estable;
}
