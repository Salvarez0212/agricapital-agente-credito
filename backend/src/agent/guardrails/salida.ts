/**
 * Filtro de salida: última barrera antes de que el texto del modelo llegue a la
 * persona. Detecta (1) promesas de aprobación o desembolso y (2) números que
 * parecen cédulas o teléfonos que no pertenecen a esta conversación.
 */

export type MotivoSalida = 'PROMESA' | 'DATOS_PERSONALES';

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Afirmaciones de aprobación o desembolso. "cupo preaprobado" no coincide (no es
 * una afirmación sobre el crédito) y las frases negadas se descartan aparte.
 */
const PATRONES_PROMESA: RegExp[] = [
  /\b(tu|su)\s+(credito|solicitud|prestamo|desembolso)\s+(ya\s+)?(esta|fue|quedo|ha sido|sera|queda)\s+(aprobad|desembolsad|garantizad)/,
  /\b(te|le|les)\s+(aprobamos|aprobaron|aprobare|aprobaremos|vamos a aprobar|desembolsamos|desembolsaremos|vamos a desembolsar|consignamos|consignaremos|vamos a consignar)\b/,
  // Sin "pre": "está preaprobado para ti" describe un cupo, no una aprobación.
  /\b(estas|esta|quedaste|quedo|quedaron)\s+aprobad[oa]s?\s+(tu|su|el|para)\b/,
  /\b(estas|quedaste)\s+aprobad[oa]\b/,
  /\b(te|le)\s+garantiz/,
  /\b(aprobacion|desembolso|credito)\s+(esta\s+)?garantizad/,
];

/**
 * Negación PEGADA a la promesa ("no te garantizo", "nunca te aprobamos", "no puedo
 * garantizarte"). Una negación suelta antes ("No te preocupes, tu crédito está
 * aprobado", "Sin duda, te aprobamos") NO cuenta: ahí la promesa es afirmativa.
 */
const NEGACION_PEGADA =
  /\b(no|nunca|jamas|tampoco)(\s+(puedo|podemos|se puede|es posible|vamos a|voy a))?\s+$/;

function hayPromesa(texto: string): boolean {
  const t = normalizar(texto);
  return PATRONES_PROMESA.some((patron) => {
    const re = new RegExp(patron.source, 'g');
    for (const m of t.matchAll(re)) {
      const antes = t.slice(Math.max(0, m.index - 30), m.index);
      if (!NEGACION_PEGADA.test(antes)) return true;
    }
    return false;
  });
}

/** Secuencias numéricas que podrían ser cédulas o celulares (6 a 13 dígitos). */
const NUMERO = /(\+?\d[\d .-]{4,18}\d)/g;
const CONTEXTO_MONTO = /(\$\s*$)|(cop\s*$)/;
const DESPUES_MONTO = /^\s*(pesos|cop|millones|mil)\b/;

function soloDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** Variantes con y sin indicativo de país, para comparar teléfonos. */
export function variantesPermitidas(valores: Array<string | null | undefined>): Set<string> {
  const permitidos = new Set<string>();
  for (const v of valores) {
    if (!v) continue;
    const d = soloDigitos(v);
    if (!d) continue;
    permitidos.add(d);
    if (d.startsWith('57') && d.length === 12) permitidos.add(d.slice(2));
  }
  return permitidos;
}

const FECHA = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;

function hayDatoAjeno(textoOriginal: string, permitidos: Set<string>): boolean {
  // Las fechas (2026-11-13, 13/11/2026) no son cédulas ni teléfonos.
  const texto = textoOriginal.replace(FECHA, ' ');
  for (const m of texto.matchAll(NUMERO)) {
    const digitos = soloDigitos(m[0]);
    if (digitos.length < 6 || digitos.length > 13) continue;
    const antes = texto.slice(Math.max(0, m.index - 4), m.index).toLowerCase();
    const despues = texto.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase();
    // Montos de dinero ($8.000.000, 2.000.000 pesos) no son datos personales.
    if (CONTEXTO_MONTO.test(antes) || DESPUES_MONTO.test(despues)) continue;
    if (permitidos.has(digitos)) continue;
    if (digitos.startsWith('57') && permitidos.has(digitos.slice(2))) continue;
    return true;
  }
  return false;
}

/**
 * Revisa la respuesta del modelo. `permitidos` son los números legítimos de esta
 * conversación (cédula y teléfono de la persona, datos de las herramientas, FAQ).
 */
export function revisarSalida(texto: string, permitidos: Set<string>): MotivoSalida | null {
  if (hayPromesa(texto)) return 'PROMESA';
  if (hayDatoAjeno(texto, permitidos)) return 'DATOS_PERSONALES';
  return null;
}
