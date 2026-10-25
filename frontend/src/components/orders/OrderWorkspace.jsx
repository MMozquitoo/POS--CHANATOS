import { useCallback, useEffect, useRef, useState } from 'react';
import DetalleMesa from '../../pages/Caja/DetalleMesa';
import Ventanilla from '../../pages/Ventanilla/Ventanilla';
import Domicilios from '../../pages/Domicilios/Domicilios';
import Icon from '../ui/Icon';
import { PlaceTag, StatusPill } from '../ui/StatusPill';
import { orderNumber, placeOf } from '../../utils/orderView';
import './orders.css';

// Hoja de trabajo de una orden (2026-10): Cobrar / Agregar productos / Revisar
// desde Órdenes o Mesas abren ESTA hoja encima de la lista en vez de ir a otra
// página. Adentro va DetalleMesa en modo embedded — el mismo cobro (dividido,
// propina, descuento, abonos, recibo) y la misma edición de siempre, sin una
// segunda versión de la lógica. Al cerrar, la lista queda como estaba
// (filtros, selección y desplazamiento viven en la URL de la página).
//
// estacion ('VENTANILLA' | 'DOMICILIOS'): pedido nuevo de Ventanilla o
// Domicilios — adentro van esas mismas pantallas en modo embedded; al crear,
// la hoja pasa sola al cobro de la orden recién creada (como antes, pero sin
// cambiar de página).
// startAdding: "Agregar productos" abre con el selector ya desplegado.
// order: la orden tal como estaba al abrir (si se paga y desaparece de la
// lista en vivo, la hoja sigue mostrando su recibo hasta que se cierre).
export default function OrderWorkspace({ order: orderProp = null, table = null, estacion = null, startAdding = false, onClose }) {
  const [closing, setClosing] = useState(false);
  // Ventanilla/Domicilios: al crear el pedido la hoja cambia a su cobro
  const [creada, setCreada] = useState(null);
  const order = creada || orderProp;
  const modoEstacion = !order && estacion;
  // Sin orden (mesa libre desde Mesas o el "+"): la hoja arma la orden nueva
  const n = table ? Number(table.number) : null;
  const place = order
    ? placeOf(order)
    : estacion === 'VENTANILLA'
      ? { kind: 'VENTANILLA', label: 'Ventanilla', icon: 'ventanilla' }
      : estacion === 'DOMICILIOS'
        ? { kind: 'DOMICILIO', label: 'Domicilio', icon: 'domicilio' }
        : { kind: 'MESA', label: n ? `Mesa ${n}` : 'Mesa', short: n ? String(n) : '–', icon: 'mesas' };
  const tableId = order ? order.table_id : table?.id;

  // La página de atrás no se desplaza mientras la hoja está abierta
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // DetalleMesa registra acá su "¿salir sin enviar?" (borrador pendiente)
  const guardRef = useRef(null);
  const registerCloseGuard = useCallback((fn) => { guardRef.current = fn; }, []);
  const close = async () => {
    if (closing) return;
    if (guardRef.current && !(await guardRef.current())) return;
    setClosing(true);
    setTimeout(onClose, 200);
  };
  // Cierre sin preguntar (DetalleMesa ya preguntó o la orden quedó cobrada)
  const closeNow = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  };

  const title = place.kind === 'MESA' ? place.label : place.kind === 'VENTANILLA' ? 'Ventanilla' : 'Domicilio';

  return (
    <>
      <div className={`order-ws-scrim ${closing ? 'is-closing' : ''}`} onClick={close} aria-hidden="true" />
      <section
        className={`order-ws ${closing ? 'is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={order ? `${title}, orden ${orderNumber(order)}` : title}
      >
        <header className="order-ws__head">
          <div className={`order-ws__place order-ws__place--${place.kind.toLowerCase()}`}>
            {place.kind === 'MESA' ? (
              <span className="tnum">{place.short}</span>
            ) : (
              <Icon name={place.icon} size={26} strokeWidth={2.2} />
            )}
          </div>
          <div className="order-ws__titles">
            <h2>{title}</h2>
            <div className="order-ws__sub">
              {order ? (
                <>
                  <span>Orden {orderNumber(order)}{order.customer_name ? ` · ${order.customer_name}` : ''}</span>
                  <StatusPill status={order.status} />
                </>
              ) : (
                <span>{modoEstacion ? 'Pedido nuevo' : 'Mesa y su orden'}</span>
              )}
              {place.rappi && <PlaceTag place={place} />}
            </div>
          </div>
          <button type="button" className="icon-btn order-ws__close" onClick={close} aria-label="Cerrar y volver a la lista">
            <Icon name="close" size={22} />
          </button>
        </header>
        <div className="order-ws__body">
          {modoEstacion === 'VENTANILLA' ? (
            <Ventanilla embedded onClose={closeNow} onOpenOrder={setCreada} registerCloseGuard={registerCloseGuard} />
          ) : modoEstacion === 'DOMICILIOS' ? (
            <Domicilios embedded onClose={closeNow} onOpenOrder={setCreada} registerCloseGuard={registerCloseGuard} />
          ) : (
            <DetalleMesa key={order ? order.id : `mesa-${tableId}`} embedded tableId={tableId} orderId={order ? order.id : null} startAdding={startAdding} onClose={closeNow} registerCloseGuard={registerCloseGuard} />
          )}
        </div>
      </section>
    </>
  );
}
