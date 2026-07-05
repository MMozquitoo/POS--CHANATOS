import { useState, useEffect } from 'react';
import { useConnection } from '../../contexts/ConnectionContext';
import ModalHost from '../ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

/**
 * Modal para abrir caja
 * FASE 17.2: Modal simple y seguro para apertura de caja
 * FASE 17.8: Persistencia de monto sugerido
 */
export default function OpenCashModal({ isOpen, onClose, onConfirm, loading = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const { isOnline } = useConnection();
  const [initialCash, setInitialCash] = useState('');

  // FASE 17.8: Cargar último monto usado al abrir el modal
  useEffect(() => {
    if (isOpen) {
      const lastCash = localStorage.getItem('last_initial_cash');
      if (lastCash) {
        setInitialCash(lastCash);
      }
    } else {
      // Limpiar cuando se cierra (opcional, para que no quede el valor si cancelan)
      // setInitialCash('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const cash = parseFloat(initialCash);
    if (isNaN(cash) || cash < 0) {
      showAlert('Ingresa un monto válido (>= 0)');
      return;
    }
    onConfirm(cash);
  };

  const handleCancel = () => {
    setInitialCash('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '1rem'
      }}
      onClick={handleCancel}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center', color: '#333' }}>
          ABRIR CAJA
        </h2>
        
        <p style={{ color: '#666', marginBottom: '1.5rem', textAlign: 'center' }}>
          Ingresa el efectivo inicial para abrir caja.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: 'bold',
              fontSize: '1rem',
              color: '#333'
            }}>
              Efectivo inicial: *
            </label>
            <input
              type="number"
              value={initialCash}
              onChange={(e) => setInitialCash(e.target.value)}
              placeholder="0"
              min="0"
              step="100"
              required
              disabled={loading || !isOnline}
              autoFocus
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '1.2rem',
                border: '2px solid #F5BB4C',
                borderRadius: '8px',
                textAlign: 'right',
                fontWeight: 'bold',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Mensaje cuando no hay conexión */}
          {!isOnline && (
            <div style={{
              padding: '0.75rem',
              background: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              marginBottom: '1rem',
              textAlign: 'center',
              fontSize: '0.9rem',
              color: '#856404',
              fontWeight: 'bold'
            }}>
              No hay conexión. Operación no disponible.
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                opacity: loading ? 0.6 : 1
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !initialCash || isNaN(parseFloat(initialCash)) || parseFloat(initialCash) < 0 || !isOnline}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: loading || !isOnline ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading || !isOnline ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                boxShadow: loading || !isOnline ? 'none' : '0 4px 12px rgba(40, 167, 69, 0.4)',
                opacity: loading || !isOnline ? 0.6 : 1
              }}
            >
              {loading ? 'Abriendo...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
