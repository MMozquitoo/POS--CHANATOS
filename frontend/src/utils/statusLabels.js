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
