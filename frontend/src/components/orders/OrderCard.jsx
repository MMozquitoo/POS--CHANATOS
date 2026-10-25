import { formatPriceCOP } from '../../utils/currency';
import { activeItems, clockLabel, elapsedLabel, minutesSince, orderNumber, placeOf, urgencyOf } from '../../utils/orderView';
import { StatusPill } from '../ui/StatusPill';
import Icon from '../ui/Icon';
import OrderActions from './OrderActions';
import './orders.css';

const MAX_LINES = 3;

// Tarjeta de la vista Órdenes (referencia docs/referencias-diseno/05): el
// LUGAR manda (en el local se ubica la orden por "Mesa 4" o "Ventanilla", no
// por el número de comanda, que queda chico al lado de la espera), estado,
// resumen de productos, total/saldo y UNA acción principal. Tocar la tarjeta
// la selecciona; la acción abre la hoja de trabajo (onOpen) sin salir.
export function placeTitle(place) {
  if (place.kind === 'MESA') return place.label;
  return place.kind === 'VENTANILLA' ? 'Ventanilla' : 'Domicilio';
}

export default function OrderCard({ order, now, selected, flash, onSelect, from, onOpen }) {
  const place = placeOf(order);
  const items = activeItems(order);
  const min = minutesSince(order.created_at, now);
  const urgency = urgencyOf(order, now);
  const paid = Number(order.paidAmount) || 0;
  const total = Math.max(0, (Number(order.itemsTotal) || 0) - (Number(order.discount_amount) || 0));

  return (
    <article
      className={`order-card ${selected ? 'is-selected' : ''} ${flash ? 'flash-update' : ''}`}
      onClick={() => onSelect(order)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(order);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <header className="order-card__head">
        <div className={`order-card__place order-card__place--${place.kind.toLowerCase()}`} aria-hidden="true">
          {place.kind === 'MESA' ? (
            <span className="tnum">{place.short}</span>
          ) : (
            <Icon name={place.icon} size={26} strokeWidth={2.2} />
          )}
        </div>
        <div className="order-card__who">
          <div className="order-card__who-row">
            <h3 className="order-card__title">
              {placeTitle(place)}
              {order.customer_name && <span className="order-card__cliente"> · {order.customer_name}</span>}
            </h3>
            <StatusPill status={order.status} short />
          </div>
          <span className={`order-card__time order-card__time--${urgency}`}>
            <span className="order-card__num tnum" aria-label={`Orden ${orderNumber(order)}`}>#{orderNumber(order)}</span>
            {place.rappi && <span className="order-card__rappi">Rappi</span>}
            <Icon name="clock" size={14} strokeWidth={2} />
            <span>{elapsedLabel(min)} · {clockLabel(order.created_at)}</span>
          </span>
        </div>
      </header>

      <ul className="order-card__lines">
        {items.slice(0, MAX_LINES).map((it) => (
          <li key={it.id}>
            <span className="tnum order-card__qty">{it.qty}×</span>
            <span className="order-card__name">{it.name}</span>
            <span className="tnum order-card__price">{formatPriceCOP((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
          </li>
        ))}
        {items.length > MAX_LINES && (
          <li className="order-card__more">y {items.length - MAX_LINES} más</li>
        )}
      </ul>

      {order.special_note && (
        <div className="order-card__note"><Icon name="note" size={14} strokeWidth={2} /> {order.special_note}</div>
      )}

      <div className="order-card__totals">
        <div>
          <span className="order-card__total-label">{paid > 0 ? 'Saldo' : 'Total'}</span>
          <span className="order-card__total tnum">{formatPriceCOP(paid > 0 ? order.saldo : total)}</span>
        </div>
        {paid > 0 && (
          <span className="order-card__abono tnum">Abonado {formatPriceCOP(paid)} de {formatPriceCOP(total)}</span>
        )}
      </div>

      <OrderActions order={order} from={from} onOpen={onOpen} compact only="primary" />
    </article>
  );
}
