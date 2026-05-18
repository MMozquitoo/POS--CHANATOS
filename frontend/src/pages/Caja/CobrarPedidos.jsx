import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import CalculadoraVuelto from '../../components/CalculadoraVuelto.jsx';
import CajaHeader from '../../components/CajaHeader.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { normalizePaymentItemsPayload } from '../../utils/payments';

export default function CobrarPedidos() {
  const { isOnline } = useConnection();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [loading, setLoading] = useState(true);
  const [showCalculator, setShowCalculator] = useState(false);
  const [cashSessionActive, setCashSessionActive] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();
  const { socket } = useAuth();
  
  // FASE 19.5: Refs para evitar loops
  const loadingOrdersRef = useRef(false);
  
  // FASE 19.5: useCallback para funciones loadX
  const checkCashSession = useCallback(async () => {
    if (!isOnline) return;
    
    try {
      setCheckingSession(true);
      const res = await axios.get('/cash/session/active');
      setCashSessionActive(res.data.active || false);
    } catch (error) {
      console.error('Error verificando sesión de caja:', error);
      setCashSessionActive(false);
    } finally {
      setCheckingSession(false);
    }
  }, [isOnline]);

  const loadOrders = useCallback(async () => {
    // FASE 19.5: Evitar refetch si ya está cargando
    // FASE 19.10: Modo ahorro - no hacer refetch cuando offline
    if (loadingOrdersRef.current || !isOnline) return;
    
    loadingOrdersRef.current = true;
    try {
      const res = await axios.get('/orders?status=LISTO');
      setOrders(res.data.filter(o => !o.paid_at));
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
      loadingOrdersRef.current = false;
    }
  }, [isOnline]);
  
  // FASE 19.1: Recuperación automática al reconectar
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: true,
    onReconnect: useCallback(async () => {
      await Promise.all([
        loadOrders(),
        checkCashSession()
      ]);
    }, [loadOrders, checkCashSession])
  });

  // FASE 19.5: Separar carga inicial de listeners
  useEffect(() => {
    checkCashSession();
    loadOrders();
  }, [checkCashSession, loadOrders]);

  // FASE 19.8: Listeners de socket con cleanup correcto
  useEffect(() => {
    if (!socket) return;
    
    const handleOrderStatusChanged = () => {
      loadOrders();
    };

    const handlePaymentCreated = () => {
      loadOrders();
      setSelectedOrder(null);
      setSelectedItemIds(new Set());
    };

    socket.on('order:status-changed', handleOrderStatusChanged);
    socket.on('payment:created', handlePaymentCreated);

    return () => {
      socket.off('order:status-changed', handleOrderStatusChanged);
      socket.off('payment:created', handlePaymentCreated);
    };
  }, [socket, loadOrders]);


  const calculateTotal = (order) => {
    return order.items?.reduce((sum, item) => {
      const price = item.price ?? 0;
      return sum + (price * item.qty);
    }, 0) || 0;
  };

  const processPaymentFull = async () => {
    if (!selectedOrder) return;

    // Validar sesión activa (FASE 9.5)
    if (!cashSessionActive) {
      await showAlert('Debes ABRIR CAJA antes de cobrar');
      navigate('/mesas');
      return;
    }

    const total = calculateTotal(selectedOrder);

    // Validar total > 0 (FASE 9.5)
    if (total <= 0) {
      await showAlert('Total inválido. Revisa precios o items.');
      return;
    }

    // FASE 12.4: Validar que la orden esté en estado LISTO
    if (selectedOrder.status !== 'LISTO') {
      await showAlert(`Solo se puede cobrar cuando la orden está LISTO. Estado actual: ${selectedOrder.status}`);
      loadOrders();
      return;
    }

    try {
      await axios.post('/payments', {
        orderId: selectedOrder.id,
        method: paymentMethod,
        amount: total
      });

      await showAlert('Pago procesado correctamente');
      loadOrders();
      setSelectedOrder(null);
    } catch (error) {
      console.error('Error procesando pago:', error);
      // FASE 12.4: Manejo de error 409 (orden bloqueada)
      if (error.response?.status === 409) {
        await showAlert(error.response?.data?.error || 'Solo se puede cobrar cuando la orden está LISTO.');
        loadOrders();
      } else {
        await showAlert(error.response?.data?.error || 'Error al procesar pago');
      }
    }
  };

  const toggleItem = (itemId) => {
    const next = new Set(selectedItemIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setSelectedItemIds(next);
  };

  const selectedTotal = () => {
    if (!selectedOrder) return 0;
    return selectedOrder.items?.reduce((sum, it) => {
      if (!selectedItemIds.has(it.id)) return sum;
      return sum + (it.qty * (it.price ?? 0));
    }, 0) || 0;
  };

  const processPaymentPartial = async () => {
    if (!selectedOrder) return;

    // Validar sesión activa (FASE 9.5)
    if (!cashSessionActive) {
      await showAlert('Debes ABRIR CAJA antes de cobrar');
      navigate('/mesas');
      return;
    }

    const itemIds = Array.from(selectedItemIds);
    if (itemIds.length === 0) {
      await showAlert('Selecciona items para cobrar por partes');
      return;
    }
    const total = selectedTotal();

    // Validar total > 0 (FASE 9.5)
    if (total <= 0) {
      await showAlert('Total inválido. Revisa precios o items.');
      return;
    }

    // FASE 12.4: Validar que la orden esté en estado LISTO
    if (selectedOrder.status !== 'LISTO') {
      await showAlert(`Solo se puede cobrar cuando la orden está LISTO. Estado actual: ${selectedOrder.status}`);
      loadOrders();
      return;
    }

    if (!(await showConfirm(`¿Cobrar ${itemIds.length} item(s) por ${formatPriceCOP(total)}?`))) return;
    try {
      // PASO 16.2.2-A: Normalizar payload
      let payload;
      try {
        const itemsObjects = selectedOrder.items?.filter(item => itemIds.includes(item.id)) || [];
        payload = normalizePaymentItemsPayload({
          items: itemsObjects, // pasar objetos completos para extraer IDs
          method: paymentMethod,
          orderId: selectedOrder.id, // preferir orderId si existe
          amount: total
        });
      } catch (normalizeError) {
        await showAlert(normalizeError.message || 'Error al preparar el pago. Verifica los items seleccionados.');
        return;
      }

      // PASO 16.2.2: Instrumentación para diagnóstico del 400
      if (import.meta.env?.DEV) {
        console.log("[DEBUG payments/items] payload =", JSON.stringify(payload, null, 2));
        console.log("[DEBUG payments/items] itemsObjects =", JSON.stringify(itemsObjects, null, 2));
        console.log("[DEBUG payments/items] itemIds =", itemIds);
        console.log("[DEBUG payments/items] selectedOrder.id =", selectedOrder.id);
        console.log("[DEBUG payments/items] paymentMethod =", paymentMethod);
      }

      await axios.post('/payments/items', payload);
      await showAlert('Pago parcial procesado');
      loadOrders();
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error('Error procesando pago parcial:', error);
      // FASE 12.4: Manejo de error 409 (orden bloqueada)
      if (error.response?.status === 409) {
        await showAlert(error.response?.data?.error || 'Solo se puede cobrar cuando la orden está LISTO.');
        loadOrders();
      } else {
        await showAlert(error.response?.data?.error || 'Error al procesar pago parcial');
      }
    }
  };

  const archiveOrder = async (orderId) => {
    if (!(await showConfirm('¿Archivar esta cuenta? Se ocultará de listas/cocina.'))) return;
    try {
      await axios.patch(`/orders/${orderId}/archive`);
      loadOrders();
      setSelectedOrder(null);
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error('Error archivando:', error);
      await showAlert(error.response?.data?.error || 'Error al archivar');
    }
  };

  const deleteOrder = async (orderId) => {
    if (!(await showConfirm('¿BORRAR esta cuenta? Solo permitido si no tiene pagos.'))) return;
    try {
      await axios.delete(`/orders/${orderId}`);
      loadOrders();
      setSelectedOrder(null);
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error('Error borrando:', error);
      await showAlert(error.response?.data?.error || 'Error al borrar');
    }
  };

  const cancelOrder = async (order) => {
    const reason = prompt('Motivo de cancelación (mínimo 3 caracteres):');
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) {
        await showAlert('El motivo debe tener al menos 3 caracteres');
      }
      return;
    }

    const orderCode = order.daily_no || order.code || `#${order.id}`;
    if (!(await showConfirm(`¿Cancelar ORDEN ${orderCode}?\n\nMotivo: ${reason}`))) {
      return;
    }

    try {
      await axios.patch(`/orders/${order.id}/cancel`, { reason: reason.trim() });
      await showAlert('Orden cancelada correctamente');
      loadOrders();
      setSelectedOrder(null);
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error('Error cancelando orden:', error);
      await showAlert(error.response?.data?.error || 'Error al cancelar orden');
    }
  };

  if (loading) {
    return <div className="loading">Cargando información...</div>;
  }

  return (
    <>
    <div className="cobrar-container">
      <CajaHeader
        title="COBRAR PEDIDOS"
        backTo="/centro"
      />
      
      {/* PASO 14.4: Mensaje cuando se está refrescando tras reconectar */}
      {isOnline && isRefreshingOnReconnect && (
        <div style={{
          padding: '0.5rem 1rem',
          background: '#d4edda',
          border: '1px solid #28a745',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#155724',
          fontWeight: 'bold'
        }}>
          Actualizando...
        </div>
      )}

      <div className="cobrar-content">
        {/* Banner de sesión activa obligatoria (FASE 9.5) */}
        {!checkingSession && !cashSessionActive && (
          <div style={{
            background: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#856404' }}>
              Debes ABRIR CAJA antes de cobrar
            </div>
            <button
              onClick={() => navigate('/mesas')}
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1.5rem',
                background: '#F5BB4C',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
            >
              Ir a Mesas
            </button>
          </div>
        )}
        <div className="orders-list-cobrar">
          <h2>Pedidos Listos ({orders.length})</h2>
          {orders.length === 0 && !loading ? (
            <EmptyState
              title="No hay pedidos para cobrar"
              description="Cuando una orden esté lista, aparecerá aquí automáticamente."
            />
          ) : (
            <div className="orders-grid">
              {orders.map(order => (
                <button
                  key={order.id}
                  className={`order-card-cobrar ${selectedOrder?.id === order.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedOrder(order);
                    setSelectedItemIds(new Set());
                  }}
                >
                  <div className="order-code-cobrar">{order.daily_no ? `ORDEN ${order.daily_no}` : order.code}</div>
                  {order.table_label && (
                    <div className="order-table-cobrar">Mesa: {order.table_label}</div>
                  )}
                  <div className="order-total-cobrar">
                    {formatPriceCOP(calculateTotal(order))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedOrder && (
          <div className="payment-panel">
            <h2>Procesar Pago</h2>
            <div className="order-details-payment">
              <div className="order-code-payment">{selectedOrder.daily_no ? `ORDEN ${selectedOrder.daily_no}` : selectedOrder.code}</div>
              {selectedOrder.table_label && (
                <div className="order-table-payment">Mesa: {selectedOrder.table_label}</div>
              )}
              <div className="order-items-payment">
                {selectedOrder.items?.map((item, idx) => (
                  <label key={idx} className="payment-item" style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.has(item.id)}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span>{item.qty}x {item.name} ({formatPriceCOP(item.qty * (item.price ?? 0))})</span>
                  </label>
                ))}
              </div>
              <div className="payment-total">
                <span>Total:</span>
                <span className="total-amount">{formatPriceCOP(calculateTotal(selectedOrder))}</span>
              </div>
            </div>

            <div className="payment-methods">
              <h3>Método de Pago</h3>
              <div className="methods-grid">
                <button
                  className={`method-btn ${paymentMethod === 'EFECTIVO' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('EFECTIVO')}
                >
                  Efectivo
                </button>
                <button
                  className={`method-btn ${paymentMethod === 'TARJETA' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('TARJETA')}
                >
                  Tarjeta
                </button>
                <button
                  className={`method-btn ${paymentMethod === 'TRANSFERENCIA' ? 'active' : ''}`}
                  onClick={() => setPaymentMethod('TRANSFERENCIA')}
                >
                  Transferencia
                </button>
              </div>
            </div>

            <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
              <button 
                onClick={() => setShowCalculator(true)} 
                className="process-payment-btn"
              >
                CALCULADORA
              </button>
              {/* PASO 14.3: Mensaje cuando no hay conexión */}
              {!isOnline && (
                <div style={{
                  padding: '0.75rem',
                  background: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.9rem',
                  color: '#856404',
                  fontWeight: 'bold',
                  width: '100%'
                }}>
                  No hay conexión. Operación no disponible.
                </div>
              )}
              <button 
                onClick={processPaymentPartial} 
                disabled={!cashSessionActive || !isOnline}
                className="process-payment-btn" 
                style={{
                  background: cashSessionActive && isOnline ? '#F5BB4C' : '#6c757d',
                  opacity: cashSessionActive && isOnline ? 1 : 0.6,
                  cursor: cashSessionActive ? 'pointer' : 'not-allowed'
                }}
              >
                COBRAR POR PARTES ({formatPriceCOP(selectedTotal())})
              </button>
              <button 
                onClick={processPaymentFull} 
                disabled={!cashSessionActive}
                className="process-payment-btn"
                style={{
                  opacity: cashSessionActive ? 1 : 0.6,
                  cursor: cashSessionActive ? 'pointer' : 'not-allowed'
                }}
              >
                COBRAR TODO
              </button>
            </div>
            {showCalculator && (
              <CalculadoraVuelto 
                total={selectedTotal()} 
                onClose={() => setShowCalculator(false)} 
              />
            )}
            <div style={{display:'flex', gap:'0.5rem', marginTop:'1rem', flexWrap:'wrap'}}>
              {/* FASE 20.C: Botones secundarios con colores más suaves */}
              <button onClick={() => archiveOrder(selectedOrder.id)} className="method-btn" style={{
                flex:'1',
                background: '#f8f9fa',
                color: '#6c757d',
                border: '1px solid #dee2e6',
                fontWeight: 500
              }}>
                ARCHIVAR
              </button>
              <button onClick={() => deleteOrder(selectedOrder.id)} className="method-btn" style={{
                flex:'1',
                border:'1px solid #dc3545',
                color:'#dc3545',
                background:'transparent',
                fontWeight: 500
              }}>
                BORRAR
              </button>
            </div>
          </div>
        )}
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

