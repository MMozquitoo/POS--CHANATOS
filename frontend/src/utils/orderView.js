// Presentación de órdenes para Mesas / Órdenes / Resumen (rediseño 2026-10).
// SOLO formato y etiquetas: los montos (itemsTotal, paidAmount, saldo) vienen
// calculados por el servidor (GET /orders y GET /orders/:id usan la misma
// cuenta) — acá no se reimplementa ninguna regla de cobro.
import { statusLabel } from './statusLabels';

export const VENTANILLA_NUMBER = 9;
export const DOMICILIOS_NUMBER = 10;
export const ACTIVE_STATUSES = ['NUEVO', 'EN_PREP', 'LISTO'];

export function isActiveOrder(order) {
  return !!order && ACTIVE_STATUSES.includes(order.status) && !order.paid_at;
}

// Mesa / Ventanilla / Domicilio (+ Rappi), con la misma etiqueta en todo el POS
export function placeOf(order) {
  const n = Number(order?.table_number);
  const service = order?.service || order?.channel;
  if (n === VENTANILLA_NUMBER || service === 'VENTANILLA') {
    return { kind: 'VENTANILLA', label: 'Ventanilla', short: 'V', icon: 'ventanilla' };
  }
  if (n === DOMICILIOS_NUMBER || service === 'DOMICILIO') {
    const rappi = order?.delivery_platform === 'RAPPI';
    return { kind: 'DOMICILIO', label: rappi ? 'Domicilio Rappi' : 'Domicilio', short: 'D', icon: 'domicilio', rappi };
  }
  return { kind: 'MESA', label: n ? `Mesa ${n}` : 'Mesa', short: n ? String(n) : '–', icon: 'mesas' };
}

export function orderNumber(order) {
  if (order?.daily_no != null) return String(order.daily_no);
  const m = String(order?.code || '').match(/\d+/);
  return m ? m[0] : String(order?.id ?? '');
}

export function activeItems(order) {
  return (order?.items || []).filter((it) => !it.voided_at);
}

// Unidades listas de una fila (cocina por unidad, 2026-10): "5× Hamburguesa"
// con 3 listas → 3. ready_at = la fila completa.
export function readyUnits(item) {
  const qty = Math.max(1, Number(item?.qty) || 1);
  if (item?.ready_at) return qty;
  return Math.min(Math.max(Number(item?.ready_qty) || 0, 0), qty);
}

export function itemsCount(order) {
  return activeItems(order).reduce((s, it) => s + (Number(it.qty) || 0), 0);
}

// Timestamps del servidor: 'YYYY-MM-DD HH:mm:ss' en hora Bogotá. Los equipos
// del local están en esa misma zona (mismo criterio que Cocina.jsx).
export function parseServerTime(ts) {
  if (!ts) return null;
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function minutesSince(ts, now = Date.now()) {
  const d = parseServerTime(ts);
  if (!d) return null;
  return Math.max(0, Math.floor((now - d.getTime()) / 60000));
}

export function elapsedLabel(min) {
  if (min == null) return '';
  if (min < 1) return 'Recién';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `Hace ${d} ${d === 1 ? 'día' : 'días'}`;
  }
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Versión corta para espacios chicos (mesas del plano en celular)
export function elapsedShort(min) {
  if (min == null) return '';
  if (min < 1) return 'Ya';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d`;
  return `${h} h`;
}

export function clockLabel(ts) {
  const d = parseServerTime(ts);
  return d ? d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
}

// Semáforo de espera (mismo umbral que Cocina: 10 / 20 min) — solo mientras
// la orden está en cocina; una orden lista no "se atrasa".
export function urgencyOf(order, now = Date.now()) {
  if (!order || !['NUEVO', 'EN_PREP'].includes(order.status)) return 'ok';
  const min = minutesSince(order.created_at, now);
  if (min >= 20) return 'late';
  if (min >= 10) return 'warn';
  return 'ok';
}

// Clase de color por estado (las mismas .pill--* de primitives.css)
export function statusTone(status) {
  return {
    NUEVO: 'nuevo',
    EN_PREP: 'enprep',
    LISTO: 'listo',
    PAGADA: 'pagada',
    CANCELADO: 'cancelado',
  }[status] || 'pagada';
}

export function statusText(status) {
  if (status === 'LISTO') return 'Listo para cobrar';
  return statusLabel(status);
}

// Firma de "qué cambió" para resaltar una tarjeta cuando otra sesión la toca
export function orderSignature(order) {
  return [
    order.status,
    order.updated_at,
    order.saldo,
    order.paidAmount,
    (order.items || []).map((it) => `${it.id}:${it.qty}:${it.voided_at ? 1 : 0}:${it.ready_at || ''}:${it.ready_qty || 0}:${it.paid_at ? 1 : 0}`).join(','),
    order.special_note || '',
  ].join('|');
}
