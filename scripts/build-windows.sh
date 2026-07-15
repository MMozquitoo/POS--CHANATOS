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
"%~dp0node\node.exe" server.js
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
  sh.Run """" & navegador & """ --app=" & url & " --user-data-dir=""" & perfil & """", 1, False
Else
  ' Respaldo si no hay Chrome ni Edge: abrir en el navegador por defecto
  sh.Run url
End If
VBS
# Boton "Actualizar": baja la ultima version de GitHub Releases, conserva la base de
# datos (data/) y el binario de Windows (node_modules/), y reinicia el servidor.
cat > "$STAGE/app/Actualizar.bat" << 'BAT'
@echo off
setlocal EnableDelayedExpansion
set "DEST=%LOCALAPPDATA%\POSChanatos"
set "BASE=https://github.com/MMozquitoo/POS--CHANATOS/releases/latest/download"
set "TMP=%TEMP%\pos-update"
title Actualizar POS Chanatos
echo.
echo  Buscando actualizaciones...
if exist "%TMP%" rmdir /S /Q "%TMP%" 2>nul
mkdir "%TMP%"

powershell -NoProfile -Command "try{Invoke-WebRequest -Uri '%BASE%/version.txt' -OutFile '%TMP%\version.txt' -UseBasicParsing}catch{exit 1}"
if errorlevel 1 (
  echo  No hay conexion a internet o no se pudo consultar GitHub. Intenta mas tarde.
  echo. & pause & exit /b 1
)
set /p NEW=<"%TMP%\version.txt"
set "CUR=(ninguna)"
if exist "%DEST%\VERSION" set /p CUR=<"%DEST%\VERSION"

if "%NEW%"=="%CUR%" (
  echo  Ya tienes la ultima version ^(%CUR%^). No hay nada que actualizar.
  echo. & pause & exit /b 0
)

echo  Version instalada: %CUR%
echo  Version nueva:     %NEW%
echo.
echo  Descargando actualizacion...
powershell -NoProfile -Command "try{Invoke-WebRequest -Uri '%BASE%/POS-Chanatos-Update.zip' -OutFile '%TMP%\update.zip' -UseBasicParsing}catch{exit 1}"
if errorlevel 1 ( echo  Fallo la descarga. & echo. & pause & exit /b 1 )

echo  Cerrando el servidor...
taskkill /F /IM node.exe /T >nul 2>&1

echo  Instalando ^(se conservan las ventas^)...
powershell -NoProfile -Command "Expand-Archive -Path '%TMP%\update.zip' -DestinationPath '%DEST%' -Force"
if errorlevel 1 ( echo  Fallo al instalar. & echo. & pause & exit /b 1 )

echo  Reiniciando el servidor...
start "" "%DEST%\servidor.vbs"
rmdir /S /Q "%TMP%" 2>nul

echo.
echo  Listo. POS Chanatos actualizado a la version %NEW%.
echo  Si tienes la ventana del POS abierta, recargala con Ctrl+R.
echo. & pause
exit /b 0
BAT
cat > "$STAGE/INSTALAR.bat" << 'BAT'
@echo off
echo.
echo  Instalando POS Chanatos...
set "DEST=%LOCALAPPDATA%\POSChanatos"
xcopy "%~dp0app" "%DEST%\" /E /I /Y /Q >nul
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut([Environment]::GetFolderPath('Startup')+'\POS Chanatos Servidor.lnk'); $s.TargetPath='%DEST%\servidor.vbs'; $s.WorkingDirectory='%DEST%'; $s.Save(); $d=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\POS Chanatos.lnk'); $d.TargetPath='%DEST%\POSChanatos.vbs'; $d.WorkingDirectory='%DEST%'; $d.Save(); $u=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Actualizar POS Chanatos.lnk'); $u.TargetPath='%DEST%\Actualizar.bat'; $u.WorkingDirectory='%DEST%'; $u.Save()"
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
