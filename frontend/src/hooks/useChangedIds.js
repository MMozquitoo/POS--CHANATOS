import { useEffect, useRef, useState } from 'react';
import { orderSignature } from '../utils/orderView';

// Ids de órdenes que cambiaron desde la última lista (nuevas o modificadas),
// para resaltarlas ~800 ms. Nunca en la primera carga (si no, todo "brilla"
// al abrir la pantalla). Rediseño 2026-10.
export default function useChangedIds(orders, flashMs = 900) {
  const prevRef = useRef(null);
  const timerRef = useRef(null);
  const [changed, setChanged] = useState(() => new Set());

  useEffect(() => {
    if (!orders) return;
    const next = new Map(orders.map((o) => [o.id, orderSignature(o)]));
    const prev = prevRef.current;
    prevRef.current = next;
    if (!prev) return;
    const ids = new Set();
    next.forEach((sig, id) => {
      if (prev.get(id) !== sig) ids.add(id);
    });
    if (ids.size) {
      setChanged(ids);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setChanged(new Set()), flashMs);
    }
  }, [orders, flashMs]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return changed;
}
