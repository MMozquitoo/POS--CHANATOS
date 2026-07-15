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
