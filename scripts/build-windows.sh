#!/bin/bash
# Genera el paquete instalable de Windows (POS-Chanatos-Windows.zip en el Escritorio).
# Empaqueta: Node.js portable win-x64 + backend (con binario sqlite3 de Windows,
# bcryptjs es JS puro) + frontend compilado + instalador con accesos directos
# y arranque automático. Uso: ./scripts/build-windows.sh (desde macOS/Linux)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)/win-build"
NODE_VER="v22.14.0"
VERSION="${POS_VERSION:-$(date +%Y.%m.%d.%H%M)}"

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
printf '%s\n' "$VERSION" > "$STAGE/app/VERSION"

echo "→ Dependencias + binario sqlite3 win32"
(cd "$STAGE/app/backend" && npm install --omit=dev >/dev/null 2>&1)
(cd "$STAGE/app/backend/node_modules/sqlite3" && npx prebuild-install --platform win32 --arch x64 -r napi >/dev/null)
file "$STAGE/app/backend/node_modules/sqlite3/build/Release/node_sqlite3.node" | grep -q "PE32+" || { echo "ERROR: binario sqlite3 no es de Windows"; exit 1; }

echo "→ Lanzadores e instalador"
cat > "$STAGE/app/iniciar-servidor.bat" << 'BAT'
@echo off
cd /d "%~dp0backend"
set "RESOURCES_PATH=%~dp0"
rem Watchdog: si el servidor termina (p.ej. tras "Buscar actualizaciones"), se relanza
rem con el codigo nuevo. Tambien se recupera de caidas.
:loop
"%~dp0node\node.exe" server.js
timeout /t 2 /nobreak >nul
goto loop
BAT
# Arranque SILENCIOSO del servidor (usado en el arranque de Windows): sin ventana, sin navegador
cat > "$STAGE/app/servidor.vbs" << 'VBS'
Set sh = CreateObject("WScript.Shell")
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.Run """" & appDir & "iniciar-servidor.bat""", 0, False
VBS
# Icono de escritorio "POS Chanatos": asegura el servidor y abre la VENTANA EN MODO APP
# (Chrome o Edge con --app=, sin barra de direcciones ni pestanas). NO abre el navegador normal.
cat > "$STAGE/app/POSChanatos.vbs" << 'VBS'
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))

' 1) Asegurar el servidor. Si ya esta corriendo, la 2a instancia se cierra sola por el puerto.
sh.Run """" & appDir & "iniciar-servidor.bat""", 0, False

' 2) Localizar Chrome o Edge (Edge viene con Windows 10/11)
navegador = ""
rutas = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") )
For Each r In rutas
  If navegador = "" And fso.FileExists(r) Then navegador = r
Next

perfil = sh.ExpandEnvironmentStrings("%LocalAppData%\POSChanatos\ventana-app")
url = "http://localhost:3000"

' 3) Dar tiempo al servidor y abrir en modo app
WScript.Sleep 4000
If navegador <> "" Then
  sh.Run """" & navegador & """ --app=" & url & " --start-maximized --user-data-dir=""" & perfil & """", 3, False
Else
  ' Respaldo si no hay Chrome ni Edge: abrir en el navegador por defecto
  sh.Run url
End If
VBS
cat > "$STAGE/app/LEEME.txt" << 'TXT'
POS Chanatos
Para actualizar: abre la app, entra a OPCIONES y pulsa BUSCAR ACTUALIZACIONES.
TXT

# Instalador .exe (NSIS): un solo doble clic → crea el icono "POS Chanatos" en el
# escritorio, arranca con Windows y abre la app. Sin carpetas ni pasos manuales.
echo "→ Instalador .exe (NSIS)"
NSI="$STAGE/instalador.nsi"
cat > "$NSI" << 'NSISEOF'
!include "MUI2.nsh"
Unicode true
Name "POS Chanatos"
OutFile "@OUTFILE@"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\POSChanatos"
ShowInstDetails show

!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!define MUI_FINISHPAGE_RUN_TEXT "Abrir POS Chanatos ahora"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Function LaunchApp
  Exec 'wscript.exe "$INSTDIR\POSChanatos.vbs"'
FunctionEnd

Section "POS Chanatos"
  ; Cerrar cualquier servidor anterior para poder sobrescribir sin bloqueos de archivo
  nsExec::Exec 'taskkill /F /IM node.exe /T'
  SetOutPath "$INSTDIR"
  File /r "@APPDIR@/"
  ; Limpiar accesos directos de versiones antiguas
  Delete "$DESKTOP\Actualizar POS Chanatos.lnk"
  CreateShortcut "$DESKTOP\POS Chanatos.lnk" "$INSTDIR\POSChanatos.vbs"
  CreateShortcut "$SMSTARTUP\POS Chanatos Servidor.lnk" "$INSTDIR\servidor.vbs"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\POS Chanatos.lnk"
  Delete "$SMSTARTUP\POS Chanatos Servidor.lnk"
  RMDir /r "$INSTDIR"
SectionEnd
NSISEOF
sed -i '' "s|@OUTFILE@|$HOME/Desktop/Instalar-POS-Chanatos.exe|; s|@APPDIR@|$STAGE/app|" "$NSI"
rm -f "$HOME/Desktop/Instalar-POS-Chanatos.exe"
makensis -V2 "$NSI"
echo "✔ $HOME/Desktop/Instalar-POS-Chanatos.exe"
