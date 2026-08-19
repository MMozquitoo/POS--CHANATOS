import { useState, useEffect } from 'react';

const STEP = 0.1;

/**
 * Control de zoom estilo Chrome ("-  100%  +") para la app de escritorio
 * (Electron). La UI es mobile-first (botones/fuentes grandes para dedo) y
 * se ve desproporcionada en un monitor de PC — el dueño pidió poder
 * ajustarlo él mismo desde Opciones (2026-08-19), en vez de un valor fijo.
 * No hace nada fuera de Electron (celular/PWA no tienen window.posElectron).
 */
export default function ZoomControl() {
  const [zoom, setZoom] = useState(null);
  const available = typeof window !== 'undefined' && !!window.posElectron?.getZoomFactor;

  useEffect(() => {
    if (!available) return;
    window.posElectron.getZoomFactor().then(setZoom).catch(() => {});
  }, [available]);

  if (!available || zoom === null) return null;

  const applyZoom = async (factor) => {
    const clamped = await window.posElectron.setZoomFactor(factor);
    setZoom(clamped);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
      background: 'var(--gray-50, #f1f3f5)',
      border: '1px solid var(--separator, #ddd)',
      borderRadius: 'var(--radius-md, 8px)',
      padding: '0.3rem'
    }}>
      <button
        onClick={() => applyZoom(zoom - STEP)}
        aria-label="Reducir tamaño"
        style={{
          width: 32, height: 32, border: 'none', background: 'white',
          borderRadius: 6, fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer'
        }}
      >
        −
      </button>
      <button
        onClick={() => applyZoom(1)}
        title="Restablecer a 100%"
        className="tnum"
        style={{
          minWidth: 48, border: 'none', background: 'transparent',
          fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', color: 'var(--gray-900, #333)'
        }}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => applyZoom(zoom + STEP)}
        aria-label="Aumentar tamaño"
        style={{
          width: 32, height: 32, border: 'none', background: 'white',
          borderRadius: 6, fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer'
        }}
      >
        +
      </button>
    </div>
  );
}
