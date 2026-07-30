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
        <button
          type="button"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '0.85rem 1rem',
            background: '#FFF8E7',
            border: '1.5px solid #F5BB4C',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '0.95rem',
            color: '#333',
            cursor: 'pointer',
            marginBottom: '0.75rem',
          }}
          onClick={() => {
            onClose?.();
            navigate('/sabores');
          }}
        >
          SABORES DEL MENÚ
        </button>

        <button
          type="button"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '0.85rem 1rem',
            background: '#fdecea',
            border: '1.5px solid #dc3545',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '0.95rem',
            color: '#dc3545',
            cursor: 'pointer',
          }}
          onClick={async () => {
            if (await showConfirm('¿Cerrar sesión?')) {
              onClose?.();
              logout();
            }
          }}
        >
          SALIR
        </button>
      </Modal>
      <ModalHost confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} />
    </>
  );
}
