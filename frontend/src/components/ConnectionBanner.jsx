import { useNavigate } from 'react-router-dom';
import { useConnection } from '../contexts/ConnectionContext';

/**
 * PASO 14.3: Banner global que muestra estado de conexión
 * Solo se muestra cuando isOnline === false
 */
export default function ConnectionBanner() {
  const navigate = useNavigate();
  const { isOnline, lastError, checkNow } = useConnection();

  // No renderizar si está online
  if (isOnline) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2000,
        background: '#dc3545',
        color: 'white',
        padding: '0.75rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
      }}
    >
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.25rem' }}>
          SIN CONEXIÓN AL SERVIDOR
        </div>
        {lastError && (
          <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
            {lastError}
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={checkNow}
          style={{
            padding: '0.5rem 1rem',
            background: 'white',
            color: '#dc3545',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          REINTENTAR
        </button>
        
        <button
          onClick={() => navigate('/config-servidor')}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '6px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          SERVIDOR
        </button>
      </div>
    </div>
  );
}
