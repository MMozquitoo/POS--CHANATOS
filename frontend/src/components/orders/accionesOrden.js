import axios from 'axios';
import { placeOf } from '../../utils/orderView';

// Acciones de CAJA según el estado (panel de Mesas / Órdenes). Las reglas
// siguen en el servidor y en DetalleMesa: acá solo se decide QUÉ botón
// ofrecer y a dónde llevar. "Enviar a preparación" es la misma llamada que ya
// hacían CentroTotal/DetalleMesa (PATCH status), y el servidor valida.
//
// Devuelve [{ key, label, kind: 'primary'|'secondary', run }] (+ onCard:false =
// solo en el panel, cardPrimary = la principal de la tarjeta, confirmLabel =
// pide un segundo toque) — run recibe
// { navigate, from, onOpen } y puede devolver una promesa. Con onOpen (Órdenes
// y Mesas) cobrar/agregar/revisar abren la hoja de trabajo encima de la lista
// (OrderWorkspace) en vez de ir a la página de la mesa.
export function actionsFor(order) {
  const place = placeOf(order);
  const open = (extra = '', opts = {}) => ({ navigate, from, onOpen }) =>
    onOpen ? onOpen(order, opts) : navigate(`/mesa/${order.table_id}?orderId=${order.id}${extra}`, { state: { from } });
  const agregar = open('', { agregar: true });
  const saldo = Number(order.saldo) || 0;
  const prepagoPosible = place.kind !== 'MESA' && !place.rappi;

  if (order.status === 'NUEVO') {
    return [
      {
        key: 'enviar',
        label: 'Enviar a preparación',
        kind: 'primary',
        server: true,
        okMessage: 'Pedido enviado',
        run: () => axios.patch(`/orders/${order.id}/status`, { status: 'EN_PREP' }),
      },
      { key: 'agregar', label: 'Agregar productos', kind: 'secondary', run: agregar },
      ...(prepagoPosible && saldo > 0 ? [{ key: 'cobrar', label: 'Cobrar', kind: 'secondary', run: open() }] : []),
    ];
  }
  if (order.status === 'EN_PREP') {
    return [
      // Caja también puede dar la orden por lista (misma llamada que "Todo
      // listo" de cocina: el servidor completa todas las unidades). En la
      // tarjeta NO aparece — ahí sigue "Revisar orden" — y en el panel pide un
      // segundo toque para confirmar (se puede devolver desde cocina).
      {
        key: 'lista',
        label: 'Marcar lista',
        confirmLabel: 'Toca otra vez para confirmar',
        kind: 'primary',
        onCard: false,
        server: true,
        okMessage: 'Orden lista',
        run: () => axios.patch(`/orders/${order.id}/status`, { status: 'LISTO' }),
      },
      { key: 'revisar', label: 'Revisar orden', kind: 'secondary', cardPrimary: true, run: open() },
      { key: 'agregar', label: 'Agregar productos', kind: 'secondary', run: agregar },
      ...(prepagoPosible && saldo > 0 ? [{ key: 'cobrar', label: 'Cobrar', kind: 'secondary', run: open() }] : []),
    ];
  }
  if (order.status === 'LISTO') {
    if (saldo > 0 && !place.rappi) {
      return [
        { key: 'cobrar', label: saldo < (Number(order.itemsTotal) || 0) ? 'Cobrar saldo' : 'Cobrar', kind: 'primary', run: open() },
        { key: 'agregar', label: 'Agregar productos', kind: 'secondary', run: agregar },
      ];
    }
    return [{ key: 'revisar', label: 'Revisar orden', kind: 'primary', run: open() }];
  }
  return [{ key: 'revisar', label: 'Revisar orden', kind: 'primary', run: open() }];
}
