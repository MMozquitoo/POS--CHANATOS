import Icon from './ui/Icon';
import './ui/ui.css';

// FASE 20.1 — EmptyState reutilizable.
// Rediseño 2026-10: mensaje específico + detalle gráfico discreto (la misma
// forma orgánica mostaza de la confirmación de pago, en chico) y botón de la
// marca. Misma API de siempre: las 4 pantallas que ya lo usan no cambian.
//
// @param {string} title         título (requerido)
// @param {string} [description]
// @param {string} [actionLabel] botón opcional (con onAction)
// @param {Function} [onAction]
// @param {string} [icon]        nombre de Icon para el centro del detalle
// @param {boolean} [compact]    menos aire (dentro de paneles)
export default function EmptyState({ title, description, actionLabel, onAction, icon = 'check', compact = false }) {
  const hasAction = actionLabel && onAction;
  return (
    <div className={`empty-state-v3 ${compact ? 'is-compact' : ''}`}>
      <div className="empty-state-v3__art" aria-hidden="true">
        <span className="empty-state-v3__blob" />
        <span className="empty-state-v3__icon"><Icon name={icon} size={26} strokeWidth={2} /></span>
      </div>
      <h2 className="empty-state-v3__title">{title}</h2>
      {description && <p className="empty-state-v3__text">{description}</p>}
      {hasAction && (
        <button type="button" className="btn btn--primary empty-state-v3__btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
