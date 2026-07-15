const { contextBridge } = require('electron');

// La app web detecta esto (window.posElectron) para saber que corre como app de escritorio.
contextBridge.exposeInMainWorld('posElectron', {
  app: 'pos-chanatos',
  version: '1',
});
