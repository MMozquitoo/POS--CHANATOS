import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import axios from 'axios';
import { formatPriceCOP } from '../../utils/currency.js';
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
  if (diff > 0) return "#28a745";
  if (diff < 0) return "#dc3545";
  return "#F5BB4C";
}

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
    const cash = parseFloat(closingCash);
    if (isNaN(cash) || cash < 0) {
      await showAlert('Ingresa un monto válido (>= 0)');
      return;
    }

    if (!summary) {
      await showAlert('No hay datos de resumen disponibles');
      return;
    }

    // Calcular efectivo esperado
    const openingCash = session.initial_cash || 0;
    const totalCash = summary.byMethod.find(m => m.method === 'EFECTIVO')?.total || 0;
    const expectedCash = openingCash + totalCash;

    // Confirmación
    const confirmMsg = `¿Cerrar caja?\n\n` +
      `Efectivo inicial: ${formatPriceCOP(openingCash)}\n` +
      `Ventas en efectivo: ${formatPriceCOP(totalCash)}\n` +
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
        <CajaHeader title="CIERRE DE CAJA" backTo="/centro" />
        <div className="caja-content" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  // FASE 15.1: Si no hay sesión activa, mostrar CTA a apertura
  if (!session) {
    return (
      <div className="caja-container">
        <CajaHeader title="CIERRE DE CAJA" backTo="/centro" />
        
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
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
            >
              IR AL DASHBOARD
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calcular efectivo esperado
  const openingCash = session.initial_cash || 0;
  const totalCash = summary?.byMethod.find(m => m.method === 'EFECTIVO')?.total || 0;
  const expectedCash = openingCash + totalCash;

  return (
    <>
    <div className="caja-container">
      <CajaHeader title="CIERRE DE CAJA" backTo="/centro" />

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
          padding: '1.5rem', 
          borderRadius: '12px',
          border: '2px solid #F5BB4C',
          marginBottom: '1rem'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>Sesión Activa</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <strong>ID Sesión:</strong> {session.id}
            </div>
            <div>
              <strong>Apertura:</strong> {formatBogotaDateTime(new Date(session.opened_at))}
            </div>
            <div>
              <strong>Efectivo inicial:</strong> {formatPriceCOP(openingCash)}
            </div>
            <div>
              <strong>Abierta por:</strong> Usuario #{session.opened_by}
            </div>
          </div>
        </div>

        {/* Resumen de ventas */}
        {summary && (
          <div style={{ 
            background: 'white', 
            padding: '1.5rem', 
            borderRadius: '12px',
            border: '1px solid #ddd',
            marginBottom: '1rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Resumen de Ventas</h3>
            {summary.byMethod.length > 0 ? (
              <>
                {summary.byMethod.map((method, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginBottom: '0.5rem',
                    padding: '0.75rem',
                    background: '#f8f9fa',
                    borderRadius: '6px'
                  }}>
                    <span><strong>{method.method}:</strong> {method.count} pago(s)</span>
                    <span style={{ fontWeight: 'bold' }}>{formatPriceCOP(method.total)}</span>
                  </div>
                ))}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginTop: '1rem',
                  paddingTop: '1rem',
                  borderTop: '2px solid #333',
                  fontSize: '1.3rem',
                  fontWeight: 'bold'
                }}>
                  <span>TOTAL VENTAS:</span>
                  <span>{formatPriceCOP(summary.total)}</span>
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
          padding: '1.5rem', 
          borderRadius: '12px',
          border: '2px solid #28a745',
          marginBottom: '1rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>Arqueo de Efectivo</h3>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Efectivo inicial:</span>
              <span>{formatPriceCOP(openingCash)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Ventas en efectivo:</span>
              <span>{formatPriceCOP(totalCash)}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '2px solid #333',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              <span>Efectivo esperado:</span>
              <span>{formatPriceCOP(expectedCash)}</span>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Efectivo contado:
            </label>
            <input
              type="number"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              placeholder="0"
              min="0"
              step="100"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1.2rem',
                border: '2px solid #28a745',
                borderRadius: '8px',
                textAlign: 'right',
                fontWeight: 'bold'
              }}
            />
          </div>

          {closingCash && !isNaN(parseFloat(closingCash)) && (
            <div style={{
              padding: '1rem',
              background: '#f8f9fa',
              borderRadius: '8px',
              marginTop: '1rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Diferencia:</span>
                <span style={{ 
                  fontWeight: 'bold',
                  fontSize: '1.2rem',
                  color: getDiffColor(parseFloat(closingCash) - expectedCash)
                }}>
                  {getDiffLabel(parseFloat(closingCash) - expectedCash)} {formatPriceCOP(Math.abs(parseFloat(closingCash) - expectedCash))}
                </span>
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

        {/* Botón cerrar */}
        <button
          onClick={handleClose}
          disabled={closing || !closingCash || isNaN(parseFloat(closingCash)) || !isOnline}
          style={{
            width: '100%',
            padding: '1.5rem',
            background: closing || !isOnline ? '#ccc' : '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            cursor: closing || !isOnline ? 'not-allowed' : 'pointer',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            boxShadow: closing || !isOnline ? 'none' : '0 4px 12px rgba(220, 53, 69, 0.4)',
            opacity: closing || !isOnline ? 0.6 : 1,
            transition: 'opacity 0.2s, transform 0.1s'
          }}
          onMouseEnter={(e) => {
            if (!closing && isOnline && closingCash && !isNaN(parseFloat(closingCash))) {
              e.currentTarget.style.opacity = '0.85';
            }
          }}
          onMouseLeave={(e) => {
            if (!closing && isOnline && closingCash && !isNaN(parseFloat(closingCash))) {
              e.currentTarget.style.opacity = '1';
            }
          }}
          onMouseDown={(e) => {
            if (!closing && isOnline && closingCash && !isNaN(parseFloat(closingCash))) {
              e.currentTarget.style.transform = 'scale(0.98)';
            }
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
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
