import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Modal from './Modal';
import { splitTables, getSpecialType } from '../utils/tables.js';

const STATUS_LABEL = {
  libre: 'Libre',
  pedido_activo: 'Activa',
  pedido_listo: 'Lista',
};

const STATUS_COLOR = {
  libre: '#28a745',
  pedido_activo: '#F5BB4C',
  pedido_listo: '#dc3545',
};

// Reemplaza el panel "Mesas" que antes vivía fijo dentro de DetalleMesa
// (grid 1-8 + Ventanilla/Domicilios, ocupando media pantalla en el celular).
// Ahora es un panel bajo demanda: se abre desde el botón "+" de la barra
// inferior o desde el menú ☰, y se cierra solo al elegir una mesa.
export default function OrdenesDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTables = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/tables');
      setTables(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error cargando mesas:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadTables();
  }, [open, loadTables]);

  const goToTable = (table) => {
    onClose?.();
    navigate(`/mesa/${table.id}`);
  };

  const { regularTables, specialTables } = splitTables(tables);

  return (
    <Modal open={open} onClose={onClose} title="Mesas y órdenes">
      {loading ? (
        <p style={{ color: '#666', textAlign: 'center' }}>Cargando...</p>
      ) : (
        <>
          {specialTables.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
              {specialTables.map((table) => {
                const type = getSpecialType(table);
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => goToTable(table)}
                    style={{
                      padding: '1rem 0.5rem',
                      background: type === 'VENTANILLA' ? '#FFF3D6' : '#e8f7ec',
                      border: `2px solid ${type === 'VENTANILLA' ? '#F5BB4C' : '#28a745'}`,
                      borderRadius: '10px',
                      fontWeight: 'bold',
                      fontSize: '0.95rem',
                      color: '#333',
                      cursor: 'pointer',
                    }}
                  >
                    {type === 'VENTANILLA' ? 'VENTANILLA' : 'DOMICILIOS'}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
            {regularTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => goToTable(table)}
                style={{
                  padding: '0.9rem 0.5rem',
                  background: 'white',
                  border: `2px solid ${STATUS_COLOR[table.status] || '#ddd'}`,
                  borderRadius: '10px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333' }}>{table.number}</div>
                <div style={{ fontSize: '0.75rem', color: STATUS_COLOR[table.status] || '#999', fontWeight: 'bold' }}>
                  {STATUS_LABEL[table.status] || table.status}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
