import { useNavigate } from 'react-router-dom';
import Modal from '../Modal';
import ModalHost from '../ModalHost';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../hooks/useModal';

const OPTION_STYLE = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '0.85rem 1rem',
  marginBottom: '0.5rem',
  background: '#f8f9fa',
  border: '1px solid #eee',
  borderRadius: '8px',
  fontWeight: 'bold',
  fontSize: '0.95rem',
  color: '#333',
  cursor: 'pointer',
};

// Menú de Caja para celular: los accesos que se usan seguido quedan a un toque
// (reportes, menú/precios, historial), y lo que casi no se toca en el día a
// día (respaldos, buscar actualización, diagnóstico) se deja detrás de
// "Más opciones" (la página /mas de siempre) para no duplicar esa lógica acá.
export default function MenuDrawer({ open, onClose, onOpenOrdenes }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  const go = (path) => {
    onClose?.();
    navigate(path);
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Menú">
        <button type="button" style={{ ...OPTION_STYLE, background: '#FFF3D6', border: '1.5px solid #F5BB4C' }} onClick={() => { onClose?.(); onOpenOrdenes?.(); }}>
          MESAS Y ÓRDENES ABIERTAS
        </button>
        <button type="button" style={{ ...OPTION_STYLE, background: '#F5BB4C', color: '#1a1a2e' }} onClick={() => go('/reportes')}>
          REPORTES DE VENTAS
        </button>
        <button type="button" style={OPTION_STYLE} onClick={() => go('/menu')}>
          MENÚ (PRECIOS)
        </button>
        <button type="button" style={OPTION_STYLE} onClick={() => go('/historial')}>
          HISTORIAL DE PAGOS
        </button>
        <button type="button" style={OPTION_STYLE} onClick={() => go('/historial-cierres')}>
          HISTORIAL DE CIERRES
        </button>
        <button type="button" style={OPTION_STYLE} onClick={() => go('/auditoria')}>
          AUDITORÍA
        </button>
        <button type="button" style={{ ...OPTION_STYLE, background: '#fff0f0', border: '1px solid #f5c6cb', color: '#a94442' }} onClick={() => go('/cierre')}>
          CIERRE DE CAJA
        </button>
        <button type="button" style={OPTION_STYLE} onClick={() => go('/mas')}>
          MÁS OPCIONES
        </button>
        <button
          type="button"
          style={{ ...OPTION_STYLE, marginTop: '0.75rem', background: '#fdecea', border: '1.5px solid #dc3545', color: '#dc3545' }}
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
