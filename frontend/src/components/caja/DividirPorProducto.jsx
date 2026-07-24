import { useState, useEffect } from 'react';
import { formatPriceCOP } from '../../utils/currency.js';
import './DividirPorProducto.css';

// TARJETA oculta a pedido del dueño: no hay datáfono activo todavía (ver
// CLAUDE.md "Pendientes conocidos" — evalúa Bold/Wompi).
const METHODS = ['EFECTIVO', 'TRANSFERENCIA'];
const METHOD_LABELS = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transfer.' };

/**
 * Modal "Dividir por producto": permite cobrar la cuenta en varios grupos,
 * eligiendo qué productos (y qué cantidad de un producto con qty>1) paga
 * cada método. Cada grupo se cobra con una llamada independiente a
 * POST /payments/items (vía onConfirmGroup), que puede repetirse hasta que
 * no quede nada pendiente.
 *
 * `items`: items pendientes de pago de la orden activa ({id, name, qty, price, notes}).
 * `onConfirmGroup(payloadItems, method)`: payloadItems = [{id, qty}]; debe
 *   devolver una Promise que resuelve a { fullyPaid: boolean }. El padre es
 *   quien refresca los datos y decide si cierra el modal (orden ya PAGADA) o
 *   sigue mostrando lo que queda pendiente (nuevo valor de `items`).
 * `onClose()`: el cajero decide terminar (queda lo no seleccionado pendiente,
 *   igual que hoy con el cobro parcial por items).
 */
export default function DividirPorProducto({ items, onConfirmGroup, onClose }) {
  const [selection, setSelection] = useState({}); // { [itemId]: qtySeleccionada }
  const [method, setMethod] = useState('EFECTIVO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const safeItems = items || [];

  // Si el padre refresca los items (después de cobrar un grupo, o por un
  // evento externo), recorta selecciones que ya no existan o excedan lo
  // realmente pendiente — evita seleccionar más de lo que hay.
  useEffect(() => {
    setSelection((prev) => {
      const next = {};
      for (const item of safeItems) {
        if (prev[item.id] != null) {
          const capped = Math.min(prev[item.id], item.qty);
          if (capped > 0) next[item.id] = capped;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const updateSelQty = (id, qty) => {
    setError(null);
    setSuccessMsg(null);
    setSelection((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const selectAllPending = () => {
    setError(null);
    setSuccessMsg(null);
    const next = {};
    for (const item of safeItems) next[item.id] = item.qty;
    setSelection(next);
  };

  const clearSelection = () => {
    setError(null);
    setSuccessMsg(null);
    setSelection({});
  };

  const pendingTotal = safeItems.reduce((sum, item) => sum + item.qty * item.price, 0);
  const groupTotal = safeItems.reduce(
    (sum, item) => sum + (selection[item.id] || 0) * item.price,
    0
  );
  const hasSelection = groupTotal > 0;

  const handleConfirm = async () => {
    if (!hasSelection || busy) return;
    const payloadItems = safeItems
      .filter((item) => (selection[item.id] || 0) > 0)
      .map((item) => ({ id: item.id, qty: selection[item.id] }));
    if (payloadItems.length === 0) return;

    setBusy(true);
    setError(null);
    const cobradoTexto = `${formatPriceCOP(groupTotal)} (${METHOD_LABELS[method]})`;
    try {
      const result = await onConfirmGroup(payloadItems, method);
      setSelection({});
      if (!result?.fullyPaid) {
        setSuccessMsg(`Grupo cobrado: ${cobradoTexto}. Sigue con el resto o cierra si terminaste.`);
      }
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          'No se pudo cobrar el grupo. Intenta nuevamente.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dpp-overlay">
      <div className="dpp-card">
        <h3>Dividir por producto</h3>
        <p className="dpp-subtitle">
          Elige qué productos (o qué cantidad) paga cada persona y cobra el grupo. Puedes repetir
          hasta cobrar toda la cuenta.
        </p>

        {safeItems.length === 0 ? (
          <div className="dpp-done">
            <div className="dpp-done-check">Todo pagado</div>
            <button type="button" className="btn-chanatos" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="dpp-total">
              Pendiente de la orden: <strong>{formatPriceCOP(pendingTotal)}</strong>
            </div>

            <div className="dpp-items">
              {safeItems.map((item) => {
                const selQty = selection[item.id] || 0;
                return (
                  <div key={item.id} className={`dpp-item-row ${selQty > 0 ? 'selected' : ''}`}>
                    <div className="dpp-item-info">
                      <div className="dpp-item-name">{item.name}</div>
                      <div className="dpp-item-sub">
                        {formatPriceCOP(item.price)} c/u · pendiente: {item.qty}
                        {item.notes && <span> · {item.notes}</span>}
                      </div>
                    </div>
                    <div className="dpp-item-stepper">
                      <button
                        type="button"
                        onClick={() => updateSelQty(item.id, selQty - 1)}
                        disabled={selQty <= 0 || busy}
                      >
                        −
                      </button>
                      <span>{selQty}</span>
                      <button
                        type="button"
                        onClick={() => updateSelQty(item.id, selQty + 1)}
                        disabled={selQty >= item.qty || busy}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="dpp-tools">
              <button type="button" onClick={selectAllPending} disabled={busy}>
                Seleccionar todo lo pendiente
              </button>
              <button type="button" onClick={clearSelection} disabled={busy}>
                Limpiar selección
              </button>
            </div>

            <div className="dpp-methods">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`dpp-method-btn ${method === m ? 'active' : ''}`}
                  onClick={() => {
                    setMethod(m);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>

            {error && <div className="dpp-msg error">{error}</div>}
            {successMsg && !error && <div className="dpp-msg ok">{successMsg}</div>}

            <div className="dpp-group-total">
              Grupo actual: <strong>{formatPriceCOP(groupTotal)}</strong>
            </div>

            <div className="dpp-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Terminar
              </button>
              <button
                type="button"
                className="btn-chanatos"
                onClick={handleConfirm}
                disabled={!hasSelection || busy}
              >
                {busy ? 'Cobrando…' : `Cobrar grupo ${formatPriceCOP(groupTotal)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
