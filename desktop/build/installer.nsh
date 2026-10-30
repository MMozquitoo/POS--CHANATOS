!include "LogicLib.nsh"

!macro customInit
  ; RESCATE DE LA BASE (2026-10-25): el desinstalador de la versión anterior
  ; borra toda la carpeta de instalación, y las ventas vivían adentro
  ; (resources\backend\data). Antes de que eso pase, copiar los datos a
  ; %APPDATA%\POS Chanatos\datos — el mismo lugar donde la app nueva los busca
  ; (main.js, DB_PATH). Si ya existen allá, no tocar nada (serían más nuevos).
  ${IfNot} ${FileExists} "$APPDATA\POS Chanatos\datos\pos_chanatos.db"
    ${If} ${FileExists} "$LOCALAPPDATA\Programs\POS Chanatos\resources\backend\data\pos_chanatos.db"
      CreateDirectory "$APPDATA\POS Chanatos\datos"
      CopyFiles /SILENT "$LOCALAPPDATA\Programs\POS Chanatos\resources\backend\data\*.*" "$APPDATA\POS Chanatos\datos"
    ${EndIf}
  ${EndIf}

  ; RESCATE DEL .env (2026-10-30): mismo problema que la base — resources\backend\.env
  ; (secretos: Rappi, pedidos web, Instagram) vive DENTRO de la carpeta que el
  ; desinstalador borra. Se guarda como "backend.env" junto a la base (main.js,
  ; prepararDatos, la copia de vuelta a resources\backend\.env si hace falta).
  ${IfNot} ${FileExists} "$APPDATA\POS Chanatos\datos\backend.env"
    ${If} ${FileExists} "$LOCALAPPDATA\Programs\POS Chanatos\resources\backend\.env"
      CreateDirectory "$APPDATA\POS Chanatos\datos"
      CopyFiles /SILENT "$LOCALAPPDATA\Programs\POS Chanatos\resources\backend\.env" "$APPDATA\POS Chanatos\datos\backend.env"
    ${EndIf}
  ${EndIf}
!macroend

; Personalizaciones del instalador NSIS (electron-builder)

!macro customInstall
  ; 1) Cerrar y limpiar la instalacion vieja basada en Edge (evita choque en el puerto 3000)
  nsExec::Exec 'taskkill /F /IM node.exe /T'
  Delete "$SMSTARTUP\POS Chanatos Servidor.lnk"
  Delete "$DESKTOP\Actualizar POS Chanatos.lnk"
  RMDir /r "$LOCALAPPDATA\POSChanatos"

  ; 2) Arranque automatico de la app real con Windows (para que el servidor este
  ;    disponible a los celulares aunque nadie abra nada)
  CreateShortcut "$SMSTARTUP\POS Chanatos.lnk" "$INSTDIR\POS Chanatos.exe"
!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\POS Chanatos.lnk"
!macroend
