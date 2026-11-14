#!/usr/bin/env bash
# Hook PreToolUse de Claude Code: antes de `gh pr create`, un Claude NUEVO (sin el
# contexto de la conversación que escribió el código) revisa el diff de la rama.
#   - Hallazgos críticos → exit 2: se bloquea la creación del PR y el informe vuelve a Claude.
#   - Sin críticos       → exit 0: el PR se crea y las sugerencias se pasan como contexto.
#   - Si la revisión falla (sin red, sin `claude`), no bloquea: avisa y deja pasar.
# Saltarla a propósito: incluir SKIP_AI_REVIEW=1 en el comando.
set -uo pipefail

entrada="$(cat)"

# Solo actúa sobre `gh pr create`; cualquier otro comando pasa sin costo.
case "$entrada" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac
case "$entrada" in
  *"SKIP_AI_REVIEW=1"*) echo '{"systemMessage":"Revisión IA omitida (SKIP_AI_REVIEW=1)."}'; exit 0 ;;
esac
# Evita recursión si el propio revisor ejecutara hooks.
[ "${AI_REVIEW_RUNNING:-}" = "1" ] && exit 0

raiz="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$raiz" || exit 0

git fetch -q origin main 2>/dev/null || true
base="$(git merge-base origin/main HEAD 2>/dev/null || echo origin/main)"
diff="$(git diff "$base"...HEAD -- . ':(exclude)package-lock.json')"

if [ -z "$diff" ]; then
  echo '{"systemMessage":"Revisión IA: no hay diferencias contra main."}'
  exit 0
fi

rama="$(git rev-parse --abbrev-ref HEAD | tr '/' '-')"
mkdir -p .reviews
informe=".reviews/${rama}-$(date +%Y%m%d-%H%M%S).md"

if ! command -v claude >/dev/null 2>&1; then
  echo '{"systemMessage":"Revisión IA no ejecutada: no se encontró la CLI `claude`."}'
  exit 0
fi

# Sesión headless independiente: solo herramientas de lectura, sin la config del
# proyecto (evita que el revisor dispare este mismo hook) y sin guardar la sesión.
printf '%s\n' "$diff" | AI_REVIEW_RUNNING=1 claude -p \
  --model sonnet \
  --tools "Read,Grep,Glob" \
  --allowedTools "Read,Grep,Glob" \
  --setting-sources user \
  --no-session-persistence \
  "$(cat .claude/review/instrucciones.md)" > "$informe" 2>/dev/null
estado=$?

if [ $estado -ne 0 ] || [ ! -s "$informe" ]; then
  echo "{\"systemMessage\":\"Revisión IA falló (código $estado); el PR no se bloquea. Revisa manualmente.\"}"
  exit 0
fi

veredicto="$(grep -E '^VEREDICTO: (APROBAR|BLOQUEAR)' "$informe" | tail -1)"

if [ "$veredicto" = "VEREDICTO: BLOQUEAR" ]; then
  {
    echo "Revisión IA independiente: BLOQUEADO. Corrige los hallazgos críticos y vuelve a crear el PR."
    echo "Informe completo: $informe"
    echo
    cat "$informe"
  } >&2
  exit 2
fi

# Aprobado (o sin veredicto claro): se deja pasar y se comparte el informe como contexto.
contexto="$(node -e 'const fs=require("fs");process.stdout.write(JSON.stringify(fs.readFileSync(process.argv[1],"utf8")))' "$informe")"
printf '{"systemMessage":"Revisión IA independiente: %s (%s)","hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":%s}}\n' \
  "${veredicto:-sin veredicto, revisar}" "$informe" "$contexto"
exit 0
