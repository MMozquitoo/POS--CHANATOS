import { useState } from 'react';
import { formatPriceCOP } from '../../utils/currency.js';
import './PagoDividido.css';

const METHODS = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'];
const METHOD_LABELS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transfer.' };

/**
 * Modal de pago dividido: reparte el total de una cuenta entre varios
 * métodos de pago (ej. una parte por transferencia y otra en efectivo).
 * onConfirm recibe [{method, amount}, ...] cuya suma es exactamente el total.
 */
export default function PagoDividido({ total, onCancel, onConfirm }) {
  const [lines, setLines] = useState([
    { method: 'EFECTIVO', amount: '' },
    { method: 'TRANSFERENCIA', amount: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const sum = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const restante = Math.round((total - sum) * 100) / 100;
  const listo = Math.abs(restante) < 1 && lines.every(l => parseFloat(l.amount) > 0);

  const updateLine = (idx, patch) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    if (lines.length >= 4) return;
    setLines([...lines, { method: 'EFECTIVO', amount: restante > 0 ? String(restante) : '' }]);
  };

  const removeLine = (idx) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const splitEqual = () => {
    const n = lines.length;
    const base = Math.floor(total / n);
    const newLines = lines.map((l, i) => ({
      ...l,
      // La primera línea absorbe el residuo para que la suma sea exacta
      amount: String(i === 0 ? total - base * (n - 1) : base),
    }));
    setLines(newLines);
  };

  const completeLine = (idx) => {
    const others = lines.reduce((s, l, i) => (i === idx ? s : s + (parseFloat(l.amount) || 0)), 0);
    const falta = Math.max(0, total - others);
    updateLine(idx, { amount: falta > 0 ? String(falta) : '' });
  };

  const handleConfirm = async () => {
    if (!listo || busy) return;
    setBusy(true);
    try {
      await onConfirm(lines.map(l => ({ method: l.method, amount: parseFloat(l.amount) })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pago-dividido-overlay">
      <div className="pago-dividido-card">
        <h3>Pago dividido</h3>
        <div className="pago-dividido-total">
          Total a cobrar: <strong>{formatPriceCOP(total)}</strong>
        </div>

        {lines.map((line, idx) => (
          <div key={idx} className="pago-dividido-line">
            <div className="pago-dividido-methods">
              {METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  className={`pd-method-btn ${line.method === m ? 'active' : ''}`}
                  onClick={() => updateLine(idx, { method: m })}
                >
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="pago-dividido-amount">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={line.amount}
                onChange={e => updateLine(idx, { amount: e.target.value })}
              />
              <button type="button" className="pd-fill-btn" title="Completar con lo que falta"
                onClick={() => completeLine(idx)}>
                Resto
              </button>
              {lines.length > 2 && (
                <button type="button" className="pd-remove-btn" onClick={() => removeLine(idx)}>×</button>
              )}
            </div>
          </div>
        ))}

        <div className="pago-dividido-tools">
          <button type="button" onClick={splitEqual}>Partes iguales</button>
          {lines.length < 4 && <button type="button" onClick={addLine}>+ Agregar pago</button>}
        </div>

        <div className={`pago-dividido-restante ${listo ? 'ok' : restante < 0 ? 'excede' : ''}`}>
          {listo
            ? '✓ Los pagos cubren el total'
            : restante < 0
              ? `Sobra ${formatPriceCOP(Math.abs(restante))}`
              : `Falta ${formatPriceCOP(restante)}`}
        </div>

        <div className="pago-dividido-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn-chanatos" onClick={handleConfirm} disabled={!listo || busy}>
            {busy ? 'Cobrando…' : `Cobrar ${formatPriceCOP(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
