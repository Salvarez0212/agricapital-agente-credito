import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaginaSolicitudes, Solicitud } from './api/solicitudes';
import App from './App';

function solicitud(datos: Partial<Solicitud> = {}): Solicitud {
  return {
    id: '7b0a1f0e-3c4d-4e5f-8a9b-0c1d2e3f4a5b',
    cedula: '1010101010',
    nombreCompleto: 'Ana María Restrepo',
    telefono: '+573001112233',
    municipio: 'Rionegro',
    tipoCliente: 'PREFERENCIAL',
    estado: 'EN_REVISION',
    canal: 'WHATSAPP',
    montoSolicitado: null,
    requiereVerificacion: false,
    consentimientoDatosAt: '2026-11-14T15:00:00.000Z',
    createdAt: '2026-11-14T15:01:00.000Z',
    updatedAt: '2026-11-14T15:01:00.000Z',
    ...datos,
  };
}

const ANA = solicitud();
const CARLOS = solicitud({
  id: '9c8b7a6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
  cedula: '79888777',
  nombreCompleto: 'Carlos Pérez Gómez',
  telefono: '+573109998877',
  municipio: 'Montería',
  tipoCliente: 'NUEVO',
  canal: 'WEB',
  montoSolicitado: 3_500_000,
  requiereVerificacion: true,
});

function pagina(data: Solicitud[], meta: Partial<PaginaSolicitudes['meta']> = {}) {
  return {
    data,
    meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1, ...meta },
  };
}

function respuestaJson(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Simula la API: `responder` decide la respuesta según los parámetros de la URL. */
function simularApi(responder: (params: URLSearchParams) => Response | Promise<Response>) {
  const fetchFalso = vi.fn(async (url: string | URL | Request) => {
    const params = new URL(String(url), 'http://panel.local').searchParams;
    return responder(params);
  });
  vi.stubGlobal('fetch', fetchFalso);
  /** Parámetros de cada petición hecha, en orden. */
  return () => fetchFalso.mock.calls.map(([url]) => new URL(String(url), 'http://x').searchParams);
}

describe('Panel de solicitudes', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lista nombre, cédula, teléfono, municipio y tipo de cliente', async () => {
    simularApi(() => respuestaJson(pagina([ANA, CARLOS])));
    render(<App />);

    const tabla = await screen.findByRole('table');
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(3); // encabezado + 2

    const ana = within(filas[1]!);
    expect(ana.getByRole('button', { name: 'Ana María Restrepo' })).toBeInTheDocument();
    expect(ana.getByText('1.010.101.010')).toBeInTheDocument();
    expect(ana.getByText('+57 300 111 2233')).toBeInTheDocument();
    expect(ana.getByText('Rionegro')).toBeInTheDocument();
    expect(ana.getByText('Preferencial')).toBeInTheDocument();

    expect(within(filas[2]!).getByText('Verificar identidad')).toBeInTheDocument();
    expect(screen.getByText('2 solicitudes')).toBeInTheDocument();
  });

  it('en móvil cada dato lleva su título y la tabla conserva sus roles', async () => {
    simularApi(() => respuestaJson(pagina([ANA])));
    render(<App />);

    const tabla = await screen.findByRole('table');
    // Roles explícitos: Safari los pierde si no, al mostrar la tabla como tarjetas.
    expect(tabla).toHaveAttribute('role', 'table');
    expect(within(tabla).getByRole('rowheader')).toHaveTextContent('Ana María Restrepo');

    const etiquetas = within(tabla)
      .getAllByRole('cell')
      .map((celda) => [celda.dataset.label, celda.textContent]);
    expect(etiquetas).toEqual([
      ['Cédula', '1.010.101.010'],
      ['Teléfono', '+57 300 111 2233'],
      ['Municipio', 'Rionegro'],
      ['Tipo de cliente', 'Preferencial'],
      ['Radicada', expect.stringMatching(/14\/11\/2026/)],
    ]);
  });

  it('filtra por cédula mientras se escribe, con una sola petición al terminar', async () => {
    const peticiones = simularApi((p) =>
      respuestaJson(pagina(p.get('cedula') ? [ANA] : [ANA, CARLOS])),
    );
    render(<App />);
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Cédula'), '1.010');

    expect(await screen.findByText('1 solicitud coincide con la búsqueda')).toBeInTheDocument();
    const conCedula = peticiones().filter((p) => p.has('cedula'));
    expect(conCedula.map((p) => p.get('cedula'))).toEqual(['1010']);
    expect(conCedula[0]?.get('page')).toBe('1');
  });

  it('filtra por teléfono aunque se escriba con espacios', async () => {
    const peticiones = simularApi(() => respuestaJson(pagina([CARLOS])));
    render(<App />);
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Teléfono'), '310 999');

    await waitFor(() => expect(peticiones().at(-1)?.get('telefono')).toBe('310999'));
  });

  it('abre el detalle con todos los datos al hacer clic en una fila y lo cierra', async () => {
    simularApi(() => respuestaJson(pagina([ANA, CARLOS])));
    render(<App />);

    const filaCarlos = (await screen.findByText('Montería')).closest('tr')!;
    await userEvent.click(filaCarlos);

    const detalle = screen.getByRole('dialog', { name: 'Carlos Pérez Gómez' });
    const d = within(detalle);
    expect(d.getByText('79.888.777')).toBeInTheDocument();
    expect(d.getByText('+57 310 999 8877')).toBeInTheDocument();
    expect(d.getByText('Montería')).toBeInTheDocument();
    expect(d.getByText('Nuevo')).toBeInTheDocument();
    expect(d.getByText('En revisión')).toBeInTheDocument();
    expect(d.getByText('Web')).toBeInTheDocument();
    expect(d.getByText(/3\.500\.000/)).toBeInTheDocument();
    expect(d.getByRole('note')).toHaveTextContent('Verificar identidad');
    expect(d.getByText(CARLOS.id)).toBeInTheDocument();

    await userEvent.click(d.getByRole('button', { name: 'Cerrar detalle' }));
    expect(detalle).not.toHaveAttribute('open');
  });

  it('el detalle también se abre con el teclado desde el nombre', async () => {
    simularApi(() => respuestaJson(pagina([ANA])));
    render(<App />);

    const boton = await screen.findByRole('button', { name: 'Ana María Restrepo' });
    boton.focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: 'Ana María Restrepo' })).toHaveAttribute('open');
  });

  it('explica cuando ninguna solicitud coincide con la búsqueda', async () => {
    simularApi((p) => respuestaJson(pagina(p.get('telefono') ? [] : [ANA])));
    render(<App />);
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Teléfono'), '999');

    expect(await screen.findByText(/Ninguna solicitud coincide/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('"Limpiar filtros" borra la búsqueda y vuelve a la lista completa', async () => {
    const peticiones = simularApi(() => respuestaJson(pagina([ANA])));
    render(<App />);
    await screen.findByRole('table');
    const limpiar = screen.getByRole('button', { name: 'Limpiar filtros' });
    expect(limpiar).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Cédula'), '1010');
    await waitFor(() => expect(peticiones().at(-1)?.get('cedula')).toBe('1010'));
    await userEvent.click(limpiar);

    expect(screen.getByLabelText('Cédula')).toHaveValue('');
    await waitFor(() => expect(peticiones().at(-1)?.has('cedula')).toBe(false));
  });

  it('muestra el error de la API y permite reintentar', async () => {
    let fallar = true;
    simularApi(() =>
      fallar
        ? respuestaJson({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } }, 500)
        : respuestaJson(pagina([ANA])),
    );
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');

    fallar = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('traduce un fallo de red a un mensaje claro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    );
  });

  it('pagina hacia adelante y atrás', async () => {
    const peticiones = simularApi((p) =>
      respuestaJson(
        pagina(p.get('page') === '2' ? [CARLOS] : [ANA], {
          page: Number(p.get('page')),
          total: 21,
          totalPages: 2,
        }),
      ),
    );
    render(<App />);
    await screen.findByText('Página 1 de 2');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Carlos Pérez Gómez')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(peticiones().at(-1)?.get('page')).toBe('2');
  });

  it('"Actualizar" vuelve a consultar la API', async () => {
    const peticiones = simularApi(() => respuestaJson(pagina([ANA])));
    render(<App />);
    await screen.findByRole('table');
    const antes = peticiones().length;

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(peticiones().length).toBe(antes + 1));
  });
  it('si la página actual queda vacía al actualizar, salta a la última que existe', async () => {
    let total = 21;
    const peticiones = simularApi((p) => {
      const paginas = Math.ceil(total / 20);
      const enPagina = Number(p.get('page'));
      const datos = enPagina > paginas ? [] : enPagina === 2 ? [CARLOS] : [ANA];
      return respuestaJson(pagina(datos, { page: enPagina, total, totalPages: paginas }));
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 2');

    total = 1; // Mientras tanto, la lista se acortó a una sola página.
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));

    expect(await screen.findByText('Ana María Restrepo')).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no hay solicitudes/)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
    expect(peticiones().at(-1)?.get('page')).toBe('1');
  });

  it('al filtrar desde otra página no pide la página 1 con el filtro anterior', async () => {
    const peticiones = simularApi((p) =>
      respuestaJson(
        pagina([ANA], {
          page: Number(p.get('page')),
          total: p.get('cedula') ? 1 : 21,
          totalPages: p.get('cedula') ? 1 : 2,
        }),
      ),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 2');
    const antes = peticiones().length;

    await userEvent.type(screen.getByLabelText('Cédula'), '1010');

    await screen.findByText('1 solicitud coincide con la búsqueda');
    const despues = peticiones().slice(antes);
    expect(despues.map((p) => [p.get('cedula'), p.get('page')])).toEqual([['1010', '1']]);
  });

  it('una respuesta lenta de una búsqueda anterior no pisa la búsqueda actual', async () => {
    let soltarLenta: (() => void) | undefined;
    const peticiones = simularApi((p) => {
      if (p.get('cedula') === '7') {
        // Esta búsqueda responde tarde, cuando la persona ya escribió otra cosa.
        return new Promise<Response>((resolver) => {
          soltarLenta = () => resolver(respuestaJson(pagina([CARLOS])));
        });
      }
      return respuestaJson(pagina(p.get('cedula') ? [ANA] : [ANA, CARLOS]));
    });
    render(<App />);
    await screen.findByText('2 solicitudes');

    const cedula = screen.getByLabelText('Cédula');
    await userEvent.type(cedula, '7');
    await waitFor(() => expect(peticiones().at(-1)?.get('cedula')).toBe('7'));
    await userEvent.clear(cedula);
    await userEvent.type(cedula, '1010');
    await screen.findByText('1 solicitud coincide con la búsqueda');

    await act(async () => soltarLenta?.());

    expect(screen.getByText('Ana María Restrepo')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Pérez Gómez')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'false');
  });

  it('ignora los dígitos de más en vez de mostrar un error de la API', async () => {
    const peticiones = simularApi(() => respuestaJson(pagina([CARLOS])));
    render(<App />);
    await screen.findByRole('table');

    await userEvent.type(screen.getByLabelText('Teléfono'), '573109998877123456');

    await waitFor(() => expect(peticiones().at(-1)?.get('telefono')).toBe('5731099988771'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
