const { app, BrowserWindow, session, shell, ipcMain, Notification } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// En la app empaquetada, extraResources cae en process.resourcesPath.
// En desarrollo (npm start) usamos ./resources.
const RES = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
const PORT = 3000;

// Windows agrupa/identifica las notificaciones de la app por este id (debe coincidir
// con build.appId de package.json). Sin esto, las notificaciones nativas en Windows
// pueden aparecer atribuidas a Electron en vez de "POS Chanatos", o no mostrar el icono.
app.setAppUserModelId('co.chanatos.pos');

let backend = null;
let win = null;
let quitting = false;

// Zoom estilo Chrome, editable desde Opciones (pedido del dueño 2026-08-19):
// la UI es mobile-first (botones/fuentes grandes para dedo) y se ve
// desproporcionada maximizada en un monitor de PC. Arranca en 80% por
// defecto y el dueño lo ajusta desde la app; queda guardado en un archivo
// junto a la config de la app para sobrevivir reinicios/actualizaciones.
const ZOOM_FILE = path.join(app.getPath('userData'), 'zoom.json');
const DEFAULT_ZOOM = 0.8;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;

function loadZoomFactor() {
  try {
    const raw = fs.readFileSync(ZOOM_FILE, 'utf8');
    const factor = JSON.parse(raw)?.factor;
    if (typeof factor === 'number' && factor >= ZOOM_MIN && factor <= ZOOM_MAX) return factor;
  } catch (e) { /* primer arranque o archivo corrupto: usar default */ }
  return DEFAULT_ZOOM;
}

function saveZoomFactor(factor) {
  try {
    fs.writeFileSync(ZOOM_FILE, JSON.stringify({ factor }));
  } catch (e) {
    console.error('No se pudo guardar el zoom:', e);
  }
}

ipcMain.handle('zoom:get', () => (win ? win.webContents.getZoomFactor() : loadZoomFactor()));
ipcMain.handle('zoom:set', (_event, factor) => {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(factor) || DEFAULT_ZOOM));
  if (win) win.webContents.setZoomFactor(clamped);
  saveZoomFactor(clamped);
  return clamped;
});

// Notificación nativa del sistema operativo (pedido del dueño: que suene incluso con
// la ventana minimizada o sin foco, cosa que Web Audio NO puede hacer porque los
// navegadores/Electron suspenden el AudioContext en ese caso). El renderer la dispara
// vía window.posElectron.notify(...) (ver preload.js).
ipcMain.on('show-notification', (_event, payload) => {
  if (!Notification.isSupported()) return;
  const { title, body } = payload || {};
  try {
    new Notification({
      title: title || 'POS Chanatos',
      body: body || '',
      icon: path.join(RES, 'app.ico'),
      silent: false,
    }).show();
  } catch (e) {
    // No tumbar el proceso principal por un error de notificación
    console.error('Error mostrando notificación nativa:', e);
  }
});

function nodeBinary() {
  // Windows: node portable incluido. En desarrollo (Mac) usa el node del sistema.
  const win = path.join(RES, 'node', 'node.exe');
  return process.platform === 'win32' ? win : 'node';
}

function startBackend() {
  const server = path.join(RES, 'backend', 'server.js');
  backend = spawn(nodeBinary(), [server], {
    cwd: path.join(RES, 'backend'),
    env: { ...process.env, RESOURCES_PATH: RES + path.sep, PORT: String(PORT), NODE_ENV: '' },
    stdio: 'ignore',
    windowsHide: true,
  });
  // Watchdog: si el servidor termina (p.ej. tras "Buscar actualizaciones"), relanzar
  // con el codigo nuevo y recargar la ventana.
  backend.on('exit', () => {
    backend = null;
    if (quitting) return;
    setTimeout(() => {
      startBackend();
      waitForServer(() => { if (win) win.reload(); });
    }, 1500);
  });
}

function waitForServer(cb, tries = 0) {
  const req = http.get(`http://localhost:${PORT}/api/discover`, () => cb());
  req.on('error', () => {
    if (tries < 120) setTimeout(() => waitForServer(cb, tries + 1), 500);
    else cb();
  });
  req.setTimeout(1500, () => req.destroy());
}

async function createWindow() {
  // Evitar que se muestre una version vieja guardada en cache
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] });
  } catch (e) { /* ignorar */ }

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'POS Chanatos',
    icon: path.join(RES, 'app.ico'),
    backgroundColor: '#FFF8E7',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.setMenuBarVisibility(false);
  win.maximize();

  // Zoom guardado (editable desde Opciones, ver ipcMain 'zoom:set'). Se
  // reaplica en cada carga porque el watchdog recarga la ventana tras
  // actualizar y Chromium no siempre conserva el zoom entre cargas.
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(loadZoomFactor());
  });

  // Los enlaces externos se abren en el navegador del sistema, no dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  waitForServer(() => {
    win.loadURL(`http://localhost:${PORT}`);
    win.show();
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  quitting = true;
  if (backend) backend.kill();
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  if (backend) backend.kill();
});
