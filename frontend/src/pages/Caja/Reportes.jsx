import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Caja.css';
import './Reportes.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import { formatPriceCOP } from '../../utils/currency.js';

// Fecha YYYY-MM-DD en zona Bogotá
function bogotaDate(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
}

const PERIODS = [
  { key: 'hoy', label: 'Hoy', range: () => [bogotaDate(0), bogotaDate(0)] },
  { key: 'ayer', label: 'Ayer', range: () => [bogotaDate(1), bogotaDate(1)] },
  { key: '7d', label: '7 días', range: () => [bogotaDate(6), bogotaDate(0)] },
  { key: '30d', label: '30 días', range: () => [bogotaDate(29), bogotaDate(0)] },
];

const METHOD_LABELS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };

// Fila con barra horizontal (una sola magnitud → un solo tono validado #B8860B)
// money=false para magnitudes que son conteos, no plata
function BarRow({ label, value, max, extra, money = true }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const display = money ? formatPriceCOP(value) : String(value);
  return (
    <div className="rep-bar-row" title={`${label}: ${display}`}>
      <div className="rep-bar-label">{label}</div>
      <div className="rep-bar-track">
        <div className="rep-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="rep-bar-value">
        {display}
        {extra && <span className="rep-bar-extra">{extra}</span>}
      </div>
    </div>
  );
}

export default function Reportes() {
  const [period, setPeriod] = useState('hoy');
  const [data, setData] = useState(null);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from, to] = PERIODS.find(p => p.key === period).range();
      const [repRes, stockRes] = await Promise.all([
        axios.get(`/reports/summary?from=${from}&to=${to}`),
        axios.get('/inventory/low-stock'),
      ]);
      setData(repRes.data);
      setLowStock(stockRes.data || []);
    } catch (error) {
      console.error('Error cargando reporte:', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const maxProduct = Math.max(0, ...(data?.topProducts || []).map(p => p.total));
  const maxMethod = Math.max(0, ...(data?.byMethod || []).map(m => m.total));
  const maxHour = Math.max(0, ...(data?.byHour || []).map(h => h.total));
  const maxOrdersHour = Math.max(0, ...(data?.ordersByHour || []).map(h => h.count));
  const maxDay = Math.max(0, ...(data?.byDay || []).map(d => d.total));

  return (
    <div className="caja-container">
      <CajaHeader title="REPORTES" backTo="/centro" />

      <div className="caja-content caja-page rep-content">
        {/* Periodo */}
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

        {/* Alerta de stock bajo (estado, con icono y texto — nunca solo color) */}
        {lowStock.length > 0 && (
          <div className="rep-low-stock">
            <strong>⚠ Stock bajo ({lowStock.length}):</strong>{' '}
            {lowStock.slice(0, 6).map(i => `${i.ingredient_name} (${i.stock_qty} ${i.unit})`).join(' · ')}
            {lowStock.length > 6 && ` · y ${lowStock.length - 6} más`}
          </div>
        )}

        {loading || !data ? (
          <div className="rep-loading">Cargando reporte…</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="rep-kpis">
              <div className="rep-kpi">
                <div className="rep-kpi-value">{formatPriceCOP(t.sales)}</div>
                <div className="rep-kpi-label">Ventas</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value">{t.orders}</div>
                <div className="rep-kpi-label">Órdenes pagadas</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value">{formatPriceCOP(t.avgTicket)}</div>
                <div className="rep-kpi-label">Ticket promedio</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value">{formatPriceCOP(t.tips)}</div>
                <div className="rep-kpi-label">Propinas</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value">{formatPriceCOP(t.discounts)}</div>
                <div className="rep-kpi-label">Descuentos dados</div>
              </div>
              <div className="rep-kpi">
                <div className="rep-kpi-value">{t.cancelled}</div>
                <div className="rep-kpi-label">Canceladas</div>
              </div>
              {t.prepCount > 0 && (
                <>
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{t.avgPrepMin} min</div>
                    <div className="rep-kpi-label">Preparación promedio</div>
                  </div>
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{t.maxPrepMin} min</div>
                    <div className="rep-kpi-label">Preparación más lenta</div>
                  </div>
                </>
              )}
            </div>

            {/* Top productos */}
            <section className="rep-section">
              <h3>Top productos</h3>
              {data.topProducts.length === 0 ? (
                <p className="rep-empty">Sin ventas en este periodo</p>
              ) : (
                data.topProducts.map(p => (
                  <BarRow key={p.name} label={p.name} value={p.total} max={maxProduct} extra={`${p.qty} und`} />
                ))
              )}
            </section>

            {/* Por método de pago */}
            <section className="rep-section">
              <h3>Ventas por método de pago</h3>
              {data.byMethod.length === 0 ? (
                <p className="rep-empty">Sin pagos en este periodo</p>
              ) : (
                data.byMethod.map(m => (
                  <BarRow key={m.method} label={METHOD_LABELS[m.method] || m.method} value={m.total} max={maxMethod} extra={`${m.count} pagos`} />
                ))
              )}
            </section>

            {/* Por día (solo si el periodo cubre varios días) */}
            {data.byDay.length > 1 && (
              <section className="rep-section">
                <h3>Ventas por día</h3>
                {data.byDay.map(d => (
                  <BarRow key={d.day} label={d.day.slice(5)} value={d.total} max={maxDay} extra={`${d.count} pagos`} />
                ))}
              </section>
            )}

            {/* Horas pico de cobro */}
            <section className="rep-section">
              <h3>Ventas por hora <span className="rep-section-hint">(cuándo se cobra)</span></h3>
              {data.byHour.length === 0 ? (
                <p className="rep-empty">Sin pagos en este periodo</p>
              ) : (
                data.byHour.map(h => (
                  <BarRow key={h.hour} label={`${h.hour}:00`} value={h.total} max={maxHour} extra={`${h.count} pagos`} />
                ))
              )}
            </section>

            {/* Horas pico de llegada */}
            <section className="rep-section">
              <h3>Pedidos por hora <span className="rep-section-hint">(cuándo llega la gente)</span></h3>
              {(data.ordersByHour || []).length === 0 ? (
                <p className="rep-empty">Sin pedidos en este periodo</p>
              ) : (
                data.ordersByHour.map(h => (
                  <BarRow key={h.hour} label={`${h.hour}:00`} value={h.count} max={maxOrdersHour} money={false} extra="pedidos" />
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
