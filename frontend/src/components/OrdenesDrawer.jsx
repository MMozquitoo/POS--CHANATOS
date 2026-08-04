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

// Pills de estado (fondo tenue + texto oscuro, estilo iOS)
const STATUS_PILL = {
  libre: { background: 'var(--green-tint)', color: 'var(--green-text)' },
  pedido_activo: { background: 'var(--brand-tint)', color: 'var(--brand-deep)' },
  pedido_listo: { background: 'var(--red-tint)', color: 'var(--red-text)' },
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
    // Ventanilla/Domicilios van DIRECTO a armar la orden nueva (flujo 2026-08:
    // "+" siempre crea un pedido; las órdenes vivas se ven en COBRAR/PEDIDOS)
    const type = getSpecialType(table);
    if (type === 'VENTANILLA') return navigate('/ventanilla');
    if (type === 'DOMICILIOS') return navigate('/domicilios');
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '0.9rem' }}>
              {specialTables.map((table) => {
                const type = getSpecialType(table);
                return (
                  <button
                    key={table.id}
                    type="button"
                    className="card--tap"
                    onClick={() => goToTable(table)}
                    style={{
                      padding: '1rem 0.5rem',
                      background: type === 'VENTANILLA' ? 'var(--brand-tint)' : 'var(--green-tint)',
                      border: 'none',
                      borderRadius: 'var(--radius-lg)',
                      fontWeight: 700,
                      fontSize: 'var(--text-15)',
                      color: type === 'VENTANILLA' ? 'var(--brand-deep)' : 'var(--green-text)',
                      cursor: 'pointer',
                    }}
                  >
                    {type === 'VENTANILLA' ? 'Ventanilla' : 'Domicilios'}
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
                className="card--tap"
                onClick={() => goToTable(table)}
                style={{
                  padding: '0.8rem 0.5rem 0.7rem',
                  background: 'var(--gray-50)',
                  border: 'none',
                  borderRadius: 'var(--radius-lg)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <div className="tnum" style={{ fontSize: 'var(--text-22)', fontWeight: 800, color: 'var(--gray-900)', lineHeight: 1 }}>
                  {table.number}
                </div>
                <span className="pill" style={STATUS_PILL[table.status] || { background: 'var(--gray-100)', color: 'var(--gray-600)' }}>
                  {STATUS_LABEL[table.status] || table.status}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
