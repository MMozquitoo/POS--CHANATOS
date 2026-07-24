const { contextBridge, ipcRenderer } = require('electron');

// La app web detecta esto (window.posElectron) para saber que corre como app de escritorio.
contextBridge.exposeInMainWorld('posElectron', {
  app: 'pos-chanatos',
  version: '1',
  // Notificación nativa de Windows (con sonido), funciona aunque la ventana esté
  // minimizada o sin foco. Ver handler 'show-notification' en main.js.
  notify: (payload) => ipcRenderer.send('show-notification', payload || {}),
});
