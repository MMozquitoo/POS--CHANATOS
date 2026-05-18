import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';

/* OrderCard extracted outside CocinaCaja to avoid re-creating on every render */
function OrderCard({ order, selectedOrderId, onSelect, isUpdating, onConfirmStatus }) {
  const getActionButton = () => {
    if (order.status === 'NUEVO') {
      return (
        <button
          onClick={() => onConfirmStatus(order.id, 'EN_PREP', '¿Enviar esta orden a preparación?')}
          disabled={isUpdating}
          className={isUpdating ? 'btn-secondary' : 'btn-chanatos'}
          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
        >
          {isUpdating ? 'Enviando...' : 'Enviar a Preparación'}
        </button>
      );
    } else if (order.status === 'EN_PREP') {
      return (
        <button
          onClick={() => onConfirmStatus(order.id, 'LISTO', '¿Marcar esta orden como LISTO?')}
          disabled={isUpdating}
          className={isUpdating ? 'btn-secondary' : 'btn-success'}
          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
        >
          {isUpdating ? 'Marcando...' : 'Marcar Listo'}
        </button>
      );
    }
    return null;
  };

  const totalItems = order.items?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;

  return (
    <div
      onClick={() => onSelect(order)}
      className="caja-list-item"
      style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        border: selectedOrderId === order.id ? '3px solid #F5BB4C' : '2px solid #ddd',
        marginBottom: '1rem'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333' }}>
          {order.daily_no ? `ORDEN ${order.daily_no}` : order.code}
        </div>
        <div style={{ color: '#666', fontSize: '0.85rem' }}>
          {new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {order.table_label && (
        <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          Mesa: {order.table_label}
        </div>
      )}

      <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        {totalItems} item(s)
      </div>

      {getActionButton()}
    </div>
  );
}

export default function CocinaCaja({ hideHeader = false }) {
  const navigate = useNavigate();
  const { socket } = useAuth();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [orders, setOrders] = useState({ NUEVO: [], EN_PREP: [], LISTO: [] });
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(new Set());

  useEffect(() => {
    loadOrders();

    if (socket) {
      socket.on('order:new', () => {
        loadOrders();
      });

      socket.on('order:status-changed', () => {
        loadOrders();
      });

      socket.on('order:archived', () => {
        loadOrders();
      });

      socket.on('order:updated', () => {
        loadOrders();
      });

      return () => {
        socket.off('order:new');
        socket.off('order:status-changed');
        socket.off('order:archived');
        socket.off('order:updated');
      };
    }
  }, [socket]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/orders?kitchen=true');
      const allOrders = res.data.filter(o => o.status !== 'CANCELADO');

      setOrders({
        NUEVO: allOrders.filter(o => o.status === 'NUEVO'),
        EN_PREP: allOrders.filter(o => o.status === 'EN_PREP'),
        LISTO: allOrders.filter(o => o.status === 'LISTO')
      });
    } catch (error) {
      console.error('Error cargando pedidos:', error);
      await showAlert(error.response?.data?.error || 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    if (updatingStatus.has(orderId)) {
      return;
    }

    if (newStatus === 'EN_PREP' || newStatus === 'LISTO') {
      const allOrders = [...orders.NUEVO, ...orders.EN_PREP, ...orders.LISTO];
      const order = allOrders.find(o => o.id === orderId);
      if (order) {
        const items = order.items || [];
        const pendingItems = items.filter(item => !item.paid_at && !item.voided_at);
        if (pendingItems.length === 0) {
          await showAlert('No se puede cambiar estado: la orden no tiene items.');
          return;
        }
      }
    }

    setUpdatingStatus(prev => new Set(prev).add(orderId));

    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      await loadOrders();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      await showAlert(error.response?.data?.error || 'Error al actualizar estado');
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleConfirmStatus = async (orderId, newStatus, message) => {
    if (await showConfirm(message)) {
      updateStatus(orderId, newStatus);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        background: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.1rem', color: '#666' }}>Cargando pedidos...</div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="caja-container" style={{ height: hideHeader ? '100%' : '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!hideHeader && (
        <header className="caja-header" style={{ flexShrink: 0 }}>
          <button onClick={() => navigate('/')} className="back-btn">← Volver</button>
          <h1>COCINA</h1>
          <div style={{ width: '100px' }}></div>
        </header>
      )}

      <div style={{ 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '1rem', 
        padding: '1rem',
        overflow: 'hidden',
        background: '#f8f9fa'
      }}>
        {/* Columna NUEVO */}
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '1rem', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h2 style={{ 
            fontSize: '1.2rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem', 
            paddingBottom: '0.5rem',
            borderBottom: '3px solid #1971c2',
            color: '#1971c2'
          }}>
            NUEVOS ({orders.NUEVO.length})
          </h2>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {orders.NUEVO.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No hay pedidos nuevos</p>
            ) : (
              orders.NUEVO.map(order => (
                <OrderCard key={order.id} order={order} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} />
              ))
            )}
          </div>
        </div>

        {/* Columna EN_PREP */}
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '1rem', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h2 style={{ 
            fontSize: '1.2rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem', 
            paddingBottom: '0.5rem',
            borderBottom: '3px solid #f59f00',
            color: '#f59f00'
          }}>
            EN PREPARACIÓN ({orders.EN_PREP.length})
          </h2>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {orders.EN_PREP.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No hay pedidos en preparación</p>
            ) : (
              orders.EN_PREP.map(order => (
                <OrderCard key={order.id} order={order} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} />
              ))
            )}
          </div>
        </div>

        {/* Columna LISTO */}
        <div style={{ 
          background: 'white', 
          borderRadius: '12px', 
          padding: '1rem', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h2 style={{ 
            fontSize: '1.2rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem', 
            paddingBottom: '0.5rem',
            borderBottom: '3px solid #2b8a3e',
            color: '#2b8a3e'
          }}>
            LISTOS ({orders.LISTO.length})
          </h2>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {orders.LISTO.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No hay pedidos listos</p>
            ) : (
              orders.LISTO.map(order => (
                <OrderCard key={order.id} order={order} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de detalle de orden */}
      {selectedOrder && (
        <div 
          onClick={() => setSelectedOrder(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>
                {selectedOrder.daily_no ? `ORDEN ${selectedOrder.daily_no}` : selectedOrder.code}
              </h2>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
              <div>Fecha: {new Date(selectedOrder.created_at).toLocaleString('es-CO')}</div>
              {selectedOrder.table_label && (
                <div>Mesa: {selectedOrder.table_label}</div>
              )}
              <div>Estado: <strong>{selectedOrder.status}</strong></div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 'bold' }}>Items:</h3>
              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.75rem',
                        background: '#f8f9fa',
                        borderRadius: '6px',
                        border: '1px solid #ddd'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#F5BB4C', marginRight: '0.5rem' }}>{item.qty}x</span>
                        {item.name}
                      </div>
                      {item.notes && (
                        <div style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                          Notas: {item.notes}
                        </div>
                      )}
                      <div style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                        {formatPriceCOP(item.price)} c/u
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#999', textAlign: 'center', padding: '1rem' }}>No hay items</p>
              )}
            </div>
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
    </>
  );
}
