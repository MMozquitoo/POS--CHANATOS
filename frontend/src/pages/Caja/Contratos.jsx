import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader';
import EmptyState from '../../components/EmptyState';
import ModalHost from '../../components/ModalHost';
import Icon from '../../components/ui/Icon';
import { useAlert, useConfirm } from '../../hooks/useModal';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import { toast } from '../../components/ui/Toast';
import SkeletonCards from '../../components/ui/Skeleton';
import { formatPriceCOP } from '../../utils/currency.js';
import { paymentMethodLabel } from '../../utils/statusLabels.js';
import '../../components/orders/orders.css';
import '../../components/ui/ui.css';

// CONTRATOS — Administración (2026-10-25). Pedidos cerrados con el método
// "Contrato" (fiados y pedidos grandes, ej. 200 sándwiches, que pagan
// después). "Hoy comió gratis": el día del contrato NO cuenta como venta.
// Al marcar "Ya pagó" se registra un pago REAL (efectivo/transferencia) en la
// caja ABIERTA de ese momento — por eso acá SÍ se exige caja abierta: esa
// plata entra al arqueo y a Reportes del día que pagó. Tarjetas con el mismo
// estilo de Órdenes (orders.css), con los productos del pedido.

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

function lugarDe(r) {
  const n = Number(r.table_number);
  if (n === 9 || r.service === 'VENTANILLA') return 'Ventanilla';
  if (n === 10 || r.service === 'DOMICILIO') return 'Domicilio';
  return n ? `Mesa ${n}` : '';
}

function nombreDe(r) {
  return r.debtor_name || r.customer_name || 'Sin nombre';
}

const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA'];
const MAX_LINES = 4;

function ContratoCard({ contrato: f, busy, pagando, setPagando, onPagar, onReabrir, cajaAbierta }) {
  const pagado = !!f.settled_at;
  const items = f.items || [];
  return (
    <article className="order-card" style={{ cursor: 'default' }}>
      <header className="order-card__head">
        <div className="order-card__who">
          <div className="order-card__who-row">
            <h3 className="order-card__title">{nombreDe(f)}</h3>
          </div>
          <span className="order-card__time">
            {[lugarDe(f), f.daily_no ? `Orden ${f.daily_no}` : f.code, fechaCorta(f.created_at)].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span
          className="pill"
          style={pagado
            ? { background: 'var(--green-tint)', color: 'var(--green-text)' }
            : { background: 'var(--brand-tint)', color: 'var(--brand-deep)' }}
        >
          {pagado ? 'Pagado' : 'Pendiente'}
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

      {pagado ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem' }}>
          <span style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)' }}>
            Pagó {fechaCorta(f.settled_at)}{f.settled_method ? ` en ${paymentMethodLabel(f.settled_method).toLowerCase()}` : ''}
          </span>
          <button type="button" className="btn btn--secondary" disabled={!!busy} onClick={() => onReabrir(f)} style={{ padding: '0.35rem 0.7rem', fontSize: 'var(--text-13)' }}>
            Deshacer
          </button>
        </div>
      ) : pagando === f.id ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
          {METODOS_PAGO.map((m) => (
            <button key={m} type="button" className="btn btn--primary" disabled={!!busy} onClick={() => onPagar(f, m)} style={{ flex: 1, minWidth: 130 }}>
              {busy === f.id ? 'Guardando…' : `Pagó en ${paymentMethodLabel(m).toLowerCase()}`}
            </button>
          ))}
          <button type="button" className="btn btn--secondary" disabled={!!busy} onClick={() => setPagando(null)} style={{ flex: '0 0 auto' }}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!!busy || cajaAbierta === false}
          onClick={() => setPagando(f.id)}
          style={{ marginTop: '0.6rem' }}
        >
          {cajaAbierta === false ? 'Abre la caja para recibir el pago' : 'Ya pagó'}
        </button>
      )}
    </article>
  );
}

export default function Contratos() {
  const navigate = useNavigate();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const cajaAbierta = useCajaAbierta();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  // Al tocar "Ya pagó" se despliegan los métodos para anotar CÓMO pagó
  const [pagando, setPagando] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/payments/contratos');
      setData(res.data);
    } catch (error) {
      console.error('Error cargando contratos:', error);
      await showAlert(error.response?.data?.error || 'Error al cargar los contratos');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { load(); }, [load]);

  const marcarPagado = async (contrato, method) => {
    if (busy) return;
    if (!(await showConfirm(
      `¿Registrar el pago de ${nombreDe(contrato)} por ${formatPriceCOP(contrato.amount)} en ${paymentMethodLabel(method).toLowerCase()}? Entra a la caja y a las ventas de HOY.`
    ))) return;
    setBusy(contrato.id);
    try {
      await axios.patch(`/payments/contratos/${contrato.id}`, { settled: true, method });
      toast(`Pago de ${nombreDe(contrato)} registrado en la caja de hoy`);
      setPagando(null);
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo registrar el pago');
    } finally {
      setBusy(null);
    }
  };

  const reabrir = async (contrato) => {
    if (busy) return;
    if (!(await showConfirm(`¿Deshacer el pago de ${nombreDe(contrato)} por ${formatPriceCOP(contrato.amount)}? Se anula el pago registrado y la deuda vuelve a pendiente.`))) return;
    setBusy(contrato.id);
    try {
      await axios.patch(`/payments/contratos/${contrato.id}`, { settled: false });
      toast('Contrato reabierto');
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo deshacer');
    } finally {
      setBusy(null);
    }
  };

  const pending = data?.pending || [];
  const settled = data?.settled || [];

  return (
    <div className="caja-container">
      <CajaHeader title="Contratos" backTo="/mas" />

      <div className="caja-content caja-page" style={{ maxWidth: 760, margin: '0 auto' }}>
        {loading ? (
          <SkeletonCards count={3} />
        ) : (
          <>
            <div className="card" style={{ padding: '1rem 1.2rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem' }}>
              <div>
                <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pendiente por cobrar
                </div>
                <div className="tnum" style={{ fontSize: 'var(--text-28, 28px)', fontWeight: 800, color: 'var(--gray-900)' }}>
                  {formatPriceCOP(data?.totalPending || 0)}
                </div>
              </div>
              <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)' }}>
                {pending.length === 1 ? '1 contrato' : `${pending.length} contratos`} · el pago entra a la caja del día que paguen
              </div>
            </div>

            {cajaAbierta === false && pending.length > 0 && (
              <div className="caja-cerrada" role="status" style={{ marginBottom: '1rem' }}>
                <span className="caja-cerrada__icon" aria-hidden="true">
                  <Icon name="caja" size={22} strokeWidth={2.2} />
                </span>
                <div className="caja-cerrada__text">
                  <strong>La caja está cerrada</strong>
                  <span>Para recibir el pago de un contrato abre la caja (puede ser con $ 0): esa plata entra al arqueo del día.</span>
                </div>
                <button type="button" className="btn btn--dark" onClick={() => navigate('/centro', { state: { abrirCaja: true } })}>
                  Abrir caja
                </button>
              </div>
            )}

            {pending.length === 0 ? (
              <EmptyState icon="check" title="Nada pendiente por cobrar" description="Cuando dejes un pedido como contrato (método Contrato al cobrar), aparece aquí hasta que paguen." />
            ) : (
              <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '1.4rem' }}>
                {pending.map((f) => (
                  <ContratoCard key={f.id} contrato={f} busy={busy} pagando={pagando} setPagando={setPagando} onPagar={marcarPagado} onReabrir={reabrir} cajaAbierta={cajaAbierta} />
                ))}
              </div>
            )}

            {settled.length > 0 && (
              <>
                <h3 style={{ fontSize: 'var(--text-15)', color: 'var(--gray-600)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.6rem' }}>
                  Pagados recientes
                </h3>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  {settled.map((f) => (
                    <ContratoCard key={f.id} contrato={f} busy={busy} pagando={pagando} setPagando={setPagando} onPagar={marcarPagado} onReabrir={reabrir} cajaAbierta={cajaAbierta} />
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
