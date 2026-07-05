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
