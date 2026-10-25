import { useEffect, useState } from 'react';
import Icon from './Icon';
import './ui.css';

// Confirmaciones cortas ("Pedido enviado", "Producto agregado", "Pago
// recibido") con el mismo tratamiento en todo el POS. REGLA: se llama SOLO
// después de que el servidor confirmó (o, para el borrador local, después de
// agregarlo de verdad a la lista) — una animación nunca anticipa un éxito.
let push = null;
const queue = [];

export function toast(message, { tone = 'ok', duration = 1800 } = {}) {
  const item = { id: Date.now() + Math.random(), message, tone, duration };
  if (push) push(item);
  else queue.push(item);
}

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    push = (item) => {
      setItems((list) => [...list.slice(-2), item]);
      setTimeout(() => {
        setItems((list) => list.map((t) => (t.id === item.id ? { ...t, leaving: true } : t)));
      }, item.duration);
      setTimeout(() => {
        setItems((list) => list.filter((t) => t.id !== item.id));
      }, item.duration + 220);
    };
    queue.splice(0).forEach((i) => push(i));
    return () => {
      push = null;
    };
  }, []);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone} ${t.leaving ? 'is-leaving' : ''}`}>
          <span className="toast__icon" aria-hidden="true">
            <Icon name={t.tone === 'error' ? 'alerta' : 'check'} size={16} strokeWidth={2.4} />
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
