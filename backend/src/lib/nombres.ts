/** Normaliza un nombre a sus palabras: minúsculas, sin tildes ni signos. */
export function palabrasDeNombre(nombre: string): string[] {
  return nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/**
 * ¿El nombre que dio la persona es compatible con el registrado?
 * Compatible = cada palabra que dio aparece en el nombre registrado.
 * Así "Maria Rojas" encaja con "María Fernanda Rojas Gil" (puede omitir nombres o
 * apellidos), pero "María López" no (aporta un apellido que no está registrado).
 * Ignora tildes, mayúsculas y el orden.
 */
export function nombresCoinciden(dado: string, registrado: string): boolean {
  const registradas = new Set(palabrasDeNombre(registrado));
  const dadas = palabrasDeNombre(dado);
  return dadas.length > 0 && dadas.every((p) => registradas.has(p));
}
