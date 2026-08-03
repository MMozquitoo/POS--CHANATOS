import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { statusLabel } from '../../utils/statusLabels.js';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { notifyDesktop, playKitchenChime, unlockAudio } from '../../utils/kitchenSound';

/* OrderCard extracted outside CocinaCaja to avoid re-creating on every render */
function OrderCard({ order, selectedOrderId, onSelect, isUpdating, onConfirmStatus, onCobrar }) {
  const getActionButton = () => {
    if (order.status === 'NUEVO') {
      return (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onConfirmStatus(order.id, 'EN_PREP', '¿Enviar esta orden a preparación?');
          }}
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
          onClick={(e) => {
            e.stopPropagation();
            onConfirmStatus(order.id, 'LISTO', '¿Marcar esta orden como LISTO?');
          }}
          disabled={isUpdating}
          className={isUpdating ? 'btn-secondary' : 'btn-success'}
          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
        >
          {isUpdating ? 'Marcando...' : 'Marcar Listo'}
        </button>
      );
    } else if (order.status === 'LISTO' && onCobrar) {
      // Cobro directo desde el tablero de cocina: sin recorrer la app
      // buscando el pedido (dueño, 2026-08-02)
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onCobrar(order); }}
          className="btn-chanatos"
          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', fontWeight: 800 }}
        >
          COBRAR
        </button>
      );
    }
    return null;
  };

  // FASE F7: avance plato por plato
  const activeItems = order.items?.filter(item => !item.voided_at) || [];
  const readyCount = activeItems.filter(item => item.ready_at).length;

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
          {order.status === 'EN_PREP' && activeItems.length > 1 && (
            <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, background: readyCount > 0 ? '#FFF3D6' : '#f0f0f0', color: readyCount > 0 ? '#B8860B' : '#888' }}>
              {readyCount}/{activeItems.length}
            </span>
          )}
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

      {/* Items visibles directamente en la tarjeta (igual que la vista de Cocina
          real) — antes solo decía "N item(s)" y había que tocar la tarjeta para
          ver qué era cada uno. */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {activeItems.length === 0 ? (
          <div style={{ color: '#999', fontSize: '0.85rem' }}>Sin items</div>
        ) : activeItems.map((item, idx) => (
          <div
            key={item.id ?? idx}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.4rem',
              fontSize: '0.9rem',
              color: item.ready_at ? '#999' : '#333',
              textDecoration: item.ready_at ? 'line-through' : 'none',
            }}
          >
            {item.ready_at && <span style={{ color: '#2ecc71', textDecoration: 'none' }}>✓</span>}
            <span style={{ fontWeight: 700, color: item.ready_at ? '#999' : '#F5BB4C' }}>{item.qty}x</span>
            <span>{item.name}</span>
            {item.notes && <span style={{ color: '#888', fontSize: '0.8rem' }}>({item.notes})</span>}
          </div>
        ))}
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
  // FASE M15: en móvil las 3 columnas apiladas con su propio scroll interno
  // (scroll sobre scroll) confundían más de lo que ayudaban. En vez de eso,
  // se elige UNA sección a la vez (como pestañas); en desktop, con espacio de
  // sobra, siguen viéndose las 3 lado a lado y este estado no se usa.
  const [mobileSection, setMobileSection] = useState('NUEVO');

  // Desbloquear el chime de Web Audio al primer toque — solo cuando esta vista
  // corre "sola" (ruta /cocina); embebida en Centro Total, CentroTotal.jsx ya
  // lo desbloquea a nivel de toda la pantalla.
  useEffect(() => {
    if (hideHeader) return;
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, [hideHeader]);

  useEffect(() => {
    loadOrders();

    if (socket) {
      socket.on('order:new', (data) => {
        loadOrders();
        // Sonido + notificación nativa: solo cuando esta vista corre "sola" (ruta
        // /cocina, hideHeader=false). Cuando está embebida dentro de Centro Total
        // (hideHeader=true) el aviso ya lo dispara CentroTotal.jsx a nivel de toda
        // la pantalla, para no duplicarlo aquí.
        if (!hideHeader) {
          playKitchenChime();
          const order = data?.order;
          const label = order?.daily_no ? `Orden ${order.daily_no}` : (order?.code || 'Pedido nuevo');
          const items = order?.items?.length;
          notifyDesktop({
            title: 'Nueva orden en cocina',
            body: items ? `${label} — ${items} item${items === 1 ? '' : 's'}` : label,
          });
        }
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
  }, [socket, hideHeader]);

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

  // FASE F7: marcar/desmarcar un plato terminado desde el detalle (solo EN_PREP)
  const toggleItemReady = async (item) => {
    try {
      const res = await axios.patch(`/orders/items/${item.id}/ready`, { ready: !item.ready_at });
      // Refrescar el modal con la orden actualizada (incluye auto-avance a LISTO)
      setSelectedOrder(res.data.order);
      loadOrders();
    } catch (error) {
      console.error('Error marcando plato:', error);
      await showAlert(error.response?.data?.error || 'Error al marcar el plato');
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
    <div className="caja-container cocina-caja-shell" style={{ height: hideHeader ? '100%' : '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {!hideHeader && (
        // position:'relative' explícito -- igual que CajaHeader.jsx: este
        // header vive fuera del área que hace scroll (el tablero de abajo
        // scrollea aparte), así que "sticky" (el default de .caja-header en
        // mobile-polish.css) no cumple ninguna función acá, y combinado con
        // el contenedor padre en 100dvh/overflow:hidden es el mismo bug de
        // iOS Safari que hacía desaparecer el header en Centro de Control.
        <header className="caja-header" style={{ flexShrink: 0, position: 'relative' }}>
          <button onClick={() => navigate('/')} className="back-btn">← Volver</button>
          <h1>COCINA</h1>
          <div style={{ width: '100px' }}></div>
        </header>
      )}

      {/* Selector de sección — solo se ve en móvil (mobile-polish.css), en
          desktop las 3 columnas ya se ven juntas y esto queda oculto. */}
      <div className="cocina-caja-mobile-tabs">
        {[
          { key: 'NUEVO', label: 'Nuevos', color: '#1971c2' },
          { key: 'EN_PREP', label: 'En preparación', color: '#f59f00' },
          { key: 'LISTO', label: 'Listos', color: '#2b8a3e' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileSection(key)}
            className={`cocina-caja-mobile-tab ${mobileSection === key ? 'active' : ''}`}
            style={mobileSection === key ? { background: color, borderColor: color } : undefined}
          >
            {label} ({orders[key].length})
          </button>
        ))}
      </div>

      <div className="cocina-caja-board" style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        padding: '1rem',
        overflow: 'hidden',
        background: '#f8f9fa'
      }}>
        {/* Columna NUEVO */}
        <div className={`cocina-caja-column ${mobileSection === 'NUEVO' ? 'cocina-section-active' : ''}`} style={{
          background: 'white', 
          borderRadius: '12px', 
          padding: '1rem', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
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
          <div className="cocina-caja-column-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {orders.NUEVO.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No hay pedidos nuevos</p>
            ) : (
              orders.NUEVO.map(order => (
                <OrderCard key={order.id} order={order} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} onCobrar={(o) => navigate(`/mesa/${o.table_id}?orderId=${o.id}`)} />
              ))
            )}
          </div>
        </div>

        {/* Columna EN_PREP */}
        <div className={`cocina-caja-column ${mobileSection === 'EN_PREP' ? 'cocina-section-active' : ''}`} style={{
          background: 'white', 
          borderRadius: '12px', 
          padding: '1rem', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
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
          <div className="cocina-caja-column-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {orders.EN_PREP.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No hay pedidos en preparación</p>
            ) : (
              orders.EN_PREP.map(order => (
                <OrderCard key={order.id} order={order} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} onCobrar={(o) => navigate(`/mesa/${o.table_id}?orderId=${o.id}`)} />
              ))
            )}
          </div>
        </div>

        {/* Columna LISTO */}
        <div className={`cocina-caja-column ${mobileSection === 'LISTO' ? 'cocina-section-active' : ''}`} style={{
          background: 'white', 
          borderRadius: '12px', 
          padding: '1rem', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0
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
          <div className="cocina-caja-column-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {orders.LISTO.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>No hay pedidos listos</p>
            ) : (
              orders.LISTO.map(order => (
                <OrderCard key={order.id} order={order} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} onCobrar={(o) => navigate(`/mesa/${o.table_id}?orderId=${o.id}`)} />
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
              <div>Estado: <strong>{statusLabel(selectedOrder.status)}</strong></div>
            </div>

            {/* El cliente cambió algo con la orden ya andando: acceso directo a
                la pantalla donde se modifica (agregar items, anular, etc.) */}
            {['NUEVO', 'EN_PREP', 'LISTO'].includes(selectedOrder.status) && !selectedOrder.archived_at && (
              <button
                type="button"
                className="btn btn--secondary"
                style={{ width: '100%', marginBottom: '0.5rem' }}
                onClick={() => {
                  const o = selectedOrder;
                  setSelectedOrder(null);
                  if (o.channel === 'VENTANILLA') navigate('/ventanilla?orderId=' + o.id);
                  else if (o.channel === 'DOMICILIO') navigate('/domicilios?orderId=' + o.id);
                  else navigate(`/mesa/${o.table_id}`);
                }}
              >
                Modificar orden (agregar o anular items)
              </button>
            )}

            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>Items:</h3>
              {selectedOrder.status === 'EN_PREP' && (
                <p style={{ color: '#B8860B', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                  Toca un plato para marcarlo como terminado. Al completar todos, la orden pasa a LISTO sola.
                </p>
              )}
              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedOrder.items.filter(item => !item.voided_at).map((item, idx) => {
                    const isReady = !!item.ready_at;
                    const markable = selectedOrder.status === 'EN_PREP';
                    return (
                      <div
                        key={item.id ?? idx}
                        onClick={markable ? () => toggleItemReady(item) : undefined}
                        style={{
                          padding: '0.75rem',
                          background: isReady ? '#f4fcf7' : '#f8f9fa',
                          borderRadius: '6px',
                          border: isReady ? '1.5px solid #2ecc71' : '1px solid #ddd',
                          cursor: markable ? 'pointer' : 'default',
                          display: 'flex',
                          gap: '0.6rem',
                          alignItems: 'flex-start'
                        }}
                      >
                        {markable || isReady ? (
                          <span style={{
                            width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                            border: isReady ? '2px solid #2ecc71' : '2px solid #ccc',
                            background: isReady ? '#2ecc71' : 'white',
                            color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: 900, marginTop: '2px'
                          }}>{isReady ? '✓' : ''}</span>
                        ) : null}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', textDecoration: isReady ? 'line-through' : 'none', color: isReady ? '#999' : '#333' }}>
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
                      </div>
                    );
                  })}
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
