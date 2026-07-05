import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function MasCaja() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
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
          onClick={async () => {
            if (await showConfirm('¿Cerrar sesión?')) {
              logout();
            }
          }}
          className="btn-danger"
          style={{ width: '100%', maxWidth: '300px', padding: '0.75rem 2rem' }}
        >
          SALIR
        </button>
      </div>

      <div className="caja-content caja-page">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {user?.role === 'CAJA' && (
            <>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/historial-cierres')}
              >
                HISTORIAL DE CIERRES
              </button>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/auditoria')}
              >
                AUDITORÍA
              </button>
            </>
          )}

          {user?.role === 'CAJA' && (
            <button
              className="caja-menu-option"
              onClick={() => navigate('/menu')}
            >
              MENÚ (PRECIOS)
            </button>
          )}

          <button
            className="caja-menu-option"
            onClick={() => navigate('/historial')}
          >
            HISTORIAL DE PAGOS
          </button>

          {user?.role === 'CAJA' && (
            <>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/config-servidor')}
              >
                SERVIDOR
              </button>

              <button
                className="caja-menu-option"
                onClick={() => navigate('/diagnostico')}
              >
                DIAGNÓSTICO
              </button>
            </>
          )}

          {isElectron && (
            <button
              className="caja-menu-option"
              onClick={() => navigate('/config-impresora')}
            >
              IMPRESORA
            </button>
          )}
        </div>
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}


