// Chime de cocina generado con Web Audio (sin archivos de audio, funciona offline).
// Los navegadores bloquean audio hasta la primera interacción del usuario:
// llamar unlockAudio() en el primer toque/click de la pantalla.

let ctx = null;
let lastPlay = 0;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function unlockAudio() {
  ensureCtx();
}

// Notificación nativa del sistema operativo (solo existe dentro de la app de escritorio
// Electron, ver desktop/preload.js). A diferencia del chime de Web Audio de abajo, SÍ
// suena aunque la ventana esté minimizada o sin foco.
// En navegador/PWA normal window.posElectron no existe: no hace nada (no truena).
//
// Por defecto, si la ventana YA está visible y con foco, no se dispara: en ese caso el
// chime de Web Audio (que solo funciona con foco) ya avisó, y sonarían los dos a la vez.
// Pasar force:true para las vistas que no tienen chime propio (ej. CocinaCaja/CentroTotal
// en el "modo admin" de Caja), donde no hay riesgo de sonido duplicado.
export function notifyDesktop({ title, body, force = false } = {}) {
  const api = typeof window !== 'undefined' ? window.posElectron : null;
  if (!api?.notify) return;
  const isForeground = typeof document !== 'undefined' && !document.hidden && document.hasFocus();
  if (isForeground && !force) return;
  api.notify({ title, body });
}

export function playKitchenChime() {
  const now = Date.now();
  if (now - lastPlay < 1500) return; // no repetir si llegan varios eventos juntos
  lastPlay = now;

  const c = ensureCtx();
  if (!c || c.state !== 'running') return;

  const t0 = c.currentTime;
  // Dos tonos ascendentes (ding-ding), cálido y claro sobre ruido de cocina
  [[880, 0], [1174.66, 0.18]].forEach(([freq, dt]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + dt);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.4);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0 + dt);
    osc.stop(t0 + dt + 0.45);
  });
}
