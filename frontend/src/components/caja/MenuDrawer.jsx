import { useNavigate } from 'react-router-dom';
import Modal from '../Modal';
import ModalHost from '../ModalHost';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../hooks/useModal';

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

  const Row = ({ label, onClick, danger, strong }) => (
    <button
      type="button"
      className="list-row list-row--tap"
      style={{
        cursor: 'pointer',
        fontWeight: strong ? 700 : 500,
        color: danger ? 'var(--red-text)' : undefined,
      }}
      onClick={onClick}
    >
      <span className="list-row__main">{label}</span>
      <span className="list-row__chevron" aria-hidden="true">›</span>
    </button>
  );

  return (
    <>
      <Modal open={open} onClose={onClose} title="Menú">
        <div className="list-group list-group--inset" style={{ marginBottom: '0.9rem' }}>
          <Row label="Mesas y órdenes abiertas" strong onClick={() => { onClose?.(); onOpenOrdenes?.(); }} />
          <Row label="Reportes de ventas" strong onClick={() => go('/reportes')} />
          <Row label="Menú y precios" onClick={() => go('/menu')} />
          <Row label="Historial de pagos" onClick={() => go('/historial')} />
          <Row label="Historial de cierres" onClick={() => go('/historial-cierres')} />
          <Row label="Gastos de caja" onClick={() => go('/historial-caja')} />
          <Row label="Auditoría" onClick={() => go('/auditoria')} />
          <Row label="Más opciones" onClick={() => go('/mas')} />
        </div>

        <div className="list-group list-group--inset">
          <Row label="Cierre de caja" danger strong onClick={() => go('/cierre')} />
          <Row
            label="Salir"
            danger
            onClick={async () => {
              if (await showConfirm('¿Cerrar sesión?')) {
                onClose?.();
                logout();
              }
            }}
          />
        </div>
      </Modal>
      <ModalHost confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} />
    </>
  );
}
