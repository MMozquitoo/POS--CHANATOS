import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader';
import EmptyState from '../../components/EmptyState';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { toast } from '../../components/ui/Toast';
import { formatPriceCOP } from '../../utils/currency.js';
import '../../components/orders/orders.css';
import '../../components/ui/ui.css';

// RAPPI — Administración (2026-10-25). Pedidos cerrados con el método Rappi:
// la venta YA contó el día del pedido (Reportes); la plata la deposita Rappi
// después, normalmente semanal. Acá se cuadra ese depósito: se seleccionan los
// pedidos que cubrió y se marcan "depositados" (settled_at en la fila RAPPI).
// A diferencia de Contratos NO crea pagos nuevos (duplicaría la venta) y NO
// exige caja abierta (la plata llega al banco, no a ninguna caja).

// "2026-10-25 14:30:00" (hora Bogotá) → "25/10 2:30 p. m."
function fechaCorta(ts) {
  if (!ts) return '';
  const [d, h] = String(ts).split(' ');
  const [, m, dd] = d.split('-');
  let hora = '';
  if (h) {
    let hh = parseInt(h.slice(0, 2), 10);
    const min = h.slice(3, 5);
    const ampm = hh >= 12 ? 'p. m.' : 'a. m.';
    hh = hh % 12 || 12;
    hora = ` ${hh}:${min} ${ampm}`;
  }
  return `${Number(dd)}/${Number(m)}${hora}`;
}

function nombreDe(r) {
  return r.customer_name || (r.daily_no ? `Pedido ${r.daily_no}` : r.code || 'Pedido de Rappi');
}

const MAX_LINES = 4;

function RappiCard({ pago: f, seleccionado, onToggle, busy, onDeshacer }) {
  const depositado = !!f.settled_at;
  const items = f.items || [];
  return (
    <article
      className={`order-card${seleccionado ? ' is-selected' : ''}`}
      style={{ cursor: depositado ? 'default' : 'pointer' }}
      onClick={depositado ? undefined : () => onToggle(f.id)}
      role={depositado ? undefined : 'button'}
      aria-pressed={depositado ? undefined : seleccionado}
    >
      <header className="order-card__head">
        <div className="order-card__who">
          <div className="order-card__who-row">
            <h3 className="order-card__title">{nombreDe(f)}</h3>
          </div>
          <span className="order-card__time">
            {[f.daily_no ? `Orden ${f.daily_no}` : f.code, fechaCorta(f.created_at)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span
          className="pill"
          style={depositado
            ? { background: 'var(--green-tint)', color: 'var(--green-text)' }
            : seleccionado
              ? { background: 'var(--brand)', color: '#fff' }
              : { background: 'var(--brand-tint)', color: 'var(--brand-deep)' }}
        >
          {depositado ? 'Depositado' : seleccionado ? 'Seleccionado' : 'Pendiente'}
        </span>
      </header>

      {items.length > 0 && (
        <ul className="order-card__lines">
          {items.slice(0, MAX_LINES).map((it, i) => (
            <li key={i}>
              <span className="tnum order-card__qty">{it.qty}×</span>
              <span className="order-card__name">{it.name}</span>
              <span className="tnum order-card__price">{formatPriceCOP((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
            </li>
          ))}
          {items.length > MAX_LINES && (
            <li className="order-card__more">y {items.length - MAX_LINES} más</li>
          )}
        </ul>
      )}

      <div className="order-card__totals">
        <span className="order-card__total-label">Total</span>
        <span className="order-card__total tnum">{formatPriceCOP(f.amount)}</span>
      </div>

      {depositado && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
          <span style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)' }}>
            Depositado {fechaCorta(f.settled_at)}
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); onDeshacer(f); }}
            style={{ padding: '0.35rem 0.7rem', fontSize: 'var(--text-13)' }}
          >
            Deshacer
          </button>
        </div>
      )}
    </article>
  );
}

export default function Rappi() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seleccion, setSeleccion] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/payments/rappi');
      setData(res.data);
      // Un pedido que ya no está pendiente sale de la selección
      setSeleccion((prev) => {
        const vivos = new Set((res.data?.pending || []).map((r) => r.id));
        return new Set([...prev].filter((id) => vivos.has(id)));
      });
    } catch (error) {
      console.error('Error cargando pedidos de Rappi:', error);
      await showAlert(error.response?.data?.error || 'Error al cargar los pedidos de Rappi');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { load(); }, [load]);

  const pending = data?.pending || [];
  const settled = data?.settled || [];
  const seleccionados = pending.filter((r) => seleccion.has(r.id));
  const totalSeleccion = seleccionados.reduce((s, r) => s + (r.amount || 0), 0);
  const todosSeleccionados = pending.length > 0 && seleccionados.length === pending.length;

  const toggle = (id) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    setSeleccion(todosSeleccionados ? new Set() : new Set(pending.map((r) => r.id)));
  };

  const marcarDepositados = async () => {
    if (busy || seleccionados.length === 0) return;
    const n = seleccionados.length;
    if (!(await showConfirm(
      `¿Marcar ${n === 1 ? '1 pedido' : `${n} pedidos`} por ${formatPriceCOP(totalSeleccion)} como depositados por Rappi? Es solo para cuadrar el depósito: no crea pagos nuevos ni toca la caja.`
    ))) return;
    setBusy(true);
    try {
      await axios.patch('/payments/rappi/settle', {
        paymentIds: seleccionados.map((r) => r.id),
        settled: true,
      });
      toast(`Depósito de Rappi cuadrado: ${formatPriceCOP(totalSeleccion)}`);
      setSeleccion(new Set());
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo marcar el depósito');
    } finally {
      setBusy(false);
    }
  };

  const deshacer = async (pago) => {
    if (busy) return;
    if (!(await showConfirm(`¿Devolver ${nombreDe(pago)} por ${formatPriceCOP(pago.amount)} a pendiente por depositar?`))) return;
    setBusy(true);
    try {
      await axios.patch('/payments/rappi/settle', { paymentIds: [pago.id], settled: false });
      toast('Pedido devuelto a pendiente');
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo deshacer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="caja-container">
      <CajaHeader title="Rappi" backTo="/mas" />

      <div className="caja-content caja-page" style={{ maxWidth: 760, margin: '0 auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>Cargando…</p>
        ) : (
          <>
            <div className="card" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Pendiente por depositar
                  </div>
                  <div className="tnum" style={{ fontSize: 'var(--text-28, 28px)', fontWeight: 800, color: 'var(--gray-900)' }}>
                    {formatPriceCOP(data?.totalPending || 0)}
                  </div>
                </div>
                <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)' }}>
                  {pending.length === 1 ? '1 pedido' : `${pending.length} pedidos`} · Rappi deposita después (normalmente semanal)
                </div>
              </div>
              {pending.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.8rem' }}>
                  <button type="button" className="btn btn--secondary" disabled={busy} onClick={toggleTodos} style={{ flex: '0 0 auto' }}>
                    {todosSeleccionados ? 'Quitar selección' : 'Seleccionar todos'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy || seleccionados.length === 0}
                    onClick={marcarDepositados}
                    style={{ flex: 1, minWidth: 200 }}
                  >
                    {busy
                      ? 'Guardando…'
                      : seleccionados.length === 0
                        ? 'Toca los pedidos que cubrió el depósito'
                        : `Marcar depositados (${seleccionados.length} · ${formatPriceCOP(totalSeleccion)})`}
                  </button>
                </div>
              )}
            </div>

            {pending.length === 0 ? (
              <EmptyState icon="check" title="Nada pendiente por depositar" description="Cuando un pedido de Rappi quede listo, aparece aquí hasta que llegue el depósito y lo marques." />
            ) : (
              <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '1.4rem' }}>
                {pending.map((f) => (
                  <RappiCard key={f.id} pago={f} seleccionado={seleccion.has(f.id)} onToggle={toggle} busy={busy} onDeshacer={deshacer} />
                ))}
              </div>
            )}

            {settled.length > 0 && (
              <>
                <h3 style={{ fontSize: 'var(--text-15)', color: 'var(--gray-600)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.6rem' }}>
                  Depositados recientes
                </h3>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {settled.map((f) => (
                    <RappiCard key={f.id} pago={f} seleccionado={false} onToggle={toggle} busy={busy} onDeshacer={deshacer} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <ModalHost
        alertApi={{ alertState, showAlert, closeAlert }}
        confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }}
      />
    </div>
  );
}
