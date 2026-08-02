import { useNavigate } from 'react-router-dom';
import Modal from '../Modal';
import ModalHost from '../ModalHost';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../hooks/useModal';

// Menú de Mesero: Salir + Sabores del menú (prender/apagar sabores del día,
// ej. hoy solo hay jugo de Lulo). El resto de Mas.jsx de siempre ya lo cubre
// el "+" de la barra (Ventanilla/Domicilios); se le agrega lo que haga falta
// con el tiempo.
export default function MenuDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  return (
    <>
      <Modal open={open} onClose={onClose} title="Menú">
        <div className="list-group list-group--inset" style={{ marginBottom: '0.9rem' }}>
          <button
            type="button"
            className="list-row list-row--tap"
            style={{ cursor: 'pointer', fontWeight: 700 }}
            onClick={() => {
              onClose?.();
              navigate('/sabores');
            }}
          >
            <span className="list-row__main">Sabores del menú</span>
            <span className="list-row__chevron" aria-hidden="true">›</span>
          </button>
        </div>

        <div className="list-group list-group--inset">
          <button
            type="button"
            className="list-row list-row--tap"
            style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--red-text)' }}
            onClick={async () => {
              if (await showConfirm('¿Cerrar sesión?')) {
                onClose?.();
                logout();
              }
            }}
          >
            <span className="list-row__main">Salir</span>
          </button>
        </div>
      </Modal>
      <ModalHost confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} />
    </>
  );
}
