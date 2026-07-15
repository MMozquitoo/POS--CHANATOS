#!/bin/bash
# Construye la APLICACION DE ESCRITORIO real (Electron) para Windows.
# Genera ~/Desktop/Instalar-POS-Chanatos.exe: app propia, icono Chanatos, sin navegador.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DESK="$REPO/desktop"
RES="$DESK/resources"
NODE_VER="v22.14.0"
VERSION="${POS_VERSION:-$(date +%Y.%m.%d.%H%M)}"

echo "→ Compilando frontend ($VERSION)"
(cd "$REPO/frontend" && npm run build >/dev/null)

echo "→ Preparando recursos de la app (servidor + node + frontend)"
rm -rf "$RES"; mkdir -p "$RES/backend/data" "$RES/frontend"
curl -sL -o /tmp/node-win.zip "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-win-x64.zip"
rm -rf /tmp/node-unzip && mkdir /tmp/node-unzip && unzip -q /tmp/node-win.zip -d /tmp/node-unzip
mv "/tmp/node-unzip/node-$NODE_VER-win-x64" "$RES/node"
for d in routes db middleware utils scripts; do cp -R "$REPO/backend/$d" "$RES/backend/"; done
cp "$REPO/backend/server.js" "$REPO/backend/package.json" "$REPO/backend/package-lock.json" "$RES/backend/"
cp "$REPO/backend/data/products.json" "$RES/backend/data/"
cp -R "$REPO/frontend/dist" "$RES/frontend/dist"
printf '%s\n' "$VERSION" > "$RES/VERSION"
magick "$REPO/frontend/public/icon-512.png" -define icon:auto-resize=256,128,64,48,32,16 "$RES/app.ico"

echo "→ Dependencias del servidor + binario sqlite3 de Windows"
(cd "$RES/backend" && npm install --omit=dev >/dev/null 2>&1)
(cd "$RES/backend/node_modules/sqlite3" && npx prebuild-install --platform win32 --arch x64 -r napi >/dev/null)
file "$RES/backend/node_modules/sqlite3/build/Release/node_sqlite3.node" | grep -q "PE32+" \
  || { echo "ERROR: binario sqlite3 no es de Windows"; exit 1; }

echo "→ Empaquetando la aplicacion (electron-builder)"
# --x64: el PC del local es Intel (x64). NO usar arm64 (no arrancaria alli).
(cd "$DESK" && npx electron-builder --win nsis --x64 2>&1 | tail -10)

OUT="$(ls "$DESK/out/"*.exe 2>/dev/null | grep -iE "setup|instal" | head -1 || true)"
[ -z "$OUT" ] && OUT="$(ls "$DESK/out/"*.exe 2>/dev/null | head -1)"
rm -f "$HOME/Desktop/Instalar-POS-Chanatos.exe"
cp "$OUT" "$HOME/Desktop/Instalar-POS-Chanatos.exe"
echo "✔ $HOME/Desktop/Instalar-POS-Chanatos.exe"
