import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useReconnectRefresh } from './useReconnectRefresh';
import { isActiveOrder, orderSignature } from '../utils/orderView';

// Órdenes activas (+ mesas) EN VIVO para las vistas de Mesas y Órdenes
// (rediseño 2026-10). Reglas:
// - Los datos anteriores se quedan en pantalla mientras se actualiza (nunca
//   se vacía la lista por un refresco: `refreshing` avisa sin borrar nada).
// - Cualquier cambio de otra sesión (pedido nuevo, cocina, pagos, anulación)
//   dispara una recarga agrupada (varios eventos seguidos = una petición).
// - `changedIds`: órdenes que cambiaron en la última recarga, para el
//   resaltado breve (~800 ms) — nunca en la carga inicial.
const EVENTS = [
  'order:new',
  'order:status-changed',
  'order:updated',
  'order:archived',
  'order:canceled',
  'order:deleted',
  'order:disabled',
  'order:enabled',
  'payment:created',
  'payment:voided',
  'items:paid',
  'item:updated',
  'item:voided',
  'item:deleted',
  'table:updated',
];

const FLASH_MS = 900;

export default function useLiveOrders({ withTables = false } = {}) {
  const { socket } = useAuth();
  const [orders, setOrders] = useState(null);
  const [tables, setTables] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [changedIds, setChangedIds] = useState(() => new Set());
  const signaturesRef = useRef(null);
  const flashTimerRef = useRef(null);
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setRefreshing(true);
    try {
      const [ordersRes, tablesRes] = await Promise.all([
        axios.get('/orders'),
        withTables ? axios.get('/tables') : Promise.resolve(null),
      ]);
      // Una respuesta vieja que llega tarde no pisa una más nueva
      if (seq !== seqRef.current) return;
      const active = (ordersRes.data || []).filter(isActiveOrder);

      const prev = signaturesRef.current;
      const next = new Map(active.map((o) => [o.id, orderSignature(o)]));
      if (prev) {
        const changed = new Set();
        next.forEach((sig, id) => {
          if (prev.get(id) !== sig) changed.add(id);
        });
        if (changed.size) {
          setChangedIds(changed);
          clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setChangedIds(new Set()), FLASH_MS);
        }
      }
      signaturesRef.current = next;

      setOrders(active);
      if (tablesRes) setTables(tablesRes.data || []);
      setError(null);
    } catch (err) {
      if (seq !== seqRef.current) return;
      setError(err.response?.data?.error || 'No se pudo actualizar. Reintentando con la próxima novedad.');
    } finally {
      if (seq === seqRef.current) setRefreshing(false);
    }
  }, [withTables]);

  useEffect(() => {
    load();
    if (!socket) return undefined;
    let timer;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 180);
    };
    EVENTS.forEach((ev) => socket.on(ev, kick));
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((ev) => socket.off(ev, kick));
    };
  }, [socket, load]);

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  useReconnectRefresh({ enabled: true, onReconnect: load });

  return { orders, tables, refreshing, error, reload: load, changedIds };
}

// Reloj compartido para los "hace X min" (un tick por minuto basta)
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
