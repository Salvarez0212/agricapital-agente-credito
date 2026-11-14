import { useTema, type Tema } from '../hooks/useTema';
import './SelectorTema.css';

const OPCIONES: { valor: Tema; nombre: string }[] = [
  { valor: 'sistema', nombre: 'Sistema' },
  { valor: 'claro', nombre: 'Claro' },
  { valor: 'oscuro', nombre: 'Oscuro' },
];

/** Un <select> nativo: ocupa poco en móvil y funciona con teclado y lector sin más trabajo. */
export function SelectorTema() {
  const [tema, elegir] = useTema();
  return (
    <div className="selector-tema">
      <label htmlFor="selector-tema">Tema</label>
      <select id="selector-tema" value={tema} onChange={(e) => elegir(e.target.value as Tema)}>
        {OPCIONES.map(({ valor, nombre }) => (
          <option key={valor} value={valor}>
            {nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
