import { useNavigate, useLocation } from 'react-router-dom';
import Modal from '../Modal';
import ModalHost from '../ModalHost';
import Icon from '../ui/Icon';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../hooks/useModal';
import { MAIN_NAV, ADMIN_NAV } from '../shell/cajaNav';
import CajaDelDiaButton from '../shell/CajaDelDiaButton';
import useSonidoCaja from '../../hooks/useSonidoCaja';

// Menú de Caja para celular (rediseño 2026-10): lo que no cabe en la barra
// inferior — Cocina y Reportes (navegación principal) — y la misma
// "Administración" de la barra lateral de escritorio (cajaNav.js), para no
// mantener dos listas de pantallas distintas.
const EN_BARRA = ['resumen', 'mesas', 'ordenes'];

export default function MenuDrawer({ open, onClose, onOpenOrdenes }) {
  const [sonido, setSonido] = useSonidoCaja();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  const go = (path) => {
    onClose?.();
    navigate(path);
  };

  const Row = ({ label, icon, onClick, danger, strong, active }) => (
    <button
      type="button"
      className="list-row list-row--tap"
      style={{
        cursor: 'pointer',
        fontWeight: strong ? 700 : 500,
        color: danger ? 'var(--red-text)' : undefined,
        background: active ? '#FCEFCF' : undefined,
        gap: 12,
      }}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {icon && <Icon name={icon} size={20} />}
      <span className="list-row__main">{label}</span>
      <span className="list-row__chevron" aria-hidden="true">›</span>
    </button>
  );

  return (
    <>
      <Modal open={open} onClose={onClose} title="Menú">
        {/* Caja del día: primero y destacado (se usa todos los días) */}
        <div style={{ marginBottom: '0.9rem' }}>
          <CajaDelDiaButton variant="row" onNavigate={onClose} />
        </div>
        <div className="list-group list-group--inset" style={{ marginBottom: '0.9rem' }}>
          {MAIN_NAV.filter((i) => !EN_BARRA.includes(i.key)).map((i) => (
            <Row key={i.to} label={i.label} icon={i.icon} strong active={location.pathname === i.to} onClick={() => go(i.to)} />
          ))}
          <Row label="Nueva orden" icon="plus" strong onClick={() => { onClose?.(); onOpenOrdenes?.(); }} />
        </div>

        <div className="list-header" style={{ padding: '0 0.25rem 0.4rem' }}>Administración</div>
        <div className="list-group list-group--inset" style={{ marginBottom: '0.9rem' }}>
          {ADMIN_NAV.map((i) => (
            <Row key={i.to} label={i.label} icon={i.icon} active={location.pathname === i.to} onClick={() => go(i.to)} />
          ))}
        </div>

        <div className="list-group list-group--inset" style={{ marginBottom: '0.9rem' }}>
          <Row
            label={sonido ? 'Sonido al quedar lista una orden: sí' : 'Sonido al quedar lista una orden: no'}
            icon={sonido ? 'campana' : 'campanaOff'}
            onClick={() => setSonido(!sonido)}
          />
        </div>

        <div className="list-group list-group--inset">
          <Row
            label="Salir"
            icon="salir"
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
