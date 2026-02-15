import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';

export default function MasCaja() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  
  // Detectar si está en Electron
  const isElectron = typeof window !== 'undefined' && !!window.posElectron;

  return (
    <div className="caja-container">
      <CajaHeader 
        title="OPCIONES"
        backTo="/centro"
      />
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        padding: '1rem', 
        background: '#f8f9fa', 
        borderBottom: '1px solid #ddd' 
      }}>
        <button 
          onClick={() => {
            if (window.confirm('¿Cerrar sesión?')) {
              logout();
            }
          }}
          style={{
            padding: '0.75rem 2rem',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            width: '100%',
            maxWidth: '300px'
          }}
        >
          SALIR
        </button>
      </div>

      <div className="caja-content" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {user?.role === 'CAJA' && (
            <>
              <button 
                className="action-btn" 
                style={{ 
                  background: 'white', 
                  color: '#333', 
                  fontWeight: 'bold', 
                  fontSize: '1.1rem', 
                  padding: '1.25rem',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }} 
                onClick={() => navigate('/historial-cierres')}
              >
                HISTORIAL DE CIERRES
              </button>
              <button 
                className="action-btn" 
                style={{ 
                  background: 'white', 
                  color: '#333', 
                  fontWeight: 'bold', 
                  fontSize: '1.1rem', 
                  padding: '1.25rem',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }} 
                onClick={() => navigate('/auditoria')}
              >
                AUDITORÍA
              </button>
            </>
          )}
          
          {user?.role === 'CAJA' && (
            <button 
              className="action-btn" 
              style={{ 
                background: 'white', 
                color: '#333', 
                fontWeight: 'bold', 
                fontSize: '1.1rem', 
                padding: '1.25rem',
                border: '2px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left'
              }} 
              onClick={() => navigate('/menu')}
            >
              MENÚ (PRECIOS)
            </button>
          )}
          
          <button 
            className="action-btn" 
            style={{ 
              background: 'white', 
              color: '#333', 
              fontWeight: 'bold', 
              fontSize: '1.1rem', 
              padding: '1.25rem',
              border: '2px solid #ddd',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left'
            }} 
            onClick={() => navigate('/historial')}
          >
            HISTORIAL DE PAGOS
          </button>
          
          {user?.role === 'CAJA' && (
            <>
              <button 
                className="action-btn" 
                style={{ 
                  background: 'white', 
                  color: '#333', 
                  fontWeight: 'bold', 
                  fontSize: '1.1rem', 
                  padding: '1.25rem',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }} 
                onClick={() => navigate('/config-servidor')}
              >
                SERVIDOR
              </button>
              
              <button 
                className="action-btn" 
                style={{ 
                  background: 'white', 
                  color: '#333', 
                  fontWeight: 'bold', 
                  fontSize: '1.1rem', 
                  padding: '1.25rem',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }} 
                onClick={() => navigate('/diagnostico')}
              >
                DIAGNÓSTICO
              </button>
            </>
          )}
          
          {isElectron && (
            <button 
              className="action-btn" 
              style={{ 
                background: 'white', 
                color: '#333', 
                fontWeight: 'bold', 
                fontSize: '1.1rem', 
                padding: '1.25rem',
                border: '2px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left'
              }} 
              onClick={() => navigate('/config-impresora')}
            >
              IMPRESORA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


