import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { playKitchenChime, unlockAudio } from '../../utils/kitchenSound';
import './Cocina.css';

const byCreatedAt = (a, b) => new Date(a.created_at) - new Date(b.created_at);

export default function Cocina() {
  const [orders, setOrders] = useState({ NUEVO: [], EN_PREP: [], LISTO: [] });
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('cocina_sonido') !== 'off');
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  // Snapshot para detectar trabajo nuevo (órdenes o items agregados) y sonar
  const snapshotRef = useRef({ ids: new Set(), pendingItems: 0, initialized: false });
  const { socket, logout } = useAuth();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  useEffect(() => {
    loadOrders();

    // Desbloquear audio en la primera interacción (política de autoplay)
    document.addEventListener('pointerdown', unlockAudio, { once: true });

    // Cronómetro de espera de los pedidos
    const timer = setInterval(() => setNow(Date.now()), 15000);

    if (socket) {
      socket.on('order:new', loadOrders);
      socket.on('order:status-changed', loadOrders);
      // Items agregados/editados en una orden ya visible (ej. cliente pide algo más)
      socket.on('order:updated', loadOrders);
      socket.on('item:updated', loadOrders);
      socket.on('item:deleted', loadOrders);
      socket.on('item:voided', loadOrders);
      socket.on('order:archived', loadOrders);
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('pointerdown', unlockAudio);
      if (socket) {
        socket.off('order:new', loadOrders);
        socket.off('order:status-changed', loadOrders);
        socket.off('order:updated', loadOrders);
        socket.off('item:updated', loadOrders);
        socket.off('item:deleted', loadOrders);
        socket.off('item:voided', loadOrders);
        socket.off('order:archived', loadOrders);
      }
    };
  }, [socket]);

  const loadOrders = async () => {
    try {
      // Cocina solo ve pedidos no archivados (kitchen=true filtra archived_at IS NULL)
      const res = await axios.get('/orders?kitchen=true');
      const allOrders = res.data.filter(o => o.status !== 'CANCELADO');

      setOrders({
        NUEVO: allOrders.filter(o => o.status === 'NUEVO').sort(byCreatedAt),
        EN_PREP: allOrders.filter(o => o.status === 'EN_PREP').sort(byCreatedAt),
        LISTO: allOrders.filter(o => o.status === 'LISTO').sort(byCreatedAt)
      });

      // Detectar trabajo nuevo para la alerta sonora:
      // una orden desconocida o más items pendientes que antes
      const pending = allOrders.filter(o => o.status === 'NUEVO' || o.status === 'EN_PREP');
      const ids = new Set(pending.map(o => o.id));
      const pendingItems = pending.reduce(
        (sum, o) => sum + (o.items?.filter(i => !i.voided_at).length || 0), 0
      );
      const prev = snapshotRef.current;
      const hasNewWork =
        [...ids].some(id => !prev.ids.has(id)) || pendingItems > prev.pendingItems;

      if (prev.initialized && hasNewWork && soundOnRef.current) {
        playKitchenChime();
      }
      snapshotRef.current = { ids, pendingItems, initialized: true };
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('cocina_sonido', next ? 'on' : 'off');
    if (next) {
      unlockAudio();
      playKitchenChime();
    }
  };

  const archiveOrder = async (orderId) => {
    try {
      await axios.patch(`/orders/${orderId}/archive`);
      loadOrders();
    } catch (error) {
      console.error('Error archivando pedido:', error);
      showAlert('Error al archivar pedido');
    }
  };

  const archiveDayOrders = async () => {
    const ok = await showConfirm('¿Archivar todas las órdenes LISTO del día? Esto ocultará las órdenes archivadas de la vista.');
    if (!ok) return;

    try {
      await axios.post('/orders/archive-day');
      loadOrders();
      showAlert('Órdenes del día archivadas correctamente');
    } catch (error) {
      console.error('Error archivando órdenes del día:', error);
      showAlert('Error al archivar órdenes del día');
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      loadOrders();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      showAlert('Error al actualizar estado');
    }
  };

  // FASE F7: marcar/desmarcar un plato terminado (solo órdenes EN_PREP)
  const toggleItemReady = async (item) => {
    try {
      await axios.patch(`/orders/items/${item.id}/ready`, { ready: !item.ready_at });
      loadOrders();
    } catch (error) {
      console.error('Error marcando plato:', error);
      showAlert(error.response?.data?.error || 'Error al marcar el plato');
    }
  };

  const OrderCard = ({ order }) => {
    const elapsedMin = Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000));
    const isRecent = (now - new Date(order.created_at).getTime()) < 60000;
    // Urgencia solo mientras hay trabajo pendiente
    const urgency = order.status === 'LISTO' ? 'done'
      : elapsedMin >= 20 ? 'late'
      : elapsedMin >= 10 ? 'warn'
      : 'ok';

    const activeItems = order.items?.filter(item => !item.voided_at) || [];
    const readyCount = activeItems.filter(item => item.ready_at).length;
    const markable = order.status === 'EN_PREP';

    const getActionButton = () => {
      if (order.status === 'NUEVO') {
        return (
          <button
            className="action-btn iniciar-btn"
            onClick={() => updateStatus(order.id, 'EN_PREP')}
          >
            INICIAR
          </button>
        );
      } else if (order.status === 'EN_PREP') {
        return (
          <button
            className="action-btn listo-btn"
            onClick={() => updateStatus(order.id, 'LISTO')}
          >
            TODO LISTO
          </button>
        );
      } else if (order.status === 'LISTO') {
        return (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="action-btn devolver-btn"
              onClick={() => updateStatus(order.id, 'EN_PREP')}
              title="Devolver a preparación"
            >
              ↩
            </button>
            <button
              className="action-btn archivar-btn"
              onClick={() => archiveOrder(order.id)}
              style={{ flex: 1 }}
            >
              ARCHIVAR
            </button>
          </div>
        );
      }
      return null;
    };

    return (
      <div className={`order-card-kitchen ${isRecent && order.status !== 'LISTO' ? 'order-card-recent' : ''}`}>
        <div className="order-header-kitchen">
          <div className="order-code-kitchen">
            {order.daily_no ? `ORDEN ${order.daily_no}` : order.code}
            {markable && activeItems.length > 1 && (
              <span className={`order-progress ${readyCount > 0 ? 'started' : ''}`}>
                {readyCount}/{activeItems.length}
              </span>
            )}
          </div>
          <div className={`order-elapsed order-elapsed-${urgency}`}>
            {order.status === 'LISTO'
              ? new Date(order.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
              : `${elapsedMin} min`}
          </div>
        </div>
        {order.table_label && (
          <div className="order-table-kitchen">Mesa: {order.table_label}</div>
        )}
        <div className="order-items-kitchen">
          {activeItems.map((item, idx) => {
            const isReady = !!item.ready_at;
            const content = (
              <>
                <span className="item-check">{isReady ? '✓' : ''}</span>
                <span className="item-qty">{item.qty}x</span>
                <span className="item-name">{item.name}</span>
                {item.notes && (
                  <span className="item-notes">({item.notes})</span>
                )}
              </>
            );
            // FASE F7: en EN_PREP cada plato es un botón (tocar = terminado / deshacer)
            if (markable) {
              return (
                <button
                  key={item.id ?? idx}
                  type="button"
                  className={`order-item-kitchen item-touchable ${isReady ? 'item-ready' : readyCount > 0 ? 'item-pending-hot' : ''}`}
                  onClick={() => toggleItemReady(item)}
                >
                  {content}
                </button>
              );
            }
            return (
              <div key={item.id ?? idx} className={`order-item-kitchen ${isReady && order.status === 'LISTO' ? 'item-ready' : ''}`}>
                {content}
              </div>
            );
          })}
        </div>
        {getActionButton()}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Cargando pedidos...</div>;
  }

  return (
    <div className="cocina-container">
      <header className="cocina-header">
        <h1>COCINA</h1>
        <div className="header-actions">
          <button
            onClick={toggleSound}
            className="sound-toggle-btn"
            title={soundOn ? 'Silenciar alertas' : 'Activar alertas sonoras'}
          >
            {soundOn ? 'SONIDO: SÍ' : 'SONIDO: NO'}
          </button>
          {orders.LISTO.length > 0 && (
            <button onClick={archiveDayOrders} className="archive-day-btn">
              ARCHIVAR DÍA
            </button>
          )}
          <button onClick={logout} className="logout-btn">Salir</button>
        </div>
      </header>

      <div className="cocina-columns">
        <div className="cocina-column">
          <h2 className="column-title nuevo">NUEVOS ({orders.NUEVO.length})</h2>
          <div className="orders-column">
            {orders.NUEVO.length === 0 ? (
              <p className="empty-column">No hay pedidos nuevos</p>
            ) : (
              orders.NUEVO.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </div>
        </div>

        <div className="cocina-column">
          <h2 className="column-title en-prep">EN PREPARACIÓN ({orders.EN_PREP.length})</h2>
          <div className="orders-column">
            {orders.EN_PREP.length === 0 ? (
              <p className="empty-column">No hay pedidos en preparación</p>
            ) : (
              orders.EN_PREP.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </div>
        </div>

        <div className="cocina-column">
          <h2 className="column-title listo">LISTOS ({orders.LISTO.length})</h2>
          <div className="orders-column">
            {orders.LISTO.length === 0 ? (
              <p className="empty-column">No hay pedidos listos</p>
            ) : (
              orders.LISTO.map(order => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </div>
        </div>
      </div>

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
      <Modal open={confirmState.open} onClose={cancelConfirm} title={confirmState.title}
        actions={<>
          <button className="btn-secondary" onClick={cancelConfirm}>Cancelar</button>
          <button className="btn-chanatos" onClick={acceptConfirm}>Confirmar</button>
        </>}>
        <p>{confirmState.message}</p>
      </Modal>
    </div>
  );
}
