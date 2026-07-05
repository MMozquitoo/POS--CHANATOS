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
