import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaDateTime } from '../../utils/timezone.js';
import OpenCashModal from '../../components/caja/OpenCashModal.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import AnimatedNumber from '../../components/AnimatedNumber.jsx';
import PageHeader from '../../components/ui/PageHeader';
import Icon from '../../components/ui/Icon';
import { paymentMethodLabel } from '../../utils/statusLabels';
import { clockLabel } from '../../utils/orderView';
import '../../components/ui/ui.css';
import './DashboardCaja.css';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function DashboardCaja() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const { socket, logout } = useAuth();
  const { isOnline } = useConnection();
  
  // PASO 14.4: Recuperación automática al reconectar
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: true,
    onReconnect: async () => {
      await loadSession();
    }
  });
  
  // Estados para sesión de caja
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  // "Abrir caja" desde el aviso de Mesas/Órdenes llega con state.abrirCaja
  const location = useLocation();
  useEffect(() => {
    if (location.state?.abrirCaja) setShowOpenModal(true);
  }, [location.state]);
  const [openingCash, setOpeningCash] = useState(false);
  // Bloques del rediseño 2026-10 (ventas por hora, más vendidos, actividad):
  // GET /cash/session/:id/activity, con el mismo criterio del Total cobrado
  const [activity, setActivity] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);

  // Sesión actual en un ref: los manejadores del socket se registran una sola
  // vez y con el estado `session` quedaban viendo la sesión del primer render
  // (null) — un pago nuevo no refrescaba el Resumen hasta recargar.
  const sessionIdRef = useRef(null);

  useEffect(() => {
    loadSession();

    if (socket) {
      // Varios eventos seguidos (pago dividido = varios payment:created) → una
      // sola recarga. Lo que ya está en pantalla se queda mientras tanto.
      // Un cobro emite payment:created y enseguida order:status-changed: cada
      // tipo agrupa sus eventos por separado (con un solo temporizador, el
      // segundo cancelaba la recarga de las cifras y el total no cambiaba).
      let pagoTimer;
      let ordenTimer;
      const onPago = () => {
        clearTimeout(pagoTimer);
        pagoTimer = setTimeout(() => {
          loadSummary();
          loadActivity();
        }, 150);
      };
      const onOrden = () => {
        clearTimeout(ordenTimer);
        ordenTimer = setTimeout(() => loadActivity(), 250);
      };
      const onAbierta = () => loadSession();
      const onCerrada = () => {
        loadSession();
        setSummary(null);
      };
      socket.on('payment:created', onPago);
      socket.on('payment:voided', onPago);
      socket.on('order:new', onOrden);
      socket.on('order:status-changed', onOrden);
      socket.on('cash:session-opened', onAbierta);
      socket.on('cash:session-closed', onCerrada);

      // Quitar SOLO estos manejadores: socket.off('evento') sin función
      // borraba también los de otras pantallas montadas
      return () => {
        socket.off('payment:created', onPago);
        clearTimeout(pagoTimer);
        clearTimeout(ordenTimer);
        socket.off('payment:voided', onPago);
        socket.off('order:new', onOrden);
        socket.off('order:status-changed', onOrden);
        socket.off('cash:session-opened', onAbierta);
        socket.off('cash:session-closed', onCerrada);
      };
    }
  }, [socket]);

  const loadSession = async () => {
    try {
      const res = await axios.get('/cash/session/active');
      if (res.data.active && res.data.session) {
        sessionIdRef.current = res.data.session.id;
        setSession(res.data.session);
        await Promise.all([loadSummary(res.data.session.id), loadActivity(res.data.session.id)]);
      } else {
        sessionIdRef.current = null;
        setSession(null);
        setSummary(null);
        setActivity(null);
      }
    } catch (error) {
      console.error('Error cargando sesión:', error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (sessionId = sessionIdRef.current) => {
    if (!sessionId) return;

    try {
      const res = await axios.get(`/cash/session/${sessionId}/summary`);
      setSummary(res.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    }
  };

  const loadActivity = async (sessionId = sessionIdRef.current) => {
    if (!sessionId) return;
    try {
      const res = await axios.get(`/cash/session/${sessionId}/activity`);
      setActivity(res.data);
    } catch (error) {
      console.error('Error cargando actividad del turno:', error);
    }
  };

  // FASE 17.3: Función para abrir caja desde modal
  // FASE 17.7: Hardening de errores con mensajes específicos
  const handleOpenCash = async (initialCash) => {
    setOpeningCash(true);
    try {
      await axios.post('/cash/open', { initialCash });
      // FASE 17.8: Guardar monto en localStorage para próxima vez
      localStorage.setItem('last_initial_cash', initialCash.toString());
      await loadSession();
      setShowOpenModal(false);
      showAlert('Caja abierta correctamente');
      // Opcional: redirigir a centro-total
      // navigate('/centro-total');
    } catch (error) {
      console.error('Error abriendo caja:', error);
      
      // FASE 17.7: Mensajes específicos según tipo de error
      let errorMessage = 'Error al abrir caja';
      
      if (!error.response) {
        // Sin respuesta = offline o timeout
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          errorMessage = 'Timeout: El servidor no responde. Intenta de nuevo.';
        } else {
          errorMessage = 'Sin conexión. Verifica tu red e intenta de nuevo.';
        }
      } else if (error.response.status === 400) {
        if (error.response.data?.error?.includes('Ya existe')) {
          errorMessage = 'Ya hay una sesión de caja abierta. Recargando...';
          await loadSession();
        } else if (error.response.data?.error?.includes('monto') || error.response.data?.error?.includes('inicial')) {
          errorMessage = 'Monto inválido. Ingresa un número >= 0.';
        } else {
          errorMessage = error.response.data?.error || 'Datos inválidos.';
        }
      } else if (error.response.status === 500) {
        errorMessage = 'Error del servidor. Intenta de nuevo o contacta soporte.';
      } else {
        errorMessage = error.response.data?.error || 'Error al abrir caja';
      }
      
      showAlert(errorMessage);
      // FASE 17.7: Mantener modal abierto si falla (para que no pierda el valor)
      // No cerramos el modal aquí, solo mostramos el error
    } finally {
      setOpeningCash(false);
    }
  };

  if (loading) {
    return (
      <div className="workspace resumen-page">
        <div className="workspace__main">
          <PageHeader title="Resumen del turno" subtitle="Cargando…" />
          <div className="kpi-row" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="kpi kpi--skeleton" />)}
          </div>
        </div>
      </div>
    );
  }

  // Calcular valores para el bloque informativo (mismo cálculo de siempre)
  const initialCash = session?.initial_cash || 0;
  const totalSales = summary?.theoreticalSales || 0;
  const pendingSales = summary?.theoreticalSalesPending || 0;
  const totalCash = summary?.byMethod?.find(m => m.method === 'EFECTIVO')?.total || 0;
  const totalCard = summary?.byMethod?.find(m => m.method === 'TARJETA')?.total || 0;
  const totalTransfer = summary?.byMethod?.find(m => m.method === 'TRANSFERENCIA')?.total || 0;
  // Rappi paga después: se muestra aparte, nunca dentro de "Total cobrado"
  const totalRappi = summary?.rappi?.total || summary?.byMethod?.find(m => m.method === 'RAPPI')?.total || 0;
  const expectedCash = initialCash + totalCash;
  const diffCash = session?.closing_cash !== null && session?.closing_cash !== undefined 
    ? session.closing_cash - expectedCash 
    : null;

  // Ventas por hora: las últimas 12 horas con cobros de este turno
  const hours = (activity?.byHour || []).slice(-12);
  const multiDay = new Set(hours.map((h) => h.hour_key.slice(0, 10))).size > 1;
  const maxHour = Math.max(1, ...hours.map((h) => h.total));
  const peakKey = hours.reduce((best, h) => (!best || h.total > best.total ? h : best), null)?.hour_key;
  const focusKey = selectedHour && hours.some((h) => h.hour_key === selectedHour) ? selectedHour : peakKey;
  const hourLabel = (h) => {
    const label = `${Number(h.hour)}h`;
    if (!multiDay) return label;
    const [, m, d] = h.hour_key.slice(0, 10).split('-');
    return `${Number(d)}/${Number(m)} ${label}`;
  };
  const top = activity?.topProducts || [];
  const maxTop = Math.max(1, ...top.map((t) => t.qty));
  const recent = activity?.recent || [];

  const lugar = (e) => {
    const n = Number(e.table_number);
    if (n === 9 || e.service === 'VENTANILLA') return 'Ventanilla';
    if (n === 10 || e.service === 'DOMICILIO') return e.delivery_platform === 'RAPPI' ? 'Domicilio Rappi' : 'Domicilio';
    return n ? `Mesa ${n}` : '';
  };
  const EVENT = {
    PAGO: { icon: 'cobrar', tone: 'pago', title: (e) => (e.method === 'RAPPI' ? 'Rappi registrado' : 'Pago recibido') },
    ANULACION: { icon: 'anular', tone: 'anulado', title: () => 'Pago anulado' },
    ORDEN_NUEVA: { icon: 'ordenes', tone: 'nueva', title: () => 'Orden nueva' },
    ORDEN_LISTA: { icon: 'cocina', tone: 'lista', title: () => 'Orden lista' },
  };

  return (
    <div className="workspace resumen-page">
      <div className="workspace__main">
        <PageHeader
          title="Resumen del turno"
          subtitle={
            session ? (
              <>
                <span className="resumen-status"><span className="live-dot" aria-hidden="true" />Caja abierta desde {formatBogotaDateTime(session.opened_at)}</span>
                <span className="tnum">Base {formatPriceCOP(initialCash)}</span>
                {isOnline && isRefreshingOnReconnect && <span className="sub-muted">Actualizando…</span>}
              </>
            ) : (
              <span className="resumen-status"><span className="live-dot live-dot--off" aria-hidden="true" />Caja cerrada</span>
            )
          }
          actions={
            session && (
              <button type="button" className="btn btn--dark resumen-cierre" onClick={() => navigate('/cierre')}>
                <Icon name="caja" size={18} /> Cierre de caja
              </button>
            )
          }
        />

        {/* "Stock bajo" ya no va en el Resumen (dueño, 2026-10-25): nadie registra
            compras en el POS, así que mostraba ceros y negativos sin sentido. El
            inventario va a vivir en la otra plataforma (chanatos-plataforma-dev);
            el dato sigue en Menú → Ingredientes y en GET /inventory/low-stock. */}

        {session ? (
          <>
            {/* Cifras del turno: mismos números de siempre. "Total cobrado" es
                el protagonista (lo que debería haber en caja); teóricas =
                lo vendido en mesas/órdenes (decisión del negocio). */}
            <section className="kpi-row" aria-label="Cifras del turno">
              <div className="kpi kpi--hero">
                <span className="kpi-blob" aria-hidden="true" />
                <span className="kpi-label">Total cobrado</span>
                <AnimatedNumber value={totalCash + totalCard + totalTransfer} className="kpi-value" />
                <span className="kpi-hint">Efectivo, transferencias{totalCard > 0 ? ' y tarjeta' : ''}</span>
              </div>
              <div className="kpi kpi--brand">
                <span className="kpi-label">Ventas teóricas</span>
                <AnimatedNumber value={totalSales} className="kpi-value" />
                <span className="kpi-hint">
                  {pendingSales > 0 ? `Incluye ${formatPriceCOP(pendingSales)} por cobrar` : 'Todo lo vendido está cobrado'}
                </span>
              </div>
              <div className="kpi">
                <span className="kpi-label"><Icon name="caja" size={16} /> Efectivo</span>
                <AnimatedNumber value={totalCash} className="kpi-value" />
                <span className="kpi-hint">{summary?.byMethod?.find(m => m.method === 'EFECTIVO')?.count || 0} pagos</span>
              </div>
              <div className="kpi">
                <span className="kpi-label"><Icon name="arrowUpRight" size={16} /> Transferencias</span>
                <AnimatedNumber value={totalTransfer} className="kpi-value" />
                <span className="kpi-hint">{summary?.byMethod?.find(m => m.method === 'TRANSFERENCIA')?.count || 0} pagos</span>
              </div>
            </section>

            {(totalRappi > 0 || totalCard > 0 || diffCash !== null) && (
              <section className="kpi-extra" aria-label="Aparte del total">
                {totalRappi > 0 && (
                  <div className="kpi-chip kpi-chip--rappi">
                    <span>Rappi · paga después</span>
                    <strong className="tnum">{formatPriceCOP(totalRappi)}</strong>
                    <small>No entra en el total cobrado</small>
                  </div>
                )}
                {totalCard > 0 && (
                  <div className="kpi-chip">
                    <span>Tarjeta</span>
                    <strong className="tnum">{formatPriceCOP(totalCard)}</strong>
                  </div>
                )}
                {diffCash !== null && (
                  <div className={`kpi-chip ${diffCash === 0 ? 'kpi-chip--ok' : diffCash > 0 ? 'kpi-chip--warn' : 'kpi-chip--bad'}`}>
                    <span>Diferencia de caja</span>
                    <strong className="tnum">{formatPriceCOP(diffCash)}</strong>
                  </div>
                )}
              </section>
            )}

            <section className="resumen-grid">
              <div className="surface block block--chart">
                <header className="block-head">
                  <div>
                    <h2>Ventas por hora</h2>
                    <p>Cobrado en este turno, sin Rappi</p>
                  </div>
                </header>
                {hours.length === 0 ? (
                  <EmptyState compact icon="reportes" title="Aún no hay cobros" description="Las barras aparecen con el primer pago del turno." />
                ) : (
                  <div className="hour-chart" role="list">
                    {hours.map((h) => {
                      const focus = h.hour_key === focusKey;
                      return (
                        <button
                          key={h.hour_key}
                          type="button"
                          role="listitem"
                          className={`hour-bar ${focus ? 'is-focus' : ''}`}
                          onClick={() => setSelectedHour(h.hour_key)}
                          aria-label={`${hourLabel(h)}: ${formatPriceCOP(h.total)} en ${h.count} pagos`}
                        >
                          {focus && (
                            <span className="hour-tip tnum">
                              {formatPriceCOP(h.total)}
                              <small>{h.count} {h.count === 1 ? 'pago' : 'pagos'}</small>
                            </span>
                          )}
                          <span className="hour-track">
                            <span className="hour-fill" style={{ height: `${Math.max(4, (h.total / maxHour) * 100)}%` }} />
                          </span>
                          <span className="hour-label">{hourLabel(h)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="surface block block--top">
                <header className="block-head">
                  <div>
                    <h2>Más vendidos</h2>
                    <p>Unidades cobradas en el turno</p>
                  </div>
                </header>
                {top.length === 0 ? (
                  <EmptyState compact icon="fuego" title="Sin ventas todavía" description="Aquí verás los productos que más salen." />
                ) : (
                  <ol className="top-list">
                    {top.map((t, i) => (
                      <li key={t.name}>
                        <span className={`top-rank ${i === 0 ? 'is-first' : ''}`}>{i + 1}</span>
                        <span className="top-main">
                          <span className="top-name">{t.name}</span>
                          {t.detail && <span className="top-detail">{t.detail}</span>}
                          <span className="top-bar"><span style={{ width: `${(t.qty / maxTop) * 100}%` }} /></span>
                        </span>
                        <span className="top-qty tnum">{t.qty}<small> und</small></span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <section className="surface block block--activity">
              <header className="block-head">
                <div>
                  <h2>Actividad reciente</h2>
                  <p>Pagos, anulaciones y órdenes de este turno</p>
                </div>
              </header>
              {recent.length === 0 ? (
                <EmptyState compact icon="clock" title="Sin movimientos todavía" description="Cada orden y cada pago aparecen aquí al instante." />
              ) : (
                <ul className="activity-list">
                  {recent.map((e) => {
                    const meta = EVENT[e.type] || EVENT.ORDEN_NUEVA;
                    return (
                      <li key={`${e.type}-${e.payment_id || e.order_id}-${e.at}`} className={`activity activity--${meta.tone}`}>
                        <span className="activity-icon"><Icon name={meta.icon} size={18} /></span>
                        <span className="activity-main">
                          <span className="activity-title">{meta.title(e)}{lugar(e) ? ` · ${lugar(e)}` : ''}</span>
                          <span className="activity-meta">
                            Orden {e.daily_no ?? e.order_id} · {clockLabel(e.at)}
                            {e.method && ` · ${paymentMethodLabel(e.method)}`}
                          </span>
                        </span>
                        {e.amount != null && (
                          <span className={`activity-amount tnum ${e.type === 'ANULACION' ? 'is-void' : ''}`}>
                            {e.type === 'ANULACION' ? '−' : ''}{formatPriceCOP(e.amount)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className="surface">
            <EmptyState
              icon="caja"
              title="No hay una caja abierta"
              description="Para comenzar a cobrar, primero abre la caja con la base del día."
              actionLabel="Abrir caja"
              onAction={() => setShowOpenModal(true)}
            />
          </div>
        )}
      </div>

      {/* FASE 17.2: Modal para abrir caja */}
      <OpenCashModal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onConfirm={handleOpenCash}
        loading={openingCash}
      />
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
