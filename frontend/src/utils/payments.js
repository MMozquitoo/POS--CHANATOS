// PASO 16.2.2-A: Helper para normalizar payload de POST /payments/items
export function normalizePaymentItemsPayload({
  items, // array de objetos o números
  method, // string (puede venir como CASH/CARD/TRANSFER)
  tableId, // number o string
  orderId, // number o string (opcional)
  amount // number (opcional, solo para logs)
}) {
  // 1) Normalizar itemIds como array de números
  let itemIds = [];
  if (Array.isArray(items)) {
    itemIds = items
      .map(item => {
        if (typeof item === 'number') return item;
        if (typeof item === 'object' && item !== null) {
          return item.id || item.order_item_id || item.itemId || item.item_id;
        }
        return null;
      })
      .filter(id => id != null)
      .map(id => Number(id))
      .filter(id => !isNaN(id) && id > 0);
  }

  if (itemIds.length === 0) {
    throw new Error('No hay items válidos para cobrar. Verifica que los items tengan id.');
  }

  // 2) Normalizar method
  let normalizedMethod = method?.toUpperCase() || 'EFECTIVO';
  const methodMap = {
    'CASH': 'EFECTIVO',
    'CARD': 'TARJETA',
    'TRANSFER': 'TRANSFERENCIA',
    'EFECTIVO': 'EFECTIVO',
    'TARJETA': 'TARJETA',
    'TRANSFERENCIA': 'TRANSFERENCIA'
  };
  normalizedMethod = methodMap[normalizedMethod] || 'EFECTIVO';

  // 3) Construir payload
  const payload = {
    itemIds,
    method: normalizedMethod
  };

  // Agregar orderId si existe, sino tableId
  if (orderId != null) {
    const orderIdNum = typeof orderId === 'number' ? orderId : parseInt(orderId);
    if (!isNaN(orderIdNum) && orderIdNum > 0) {
      payload.orderId = orderIdNum;
    }
  }

  if (tableId != null && !payload.orderId) {
    const tableIdNum = typeof tableId === 'number' ? tableId : parseInt(tableId);
    if (!isNaN(tableIdNum) && tableIdNum > 0) {
      payload.tableId = tableIdNum;
    }
  }

  // Agregar amount si viene (opcional, solo para logs)
  if (amount != null && !isNaN(Number(amount))) {
    payload.amount = Number(amount);
  }

  // PASO 16.2.2-A: Log en desarrollo
  if (import.meta.env.DEV || process.env.NODE_ENV === 'development') {
    console.log('[payments/items payload]', payload);
  }

  return payload;
}
