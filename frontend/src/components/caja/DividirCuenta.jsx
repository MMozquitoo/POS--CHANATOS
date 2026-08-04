import { useState, useEffect } from 'react';
import { formatPriceCOP, parseMontoCOP } from '../../utils/currency.js';

// Panel ÚNICO de "Dividir cuenta" (dueño, 2026-08-04): sin preguntar el modo.
// Marcar productos llena el monto solo (editable); también se puede escribir
// un monto libre sin marcar nada. Cada "COBRAR ESTA PARTE" registra un pago
// y el panel sigue abierto con el saldo restante hasta llegar a cero.
//
// props:
//   items         items pendientes de la orden [{id, qty, name, notes, price}]
//   saldo         lo que falta por pagar (con descuento y pagos previos restados)
//   soloMonto     true si la orden tiene descuento (el cobro por items da 409):
//                 los checks solo ayudan a calcular, el pago va por monto
//   onCobrarParte async ({ method, amount, itemIds|null }) → { fullyPaid }
//   onCancel      cerrar el panel
export default function DividirCuenta({ items, saldo, soloMonto, onCobrarParte, onCancel }) {
  const [seleccion, setSeleccion] = useState(new Set());
  const [monto, setMonto] = useState('');
  const [montoManual, setMontoManual] = useState(false);
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [cobrando, setCobrando] = useState(false);

  const vivos = items || [];
  const sumaSeleccion = vivos
    .filter((i) => seleccion.has(i.id))
    .reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);

  // El monto sigue a la selección mientras el cajero no lo edite a mano
  useEffect(() => {
    if (!montoManual) setMonto(sumaSeleccion > 0 ? String(sumaSeleccion) : '');
  }, [sumaSeleccion, montoManual]);

  const montoNum = Math.max(0, parseMontoCOP(monto) || 0);
  // Va por la ruta de items solo si lo marcado coincide con el monto (y no hay descuento)
  const usaItems = !soloMonto && seleccion.size > 0 && Math.abs(montoNum - sumaSeleccion) <= 1;
  const valido = montoNum > 0 && montoNum <= saldo + 1;

  const toggle = (id) => {
    setMontoManual(false);
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cobrar = async () => {
    if (!valido || cobrando) return;
    setCobrando(true);
    try {
      const r = await onCobrarParte({
        method: metodo,
        amount: montoNum,
        itemIds: usaItems ? [...seleccion] : null,
      });
      // Preparar la siguiente parte (si la cuenta quedó completa, el padre cierra)
      setSeleccion(new Set());
      setMonto('');
      setMontoManual(false);
    } finally {
      setCobrando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 3000 }}>
      <div style={{ background: 'white', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: '520px', maxHeight: '88dvh', overflowY: 'auto', padding: '1.2rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom, 0px))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.35rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Dividir cuenta</h3>
          <div style={{ fontSize: '0.9375rem', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
            Falta <strong className="tnum" style={{ color: 'var(--gray-900)' }}>{formatPriceCOP(saldo)}</strong>
          </div>
        </div>
        <p style={{ margin: '0 0 0.8rem', fontSize: '0.875rem', color: 'var(--gray-500)' }}>
          Marca lo que paga esta persona o escribe el monto directo.
        </p>

        {vivos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.9rem' }}>
            {vivos.map((it) => (
              <label key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.6rem 0.7rem', background: seleccion.has(it.id) ? 'var(--brand-tint)' : 'var(--gray-50)', borderRadius: '10px', cursor: 'pointer', minHeight: '46px', boxSizing: 'border-box' }}>
                <input
                  type="checkbox"
                  checked={seleccion.has(it.id)}
                  onChange={() => toggle(it.id)}
                  style={{ width: 20, height: 20, flexShrink: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: '0.9375rem' }}>
                  {it.qty}× {it.name}
                  {it.notes && <span style={{ color: '#B25000', fontSize: '0.8125rem' }}> — {it.notes}</span>}
                </span>
                <span className="tnum" style={{ fontWeight: 700, flexShrink: 0 }}>{formatPriceCOP((it.qty || 1) * (it.price || 0))}</span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <label style={{ fontWeight: 600, fontSize: '0.9375rem', whiteSpace: 'nowrap' }}>Monto</label>
          <input
            type="text"
            inputMode="numeric"
            value={monto}
            onChange={(e) => { setMontoManual(true); setMonto(e.target.value); }}
            placeholder="0"
            className="tnum"
            style={{ flex: 1, minWidth: 0, height: '46px', padding: '0 12px', border: '1.5px solid var(--gray-200, #e5e5e5)', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 700, textAlign: 'right', boxSizing: 'border-box' }}
          />
          <button
            type="button"
            onClick={() => { setMontoManual(true); setMonto(String(saldo)); setSeleccion(new Set()); }}
            style={{ padding: '0 12px', height: '46px', background: 'var(--gray-50)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Resto
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.9rem' }}>
          {[{ key: 'EFECTIVO', label: 'Efectivo' }, { key: 'TRANSFERENCIA', label: 'Transfer.' }].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetodo(key)}
              style={{
                minHeight: '46px',
                border: metodo === key ? '2px solid var(--brand)' : '1.5px solid var(--gray-200, #e5e5e5)',
                background: metodo === key ? 'var(--brand-tint)' : 'white',
                color: metodo === key ? 'var(--brand-deep)' : 'var(--gray-900)',
                borderRadius: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={cobrar}
          disabled={!valido || cobrando}
          className="btn-chanatos"
          style={{ width: '100%', minHeight: '52px', fontSize: '1.05rem', fontWeight: 800, opacity: !valido || cobrando ? 0.5 : 1, cursor: !valido || cobrando ? 'not-allowed' : 'pointer' }}
        >
          {cobrando ? 'Cobrando...' : `COBRAR ESTA PARTE (${formatPriceCOP(montoNum)})`}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
          style={{ width: '100%', minHeight: '46px', marginTop: '0.5rem' }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
