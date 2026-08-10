// Categorías fijas de gastos/ingresos generales (Contaduría). El enum interno
// nunca se muestra al usuario, igual que statusLabels.js — acá vive el único
// lugar que traduce categoría → texto legible.
export const EXPENSE_CATEGORIES = [
  'VERDURAS',
  'SERVICIOS',
  'ARRIENDO',
  'NOMINA',
  'ASEO',
  'MANTENIMIENTO',
  'TRANSPORTE',
  'OTROS',
];

export const INCOME_CATEGORIES = [
  'APORTE_CAPITAL',
  'OTROS',
];

export const EXPENSE_CATEGORY_LABELS = {
  VERDURAS: 'Verduras',
  SERVICIOS: 'Servicios (agua/luz/gas/internet)',
  ARRIENDO: 'Arriendo',
  NOMINA: 'Nómina',
  ASEO: 'Aseo',
  MANTENIMIENTO: 'Mantenimiento',
  TRANSPORTE: 'Transporte',
  APORTE_CAPITAL: 'Aporte de capital',
  OTROS: 'Otros',
  SIN_CATEGORIA: 'Sin categoría',
};

export function expenseCategoryLabel(category) {
  return EXPENSE_CATEGORY_LABELS[category] || category || 'Sin categoría';
}
