import { formatPriceCOP } from '../../utils/currency';
import { activeItems, readyUnits } from '../../utils/orderView';
import Icon from '../ui/Icon';
import './orders.css';

// Cuerpo del detalle de una orden (panel de Mesas y de Órdenes). Solo
// muestra: productos, cantidades, notas por producto, nota general de
// cocina, total, abonos y saldo — con los montos que calcula el servidor.
export default function OrderDetail({ order }) {
  const items = activeItems(order);
  const discount = Number(order.discount_amount) || 0;
  const paid = Number(order.paidAmount) || 0;
  const total = Math.max(0, (Number(order.itemsTotal) || 0) - discount);

  return (
    <div className="order-detail">
      {order.customer_name && (
        <div className="order-detail__cliente">Cliente: <strong>{order.customer_name}</strong></div>
      )}

      {order.special_note && (
        <div className="order-note order-note--order">
          <Icon name="note" size={16} strokeWidth={2} />
          <div>
            <div className="order-note__label">Nota para cocina</div>
            <div>{order.special_note}</div>
          </div>
        </div>
      )}

      <div className="order-detail__section-label">
        Productos <span>{items.reduce((s, it) => s + (Number(it.qty) || 0), 0)}</span>
      </div>
      <ul className="order-lines">
        {items.map((it) => (
          <li key={it.id} className="order-line">
            <span className="order-line__qty tnum">{it.qty}</span>
            <div className="order-line__main">
              <div className="order-line__name">
                {it.name}
                {it.paid_at && paid > 0 && <span className="order-line__paid">Pagado</span>}
              </div>
              {/* Avance de cocina (marca por unidad): solo mientras se prepara */}
              {order.status === 'EN_PREP' && readyUnits(it) > 0 && (
                <div className={`order-line__kitchen ${readyUnits(it) >= (Number(it.qty) || 1) ? 'is-done' : ''}`}>
                  <Icon name="cocina" size={13} strokeWidth={2} />
                  {readyUnits(it) >= (Number(it.qty) || 1)
                    ? 'Listo en cocina'
                    : `${readyUnits(it)} de ${it.qty} listas en cocina`}
                </div>
              )}
              {it.notes && <div className="order-line__notes">{it.notes}</div>}
              {it.special_note && (
                <div className="order-line__special">
                  <Icon name="note" size={13} strokeWidth={2} />
                  {it.special_note}
                </div>
              )}
            </div>
            <span className="order-line__price tnum">{formatPriceCOP((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
          </li>
        ))}
      </ul>

      <dl className="order-totals">
        {(discount > 0 || paid > 0) && (
          <div className="order-totals__row">
            <dt>Subtotal</dt>
            <dd className="tnum">{formatPriceCOP(order.itemsTotal || 0)}</dd>
          </div>
        )}
        {discount > 0 && (
          <div className="order-totals__row">
            <dt>Descuento{order.discount_reason ? ` · ${order.discount_reason}` : ''}</dt>
            <dd className="tnum">−{formatPriceCOP(discount)}</dd>
          </div>
        )}
        {paid > 0 && (
          <>
            <div className="order-totals__row">
              <dt>Total</dt>
              <dd className="tnum">{formatPriceCOP(total)}</dd>
            </div>
            <div className="order-totals__row order-totals__row--paid">
              <dt>Abonado</dt>
              <dd className="tnum">−{formatPriceCOP(paid)}</dd>
            </div>
          </>
        )}
        <div className="order-totals__row order-totals__row--grand">
          <dt>{paid > 0 ? 'Saldo pendiente' : 'Total'}</dt>
          <dd className="tnum">{formatPriceCOP(paid > 0 ? order.saldo : total)}</dd>
        </div>
      </dl>
    </div>
  );
}
