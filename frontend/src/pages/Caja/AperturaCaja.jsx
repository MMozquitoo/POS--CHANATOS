import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../../contexts/ConnectionContext';
import axios from 'axios';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';

export default function AperturaCaja() {
  const navigate = useNavigate();
  const { isOnline } = useConnection();
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
      alert('Ingresa un monto válido (>= 0)');
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
        alert('Ya hay una caja abierta. Redirigiendo...');
        await checkActiveSession();
        setHasActiveSession(true);
      } else {
        alert(error.response?.data?.error || 'Error al abrir caja');
      }
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <div className="caja-container">
        <CajaHeader title="APERTURA DE CAJA" backTo="/centro" />
        <div className="caja-content" style={{ textAlign: 'center', padding: '2rem' }}>
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
        <div className="caja-content" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
          <div style={{ 
            background: '#d4edda', 
            padding: '2rem', 
            borderRadius: '12px',
            border: '2px solid #28a745',
            textAlign: 'center'
          }}>
            <h2 style={{ color: '#155724', marginBottom: '1rem' }}>Ya hay una caja abierta</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              No puedes abrir otra sesión mientras haya una activa.
            </p>
            <button
              onClick={() => navigate('/centro')}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
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
      <div className="caja-content" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ 
          background: 'white', 
          padding: '2rem', 
          borderRadius: '12px',
          border: '2px solid #007bff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
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
                border: '2px solid #007bff',
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
            style={{
              width: '100%',
              padding: '1rem',
              background: opening || !isOnline ? '#ccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: opening || !isOnline ? 'not-allowed' : 'pointer',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              boxShadow: opening || !isOnline ? 'none' : '0 4px 12px rgba(40, 167, 69, 0.4)',
              opacity: opening || !isOnline ? 0.6 : 1
            }}
          >
            {opening ? 'Abriendo...' : 'ABRIR CAJA'}
          </button>
        </div>
      </div>
    </div>
  );
}
