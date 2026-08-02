// Iconos de trazo estilo SF Symbols para la navegación (sin librerías:
// SVG inline, currentColor, trazo 1.8). Usados por caja/BottomNav y
// mesero/BottomNav; si otra pantalla necesita un icono, va aquí.

const base = {
  viewBox: '0 0 24 24',
  width: 24,
  height: 24,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function IconCocina(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 10h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-5z" />
      <path d="M3 10h18" />
      <path d="M9 6c0-1 .8-1 .8-2M13.5 6c0-1 .8-1 .8-2" />
    </svg>
  );
}

export function IconCobrar(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7" width="18" height="11" rx="2.5" />
      <circle cx="12" cy="12.5" r="2.6" />
      <path d="M6.5 10.2v.01M17.5 14.8v.01" />
    </svg>
  );
}

export function IconResumen(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19v-6M12 19V6M19 19v-9" />
    </svg>
  );
}

export function IconMenu(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9.2" />
    </svg>
  );
}

export function IconPedidos(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5h12V21l-2.4-1.6L13.2 21l-1.2-.9-1.2.9-2.4-1.6L6 21V3.5z" />
      <path d="M9 8.5h6M9 12h6" />
    </svg>
  );
}

export function IconPlus(props) {
  return (
    <svg {...base} strokeWidth={2.4} {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}
