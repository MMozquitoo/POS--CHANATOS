import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import PlanoMesas from '../../components/PlanoMesas';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';

export default function MesasAbiertas() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPlano, setShowPlano] = useState(true); // Por defecto mostrar plano
  const navigate = useNavigate();
  const { logout, socket } = useAuth();

  useEffect(() => {
    loadTables();

    if (socket) {
      socket.on('table:updated', () => {
        loadTables();
      });

      return () => {
        socket.off('table:updated');
      };
    }
  }, [socket]);

  const loadTables = async () => {
    try {
      // Ahora mostramos TODAS las mesas (habilitadas o no)
      const res = await axios.get('/cash/tables');
      setTables(res.data);
    } catch (error) {
      console.error('Error cargando mesas abiertas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMesaClick = (table) => {
    navigate(`/mesa/${table.id}`, { state: { from: '/mesas' } });
  };

  if (loading) {
    return <div className="loading">Cargando mesas...</div>;
  }

  return (
    <div className="mesas-abiertas-container">
      <header className="mesas-abiertas-header">
        <button onClick={() => navigate('/')} className="back-btn">← Volver</button>
        <h1>MESAS ABIERTAS</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={() => setShowPlano(!showPlano)} 
            className="toggle-btn"
            style={{
              padding: '0.5rem 1rem',
              background: showPlano ? '#6c757d' : '#F5BB4C',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {showPlano ? 'LISTA/MENÚ' : 'MESAS'}
          </button>
          <button onClick={logout} className="logout-btn">Salir</button>
        </div>
      </header>

      <div className="mesas-abiertas-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {showPlano ? (
          <PlanoMesas
            tables={tables}
            onMesaClick={handleMesaClick}
            loadTables={loadTables}
            socket={socket}
            isCaja={true}
          />
        ) : (
          tables.length === 0 ? (
            <div className="empty-state">
              <p>No hay mesas</p>
            </div>
          ) : (
            <div className="tables-list-caja">
              {tables.map(table => (
                <button
                  key={table.id}
                  className="table-card-caja"
                  onClick={() => navigate(`/mesa/${table.id}`, { state: { from: '/mesas' } })}
                >
                  <div className="table-header-caja">
                    <div className="table-number-caja">{table.number}</div>
                    <div className="table-label-caja">{table.label || `Mesa ${table.number}`}</div>
                  </div>
                  <div className="table-info-caja">
                    <div className="table-stats">
                      <span>{table.pending_items} items pendientes</span>
                      {table.has_disabled_orders && <span>Comandas deshabilitadas</span>}
                    </div>
                    <div className="table-total-caja">
                      {formatPriceCOP(Number(table.pending_total || 0))}
                    </div>
                  </div>
                  <div className="table-footer-caja">
                    <span className="last-activity">Ver detalle</span>
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </div>

      <div className="mesas-abiertas-footer">
        <button onClick={() => navigate('/cobrar')} className="footer-btn">
          Cobrar Pedidos Listos
        </button>
      </div>
    </div>
  );
}

