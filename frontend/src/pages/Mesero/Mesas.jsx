import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import PlanoMesas from '../../components/PlanoMesas';
import TableCard from '../../components/TableCard';
import { splitTables, getSpecialType } from '../../utils/tables';
import EmptyState from '../../components/EmptyState';
import './Mesero.css';

export default function Mesas() {
  const [tables, setTables] = useState([]);
  const [serviceCounts, setServiceCounts] = useState({ ventanilla: 0, domicilio: 0 });
  const [loading, setLoading] = useState(true);
  const [showPlano, setShowPlano] = useState(false);
  const navigate = useNavigate();
  const { logout, socket } = useAuth();

  // PASO 16.1: Declarar funciones ANTES de hooks que las usan (evitar TDZ)
  async function loadTables() {
    try {
      const res = await axios.get('/tables');
      // Mostrar todas las mesas 1-10
      const allTables = res.data.filter(t => t.number >= 1 && t.number <= 10);
      setTables(allTables);
    } catch (error) {
      console.error('Error cargando mesas:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadServiceCounts() {
    try {
      const res = await axios.get('/tables/service-counts');
      setServiceCounts(res.data);
    } catch (error) {
      console.error('Error cargando conteos de servicios:', error);
    }
  }

  // Todos los hooks deben estar después de las funciones
  useEffect(() => {
    loadTables();
    loadServiceCounts();

    if (socket) {
      socket.on('order:new', () => {
        loadServiceCounts();
      });

      socket.on('order:status-changed', () => {
        loadServiceCounts();
      });

      socket.on('payment:created', () => {
        loadServiceCounts();
      });

      return () => {
        socket.off('order:new');
        socket.off('order:status-changed');
        socket.off('payment:created');
      };
    }
  }, [socket]);

  // FASE 16.4.3.C: useCallback para evitar recrear función en cada render
  const handleMesaClick = useCallback((table) => {
    navigate(`/mesa/${table.id}`, { state: { from: '/' } });
  }, [navigate]);

  /* FASE 16.4.1: splitTables — separar mesas especiales (9/10) de regulares (1-8) */
  // Usar safe default para que splitTables siempre reciba un array
  const tablesSafe = tables || [];
  const { regularTables, specialTables } = splitTables(tablesSafe);
  
  // FASE 16.4.1: Obtener mesas especiales usando useMemo para optimización
  const ventanillaTable = useMemo(() => {
    return specialTables.find(t => getSpecialType(t) === 'VENTANILLA') || null;
  }, [specialTables]);
  
  const domiciliosTable = useMemo(() => {
    return specialTables.find(t => getSpecialType(t) === 'DOMICILIOS') || null;
  }, [specialTables]);

  // Helper functions (no hooks, pueden estar después)
  const getStatusLabel = (status) => {
    const labels = {
      libre: 'Libre',
      pedido_activo: 'Pedido activo',
      pedido_listo: 'Pedido listo'
    };
    return labels[status] || status;
  };

  const getStatusClass = (status) => {
    const classes = {
      libre: 'status-libre',
      pedido_activo: 'status-activo',
      pedido_listo: 'status-listo'
    };
    return classes[status] || '';
  };

  // Early return DESPUÉS de todos los hooks
  if (loading) {
    return <div className="loading">Cargando mesas...</div>;
  }

  return (
    <div className="mesero-container">
      <header className="mesero-header">
        <h1>MESAS</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setShowPlano(!showPlano)}
            className="toggle-btn"
            style={{
              padding: '0.5rem 1rem',
              background: showPlano ? '#007bff' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {showPlano ? 'LISTA' : 'MESAS'}
          </button>
          <button type="button" onClick={logout} className="logout-btn">
            Salir
          </button>
        </div>
      </header>

      {/* FASE 16.4.2.1: Ventanilla / Domicilios como cards tipo mesa usando TableCard */}
      {(ventanillaTable || domiciliosTable) && (
        <section 
          className="mesero-especiales" 
          aria-label="Ventanilla y Domicilios"
          style={{
            padding: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            maxWidth: '100%'
          }}
        >
          {ventanillaTable && (
            <TableCard
              title={ventanillaTable.label || 'VENTANILLA'}
              subtitle={serviceCounts.ventanilla > 0 
                ? `${serviceCounts.ventanilla} ${serviceCounts.ventanilla === 1 ? 'pedido' : 'pedidos'}`
                : undefined
              }
              number={ventanillaTable.number}
              status={ventanillaTable.status}
              onClick={() => handleMesaClick(ventanillaTable)}
              variant="waiter"
              highlight={true}
            />
          )}
          {domiciliosTable && (
            <TableCard
              title={domiciliosTable.label || 'DOMICILIOS'}
              subtitle={serviceCounts.domicilio > 0 
                ? `${serviceCounts.domicilio} ${serviceCounts.domicilio === 1 ? 'pedido' : 'pedidos'}`
                : undefined
              }
              number={domiciliosTable.number}
              status={domiciliosTable.status}
              onClick={() => handleMesaClick(domiciliosTable)}
              variant="waiter"
              highlight={true}
            />
          )}
        </section>
      )}

      {showPlano ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PlanoMesas
            tables={regularTables}
            onMesaClick={handleMesaClick}
            loadTables={loadTables}
            socket={socket}
            isCaja={false}
            serviceCounts={serviceCounts}
          />
        </div>
      ) : (
        <div 
          className="mesero-grid-mesas tables-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '1rem',
            padding: '1rem',
            flex: 1,
            overflowY: 'auto'
          }}
        >
          {regularTables.length === 0 && !ventanillaTable && !domiciliosTable ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <EmptyState
                title="No hay mesas activas"
                description="Cuando un cliente haga un pedido, aparecerá aquí."
              />
            </div>
          ) : (
            regularTables.map((table) => (
              <TableCard
                key={table.id}
                title={table.label || `Mesa ${table.number}`}
                number={table.number}
                status={table.status}
                onClick={() => navigate(`/mesa/${table.id}`, { state: { from: '/' } })}
                variant="waiter"
              />
            ))
          )}
        </div>
      )}

      <div className="mesero-footer">
        <button type="button" onClick={() => navigate('/pedidos')} className="footer-btn">
          Mis Pedidos
        </button>
      </div>
    </div>
  );
}

