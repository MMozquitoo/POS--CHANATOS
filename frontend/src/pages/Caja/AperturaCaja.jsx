import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../../contexts/ConnectionContext';
import axios from 'axios';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';
import Modal from '../../components/Modal';
import { useAlert } from '../../hooks/useModal';

export default function AperturaCaja() {
  const navigate = useNavigate();
  const { isOnline } = useConnection();
  const { alertState, showAlert, closeAlert } = useAlert();
  const [initialCash, setInitialCash] = useState('');
  const [opening, setOpening] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      const res = await axios.get('/cash/session/active');
      if (res.data.active && res.data.session) {
        setHasActiveSession(true);
      } else {
        setHasActiveSession(false);
      }
    } catch (error) {
      console.error('Error verificando sesión:', error);
      setHasActiveSession(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async () => {
    const cash = parseFloat(initialCash);
    if (isNaN(cash) || cash < 0) {
      await showAlert('Ingresa un monto válido (>= 0)');
      return;
    }

    setOpening(true);
    try {
      await axios.post('/cash/open', { initialCash: cash });
      // Al éxito, navegar a /centro
      navigate('/centro');
    } catch (error) {
      console.error('Error abriendo caja:', error);
      if (error.response?.status === 409) {
        await showAlert('Ya hay una caja abierta. Redirigiendo...');
        await checkActiveSession();
        setHasActiveSession(true);
      } else {
        await showAlert(error.response?.data?.error || 'Error al abrir caja');
      }
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <div className="caja-container">
        <CajaHeader title="APERTURA DE CAJA" backTo="/centro" />
        <div className="caja-content caja-page" style={{ textAlign: 'center' }}>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  // Si ya hay sesión activa
  if (hasActiveSession) {
    return (
      <div className="caja-container">
        <CajaHeader title="APERTURA DE CAJA" backTo="/centro" />
        <div className="caja-content caja-page" style={{ maxWidth: '600px' }}>
          <div className="caja-stat-card" style={{
            border: '2px solid #28a745',
            background: '#d4edda'
          }}>
            <h2 style={{ color: '#155724', marginBottom: '1rem' }}>Ya hay una caja abierta</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              No puedes abrir otra sesión mientras haya una activa.
            </p>
            <button
              onClick={() => navigate('/centro')}
              className="btn-chanatos"
            >
              IR AL DASHBOARD
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="caja-container">
      <CajaHeader title="APERTURA DE CAJA" backTo="/centro" />
      <div className="caja-content caja-page" style={{ maxWidth: '600px' }}>
        <div className="caja-stat-card" style={{
          border: '2px solid #F5BB4C',
          textAlign: 'left'
        }}>
          <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', textAlign: 'center', color: '#333' }}>
            APERTURA DE CAJA
          </h2>
          <p style={{ color: '#666', marginBottom: '1.5rem', textAlign: 'center' }}>
            Ingresa el efectivo inicial para abrir caja.
          </p>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: 'bold',
              fontSize: '1rem',
              color: '#333'
            }}>
              Efectivo inicial:
            </label>
            <input
              type="number"
              value={initialCash}
              onChange={(e) => setInitialCash(e.target.value)}
              placeholder="0"
              min="0"
              step="100"
              required
              disabled={opening || !isOnline}
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

          <button
            onClick={handleOpen}
            disabled={opening || !initialCash || isNaN(parseFloat(initialCash)) || parseFloat(initialCash) < 0 || !isOnline}
            className="btn-success"
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1.2rem'
            }}
          >
            {opening ? 'Abriendo...' : 'ABRIR CAJA'}
          </button>
        </div>
      </div>

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
    </div>
  );
}
