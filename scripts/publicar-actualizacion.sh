#!/usr/bin/env bash
# Publica una actualización del POS a GitHub Releases.
# Uso (en la Mac): ./scripts/publicar-actualizacion.sh
# Empaqueta el código actual (backend sin node_modules/data + frontend/dist) y lo
# sube como release "latest". El PC Windows lo baja con su botón "Actualizar".
set -euo pipefail

REPO="MMozquitoo/POS--CHANATOS"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v gh >/dev/null || { echo "ERROR: falta el comando 'gh' (GitHub CLI)"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "ERROR: 'gh' no está autenticado. Corre: gh auth login"; exit 1; }

VERSION="${POS_VERSION:-$(date +%Y.%m.%d.%H%M)}"
echo "→ Publicando versión $VERSION"

echo "→ Compilando frontend..."
(cd frontend && npm run build >/dev/null 2>&1)

STAGE="$(mktemp -d)"
OUT="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$OUT"' EXIT

echo "→ Empaquetando (backend + frontend/dist, SIN node_modules ni base de datos)..."
mkdir -p "$STAGE/backend" "$STAGE/frontend"
rsync -a --exclude 'node_modules' --exclude 'data' backend/ "$STAGE/backend/"
cp -R frontend/dist "$STAGE/frontend/dist"
printf '%s\n' "$VERSION" > "$STAGE/VERSION"

( cd "$STAGE" && zip -qry "$OUT/POS-Chanatos-Update.zip" . )
printf '%s\n' "$VERSION" > "$OUT/version.txt"

echo "→ Subiendo release a GitHub ($REPO)..."
gh release create "v$VERSION" \
  "$OUT/POS-Chanatos-Update.zip" \
  "$OUT/version.txt" \
  --repo "$REPO" \
  --title "Actualización $VERSION" \
  --notes "Actualización automática del POS Chanatos. El PC Windows la instala con el botón Actualizar." \
  --latest

echo "✔ Publicado. En el PC del local, doble clic en 'Actualizar POS Chanatos'."
echo "  (URL latest: https://github.com/$REPO/releases/latest)"
