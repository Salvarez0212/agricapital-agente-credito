import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
// ?raw: Vite entrega el archivo como texto, el mismo index.html que se publica.
import indexHtml from '../../index.html?raw';
import { CLAVE_TEMA } from '../hooks/useTema';
import { SelectorTema } from './SelectorTema';

const raiz = document.documentElement;

/** El script de index.html que aplica el tema guardado antes de pintar. */
function ejecutarScriptDeIndex() {
  const codigo = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1];
  if (!codigo) throw new Error('index.html no tiene el script del tema');
  new Function(codigo)();
}

describe('Selector de tema', () => {
  afterEach(() => {
    delete raiz.dataset.tema;
    localStorage.clear();
  });

  it('empieza siguiendo al sistema, sin fijar un tema', () => {
    render(<SelectorTema />);

    expect(screen.getByLabelText('Tema')).toHaveValue('sistema');
    expect(raiz).not.toHaveAttribute('data-tema');
  });

  it('fija el tema elegido y lo recuerda; "Sistema" lo vuelve a soltar', async () => {
    render(<SelectorTema />);
    const selector = screen.getByLabelText('Tema');

    await userEvent.selectOptions(selector, 'Oscuro');
    expect(raiz).toHaveAttribute('data-tema', 'oscuro');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');

    await userEvent.selectOptions(selector, 'Sistema');
    expect(raiz).not.toHaveAttribute('data-tema');
    expect(localStorage.getItem(CLAVE_TEMA)).toBeNull();
  });

  it('al recargar, index.html aplica el tema guardado y el selector lo muestra', () => {
    localStorage.setItem(CLAVE_TEMA, 'claro');

    ejecutarScriptDeIndex();
    render(<SelectorTema />);

    expect(raiz).toHaveAttribute('data-tema', 'claro');
    expect(screen.getByLabelText('Tema')).toHaveValue('claro');
  });

  it('ignora un valor guardado que no es un tema', () => {
    localStorage.setItem(CLAVE_TEMA, 'rosado');

    ejecutarScriptDeIndex();

    expect(raiz).not.toHaveAttribute('data-tema');
  });

  it('si el navegador bloquea el almacenamiento, el tema igual cambia', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Bloqueado', 'SecurityError');
    });
    render(<SelectorTema />);

    await userEvent.selectOptions(screen.getByLabelText('Tema'), 'Oscuro');

    expect(raiz).toHaveAttribute('data-tema', 'oscuro');
  });
});
