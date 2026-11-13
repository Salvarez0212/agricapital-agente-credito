/**
 * Seed de desarrollo: deja la BD en un estado conocido con datos ficticios.
 * Uso: npm run db:seed  (borra y recrea clientes y solicitudes)
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { TipoCliente } from '../src/generated/prisma/enums.js';
import {
  antiguos,
  clientesDemo,
  preferenciales,
  solicitudesEjemplo,
  type ClienteSeed,
} from './seed-data.js';

const DIA_MS = 24 * 60 * 60 * 1000;

function tipoDe(cliente: ClienteSeed): TipoCliente {
  return cliente.cupoPreaprobado && cliente.cupoPreaprobado > 0
    ? TipoCliente.PREFERENCIAL
    : TipoCliente.ANTIGUO;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed borra datos: no se ejecuta en producción.');
  }

  const demoPhone = process.env.DEMO_PHONE?.trim();
  const clientes = [...preferenciales, ...antiguos, ...(demoPhone ? clientesDemo(demoPhone) : [])];

  await prisma.$transaction(async (tx) => {
    await tx.solicitud.deleteMany();
    await tx.cliente.deleteMany();
    await tx.cliente.createMany({ data: clientes });

    for (const s of solicitudesEjemplo) {
      const fecha = new Date(Date.now() - s.diasAtras * DIA_MS);

      if ('nuevo' in s) {
        await tx.solicitud.create({
          data: {
            cedula: s.cedula,
            ...s.nuevo,
            tipoCliente: TipoCliente.NUEVO,
            montoSolicitado: s.montoSolicitado,
            consentimientoDatosAt: fecha,
            createdAt: fecha,
          },
        });
        continue;
      }

      const cliente = clientes.find((c) => c.cedula === s.cedula);
      const registro = await tx.cliente.findUniqueOrThrow({ where: { cedula: s.cedula } });
      if (!cliente) throw new Error(`Cliente de ejemplo no encontrado: ${s.cedula}`);

      await tx.solicitud.create({
        data: {
          clienteId: registro.id,
          cedula: cliente.cedula,
          nombreCompleto: cliente.nombreCompleto,
          telefono: cliente.telefono,
          municipio: cliente.municipio,
          tipoCliente: tipoDe(cliente),
          montoSolicitado: s.montoSolicitado,
          consentimientoDatosAt: fecha,
          createdAt: fecha,
        },
      });
    }
  });

  const [totalClientes, totalSolicitudes] = await Promise.all([
    prisma.cliente.count(),
    prisma.solicitud.count(),
  ]);
  process.stdout.write(
    `Seed listo: ${totalClientes} clientes, ${totalSolicitudes} solicitudes` +
      (demoPhone ? ` (incluye clientes demo con DEMO_PHONE)` : '') +
      '\n',
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Error en el seed: ${String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
