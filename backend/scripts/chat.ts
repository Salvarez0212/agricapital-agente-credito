/**
 * Chat interactivo por terminal contra el agente real (usa ANTHROPIC_API_KEY).
 * Uso: npm run chat -- [telefono]   (por defecto +573001112233)
 * Escribe "salir" para terminar.
 */
import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { crearAgente } from '../src/agent/agent.service.js';
import { crearClienteAnthropic } from '../src/agent/llm.js';
import { prisma } from '../src/lib/prisma.js';
import { telefonoSchema } from '../src/schemas/common.schema.js';

const telefono = telefonoSchema.parse(process.argv[2] ?? '+573001112233');
const agente = crearAgente(crearClienteAnthropic());
const rl = createInterface({ input: process.stdin, output: process.stdout });

process.stdout.write(`Chat con el agente como ${telefono}. Escribe "salir" para terminar.\n\n`);

for (;;) {
  const texto = await rl.question('Tú: ');
  if (texto.trim().toLowerCase() === 'salir') break;
  const { respuesta } = await agente.procesarMensaje({ telefono, texto });
  process.stdout.write(`\nAgente: ${respuesta}\n\n`);
}

rl.close();
await prisma.$disconnect();
