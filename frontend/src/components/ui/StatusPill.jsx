import { statusTone, statusText } from '../../utils/orderView';
import Icon from './Icon';
import './ui.css';

// Estado de una orden: texto + color (nunca solo color), mismo significado en
// todo el POS (.pill--* de primitives.css).
export function StatusPill({ status, short = false }) {
  const text = short && status === 'LISTO' ? 'Listo' : statusText(status);
  return (
    <span className={`pill pill--${statusTone(status)} status-pill`}>
      <span className="pill__dot" aria-hidden="true" />
      {text}
    </span>
  );
}

// Mesa / Ventanilla / Domicilio con su icono — la misma etiqueta en tarjetas,
// panel y plano.
export function PlaceTag({ place }) {
  return (
    <span className={`place-tag place-tag--${place.kind.toLowerCase()}`}>
      <Icon name={place.icon} size={15} strokeWidth={2} />
      {place.label}
    </span>
  );
}
