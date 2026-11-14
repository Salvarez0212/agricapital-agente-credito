#!/usr/bin/env bash
# Tests del hook de revisión IA con un `claude` falso (sin costo ni red).
# Uso: npm run test:hooks
set -uo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
script="$raiz/scripts/ai-review.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# `claude` falso: ignora la entrada y responde con el contenido de $FAKE_REVIEW.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/claude" <<'FAKE'
#!/usr/bin/env bash
cat > /dev/null
printf '%s\n' "$FAKE_REVIEW"
FAKE
chmod +x "$tmp/bin/claude"

export CLAUDE_PROJECT_DIR="$raiz"
export AI_REVIEW_BASE="HEAD~1" # garantiza un diff no vacío
export AI_REVIEW_DIR="$tmp/informes" # no toca los informes reales de .reviews/
fallos=0
export FAKE_REVIEW=""

ejecutar() { # $1 = comando simulado; deja la salida en $salida y el código en $codigo
  local json
  json="$(node -e 'process.stdout.write(JSON.stringify({tool_name:"Bash",tool_input:{command:process.argv[1]}}))' "$1")"
  salida="$(printf '%s' "$json" | AI_REVIEW_MAX_DIFF_BYTES="${AI_REVIEW_MAX_DIFF_BYTES:-300000}" "$script" 2>&1)"
  codigo=$?
}

caso() { # $1 = nombre, $2 = código esperado, $3 = texto esperado en la salida ("" = salida vacía)
  if [ "$codigo" -ne "$2" ]; then
    echo "✗ $1: código $codigo, esperado $2"; fallos=$((fallos + 1)); return
  fi
  if [ -z "$3" ] && [ -n "$salida" ]; then
    echo "✗ $1: se esperaba salida vacía, llegó: ${salida:0:120}"; fallos=$((fallos + 1)); return
  fi
  if [ -n "$3" ] && ! printf '%s' "$salida" | grep -q -- "$3"; then
    echo "✗ $1: no contiene \"$3\". Salida: ${salida:0:160}"; fallos=$((fallos + 1)); return
  fi
  echo "✓ $1"
}

export PATH="$tmp/bin:$PATH"

FAKE_REVIEW="VEREDICTO: APROBAR"
ejecutar "ls -la";                                  caso "comando ajeno: no revisa" 0 ""
ejecutar 'git commit -m "docs: menciona gh pr create"'; caso "texto en un commit: no revisa" 0 ""
ejecutar "SKIP_AI_REVIEW=1 gh pr create --title x"; caso "SKIP_AI_REVIEW=1 omite" 0 "omitida"
ejecutar "cd repo && gh pr create --title x";       caso "aprobado: deja pasar" 0 "APROBADO"
ejecutar "gh -R owner/repo pr create --title x";    caso "flags globales de gh: revisa" 0 "APROBADO"

FAKE_REVIEW=$'## Hallazgos críticos\n1. bug\n\n**VEREDICTO: BLOQUEAR**'
ejecutar "gh pr create --title x";                  caso "bloqueado (con markdown): exit 2" 2 "BLOQUEADO"

FAKE_REVIEW="Respuesta truncada sin veredicto"
ejecutar "gh pr create --title x";                  caso "sin veredicto: avisa sin bloquear" 0 "ATENCIÓN"

AI_REVIEW_MAX_DIFF_BYTES=10 ejecutar "gh pr create --title x"
caso "diff demasiado grande: avisa sin revisar" 0 "supera"

# Sin `claude` en el PATH: no bloquea.
mkdir -p "$tmp/solo-node"
ln -s "$(command -v node)" "$tmp/solo-node/node"
PATH="$tmp/solo-node:/usr/bin:/bin"
ejecutar "gh pr create --title x";                  caso "sin CLI claude: no bloquea" 0 "no se encontró"

[ "$fallos" -eq 0 ] && echo "Todos los tests del hook pasan." || { echo "$fallos test(s) fallaron."; exit 1; }
