// ÚNICO armador de los datos del recibo final (2026-10-25). Antes cada flujo
// de cobro de DetalleMesa (cobrar todo, abono en efectivo, dividir por
// producto, dividir por monto) armaba el suyo a mano, y por eso el recibo de
// una cuenta dividida salía solo por el último pago en vez de por la cuenta
// completa (reporte del dueño). Las cuatro rutas pasan por acá.

// Etiqueta del lugar para el recibo (Mesa 3 / VENTANILLA / DOMICILIOS)
export function tableLabelOf(tableData) {
  const t = tableData?.table;
  if (t?.label) return t.label;
  if (t?.number === 9) return 'VENTANILLA';
  if (t?.number === 10) return 'DOMICILIOS';
  return t?.number ? `Mesa ${t.number}` : 'Sin mesa';
}

// "Quedó pagada" también cubre el prepago: la orden sigue EN_PREP pero su
// saldo ya es 0 (se cierra sola al quedar lista).
export function quedoPagada(orderData) {
  return orderData?.status === 'PAGADA' || (orderData?.saldo != null && Number(orderData.saldo) <= 0);
}

// orderData: respuesta fresca de GET /orders/:id (trae items, saldo y payments).
// payment: cómo presentar ESTE pago (método y monto) — el recibo además lista
// order.payments cuando hay más de uno.
// pendingItemIds: con saldo pendiente (abono), el recibo es SOLO de los items
// que cubrió este pago; con la cuenta pagada siempre es la cuenta completa.
export function armarRecibo({ orderData, tableData, payment, pendingItemIds = null }) {
  const completa = quedoPagada(orderData) || !pendingItemIds;
  const items = completa
    ? (orderData.items || [])
    : (orderData.items || []).filter((it) => pendingItemIds.includes(it.id));
  return {
    order: { ...orderData, table_label: tableLabelOf(tableData) },
    payment,
    items,
  };
}
