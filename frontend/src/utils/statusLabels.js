// Etiquetas legibles de los estados de orden (el enum interno no se muestra al usuario)
export const STATUS_LABELS = {
  NUEVO: 'Nuevo',
  EN_PREP: 'En preparación',
  LISTO: 'Listo',
  PAGADA: 'Pagada',
  CANCELADO: 'Cancelado',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

// Etiquetas legibles del canal de venta (orders.service)
export const SERVICE_LABELS = {
  MESA: 'Mesas',
  VENTANILLA: 'Ventanilla',
  DOMICILIO: 'Domicilios',
};

export function serviceLabel(service) {
  return SERVICE_LABELS[service] || service;
}

// Etiquetas legibles del método de pago (payments.method). RAPPI no es plata
// que entre al local el mismo día: la plataforma paga después (ver cash.js).
export const PAYMENT_METHOD_LABELS = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  RAPPI: 'Rappi',
};

export function paymentMethodLabel(method) {
  return PAYMENT_METHOD_LABELS[method] || method;
}

// Plataformas de domicilio (orders.delivery_platform). null = pedido propio.
export const DELIVERY_PLATFORM_LABELS = {
  RAPPI: 'Rappi',
};

export function isRappiOrder(order) {
  return order?.delivery_platform === 'RAPPI';
}
