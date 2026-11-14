#!/usr/bin/env bash
# Hook PreToolUse de Claude Code: antes de `gh pr create`, un Claude NUEVO (sin el
# contexto de la conversación que escribió el código) revisa el diff de la rama.
#   - Hallazgos críticos → exit 2: se bloquea la creación del PR y el informe vuelve a Claude.
#   - Sin críticos       → exit 0: el PR se crea y las sugerencias se pasan como contexto.
#   - Si la revisión falla (sin red, sin `claude`), no bloquea: avisa y deja pasar.
# Saltarla a propósito: incluir SKIP_AI_REVIEW=1 en el comando. Solo con autorización
# explícita de una persona: el agente que escribió el código no debe saltarse su revisión.
set -uo pipefail

entrada="$(cat)"

# Filtro barato: si el texto ni aparece, sale sin lanzar ningún proceso.
# (Solo "pr create": el comando puede llevar flags entre "gh" y "pr".)
case "$entrada" in
  *"pr create"*) ;;
  *) exit 0 ;;
esac

# Filtro preciso: se mira solo el comando (no el JSON completo), para que un
# mensaje de commit o un echo que mencione "gh pr create" no dispare la revisión.
comando="$(printf '%s' "$entrada" | node -e '
  let d = ""; process.stdin.on("data", (c) => (d += c)).on("end", () => {
    try { process.stdout.write(JSON.parse(d).tool_input?.command ?? ""); } catch {}
  });')"
sep='(^|[;&|({[:space:]])'
# Acepta flags globales antes del subcomando, p. ej. `gh -R owner/repo pr create`.
gh_flags='([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*'
printf '%s' "$comando" | grep -Eq "${sep}gh${gh_flags}[[:space:]]+pr[[:space:]]+create([[:space:]]|$)" || exit 0
if printf '%s' "$comando" | grep -Eq "${sep}SKIP_AI_REVIEW=1[[:space:]]"; then
  echo '{"systemMessage":"Revisión IA omitida (SKIP_AI_REVIEW=1)."}'
  exit 0
fi
# Evita recursión si el propio revisor ejecutara hooks.
[ "${AI_REVIEW_RUNNING:-}" = "1" ] && exit 0

# Emite {"systemMessage": $1} como JSON válido aunque el texto tenga comillas.
mensaje() {
  node -e 'process.stdout.write(JSON.stringify({ systemMessage: process.argv[1] }) + "\n")' "$1"
}

raiz="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$raiz" || exit 0

aviso_fetch=""
if [ -n "${AI_REVIEW_BASE:-}" ]; then
  base="$AI_REVIEW_BASE" # solo para los tests del script
else
  git fetch -q origin main 2>/dev/null || aviso_fetch=" Aviso: no se pudo actualizar origin/main; el diff puede incluir cambios ajenos."
  base="$(git merge-base origin/main HEAD 2>/dev/null || echo origin/main)"
fi
diff="$(git diff "$base"...HEAD -- . ':(exclude)package-lock.json')"

if [ -z "$diff" ]; then
  mensaje "Revisión IA: no hay diferencias contra main."
  exit 0
fi

# Un diff gigante no cabe en una revisión útil: se avisa en vez de fallar en silencio.
MAX_DIFF_BYTES="${AI_REVIEW_MAX_DIFF_BYTES:-300000}"
if [ "${#diff}" -gt "$MAX_DIFF_BYTES" ]; then
  mensaje "Revisión IA no ejecutada: el diff (${#diff} caracteres) supera ${MAX_DIFF_BYTES}. Divide el PR o revísalo manualmente."
  exit 0
fi

rama="$(git rev-parse --abbrev-ref HEAD | tr '/' '-')"
dir_informes="${AI_REVIEW_DIR:-.reviews}"
mkdir -p "$dir_informes"
informe="$dir_informes/${rama}-$(date +%Y%m%d-%H%M%S).md"

if ! command -v claude >/dev/null 2>&1; then
  mensaje "Revisión IA no ejecutada: no se encontró la CLI claude."
  exit 0
fi

# Las instrucciones se leen de origin/main, no de la rama revisada: un PR no puede
# debilitar las reglas con las que se juzga a sí mismo. Si aún no existen en main
# (el PR que las introduce), se usan las locales.
instrucciones="$(git show origin/main:.claude/review/instrucciones.md 2>/dev/null || cat .claude/review/instrucciones.md)"

# Sesión headless independiente: solo herramientas de lectura, sin la config del
# proyecto (evita que el revisor dispare este mismo hook) y sin guardar la sesión.
printf '%s\n' "$diff" | AI_REVIEW_RUNNING=1 claude -p \
  --model sonnet \
  --tools "Read,Grep,Glob" \
  --allowedTools "Read,Grep,Glob" \
  --disallowedTools "Read(**/.env)" "Read(**/.env.*)" "Grep(**/.env*)" \
  --setting-sources user \
  --no-session-persistence \
  "$instrucciones" > "$informe" 2> "$informe.err"
estado=$?

if [ $estado -ne 0 ] || [ ! -s "$informe" ]; then
  mensaje "Revisión IA falló (código $estado); el PR no se bloquea. Revisa manualmente. Detalle: $informe.err"
  exit 0
fi

# Tolera adornos de markdown (p. ej. **VEREDICTO: BLOQUEAR**).
[ -s "$informe.err" ] || rm -f "$informe.err"
veredicto="$(grep -Eo '^[*_#> `]*VEREDICTO:[*_ ]*(APROBAR|BLOQUEAR)' "$informe" | tail -1 | grep -Eo 'APROBAR|BLOQUEAR')"

if [ "$veredicto" = "BLOQUEAR" ]; then
  {
    echo "Revisión IA independiente: BLOQUEADO. Corrige los hallazgos críticos y vuelve a crear el PR."
    echo "Informe completo: $informe"
    echo
    cat "$informe"
  } >&2
  exit 2
fi

# Aprobado se deja pasar y se comparte el informe como contexto. Sin veredicto
# claro (respuesta truncada o mal formada) tampoco bloquea, pero lo avisa de forma visible.
if [ "$veredicto" = "APROBAR" ]; then
  mensaje="Revisión IA independiente: APROBADO ($informe).$aviso_fetch"
else
  mensaje="ATENCIÓN: la revisión IA no devolvió un veredicto claro. Lee $informe antes de continuar.$aviso_fetch"
fi
contexto="$(node -e 'const fs=require("fs");process.stdout.write(JSON.stringify(fs.readFileSync(process.argv[1],"utf8")))' "$informe")"
mensaje_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$mensaje")"
printf '{"systemMessage":%s,"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' \
  "$mensaje_json" "$contexto"
exit 0
