import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Mesero.css';

export default function EstadoPedidos() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await axios.get('/orders?mine=true');
      setOrders(res.data.filter(o => !o.paid_at && o.status !== 'CANCELADO'));
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusLabel = (status) => {
    const labels = {
      NUEVO: 'Nuevo',
      EN_PREP: 'En Preparación',
      LISTO: 'Listo',
      CANCELADO: 'Cancelado'
    };
    return labels[status] || status;
  };

  const getStatusClass = (status) => {
    const classes = {
      NUEVO: 'status-nuevo',
      EN_PREP: 'status-en-prep',
      LISTO: 'status-listo',
      CANCELADO: 'status-cancelado'
    };
    return classes[status] || '';
  };

  if (loading) {
    return <div className="loading">Cargando pedidos...</div>;
  }

  return (
    <div className="pedidos-container">
      <header className="pedidos-header">
        <button onClick={() => navigate('/')} className="back-btn">← Volver</button>
        <h1>MIS PEDIDOS</h1>
      </header>

      <div className="orders-list">
        {orders.length === 0 ? (
          <p className="empty-state">No tienes pedidos activos</p>
        ) : (
          orders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div className="order-code">{order.daily_no ? `ORDEN ${order.daily_no}` : order.code}</div>
                <div className={`order-status ${getStatusClass(order.status)}`}>
                  {getStatusLabel(order.status)}
                </div>
              </div>
              <div className="order-info">
                {order.table_label && (
                  <div className="order-table">Mesa: {order.table_label}</div>
                )}
                <div className="order-time">
                  {new Date(order.created_at).toLocaleTimeString()}
                </div>
              </div>
              <div className="order-items">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="order-item">
                    {item.qty}x {item.name}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

