import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Caja.css';
import './Reportes.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import { formatPriceCOP } from '../../utils/currency.js';
import { serviceLabel } from '../../utils/statusLabels.js';
import { expenseCategoryLabel } from '../../utils/expenseCategories.js';

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
  { key: 'rango', label: 'Rango' },
];

const METHOD_LABELS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia', RAPPI: 'Rappi' };

// Fila con barra horizontal (una sola magnitud → un solo tono validado #B8860B)
// money=false para magnitudes que son conteos, no plata; display sobreescribe
// el texto mostrado (ej. "5.4 kg") sin afectar el % de la barra, que sigue
// usando value
function BarRow({ label, value, max, extra, money = true, display: displayOverride }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const display = displayOverride ?? (money ? formatPriceCOP(value) : String(value));
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
  const [customFrom, setCustomFrom] = useState(bogotaDate(0));
  const [customTo, setCustomTo] = useState(bogotaDate(0));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const currentRange = useCallback(() => {
    if (period === 'rango') {
      if (!customFrom || !customTo) return null; // fecha a medio digitar
      return customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    }
    return PERIODS.find(p => p.key === period).range();
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    const range = currentRange();
    if (!range) return;
    const [from, to] = range;
    setLoading(true);
    try {
      const repRes = await axios.get(`/reports/summary?from=${from}&to=${to}`);
      setData(repRes.data);
    } catch (error) {
      console.error('Error cargando reporte:', error);
    } finally {
      setLoading(false);
    }
  }, [currentRange]);

  const handleDownloadExcel = async () => {
    const range = currentRange();
    if (!range) return;
    const [from, to] = range;
    setDownloading(true);
    setDownloadError('');
    try {
      const res = await axios.get(`/reports/summary/excel?from=${from}&to=${to}`, { responseType: 'blob' });
      const nombre = `Reporte-Ventas-${from}-a-${to}.xlsx`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (error) {
      console.error('Error descargando Excel:', error);
      setDownloadError('No se pudo descargar el Excel. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  const t = data?.totals;
  const maxProduct = Math.max(0, ...(data?.topProducts || []).map(p => p.total));
  const maxMethod = Math.max(0, ...(data?.byMethod || []).map(m => m.total));
  const maxService = Math.max(0, ...(data?.byService || []).map(s => s.total));
  const maxHour = Math.max(0, ...(data?.byHour || []).map(h => h.total));
  const maxOrdersHour = Math.max(0, ...(data?.ordersByHour || []).map(h => h.count));
  const maxDay = Math.max(0, ...(data?.byDay || []).map(d => d.total));

  return (
    <div className="caja-container">
      <CajaHeader title="Reportes" backTo="/centro" />

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

        {/* Descargar Excel del periodo elegido arriba */}
        <div style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleDownloadExcel}
            disabled={downloading || loading}
          >
            {downloading ? 'Generando…' : 'Descargar Excel'}
          </button>
          {downloadError && (
            <div style={{ color: 'var(--red-text, #dc3545)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
              {downloadError}
            </div>
          )}
        </div>

        {/* Fechas personalizadas (solo con Rango) */}
        {period === 'rango' && (
          <div className="rep-range">
            <label className="rep-range-field">
              <span>Desde</span>
              <input
                type="date"
                value={customFrom}
                max={bogotaDate(0)}
                onChange={e => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="rep-range-field">
              <span>Hasta</span>
              <input
                type="date"
                value={customTo}
                max={bogotaDate(0)}
                onChange={e => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}

        {/* "Stock bajo" se quitó de acá y del Resumen (dueño, 2026-10-25): sin
            compras registradas en el POS mostraba ceros y negativos. El
            inventario va a vivir en chanatos-plataforma-dev; el dato sigue en
            Menú → Ingredientes. */}

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
              {(t.rappi || 0) > 0 && (
                <div className="rep-kpi">
                  <div className="rep-kpi-value">{formatPriceCOP(t.rappi)}</div>
                  <div className="rep-kpi-label">De eso, Rappi (lo paga Rappi después)</div>
                </div>
              )}
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
              <div className="rep-kpi">
                <div className="rep-kpi-value">{t.burgersSold}</div>
                <div className="rep-kpi-label">Hamburguesas vendidas</div>
              </div>
              {/* "0 min" confundía (parecía un dato roto): menos de un minuto
                  se dice "< 1 min". La cuenta del servidor está verificada
                  (creada → lista, redondeada al minuto). */}
              {t.prepCount > 0 && (
                <>
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{t.avgPrepMin > 0 ? `${t.avgPrepMin} min` : '< 1 min'}</div>
                    <div className="rep-kpi-label">Preparación promedio</div>
                  </div>
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{t.maxPrepMin > 0 ? `${t.maxPrepMin} min` : '< 1 min'}</div>
                    <div className="rep-kpi-label">Preparación más lenta</div>
                  </div>
                </>
              )}
            </div>

            {/* Productos vendidos (el backend ya no corta en 10 — se muestran todos) */}
            <section className="rep-section">
              <h3>Productos vendidos</h3>
              {data.topProducts.length === 0 ? (
                <p className="rep-empty">Sin ventas en este periodo</p>
              ) : (
                data.topProducts.map(p => (
                  <BarRow key={p.name} label={p.name} value={p.total} max={maxProduct} extra={`${p.qty} und`} />
                ))
              )}
            </section>

            {/* "Consumo de insumos (según receta)" se quitó (dueño, 2026-10-25):
                el inventario va a vivir en chanatos-plataforma-dev. El servidor
                sigue calculando data.ingredientConsumption. */}

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

            {/* Por canal (mesas / ventanilla / domicilios) */}
            <section className="rep-section">
              <h3>Ventas por canal</h3>
              {(data.byService || []).length === 0 ? (
                <p className="rep-empty">Sin pagos en este periodo</p>
              ) : (
                data.byService.map(s => (
                  <BarRow key={s.service} label={serviceLabel(s.service)} value={s.total} max={maxService} extra={`${s.count} pagos`} />
                ))
              )}
            </section>

            {/* Rappi (2026-10-25, dueño): cuadre del depósito — Rappi recauda al
                cliente y transfiere después (semanal). "7 días" o "Rango" sobre
                la semana = lo que Rappi debe consignar. Independiente de la caja:
                esa plata nunca entra al arqueo. */}
            {data.rappi && (
              <section className="rep-section rep-rappi">
                <h3>Rappi <span className="rep-section-hint">(recauda y transfiere después)</span></h3>
                {data.rappi.count === 0 && (
                  <p className="rep-empty">Sin pedidos de Rappi en este periodo. Cuando los haya, aquí se cuadra el depósito: elige «7 días» o «Rango» sobre la semana que Rappi consigna.</p>
                )}
                {data.rappi.count > 0 && (
                <div className="rep-kpis">
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{formatPriceCOP(data.rappi.total)}</div>
                    <div className="rep-kpi-label">Rappi debe transferir por este periodo</div>
                  </div>
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{data.rappi.count}</div>
                    <div className="rep-kpi-label">Pedidos de Rappi</div>
                  </div>
                  <div className="rep-kpi">
                    <div className="rep-kpi-value">{formatPriceCOP(Math.round(data.rappi.total / data.rappi.count))}</div>
                    <div className="rep-kpi-label">Promedio por pedido</div>
                  </div>
                </div>
                )}
                {data.rappi.byDay.length > 1 && data.rappi.byDay.map(d => (
                  <BarRow
                    key={d.day}
                    label={d.day}
                    value={d.total}
                    max={Math.max(0, ...data.rappi.byDay.map(x => x.total))}
                    extra={`${d.count} ${d.count === 1 ? 'pedido' : 'pedidos'}`}
                  />
                ))}
                {data.rappi.count > 0 && (
                <p className="rep-rappi-note">
                  Al cuadrar el depósito, recuerda que Rappi descuenta su comisión: acá está lo vendido, no lo neto.
                </p>
                )}
              </section>
            )}

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

            {/* "Contaduría" (ventas − compras − gastos) oculta: sin compras ni
                gastos cargados en el POS solo repetía las ventas; la contabilidad
                va a vivir en chanatos-plataforma-dev (dueño, 2026-10-25).
                GET /reports/pnl sigue en el servidor. */}
          </>
        )}
      </div>
    </div>
  );
}
