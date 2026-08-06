import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import axios from 'axios';
import { formatPriceCOP, parseMontoCOP } from '../../utils/currency.js';
import { formatBogotaDateTime } from '../../utils/timezone.js';
import ReporteCierre from '../../components/ReporteCierre.jsx';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';

// Helpers locales para diferencias de cierre
function getDiffLabel(diff) {
  if (diff > 0) return "SOBRANTE";
  if (diff < 0) return "FALTANTE";
  return "CUADRA";
}

function getDiffColor(diff) {
  if (diff > 0) return "var(--green-text)";
  if (diff < 0) return "var(--red-text)";
  return "var(--brand-deep)";
}

function getDiffTint(diff) {
  if (diff > 0) return "var(--green-tint)";
  if (diff < 0) return "var(--red-tint)";
  return "var(--brand-tint)";
}

const METHOD_LABELS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };

export default function CierreCaja() {
  const navigate = useNavigate();
  const { isOnline } = useConnection();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [closingCash, setClosingCash] = useState('');
  const [closing, setClosing] = useState(false);
  const [closedReport, setClosedReport] = useState(null);
  
  // PASO 14.4: Recuperación automática al reconectar
  // Solo refrescar si NO estamos viendo un reporte cerrado
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: !closedReport, // No refrescar si ya hay reporte cerrado
    onReconnect: async () => {
      await loadSession();
      // Si hay sesión activa, recargar summary
      if (session?.id) {
        await loadSummary(session.id);
      }
    }
  });

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/cash/session/active');
      
      if (res.data.active && res.data.session) {
        setSession(res.data.session);
        // Cargar resumen usando el endpoint de summary
        await loadSummary(res.data.session.id);
      } else {
        setSession(null);
        setSummary(null);
      }
    } catch (error) {
      console.error('Error cargando sesión:', error);
      await showAlert('Error al cargar sesión de caja');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (sessionId) => {
    try {
      const res = await axios.get(`/cash/session/${sessionId}/summary`);
      setSummary(res.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    }
  };

  const handleClose = async () => {
    const cash = parseMontoCOP(closingCash);
    if (isNaN(cash) || cash < 0) {
      await showAlert('Ingresa un monto válido (>= 0)');
      return;
    }

    if (!summary) {
      await showAlert('No hay datos de resumen disponibles');
      return;
    }

    // Calcular efectivo esperado (mismo cálculo que el backend: propinas en
    // efectivo entran al cajón; ingresos/gastos manuales suman/restan)
    const openingCash = session.initial_cash || 0;
    const totalCash = summary.byMethod.find(m => m.method === 'EFECTIVO')?.total || 0;
    const tipsCash = summary.tipsCash || 0;
    const manualIn = summary.manual?.income || 0;
    const manualOut = summary.manual?.expense || 0;
    const expectedCash = openingCash + totalCash + tipsCash + manualIn - manualOut;

    // Alerta de sanidad: un descuadre gigante casi siempre es un monto mal digitado
    const diff = cash - expectedCash;
    if (expectedCash > 0 && Math.abs(diff) > expectedCash * 0.5) {
      const sanityMsg = `OJO: estás declarando ${formatPriceCOP(cash)} y se esperaban ` +
        `${formatPriceCOP(expectedCash)}.\n\n` +
        `Eso deja una diferencia de ${formatPriceCOP(Math.abs(diff))} ` +
        `(${diff < 0 ? 'FALTANTE' : 'SOBRANTE'}).\n\n` +
        `¿Seguro que escribiste el monto completo?`;
      if (!(await showConfirm(sanityMsg))) {
        return;
      }
    }

    // Confirmación
    const confirmMsg = `¿Cerrar caja?\n\n` +
      `Efectivo inicial: ${formatPriceCOP(openingCash)}\n` +
      `Ventas en efectivo: ${formatPriceCOP(totalCash)}\n` +
      (tipsCash > 0 ? `Propinas en efectivo: ${formatPriceCOP(tipsCash)}\n` : '') +
      (manualIn > 0 ? `Ingresos de caja: ${formatPriceCOP(manualIn)}\n` : '') +
      (manualOut > 0 ? `Gastos de caja: -${formatPriceCOP(manualOut)}\n` : '') +
      `Efectivo esperado: ${formatPriceCOP(expectedCash)}\n` +
      `Efectivo contado: ${formatPriceCOP(cash)}`;

    if (!(await showConfirm(confirmMsg))) {
      return;
    }

    setClosing(true);
    try {
      const res = await axios.post('/cash/session/close', { closing_cash: cash });
      // FASE 12.2: Usar snapshot del cierre si está disponible
      if (res.data.snapshot) {
        setClosedReport({ snapshot: res.data.snapshot });
      } else {
        // Fallback: cargar reporte completo si no hay snapshot
        const reportRes = await axios.get(`/cash/session/${res.data.sessionId}/close-report`);
        setClosedReport(reportRes.data);
      }
      await loadSession(); // Recargar para verificar que ya no está activa
      // FASE 17.5: Mensaje de éxito ya no se muestra con alert, se muestra visualmente arriba del reporte
      // Nota: No redirigir aquí porque queremos mostrar el reporte primero
      // El usuario puede cerrar el reporte y luego ir al dashboard
    } catch (error) {
      console.error('Error cerrando caja:', error);
      if (error.response?.status === 409) {
        await showAlert('La sesión ya fue cerrada. Recargando...');
        await loadSession();
      } else {
        await showAlert(error.response?.data?.error || 'Error al cerrar caja');
      }
    } finally {
      setClosing(false);
    }
  };

  // FASE 12.2: handlePrintReport ya no es necesario, lo maneja ReporteCierre

  if (loading) {
    return (
      <div className="caja-container">
        <CajaHeader title="Cierre de caja" backTo="/centro" />
        <div className="caja-content" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  // FASE 15.1: Si no hay sesión activa, mostrar CTA a apertura.
  // OJO: el chequeo de closedReport va PRIMERO — al cerrar caja, loadSession()
  // deja session en null y este bloque se tragaba el reporte de cierre
  // (mostraba "No hay una caja abierta" en vez del reporte).
  if (!session && !closedReport) {
    return (
      <div className="caja-container">
        <CajaHeader title="Cierre de caja" backTo="/centro" />
        
        {/* PASO 14.4: Mensaje cuando se está refrescando tras reconectar */}
        {isOnline && isRefreshingOnReconnect && !closedReport && (
          <div style={{
            padding: '0.5rem 1rem',
            background: '#d4edda',
            border: '1px solid #28a745',
            textAlign: 'center',
            fontSize: '0.85rem',
            color: '#155724',
            fontWeight: 'bold'
          }}>
            Actualizando datos...
          </div>
        )}
        <div className="caja-content" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
          <EmptyState
            title="No hay una caja abierta"
            description="No existe una sesión activa para cerrar en este momento."
            actionLabel="IR AL DASHBOARD"
            onAction={() => navigate('/centro')}
          />
        </div>
      </div>
    );
  }

  // Si ya se cerró, mostrar reporte (FASE 12.2: usar componente ReporteCierre)
  if (closedReport) {
    // Determinar snapshot: puede venir directamente o construirlo desde datos antiguos
    let snapshot = closedReport.snapshot;
    
    // Si no hay snapshot pero hay datos antiguos, construir snapshot compatible
    if (!snapshot && closedReport.session) {
      snapshot = {
        sessionId: closedReport.session.id,
        opened_at: closedReport.session.opened_at,
        closed_at: closedReport.session.closed_at,
        initial_cash: closedReport.session.initial_cash || 0,
        closing_cash: closedReport.cash?.closing_cash ?? closedReport.session.closing_cash ?? 0,
        expected_cash: closedReport.cash?.expected_cash ?? closedReport.session.expected_cash ?? 0,
        diff_cash: closedReport.cash?.diff_cash ?? closedReport.session.diff_cash ?? null,
        totals: {
          total_cash: closedReport.totals?.total_cash ?? closedReport.session.total_cash ?? 0,
          total_card: closedReport.totals?.total_card ?? closedReport.session.total_card ?? 0,
          total_transfer: closedReport.totals?.total_transfer ?? closedReport.session.total_transfer ?? 0,
          total_sales: closedReport.totals?.total_sales ?? closedReport.session.total_sales ?? 0,
          payment_count: closedReport.totals?.payment_count ?? closedReport.session.payment_count ?? 0
        },
        closed_by: closedReport.session.closed_by
      };
    }

    return (
      <div className="caja-container">
        <CajaHeader 
          title="REPORTE DE CIERRE" 
          backTo="/centro"
          rightButton={null}
        />
        <div className="caja-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
          {/* Mensaje de éxito después de cerrar caja */}
          <div style={{
            background: '#d4edda',
            border: '1px solid #28a745',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            textAlign: 'center',
            color: '#155724',
            fontSize: '1rem',
            fontWeight: '500'
          }}>
            La caja se cerró correctamente. Puedes revisar o imprimir el reporte.
          </div>
          
          {snapshot ? (
            <ReporteCierre snapshot={snapshot} showControls={true} />
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Error: No se pudo cargar el reporte de cierre
            </div>
          )}
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => {
                setClosedReport(null);
                navigate('/centro');
              }}
              className="btn-secondary"
            >
              IR AL DASHBOARD
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calcular efectivo esperado (mismo cálculo que el backend)
  const openingCash = session.initial_cash || 0;
  const totalCash = summary?.byMethod.find(m => m.method === 'EFECTIVO')?.total || 0;
  const tipsCash = summary?.tipsCash || 0;
  const manualIn = summary?.manual?.income || 0;
  const manualOut = summary?.manual?.expense || 0;
  const manualList = summary?.manual?.transactions || [];
  const expectedCash = openingCash + totalCash + tipsCash + manualIn - manualOut;

  return (
    <>
    <div className="caja-container">
      <CajaHeader title="Cierre de caja" backTo="/centro" />

      {/* PASO 14.4: Mensaje cuando se está refrescando tras reconectar */}
      {isOnline && isRefreshingOnReconnect && !closedReport && (
        <div style={{
          padding: '0.5rem 1rem',
          background: '#d4edda',
          border: '1px solid #28a745',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#155724',
          fontWeight: 'bold'
        }}>
          Actualizando datos...
        </div>
      )}
      <div className="caja-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        {/* Información de sesión */}
        <div style={{
          background: 'white',
          padding: '1.25rem 1.4rem',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '0.9rem'
        }}>
          <h2 style={{ margin: '0 0 0.9rem 0', fontSize: '1.0625rem', fontWeight: 700, letterSpacing: 'var(--tracking-title)' }}>Sesión activa</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9375rem' }}>
            <div style={{ color: 'var(--gray-600)' }}>
              Apertura<br /><strong style={{ color: 'var(--gray-900)' }}>{formatBogotaDateTime(new Date(session.opened_at))}</strong>
            </div>
            <div style={{ color: 'var(--gray-600)' }}>
              Efectivo inicial<br /><strong className="tnum" style={{ color: 'var(--gray-900)' }}>{formatPriceCOP(openingCash)}</strong>
            </div>
          </div>
        </div>

        {/* Resumen de ventas */}
        {summary && (
          <div style={{
            background: 'white',
            padding: '1.25rem 1.4rem',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-sm)',
            marginBottom: '0.9rem'
          }}>
            <h3 style={{ margin: '0 0 0.9rem 0', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumen de ventas</h3>
            {summary.byMethod.length > 0 ? (
              <>
                {summary.byMethod.map((method, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '0.4rem',
                    padding: '0.7rem 0.85rem',
                    background: 'var(--gray-50)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9375rem'
                  }}>
                    <span><strong>{METHOD_LABELS[method.method] || method.method}</strong> · {method.count} pago(s)</span>
                    <span className="tnum" style={{ fontWeight: 700 }}>{formatPriceCOP(method.total)}</span>
                  </div>
                ))}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '0.9rem',
                  paddingTop: '0.9rem',
                  borderTop: '1px solid var(--separator)',
                  fontSize: '1.0625rem',
                  fontWeight: 700
                }}>
                  <span>Total ventas</span>
                  <span className="tnum" style={{ fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{formatPriceCOP(summary.total)}</span>
                </div>
              </>
            ) : (
              <p style={{ color: '#666', textAlign: 'center', padding: '1rem' }}>
                No hay pagos registrados en esta sesión
              </p>
            )}
          </div>
        )}

        {/* Arqueo de efectivo */}
        <div style={{
          background: 'white',
          padding: '1.25rem 1.4rem',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '0.9rem'
        }}>
          <h3 style={{ margin: '0 0 0.9rem 0', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Arqueo de efectivo</h3>
          <div style={{ marginBottom: '1rem', fontSize: '0.9375rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--gray-600)' }}>
              <span>Efectivo inicial</span>
              <span className="tnum">{formatPriceCOP(openingCash)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--gray-600)' }}>
              <span>Ventas en efectivo</span>
              <span className="tnum">{formatPriceCOP(totalCash)}</span>
            </div>
            {tipsCash > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--gray-600)' }}>
                <span>Propinas en efectivo</span>
                <span className="tnum">{formatPriceCOP(tipsCash)}</span>
              </div>
            )}
            {manualIn > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--gray-600)' }}>
                <span>Ingresos de caja</span>
                <span className="tnum">{formatPriceCOP(manualIn)}</span>
              </div>
            )}
            {manualOut > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--red-text)' }}>
                <span>Gastos de caja</span>
                <span className="tnum">-{formatPriceCOP(manualOut)}</span>
              </div>
            )}
            {manualList.length > 0 && (
              <div style={{
                margin: '0.25rem 0 0.5rem',
                padding: '0.5rem 0.85rem',
                background: 'var(--gray-50)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8125rem',
                color: 'var(--gray-500)'
              }}>
                {manualList.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
                    <span className="tnum" style={{ flexShrink: 0 }}>
                      {t.type === 'INGRESO' ? '+' : '-'}{formatPriceCOP(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--separator)',
              fontWeight: 700
            }}>
              <span>Efectivo esperado</span>
              <span className="tnum" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatPriceCOP(expectedCash)}</span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.8125rem', color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Efectivo contado
            </label>
            <input
              type="number"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="0"
              min="0"
              step="100"
              className="tnum"
              style={{
                width: '100%',
                padding: '0.8rem 1rem',
                fontSize: '1.5rem',
                border: '2px solid var(--brand)',
                borderRadius: 'var(--radius-lg)',
                textAlign: 'right',
                fontWeight: 700,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {closingCash && !isNaN(parseMontoCOP(closingCash)) && (
            <div style={{
              padding: '1rem 1.1rem',
              background: getDiffTint(parseMontoCOP(closingCash) - expectedCash),
              borderRadius: 'var(--radius-lg)',
              marginTop: '1rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: getDiffColor(parseMontoCOP(closingCash) - expectedCash), textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                {getDiffLabel(parseMontoCOP(closingCash) - expectedCash)}
              </div>
              <div className="tnum" style={{
                fontWeight: 800,
                fontSize: '2.125rem',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                color: getDiffColor(parseMontoCOP(closingCash) - expectedCash)
              }}>
                {formatPriceCOP(Math.abs(parseMontoCOP(closingCash) - expectedCash))}
              </div>
            </div>
          )}
        </div>

        {/* PASO 14.3: Mensaje cuando no hay conexión */}
        {!isOnline && (
          <div style={{
            padding: '0.75rem',
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            marginBottom: '1rem',
            textAlign: 'center',
            fontSize: '0.9rem',
            color: '#856404',
            fontWeight: 'bold'
          }}>
            No hay conexión. Operación no disponible.
          </div>
        )}

        {/* Botón cerrar: única acción final de la pantalla → ancho completo está bien */}
        <button
          onClick={handleClose}
          disabled={closing || !closingCash || isNaN(parseMontoCOP(closingCash)) || !isOnline}
          className="btn-danger"
          style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }}
        >
          {closing ? 'Cerrando caja...' : 'CERRAR CAJA'}
        </button>
      </div>
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
}
