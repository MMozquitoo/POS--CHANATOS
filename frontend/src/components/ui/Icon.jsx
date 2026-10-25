import { useEffect, useRef, useState } from 'react';
import './icon-motion.css';

// Iconos del POS (rediseño 2026-10) — familia LUCIDE, con las animaciones de
// Lucide Animated (https://lucide-animated.com, github.com/pqoqubbw/icons,
// MIT © pqoqubbw; trazos de Lucide, ISC). Se portaron SOLO los iconos que el
// POS usa, de componentes motion/react a SVG + keyframes CSS (icon-motion.css):
//   - sin dependencia nueva (motion + TypeScript) en el paquete del frontend
//   - la animación NO depende del hover: se dispara al tocar, seleccionar o
//     confirmar, así funciona igual en celulares y tablets.
//
// Uso:
//   <Icon name="mesas" />                      estático
//   <Icon name="ordenes" play={activo} />      anima cada vez que `play` cambia
//                                              a un valor "verdadero" nuevo
//                                              (true, o un contador que sube)
// prefers-reduced-motion anula el movimiento (ver icon-motion.css).

const D = { pathLength: 1 }; // para dibujar trazos con stroke-dashoffset

const ICONS = {
  // ---- Navegación principal ----
  resumen: ( // layout-grid
    <>
      <rect className="ai ai-grid-1" x="3" y="3" width="7" height="7" rx="1.5" />
      <rect className="ai ai-grid-2" x="14" y="3" width="7" height="7" rx="1.5" />
      <rect className="ai ai-grid-3" x="14" y="14" width="7" height="7" rx="1.5" />
      <rect className="ai ai-grid-4" x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  mesas: ( // mesa vista desde arriba con sillas (no existe en Lucide; mismo trazo)
    <g className="ai ai-pop">
      <rect x="3.5" y="8" width="17" height="8" rx="3" />
      <path className="ai ai-chairs-top" d="M7 4.5h3M14 4.5h3" />
      <path className="ai ai-chairs-bottom" d="M7 19.5h3M14 19.5h3" />
    </g>
  ),
  ordenes: ( // receipt-text
    <>
      <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
      <path className="ai ai-draw ai-d1" {...D} d="M8 8h6" />
      <path className="ai ai-draw ai-d2" {...D} d="M8 12h8" />
      <path className="ai ai-draw ai-d3" {...D} d="M8 16h5" />
    </>
  ),
  cocina: ( // cooking-pot
    <>
      <g className="ai ai-pot">
        <path d="M2 12h20" />
        <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      </g>
      <g className="ai ai-lid">
        <path d="m4 8 16-4" />
        <path d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8" />
      </g>
    </>
  ),
  reportes: ( // chart-column-increasing
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path className="ai ai-draw ai-d1" {...D} d="M8 17v-3" />
      <path className="ai ai-draw ai-d2" {...D} d="M13 17V9" />
      <path className="ai ai-draw ai-d3" {...D} d="M18 17V5" />
    </>
  ),
  admin: ( // sliders-horizontal (las perillas se deslizan)
    <>
      <path d="M3 4h18M3 12h18M3 20h18" className="ai-track" />
      <path className="ai ai-knob-1" d="M14 2v4" />
      <path className="ai ai-knob-2" d="M8 10v4" />
      <path className="ai ai-knob-3" d="M16 18v4" />
    </>
  ),

  // ---- Administración ----
  menu: ( // book-text
    <g className="ai ai-book">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      <path d="M8 11h8" />
      <path d="M8 7h6" />
    </g>
  ),
  compras: ( // cart
    <g className="ai ai-cart">
      <path d="M6.3 5H21l-2 7H7.38M20 16H8L6 3H3" />
      <circle cx="8" cy="20" r="1" />
      <circle cx="19" cy="20" r="1" />
    </g>
  ),
  historial: ( // history
    <>
      <g className="ai ai-history-arrow">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </g>
      <path className="ai ai-hand-long-ccw" d="M12 12V7" />
      <path className="ai ai-hand-short-ccw" d="M12 12l4 2" />
    </>
  ),
  caja: ( // wallet
    <g className="ai ai-wallet">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </g>
  ),
  cobrar: ( // hand-coins (las monedas caen al cobrar)
    <>
      <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
      <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
      <path d="m2 16 6 6" />
      <circle className="ai ai-coin-1" cx="16" cy="9" r="2.9" />
      <circle className="ai ai-coin-2" cx="6" cy="5" r="3" />
    </>
  ),
  aplicacion: ( // download
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <g className="ai ai-down">
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </g>
    </>
  ),
  conexion: ( // wifi
    <>
      <path d="M12 20h.01" />
      <path className="ai ai-wifi-1" d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path className="ai ai-wifi-2" d="M5 12.859a10 10 0 0 1 14 0" />
      <path className="ai ai-wifi-3" d="M2 8.82a15 15 0 0 1 20 0" />
    </>
  ),
  auditoria: ( // shield-check
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path className="ai ai-draw ai-check" {...D} d="m9 12 2 2 4-4" />
    </>
  ),
  impresora: ( // printer (Lucide, sin variante animada: rebote corto)
    <g className="ai ai-pop">
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" />
      <rect x="6" y="14" width="12" height="8" rx="1" />
    </g>
  ),
  identidad: ( // store (Lucide)
    <g className="ai ai-pop">
      <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
      <path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" />
      <path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
    </g>
  ),
  salir: ( // logout
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <g className="ai ai-out">
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </g>
    </>
  ),

  // ---- Lugares ----
  ventanilla: ( // store (Lucide)
    <g className="ai ai-pop">
      <path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
      <path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" />
      <path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
    </g>
  ),
  domicilio: ( // bike (Lucide) — sale por la derecha y vuelve a entrar
    <g className="ai ai-ride">
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </g>
  ),

  // ---- Acciones y estados ----
  search: (
    <g className="ai ai-search">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </g>
  ),
  close: ( // x
    <>
      <path className="ai ai-draw ai-d1" {...D} d="M18 6 6 18" />
      <path className="ai ai-draw ai-d2" {...D} d="m6 6 12 12" />
    </>
  ),
  chevronRight: <path className="ai ai-nudge-r" d="m9 18 6-6-6-6" />,
  chevronLeft: <path className="ai ai-nudge-l" d="m15 18-6-6 6-6" />,
  chevronDown: <path className="ai ai-nudge-d" d="m6 9 6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path className="ai ai-hand-long" d="M12 12V6" />
      <path className="ai ai-hand-short" d="M12 12h4" />
    </>
  ),
  plus: (
    <g className="ai ai-spin-half">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </g>
  ),
  minus: <path d="M5 12h14" />,
  campana: ( // bell
    <g className="ai ai-wiggle">
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </g>
  ),
  campanaOff: ( // bell-off
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" />
      <path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" />
      <path d="m2 2 20 20" />
    </>
  ),
  check: <path className="ai ai-draw ai-check" {...D} d="M4 12 9 17 20 6" />,
  checkCircle: ( // circle-check
    <>
      <circle cx="12" cy="12" r="10" />
      <path className="ai ai-draw ai-check" {...D} d="m9 12 2 2 4-4" />
    </>
  ),
  note: ( // square-pen
    <>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path className="ai ai-pen" d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
    </>
  ),
  arrowUpRight: (
    <g className="ai ai-arrow-ur">
      <path d="M7 7h10" />
      <path d="M17 7v10" />
      <path d="M7 17 17 7" />
    </g>
  ),
  anular: ( // ban
    <>
      <circle className="ai ai-draw ai-d1" {...D} cx="12" cy="12" r="10" />
      <path className="ai ai-draw ai-d2" {...D} d="m4.9 4.9 14.2 14.2" />
    </>
  ),
  fuego: ( // flame
    <path className="ai ai-draw ai-d1" {...D} d="M8.9 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  alerta: ( // badge-alert
    <g className="ai ai-wiggle">
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </g>
  ),
};

export default function Icon({ name, size = 22, strokeWidth = 2, className = '', style, title, play }) {
  const [playing, setPlaying] = useState(false);
  const firstRef = useRef(true);

  // Cada valor "verdadero" nuevo de `play` reinicia la animación: se quita la
  // clase un frame y se vuelve a poner (si no, el navegador no la repite).
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      if (!play) return undefined;
    }
    if (!play) {
      setPlaying(false);
      return undefined;
    }
    setPlaying(false);
    const raf = requestAnimationFrame(() => setPlaying(true));
    const t = setTimeout(() => setPlaying(false), 1100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [play]);

  const content = ICONS[name];
  if (!content) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-${name} ${playing ? 'ai-play' : ''} ${className}`}
      style={style}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  );
}
