import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Icon from '../ui/Icon';
import { sectionFor } from '../shell/cajaNav';
import './BottomNav.css';

// Barra de navegación fija para Caja en celular (≤768px). Rediseño 2026-10:
// las mismas secciones que la barra lateral de escritorio (cajaNav.js) —
// Resumen, Mesas, Órdenes — más el "+" central de siempre (nueva orden) y
// MENÚ, que lleva a Cocina, Reportes y Administración. "COBRAR" pasó a ser
// Órdenes: ahí están las listas para cobrar (filtro "Listas para cobrar").
export default function BottomNav({ onOpenOrdenes, onOpenMenu }) {
  const navigate = useNavigate();
  const location = useLocation();
  const section = sectionFor(location.pathname, location.state);
  const [menuTap, setMenuTap] = useState(0);
  const [plusTap, setPlusTap] = useState(0);

  const Tab = ({ keyName, label, icon, to }) => (
    <button
      type="button"
      className={`bn-tab ${section === keyName ? 'active' : ''}`}
      aria-current={section === keyName ? 'page' : undefined}
      onClick={() => navigate(to)}
    >
      <Icon name={icon} size={24} play={section === keyName} />
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="caja-bottom-nav" aria-label="Navegación principal">
      <Tab keyName="resumen" label="RESUMEN" icon="resumen" to="/centro" />
      <Tab keyName="mesas" label="MESAS" icon="mesas" to="/mesas" />

      <div className="bn-fab-slot">
        <button
          type="button"
          className="bn-fab"
          onClick={() => {
            setPlusTap((n) => n + 1);
            onOpenOrdenes();
          }}
          aria-label="Nueva orden"
        >
          <Icon name="plus" size={28} strokeWidth={2.4} play={plusTap} />
        </button>
      </div>

      <Tab keyName="ordenes" label="ÓRDENES" icon="ordenes" to="/ordenes" />

      <button
        type="button"
        className={`bn-tab ${['cocina', 'reportes', 'admin'].includes(section) ? 'active' : ''}`}
        onClick={() => {
          setMenuTap((n) => n + 1);
          onOpenMenu();
        }}
      >
        <Icon name="admin" size={24} play={menuTap} />
        <span>MENÚ</span>
      </button>
    </nav>
  );
}
