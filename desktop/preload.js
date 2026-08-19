const { contextBridge, ipcRenderer } = require('electron');

// La app web detecta esto (window.posElectron) para saber que corre como app de escritorio.
contextBridge.exposeInMainWorld('posElectron', {
  app: 'pos-chanatos',
  version: '1',
  // Notificación nativa de Windows (con sonido), funciona aunque la ventana esté
  // minimizada o sin foco. Ver handler 'show-notification' en main.js.
  notify: (payload) => ipcRenderer.send('show-notification', payload || {}),
  // Control de zoom estilo Chrome (editor en Opciones, pedido del dueño
  // 2026-08-19): la UI es mobile-first y se ve grande en un monitor de PC.
  getZoomFactor: () => ipcRenderer.invoke('zoom:get'),
  setZoomFactor: (factor) => ipcRenderer.invoke('zoom:set', factor),
});
