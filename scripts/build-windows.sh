#!/bin/bash
# Genera el paquete instalable de Windows (POS-Chanatos-Windows.zip en el Escritorio).
# Empaqueta: Node.js portable win-x64 + backend (con binario sqlite3 de Windows,
# bcryptjs es JS puro) + frontend compilado + instalador con accesos directos
# y arranque automático. Uso: ./scripts/build-windows.sh (desde macOS/Linux)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)/win-build"
NODE_VER="v22.14.0"

mkdir -p "$STAGE/app"
echo "→ Node.js portable $NODE_VER (win-x64)"
curl -sL -o /tmp/node-win.zip "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-win-x64.zip"
unzip -q /tmp/node-win.zip -d "$STAGE/app/"
mv "$STAGE/app/node-$NODE_VER-win-x64" "$STAGE/app/node"

echo "→ Backend + frontend"
mkdir -p "$STAGE/app/backend/data"
for d in routes db middleware utils scripts; do cp -R "$REPO/backend/$d" "$STAGE/app/backend/"; done
cp "$REPO/backend/server.js" "$REPO/backend/package.json" "$REPO/backend/package-lock.json" "$STAGE/app/backend/"
cp "$REPO/backend/data/products.json" "$STAGE/app/backend/data/"
mkdir -p "$STAGE/app/frontend"
(cd "$REPO/frontend" && npm run build >/dev/null)
cp -R "$REPO/frontend/dist" "$STAGE/app/frontend/dist"

echo "→ Dependencias + binario sqlite3 win32"
(cd "$STAGE/app/backend" && npm install --omit=dev >/dev/null 2>&1)
(cd "$STAGE/app/backend/node_modules/sqlite3" && npx prebuild-install --platform win32 --arch x64 -r napi >/dev/null)
file "$STAGE/app/backend/node_modules/sqlite3/build/Release/node_sqlite3.node" | grep -q "PE32+" || { echo "ERROR: binario sqlite3 no es de Windows"; exit 1; }

echo "→ Lanzadores e instalador"
cat > "$STAGE/app/iniciar-servidor.bat" << 'BAT'
@echo off
cd /d "%~dp0backend"
set "RESOURCES_PATH=%~dp0"
"%~dp0node\node.exe" server.js
BAT
cat > "$STAGE/app/POSChanatos.vbs" << 'VBS'
Set sh = CreateObject("WScript.Shell")
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run """" & appDir & "iniciar-servidor.bat""", 0, False
WScript.Sleep 5000
sh.Run "http://localhost:3000"
VBS
cat > "$STAGE/INSTALAR.bat" << 'BAT'
@echo off
echo.
echo  Instalando POS Chanatos...
set "DEST=%LOCALAPPDATA%\POSChanatos"
xcopy "%~dp0app" "%DEST%\" /E /I /Y /Q >nul
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut([Environment]::GetFolderPath('Startup')+'\POS Chanatos Servidor.lnk'); $s.TargetPath='%DEST%\POSChanatos.vbs'; $s.WorkingDirectory='%DEST%'; $s.Save(); $d=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\POS Chanatos.lnk'); $d.TargetPath='%DEST%\POSChanatos.vbs'; $d.WorkingDirectory='%DEST%'; $d.Save()"
echo  Listo. Iniciando POS Chanatos...
start "" "%DEST%\POSChanatos.vbs"
exit /b 0
BAT
cat > "$STAGE/LEEME.txt" << 'TXT'
POS CHANATOS - INSTALACION EN WINDOWS
=====================================
1. Doble clic en INSTALAR.bat
2. Si Windows pregunta por el firewall: "Permitir acceso"
3. Listo. El POS abre solo y arranca con Windows.
TXT

(cd "$STAGE" && zip -qry "$HOME/Desktop/POS-Chanatos-Windows.zip" INSTALAR.bat LEEME.txt app)
echo "✔ $HOME/Desktop/POS-Chanatos-Windows.zip"
