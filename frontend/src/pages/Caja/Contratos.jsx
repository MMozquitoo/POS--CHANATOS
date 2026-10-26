import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader';
import EmptyState from '../../components/EmptyState';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { toast } from '../../components/ui/Toast';
import { formatPriceCOP } from '../../utils/currency.js';
import { paymentMethodLabel } from '../../utils/statusLabels.js';

// CONTRATOS — Administración (2026-10-25). Pedidos cerrados con el método
// "Contrato" (fiados y pedidos grandes, ej. 200 sándwiches, que pagan
// después). Marcar "Ya pagó" funciona con la caja abierta o cerrada A
// PROPÓSITO: la venta ya contó el día que se hizo (igual que Rappi) y saldar
// solo anota cuándo y cómo pagó — no crea un pago nuevo ni toca ningún arqueo.

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

export default function Contratos() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
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
    setBusy(contrato.id);
    try {
      await axios.patch(`/payments/contratos/${contrato.id}`, { settled: true, method });
      toast(`Contrato de ${nombreDe(contrato)} marcado como pagado`);
      setPagando(null);
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo marcar como pagado');
    } finally {
      setBusy(null);
    }
  };

  const reabrir = async (contrato) => {
    if (busy) return;
    if (!(await showConfirm(`¿Volver a dejar pendiente el contrato de ${nombreDe(contrato)} por ${formatPriceCOP(contrato.amount)}?`))) return;
    setBusy(contrato.id);
    try {
      await axios.patch(`/payments/contratos/${contrato.id}`, { settled: false });
      toast('Contrato reabierto');
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo reabrir');
    } finally {
      setBusy(null);
    }
  };

  const pending = data?.pending || [];
  const settled = data?.settled || [];

  return (
    <div className="caja-container">
      <CajaHeader title="Contratos" backTo="/mas" />

      <div className="caja-content caja-page" style={{ maxWidth: 720, margin: '0 auto' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--gray-600)' }}>Cargando…</p>
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
                {pending.length === 1 ? '1 contrato' : `${pending.length} contratos`} · se marca pagado con la caja abierta o cerrada
              </div>
            </div>

            {pending.length === 0 ? (
              <EmptyState icon="check" title="Nada pendiente por cobrar" description="Cuando dejes un pedido como contrato (método Contrato al cobrar), aparece aquí hasta que paguen." />
            ) : (
              <div className="list-group" style={{ marginBottom: '1.4rem' }}>
                {pending.map((f) => (
                  <div key={f.id} className="list-row" style={{ display: 'block', padding: '0.8rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.6rem' }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-17)', color: 'var(--gray-900)' }}>{nombreDe(f)}</div>
                      <div className="tnum" style={{ fontWeight: 800, fontSize: 'var(--text-17)' }}>{formatPriceCOP(f.amount)}</div>
                    </div>
                    <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)', margin: '2px 0 10px' }}>
                      {[lugarDe(f), f.daily_no ? `Orden ${f.daily_no}` : f.code, fechaCorta(f.created_at)].filter(Boolean).join(' · ')}
                    </div>
                    {pagando === f.id ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {METODOS_PAGO.map((m) => (
                          <button key={m} type="button" className="btn btn--primary" disabled={!!busy} onClick={() => marcarPagado(f, m)} style={{ flex: 1, minWidth: 120 }}>
                            {busy === f.id ? 'Guardando…' : `Pagó en ${paymentMethodLabel(m).toLowerCase()}`}
                          </button>
                        ))}
                        <button type="button" className="btn btn--secondary" disabled={!!busy} onClick={() => setPagando(null)} style={{ flex: '0 0 auto' }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="btn btn--primary btn--block" disabled={!!busy} onClick={() => setPagando(f.id)}>
                        Ya pagó
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {settled.length > 0 && (
              <>
                <h3 style={{ fontSize: 'var(--text-15)', color: 'var(--gray-600)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 0.6rem' }}>
                  Pagados recientes
                </h3>
                <div className="list-group">
                  {settled.map((f) => (
                    <div key={f.id} className="list-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--gray-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombreDe(f)}</div>
                        <div style={{ fontSize: 'var(--text-12, 12px)', color: 'var(--gray-600)' }}>
                          {[`Contrato ${fechaCorta(f.created_at)}`, `pagó ${fechaCorta(f.settled_at)}`, f.settled_method ? paymentMethodLabel(f.settled_method).toLowerCase() : null].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '0 0 auto' }}>
                        <span className="tnum" style={{ fontWeight: 700 }}>{formatPriceCOP(f.amount)}</span>
                        <button type="button" className="btn btn--secondary" disabled={!!busy} onClick={() => reabrir(f)} style={{ padding: '0.35rem 0.7rem', fontSize: 'var(--text-13)' }}>
                          Deshacer
                        </button>
                      </div>
                    </div>
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
