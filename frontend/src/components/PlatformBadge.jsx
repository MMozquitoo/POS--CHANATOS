import { DELIVERY_PLATFORM_LABELS } from '../utils/statusLabels';

// Etiqueta "RAPPI" junto al número de orden: cocina, caja y domicilios la ven
// igual en todas las pantallas. Rappi ya le cobró al cliente — acá nadie
// cobra, y esa plata no entra al arqueo del día (Rappi paga después).
export default function PlatformBadge({ platform, style }) {
  if (!platform) return null;
  const label = (DELIVERY_PLATFORM_LABELS[platform] || platform).toUpperCase();
  return (
    <span
      className="platform-badge"
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: '999px',
        background: '#FF441F',
        color: '#fff',
        fontSize: '0.75rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        lineHeight: 1.5,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  );
}
