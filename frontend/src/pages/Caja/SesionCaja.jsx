import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import axios from 'axios';
import './Caja.css';
import { formatBogotaDateTime, formatBogotaTime } from '../../utils/timezone.js';
import { formatPriceCOP } from '../../utils/currency.js';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';

export default function SesionCaja() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialCash, setInitialCash] = useState('');
  const [finalCash, setFinalCash] = useState('');
  const [previousDayPending, setPreviousDayPending] = useState(false);
  const [previousDaySummary, setPreviousDaySummary] = useState(null);
  const [closeSummary, setCloseSummary] = useState(null);
  const [showCloseSummary, setShowCloseSummary] = useState(false);
  const [salesSummary, setSalesSummary] = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isOnline } = useConnection();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  // FASE 19.1: Eliminar setInterval propio, usar useReconnectRefresh + botón refresh manual
  // FASE 19.5: useCallback para evitar recrear función
  const loadSession = useCallback(async () => {
    // FASE 19.10: Modo ahorro - no hacer refetch automático cuando offline
    if (!isOnline) {
      return;
    }
    
    try {
      const res = await axios.get('/cash/current');
      setSession(res.data.session);
      setSalesSummary(res.data.salesSummary || null);
      setPreviousDayPending(res.data.previousDayPending || false);
      setPreviousDaySummary(res.data.previousDaySummary || null);
      
      // Si hay sesión antigua o cierre pendiente, mostrar alerta
      if (res.data.session?.isOldSession || res.data.previousDayPending) {
        // Aquí podrías mostrar un modal con el resumen del día anterior
      }
    } catch (error) {
      console.error('Error cargando sesión:', error);
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  // FASE 19.1: Recuperación automática al reconectar
  useReconnectRefresh({
    enabled: true,
    onReconnect: loadSession
  });

  useEffect(() => {
    loadSession();
  }, [loadSession]);


  const openCash = async () => {
    if (!initialCash || parseFloat(initialCash) < 0) {
      await showAlert('Ingresa un monto inicial válido');
      return;
    }

    try {
      await axios.post('/cash/open', { initialCash: parseFloat(initialCash) });
      loadSession();
      setInitialCash('');
    } catch (error) {
      console.error('Error abriendo caja:', error);
      await showAlert(error.response?.data?.error || 'Error al abrir caja');
    }
  };

  const closeCash = async () => {
    if (!finalCash || parseFloat(finalCash) < 0) {
      await showAlert('Ingresa un monto final válido');
      return;
    }

    if (!await showConfirm('¿Estás seguro de cerrar la caja? Esto generará un resumen del día.')) {
      return;
    }

    try {
      const res = await axios.post('/cash/close', { finalCash: parseFloat(finalCash) });
      setCloseSummary(res.data.summary);
      setShowCloseSummary(true);
      setFinalCash('');
    } catch (error) {
      console.error('Error cerrando caja:', error);
      await showAlert(error.response?.data?.error || 'Error al cerrar caja');
    }
  };

  const handleCloseSummary = () => {
    setShowCloseSummary(false);
    setCloseSummary(null);
    loadSession();
  };

  if (loading) {
    return <div className="loading">Cargando información...</div>;
  }

  return (
    <div className="caja-container">
      <header className="caja-header">
        <h1>CAJA</h1>
        <button onClick={logout} className="logout-btn">Salir</button>
      </header>

      {/* Modal de resumen del día anterior pendiente */}
      {previousDayPending && previousDaySummary && !session && (
        <div className="modal-overlay">
          <div className="modal-content summary-modal">
            <h2>⚠️ Cierre Pendiente del Día Anterior</h2>
            <p>Se detectó una sesión sin cerrar del día anterior. Resumen del día:</p>
            <div className="previous-day-summary">
              <div className="summary-section">
                <h3>Resumen del Día Anterior</h3>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Ventas Totales:</span>
                    <span className="summary-value">{formatPriceCOP(previousDaySummary.totalSales || 0)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Pedidos:</span>
                    <span className="summary-value">{previousDaySummary.totalOrders || 0}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Ticket Promedio:</span>
                    <span className="summary-value">{formatPriceCOP(previousDaySummary.avgTicket || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => { setPreviousDayPending(false); setPreviousDaySummary(null); }} className="close-btn">
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Modal de resumen del cierre */}
      {showCloseSummary && closeSummary && (
        <div className="modal-overlay">
          <div className="modal-content summary-modal" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2>CIERRE DE CAJA – RESUMEN</h2>
            
            {/* Resumen del día de hoy */}
            <div className="summary-section">
              <h3>Hoy</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">Ventas:</span>
                  <span className="summary-value">{formatPriceCOP(closeSummary.today.totalSales || 0)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Pedidos:</span>
                  <span className="summary-value">{closeSummary.today.totalOrders || 0}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Ticket Promedio:</span>
                  <span className="summary-value">{formatPriceCOP(closeSummary.today.avgTicket || 0)}</span>
                </div>
                {closeSummary.today.session && (
                  <>
                  <div className="summary-item">
                    <span className="summary-label">Hora Apertura:</span>
                    <span className="summary-value">{formatBogotaTime(closeSummary.today.session.openedAt)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Hora Cierre:</span>
                    <span className="summary-value">{formatBogotaTime(closeSummary.today.session.closedAt)}</span>
                  </div>
                    <div className="summary-item">
                      <span className="summary-label">Duración:</span>
                      <span className="summary-value">{closeSummary.today.session.shiftDuration || 'N/A'}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Ventas por método de pago */}
            {closeSummary.today.paymentsByMethod && closeSummary.today.paymentsByMethod.length > 0 && (
              <div className="summary-section">
                <h3>Ventas por Método de Pago</h3>
                <div className="payments-method-list">
                  {closeSummary.today.paymentsByMethod.map((method, idx) => (
                    <div key={idx} className="method-item">
                      <span>{method.method}:</span>
                      <span className="method-amount">{formatPriceCOP(method.total || 0)} ({method.count || 0} transacciones)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comparación con ayer */}
            {closeSummary.comparison && (
              <div className="summary-section">
                <h3>Comparado con Ayer</h3>
                <div className="comparison-grid">
                  <div className="comparison-item">
                    <span className="comparison-label">Ventas:</span>
                    <span className={`comparison-value ${parseFloat(closeSummary.comparison.salesPercentChange) >= 0 ? 'positive' : 'negative'}`}>
                      {parseFloat(closeSummary.comparison.salesPercentChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(closeSummary.comparison.salesPercentChange))}%
                    </span>
                  </div>
                  <div className="comparison-item">
                    <span className="comparison-label">Pedidos:</span>
                    <span className={`comparison-value ${closeSummary.comparison.ordersDiff >= 0 ? 'positive' : 'negative'}`}>
                      {closeSummary.comparison.ordersDiff >= 0 ? '+' : ''}{closeSummary.comparison.ordersDiff}
                    </span>
                  </div>
                  <div className="comparison-item">
                    <span className="comparison-label">Ticket Promedio:</span>
                    <span className={`comparison-value ${parseFloat(closeSummary.comparison.avgTicketPercentChange) >= 0 ? 'positive' : 'negative'}`}>
                      {parseFloat(closeSummary.comparison.avgTicketPercentChange) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(closeSummary.comparison.avgTicketPercentChange))}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fase 2.3: CMV y Utilidad Bruta */}
            {closeSummary.today.session && closeSummary.today.session.cogs_total !== undefined && (
              <div className="summary-section">
                <h3>Costos y Utilidad</h3>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Ventas (Gross Sales):</span>
                    <span className="summary-value">{formatPriceCOP(closeSummary.today.session.gross_sales || 0)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">CMV (Costo de lo Vendido):</span>
                    <span className="summary-value">{formatPriceCOP(closeSummary.today.session.cogs_total || 0)}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Utilidad Bruta:</span>
                    <span className="summary-value" style={{ color: (closeSummary.today.session.gross_profit || 0) >= 0 ? '#28a745' : '#dc3545', fontWeight: 'bold' }}>
                      {formatPriceCOP(closeSummary.today.session.gross_profit || 0)}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">% CMV sobre Ventas:</span>
                    <span className="summary-value">
                      {closeSummary.today.session.cogs_percent !== undefined 
                        ? `${(closeSummary.today.session.cogs_percent * 100).toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666', fontStyle: 'italic' }}>
                  * OTROS sin receta no incluyen costo
                </div>
              </div>
            )}

            {/* Top productos */}
            {closeSummary.today.topProducts && closeSummary.today.topProducts.length > 0 && (
              <div className="summary-section">
                <h3>Top Productos</h3>
                <ol className="top-products-list">
                  {closeSummary.today.topProducts.map((product, idx) => (
                    <li key={idx} className="product-item">
                      <span className="product-name">{product.name}</span>
                      <span className="product-stats">{product.total_qty} unidades - {formatPriceCOP(product.total_sales || 0)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Análisis de mesas */}
            {(closeSummary.today.tablesServed > 0 || closeSummary.today.topTable) && (
              <div className="summary-section">
                <h3>Análisis de Mesas</h3>
                <div className="tables-analysis">
                  <div className="analysis-item">
                    <span className="analysis-label">Mesas Atendidas:</span>
                    <span className="analysis-value">{closeSummary.today.tablesServed || 0}</span>
                  </div>
                  {closeSummary.today.topTable && (
                    <div className="analysis-item">
                      <span className="analysis-label">Mesa con Mayor Consumo:</span>
                      <span className="analysis-value">
                        {closeSummary.today.topTable.table_label || `Mesa ${closeSummary.today.topTable.table_number}`} - 
                        {formatPriceCOP(closeSummary.today.topTable.total_sales || 0)} ({closeSummary.today.topTable.order_count} pedidos)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Alertas */}
            {closeSummary.alerts && closeSummary.alerts.length > 0 && (
              <div className="summary-section">
                <h3>Alertas</h3>
                <div className="alerts-list">
                  {closeSummary.alerts.map((alert, idx) => (
                    <div key={idx} className={`alert-item alert-${alert.type}`}>
                      {alert.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleCloseSummary} className="close-btn" style={{ marginTop: '1rem' }}>
              Confirmar Cierre
            </button>
          </div>
        </div>
      )}

      <div className="caja-content">
        {/* FASE 19.1: Botón refresh manual */}
        <div style={{ padding: '0.5rem 1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            onClick={loadSession}
            disabled={!isOnline}
            style={{
              padding: '0.5rem 1rem',
              background: isOnline ? '#F5BB4C' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isOnline ? 'pointer' : 'not-allowed',
              fontSize: '0.9rem',
              opacity: isOnline ? 1 : 0.6
            }}
          >
            🔄 Actualizar
          </button>
        </div>
        {!session ? (
          <>
            <div className="cash-session-form">
              <h2>Abrir Caja</h2>
              {previousDayPending && previousDaySummary && (
                <div className="warning-banner">
                  ⚠️ Hay un cierre pendiente del día anterior. 
                  Ventas del día anterior: {formatPriceCOP(previousDaySummary.totalSales || 0)}
                </div>
              )}
              <div className="form-group">
                <label>Efectivo Inicial</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={initialCash}
                    onChange={(e) => setInitialCash(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const current = parseInt(initialCash || 0);
                      setInitialCash((current + 500).toString());
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 'bold'
                    }}
                  >
                    +500
                  </button>
                </div>
              </div>
              <button onClick={openCash} className="open-btn">
                ABRIR CAJA
              </button>
            </div>
            <div className="cash-actions-no-session">
              <button onClick={() => navigate('/historial-caja')} className="action-btn" style={{ background: '#F5BB4C', color: 'white' }}>
                📅 HISTORIAL DE CAJA
              </button>
              <button onClick={() => navigate('/historial')} className="action-btn historial-btn">
                VER HISTORIAL PAGOS
              </button>
              <button onClick={() => navigate('/mas')} className="action-btn" style={{ background: '#6c757d', color: 'white' }}>
                MÁS
              </button>
            </div>
          </>
        ) : (
          <div className="cash-session-info">
            <h2>Sesión de Caja Abierta</h2>
            <div className="session-details">
              <div className="detail-item">
                <span className="detail-label">Apertura:</span>
                <span className="detail-value">
                  {formatBogotaDateTime(session.opened_at)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Efectivo Inicial:</span>
                <span className="detail-value">{formatPriceCOP(session.initial_cash)}</span>
              </div>
            </div>

            {/* Ventas Teóricas vs Pagado */}
            {salesSummary && (
              <div className="sales-summary-section">
                <h3>RESUMEN DE VENTAS</h3>
                <div className="sales-summary-grid">
                  <div className="summary-card">
                    <div className="summary-label">Ventas Teóricas</div>
                    <div className="summary-value theoretical">{formatPriceCOP(salesSummary.theoreticalSales)}</div>
                    <div className="summary-description">(Según pedidos)</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-label">Total Pagado</div>
                    <div className="summary-value paid">{formatPriceCOP(salesSummary.totalPayments)}</div>
                    <div className="summary-description">(Registrado en caja)</div>
                  </div>
                  <div className="summary-card">
                    <div className="summary-label">Diferencia</div>
                    <div className={`summary-value difference ${salesSummary.difference >= 0 ? 'positive' : 'negative'}`}>
                      {salesSummary.difference >= 0 ? '+' : ''}{formatPriceCOP(salesSummary.difference)}
                    </div>
                    <div className="summary-description">(Pagado - Teórico)</div>
                  </div>
                </div>

                {/* Desglose por método de pago */}
                {salesSummary.paymentsByMethod && salesSummary.paymentsByMethod.length > 0 && (
                  <div className="payment-methods-breakdown">
                    <h4>Desglose por Método de Pago</h4>
                    <div className="methods-list">
                      {salesSummary.paymentsByMethod.map((method, idx) => (
                        <div key={idx} className="method-breakdown-item">
                          <span className="method-name">{method.method}:</span>
                          <span className="method-count">{method.count} transacciones</span>
                          <span className="method-total">{formatPriceCOP(method.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="cash-actions">
              <button onClick={() => navigate('/centro-total')} className="action-btn" style={{ background: '#F5BB4C', color: 'white', fontSize: '1.1rem', fontWeight: 'bold' }}>
                🎯 CENTRO TOTAL
              </button>
              <button onClick={() => navigate('/mesas')} className="action-btn mesas-btn">
                MESAS
              </button>
              <button onClick={() => navigate('/cobrar')} className="action-btn cobrar-btn">
                COBRAR PEDIDOS LISTOS
              </button>
              <button onClick={() => navigate('/historial')} className="action-btn historial-btn">
                VER HISTORIAL PAGOS
              </button>
              <button onClick={() => navigate('/historial-caja')} className="action-btn" style={{ background: '#F5BB4C', color: 'white' }}>
                📅 HISTORIAL DE CAJA
              </button>
              <button onClick={() => navigate('/mas')} className="action-btn" style={{ background: '#6c757d', color: 'white' }}>
                MÁS
              </button>
            </div>

            <div className="close-session">
              <div className="form-group">
                <label>Efectivo Final</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={finalCash}
                    onChange={(e) => setFinalCash(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const current = parseInt(finalCash || 0);
                      setFinalCash((current + 500).toString());
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 'bold'
                    }}
                  >
                    +500
                  </button>
                </div>
              </div>
              <button onClick={closeCash} className="close-btn">
                CERRAR CAJA
              </button>
            </div>
          </div>
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
    </div>
  );
}
