import PlatformBadge from '../PlatformBadge';
import Icon from '../ui/Icon';
import { esQuitar } from '../QuitarChips';
import { activeItems as itemsOf, elapsedLabel, minutesSince, orderNumber, placeOf, clockLabel, readyUnits } from '../../utils/orderView';
import './kitchen.css';

// Ticket de cocina (rediseño 2026-10) — compartido por la vista del rol
// COCINA (Cocina.jsx) y la cocina de CAJA (CocinaCaja.jsx). Prioriza lectura:
// lugar + número de orden + espera arriba, cantidades grandes, nota de cada
// producto pegada al producto y la nota general de la orden aparte.
//
// Es un componente de MÓDULO (no definido dentro de la pantalla): así una
// actualización no lo vuelve a montar y el pedido sobre el que se trabaja no
// salta ni pierde su estado.
//
// props:
//   order, now
//   flash        resaltar brevemente (nuevo o modificado)
//   selected     borde mostaza (CocinaCaja abre el detalle)
//   onStepItem   si viene, cada plato es un botón: (item, +1 | -1) marca o
//                quita UNA unidad lista ("5× Hamburguesa" se marca de a una)
//   onClick      tocar el ticket
//   actions      botones de la pantalla (cada vista conserva los suyos)
export default function KitchenTicket({ order, now, flash, selected, onStepItem, onClick, actions, archived = false }) {
  const place = placeOf(order);
  const items = itemsOf(order);
  // Progreso en UNIDADES: 5 hamburguesas + 2 papas = 7, no 2 líneas
  const totalUnits = items.reduce((n, it) => n + Math.max(1, Number(it.qty) || 1), 0);
  const readyCount = items.reduce((n, it) => n + readyUnits(it), 0);
  const min = minutesSince(order.created_at, now);
  const working = order.status === 'NUEVO' || order.status === 'EN_PREP';
  const urgency = !working ? 'done' : min >= 20 ? 'late' : min >= 10 ? 'warn' : 'ok';
  const showProgress = order.status === 'EN_PREP' && totalUnits > 1;

  return (
    <article
      className={`k-ticket k-ticket--${order.status.toLowerCase()} ${flash ? 'is-flash' : ''} ${selected ? 'is-selected' : ''} ${archived ? 'is-archived' : ''}`}
      onClick={onClick}
    >
      {showProgress && (
        <div className="k-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${readyCount / totalUnits})` }} />
        </div>
      )}
      <header className="k-head">
        <div className="k-place">
          <span className="k-place__name">
            <Icon name={place.icon} size={18} strokeWidth={2.2} />
            {place.kind === 'MESA' ? place.label : place.kind === 'VENTANILLA' ? 'Ventanilla' : 'Domicilio'}
          </span>
          <PlatformBadge platform={order.delivery_platform} />
        </div>
        <span className={`k-time k-time--${urgency}`}>
          <Icon name="clock" size={15} strokeWidth={2.2} />
          {working ? elapsedLabel(min) : clockLabel(order.created_at)}
        </span>
      </header>
      <div className="k-sub">
        <span className="k-num tnum">#{orderNumber(order)}</span>
        {order.customer_name && <span className="k-cliente">{order.customer_name}</span>}
        {showProgress && (
          <span className={`k-count ${readyCount > 0 ? 'is-started' : ''}`}>{readyCount}/{totalUnits} listos</span>
        )}
      </div>

      {order.special_note && (
        <div className="k-order-note">
          <Icon name="note" size={16} strokeWidth={2.2} />
          <div>
            <span>Nota de la orden</span>
            {order.special_note}
          </div>
        </div>
      )}

      <KitchenItems items={items} onStep={onStepItem} dimReady={order.status !== 'NUEVO'} />

      {actions && <div className="k-actions" onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </article>
  );
}

// Lista de platos de un ticket. También la usa el detalle de CocinaCaja.
// Con onStep cada fila es un botón grande: tocar = una unidad más lista; con
// la fila completa, tocar quita una (como antes, que tocar desmarcaba). En
// filas de varias unidades aparece además "−" para corregir un toque de más.
export function KitchenItems({ items, onStep, dimReady = true }) {
  if (items.length === 0) {
    return (
      <ul className="k-items">
        <li className="k-empty">Sin productos</li>
      </ul>
    );
  }
  const anyStarted = items.some((it) => readyUnits(it) > 0);
  return (
    <ul className="k-items">
      {items.map((item) => {
        const qty = Math.max(1, Number(item.qty) || 1);
        const done = readyUnits(item);
        const full = done >= qty;
        const partial = done > 0 && !full;
        const multi = qty > 1;
        const body = (
          <>
            <span
              className={`k-qty tnum ${full ? 'is-ready' : ''} ${partial ? 'is-partial' : ''}`}
              style={partial ? { '--k-fill': done / qty } : undefined}
            >
              {full ? (
                <Icon name="check" size={18} strokeWidth={3} play={full} />
              ) : partial ? (
                <span className="k-qty__frac">
                  {done}
                  <small>/{qty}</small>
                </span>
              ) : (
                qty
              )}
            </span>
            <span className="k-item-main">
              <span className="k-item-name">
                {full && <span className="k-item-qty-done tnum">{qty}×</span>}
                {item.name}
              </span>
              {multi && onStep && qty <= 12 && (
                <span className="k-pips" aria-hidden="true">
                  {Array.from({ length: qty }, (_, i) => (
                    <span key={i} className={i < done ? 'is-on' : ''} />
                  ))}
                </span>
              )}
              {multi && partial && (
                <span className="k-item-left">
                  {qty - done === 1 ? 'Falta 1' : `Faltan ${qty - done}`}
                </span>
              )}
              {item.notes && <KitchenNotes notes={item.notes} />}
              {item.special_note && (
                <span className="k-item-special">
                  <Icon name="note" size={14} strokeWidth={2.2} />
                  {item.special_note}
                </span>
              )}
            </span>
          </>
        );
        if (!onStep) {
          return (
            <li key={item.id}>
              <div className={`k-item ${full && dimReady ? 'is-ready' : ''}`}>{body}</div>
            </li>
          );
        }
        const label = multi
          ? `${item.name}: ${done} de ${qty} listas. ${full ? 'Tocar para quitar una' : 'Tocar para marcar una'}`
          : `${item.name}: ${full ? 'lista. Tocar para desmarcar' : 'tocar para marcar lista'}`;
        return (
          <li key={item.id} className={`k-line ${multi && done > 0 ? 'has-undo' : ''}`}>
            <button
              type="button"
              className={`k-item k-item--tap ${full ? 'is-ready' : partial ? 'is-partial' : anyStarted ? 'is-pending' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onStep(item, full ? -1 : 1);
              }}
              aria-pressed={full}
              aria-label={label}
            >
              {body}
            </button>
            {multi && done > 0 && (
              <button
                type="button"
                className="k-undo"
                onClick={(e) => {
                  e.stopPropagation();
                  onStep(item, -1);
                }}
                aria-label={`Quitar una lista de ${item.name}`}
              >
                <Icon name="minus" size={20} strokeWidth={2.6} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Notas del plato (salsas, sabor, "+ Queso", "Sin queso"): lo que se QUITA va
// resaltado — es lo que más se le escapa a cocina con prisa.
function KitchenNotes({ notes }) {
  const parts = String(notes).split(',').map((p) => p.trim()).filter(Boolean);
  return (
    <span className="k-item-notes">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {esQuitar(p) ? <strong className="k-note-sin">{p}</strong> : p}
        </span>
      ))}
    </span>
  );
}
