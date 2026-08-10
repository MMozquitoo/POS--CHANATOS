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
          style={{ padding: '0.75rem 2rem' }}
        >
          SALIR
        </button>
      </div>

      <div className="caja-content caja-page">
        <div className="caja-menu-list">
          {user?.role === 'CAJA' && (
            <>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/reportes')}
                style={{ background: '#F5BB4C', color: '#1a1a2e', fontWeight: 'bold' }}
              >
                REPORTES DE VENTAS
              </button>
              {/* Junta HISTORIAL DE CIERRES + HISTORIAL DE PAGOS (pestañas adentro) */}
              <button
                className="caja-menu-option"
                onClick={() => navigate('/historial')}
              >
                HISTORIAL
              </button>
              {/* Compras junta Registrar compra + Ingredientes + Gastos
                  generales (pestañas adentro) — ver Compras.jsx */}
              <button
                className="caja-menu-option"
                onClick={() => navigate('/compras')}
                style={{ background: '#B8860B', color: 'white', fontWeight: 'bold' }}
              >
                COMPRAS
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
            <>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/menu')}
              >
                MENÚ (PRECIOS)
              </button>
            </>
          )}

          {user?.role === 'CAJA' && (
            <>
              {/* Junta BUSCAR ACTUALIZACIONES + DESCARGAR DATOS + RESTAURAR + BACKUP */}
              <button
                className="caja-menu-option"
                onClick={() => navigate('/aplicacion')}
                style={{ background: '#2e7d32', color: 'white', fontWeight: 'bold' }}
              >
                APLICACIÓN
              </button>

              {/* Junta SERVIDOR + DIAGNÓSTICO (pestañas adentro) */}
              <button
                className="caja-menu-option"
                onClick={() => navigate('/conexion')}
              >
                CONEXIÓN
              </button>
            </>
          )}

          {isElectron && (
            <button
              className="caja-menu-option"
              onClick={() => navigate('/impresora')}
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
