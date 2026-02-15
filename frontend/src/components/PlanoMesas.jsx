import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { tablesLayout } from '../layouts/tablesLayout';
import MesaTile from './MesaTile';
import './PlanoMesas.css';

export default function PlanoMesas({ 
  tables = [], 
  onMesaClick,
  loadTables,
  socket,
  isCaja = false,
  serviceCounts = { ventanilla: 0, domicilio: 0 }
}) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (loadTables) {
      loadTables();
    }

    if (socket) {
      const events = isCaja 
        ? ['table:updated']
        : ['order:new', 'order:status-changed', 'payment:created'];
      
      events.forEach(event => {
        socket.on(event, () => {
          if (loadTables) {
            loadTables();
          }
        });
      });

      return () => {
        events.forEach(event => {
          socket.off(event);
        });
      };
    }
  }, [socket, loadTables, isCaja]);

  const handleMesaClick = (table) => {
    // Todas las mesas (1-10) se manejan igual
    if (onMesaClick) {
      onMesaClick(table);
    } else {
      console.log('Mesa clickeada:', table);
    }
  };

  // Crear mapa de mesas por número/id para acceso rápido
  const tablesMap = {};
  tables.forEach((table) => {
    const key = table.number ?? table.id;
    if (key != null) tablesMap[key] = table;
  });

  /* HOTFIX M7.1: Solo renderizar tiles para mesas que existan en `tables`.
   * Si se pasa regularTables (sin 9/10), no se muestran Ventanilla/Domicilios en el plano. */
  const layoutFiltered = tablesLayout.filter((layout) => tablesMap[layout.id]);

  return (
    <div className="plano-mesas-container">
      <div className="plano-mesas-grid">
        {layoutFiltered.map((layout) => {
          const table = tablesMap[layout.id];
          const isVentanilla = table?.number === 9;
          const isDomicilios = table?.number === 10;
          if (table && (isVentanilla || isDomicilios)) {
            return (
              <MesaTile
                key={layout.id}
                table={{
                  ...table,
                  label: isVentanilla ? 'VENTANILLA' : 'DOMICILIOS'
                }}
                layout={layout}
                onClick={handleMesaClick}
                customStyle={{
                  background: isVentanilla ? '#F5BB4C' : '#28a745',
                  color: 'white'
                }}
              />
            );
          }
          return (
            <MesaTile
              key={layout.id}
              table={table}
              layout={layout}
              onClick={handleMesaClick}
            />
          );
        })}
      </div>
    </div>
  );
}
