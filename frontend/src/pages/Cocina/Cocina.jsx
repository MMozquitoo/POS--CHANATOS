import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './Cocina.css';

export default function Cocina() {
  const [orders, setOrders] = useState({ NUEVO: [], EN_PREP: [], LISTO: [] });
  const [loading, setLoading] = useState(true);
  const { socket, logout } = useAuth();

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

      return () => {
        socket.off('order:new');
        socket.off('order:status-changed');
        socket.off('order:archived');
      };
    }
  }, [socket]);

  const loadOrders = async () => {
    try {
      // Cocina solo ve pedidos no archivados (kitchen=true filtra archived_at IS NULL)
      const res = await axios.get('/orders?kitchen=true');
      const allOrders = res.data.filter(o => o.status !== 'CANCELADO');
      
      setOrders({
        NUEVO: allOrders.filter(o => o.status === 'NUEVO'),
        EN_PREP: allOrders.filter(o => o.status === 'EN_PREP'),
        LISTO: allOrders.filter(o => o.status === 'LISTO')
      });
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const archiveOrder = async (orderId) => {
    try {
      await axios.patch(`/orders/${orderId}/archive`);
      loadOrders();
    } catch (error) {
      console.error('Error archivando pedido:', error);
      alert('Error al archivar pedido');
    }
  };

  const archiveDayOrders = async () => {
    if (!confirm('¿Archivar todas las órdenes LISTO del día? Esto ocultará las órdenes archivadas de la vista.')) {
      return;
    }
    
    try {
      await axios.post('/orders/archive-day');
      loadOrders();
      alert('Órdenes del día archivadas correctamente');
    } catch (error) {
      console.error('Error archivando órdenes del día:', error);
      alert('Error al archivar órdenes del día');
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      loadOrders();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      alert('Error al actualizar estado');
    }
  };

  const OrderCard = ({ order }) => {
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
            LISTO
          </button>
        );
      } else if (order.status === 'LISTO') {
        return (
          <button
            className="action-btn archivar-btn"
            onClick={() => archiveOrder(order.id)}
          >
            ARCHIVAR
          </button>
        );
      }
      return null;
    };

    return (
      <div className="order-card-kitchen">
        <div className="order-header-kitchen">
          <div className="order-code-kitchen">
            {order.daily_no ? `ORDEN ${order.daily_no}` : order.code}
          </div>
          <div className="order-time-kitchen">
            {new Date(order.created_at).toLocaleTimeString()}
          </div>
        </div>
        {order.table_label && (
          <div className="order-table-kitchen">Mesa: {order.table_label}</div>
        )}
        <div className="order-items-kitchen">
          {order.items?.map((item, idx) => (
            <div key={idx} className="order-item-kitchen">
              <span className="item-qty">{item.qty}x</span>
              <span className="item-name">{item.name}</span>
              {item.notes && (
                <span className="item-notes">({item.notes})</span>
              )}
            </div>
          ))}
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
    </div>
  );
}

