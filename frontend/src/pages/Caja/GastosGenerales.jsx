import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Caja.css';
import './Reportes.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaDateTime } from '../../utils/timezone.js';
import { expenseCategoryLabel } from '../../utils/expenseCategories.js';

// Fecha YYYY-MM-DD en zona Bogotá (mismo helper que Reportes.jsx — no hay
// componente de rango de fechas compartido en el proyecto)
function bogotaDate(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
}

const PERIODS = [
  { key: 'hoy', label: 'Hoy', range: () => [bogotaDate(0), bogotaDate(0)] },
  { key: 'ayer', label: 'Ayer', range: () => [bogotaDate(1), bogotaDate(1)] },
  { key: '7d', label: '7 días', range: () => [bogotaDate(6), bogotaDate(0)] },
  { key: '30d', label: '30 días', range: () => [bogotaDate(29), bogotaDate(0)] },
  { key: 'rango', label: 'Rango' },
];

function BarRow({ label, value, max, extra }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="rep-bar-row" title={`${label}: ${formatPriceCOP(value)}`}>
      <div className="rep-bar-label">{label}</div>
      <div className="rep-bar-track">
        <div className="rep-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="rep-bar-value">
        {formatPriceCOP(value)}
        {extra && <span className="rep-bar-extra">{extra}</span>}
      </div>
    </div>
  );
}

// Pantalla de SOLO CONSULTA (filtro por período, KPIs, gráfico por categoría,
// borrar un movimiento puntual). Para anotar un ingreso/gasto nuevo el
// registro ahora es unificado en RegistrarCompra.jsx ("Registrar compra" en
// el menú) — ahí no hace falta saber si es insumo con receta o gasto suelto,
// se resuelve solo. Tener el alta en dos lugares (acá y allá) generaba la
// misma "doble navegación confusa" que ya se corrigió en otras pantallas.
//
// embedded=true: se usa dentro de Compras.jsx (pestaña "Generales"), sin su
// propio CajaHeader/container.
export default function GastosGenerales({ embedded = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  const [period, setPeriod] = useState('7d');
  const [customFrom, setCustomFrom] = useState(bogotaDate(6));
  const [customTo, setCustomTo] = useState(bogotaDate(0));
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let from, to;
    if (period === 'rango') {
      if (!customFrom || !customTo) return;
      [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    } else {
      [from, to] = PERIODS.find(p => p.key === period).range();
    }
    setLoading(true);
    try {
      const res = await axios.get(`/cash/manual-transactions?from=${from}&to=${to}`);
      setTransactions(res.data || []);
    } catch (error) {
      console.error('Error cargando gastos generales:', error);
      await showAlert('Error al cargar gastos/ingresos generales');
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, showAlert]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (transaction) => {
    if (!(await showConfirm(`¿Borrar "${transaction.description}" (${formatPriceCOP(transaction.amount)})?`))) {
      return;
    }
    try {
      await axios.delete(`/cash/manual-transactions/${transaction.id}`);
      await load();
    } catch (error) {
      console.error('Error borrando movimiento:', error);
      await showAlert(error.response?.data?.error || 'Error al borrar');
    }
  };

  const incomeTotal = transactions.filter(t => t.type === 'INGRESO').reduce((s, t) => s + t.amount, 0);
  const expenseTotal = transactions.filter(t => t.type === 'EGRESO').reduce((s, t) => s + t.amount, 0);
  const net = incomeTotal - expenseTotal;

  const expenseByCategory = {};
  transactions.filter(t => t.type === 'EGRESO').forEach(t => {
    const cat = t.category || 'SIN_CATEGORIA';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + t.amount;
  });
  const expenseCategoryRows = Object.entries(expenseByCategory)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
  const maxExpenseCategory = Math.max(0, ...expenseCategoryRows.map(r => r.total));

  const content = (
    <>
      <div className="caja-content caja-page rep-content">
        <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Historial de gastos e ingresos sueltos sin receta (verduras, servicios, arriendo, nómina...).
          Para anotar uno nuevo usá "Registrar compra" en el menú.
        </div>

        <div className="rep-periods">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className={`rep-period-btn ${period === p.key ? 'active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'rango' && (
          <div className="rep-range">
            <label className="rep-range-field">
              <span>Desde</span>
              <input type="date" value={customFrom} max={bogotaDate(0)} onChange={e => setCustomFrom(e.target.value)} />
            </label>
            <label className="rep-range-field">
              <span>Hasta</span>
              <input type="date" value={customTo} max={bogotaDate(0)} onChange={e => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}

        {loading ? (
          <div className="rep-loading">Cargando…</div>
        ) : (
          <>
            <div className="rep-kpis">
              <div className="rep-kpi">
                <div className="rep-kpi-value">{formatPriceCOP(incomeTotal)}</div>
                <div className="rep-kpi-label">Ingresos</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value">{formatPriceCOP(expenseTotal)}</div>
                <div className="rep-kpi-label">Egresos</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value" style={{ color: net >= 0 ? 'var(--green-text, #28a745)' : 'var(--red-text, #dc3545)' }}>
                  {formatPriceCOP(net)}
                </div>
                <div className="rep-kpi-label">Neto</div>
              </div>
            </div>

            {expenseCategoryRows.length > 0 && (
              <section className="rep-section">
                <h3>Egresos por categoría</h3>
                {expenseCategoryRows.map(row => (
                  <BarRow key={row.category} label={expenseCategoryLabel(row.category)} value={row.total} max={maxExpenseCategory} />
                ))}
              </section>
            )}

            <section className="rep-section">
              <h3>Movimientos del periodo</h3>
              {transactions.length === 0 ? (
                <p className="rep-empty">Sin movimientos en este periodo</p>
              ) : (
                transactions.map(t => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 0.7rem', marginBottom: '0.4rem', background: '#f8f9fa',
                      borderRadius: '8px', gap: '0.6rem',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>
                        {expenseCategoryLabel(t.category)} · {formatBogotaDateTime(new Date(t.created_at))} · {t.created_by_name}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 700, fontSize: '0.9rem', flexShrink: 0,
                      color: t.type === 'INGRESO' ? 'var(--green-text, #28a745)' : 'var(--red-text, #dc3545)',
                    }}>
                      {t.type === 'INGRESO' ? '+' : '-'}{formatPriceCOP(t.amount)}
                    </div>
                    <button
                      onClick={() => handleDelete(t)}
                      title="Borrar"
                      style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1rem', flexShrink: 0, padding: '0.2rem 0.4rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
      <Modal open={confirmState.open} onClose={cancelConfirm} title={confirmState.title}
        actions={<>
          <button className="btn-secondary" onClick={cancelConfirm}>Cancelar</button>
          <button className="btn-chanatos" onClick={acceptConfirm}>Aceptar</button>
        </>}>
        <p>{confirmState.message}</p>
      </Modal>
    </>
  );

  if (embedded) return content;

  return (
    <div className="caja-container">
      <CajaHeader title="GASTOS GENERALES" backTo="/mas" />
      {content}
    </div>
  );
}
