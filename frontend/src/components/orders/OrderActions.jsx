import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { actionsFor } from './accionesOrden';
import { toast } from '../ui/Toast';

// Botones de acción de una orden (pie del panel y tarjetas). Una acción que va
// al servidor muestra "procesando" y SOLO confirma cuando el servidor
// respondió bien; si falla, avisa y deja todo como estaba para reintentar.
export default function OrderActions({ order, from, onDone, onOpen, compact = false, only }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  // Acción con confirmLabel: el primer toque la "arma" 3 s, el segundo la ejecuta
  const [armed, setArmed] = useState(null);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(null), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  useEffect(() => setArmed(null), [order.id, order.status]);

  let actions = actionsFor(order);
  if (only === 'primary') {
    // Tarjeta: una sola acción principal
    actions = actions
      .filter((a) => a.cardPrimary || (a.kind === 'primary' && a.onCard !== false))
      .map((a) => ({ ...a, kind: 'primary' }));
  }

  const run = async (action, e) => {
    e?.stopPropagation();
    if (busy) return;
    if (action.confirmLabel && armed !== action.key) {
      setArmed(action.key);
      return;
    }
    setArmed(null);
    if (!action.server) {
      action.run({ navigate, from, onOpen });
      return;
    }
    setBusy(action.key);
    try {
      await action.run({ navigate, from, onOpen });
      toast(action.okMessage || 'Listo');
      onDone?.();
    } catch (err) {
      toast(err.response?.data?.error || 'No se pudo completar. Intenta de nuevo.', { tone: 'error', duration: 3200 });
    } finally {
      setBusy(null);
    }
  };

  const primary = actions.filter((a) => a.kind === 'primary');
  const secondary = actions.filter((a) => a.kind === 'secondary');
  // Botón principal del color del estado (dueño, 2026-10-25): nueva azul,
  // en preparación ámbar, lista verde — mismos colores de estado del POS
  const statusClass = { NUEVO: 'st-nuevo', EN_PREP: 'st-prep', LISTO: 'st-listo' }[order.status] || '';

  return (
    <div className={`order-actions ${compact ? 'is-compact' : ''}`}>
      {primary.map((a) => (
        <button
          key={a.key}
          type="button"
          className={`btn btn--primary btn--block ${statusClass} ${armed === a.key ? 'is-armed' : ''}`}
          disabled={!!busy}
          onClick={(e) => run(a, e)}
        >
          {busy === a.key ? 'Enviando…' : armed === a.key ? a.confirmLabel : a.label}
        </button>
      ))}
      {secondary.length > 0 && (
        <div className="order-actions__row">
          {secondary.map((a) => (
            <button
              key={a.key}
              type="button"
              className="btn btn--secondary"
              disabled={!!busy}
              onClick={(e) => run(a, e)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
