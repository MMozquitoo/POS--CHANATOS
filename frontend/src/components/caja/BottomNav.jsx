import { useNavigate, useLocation } from 'react-router-dom';
import { IconCocina, IconCobrar, IconResumen, IconMenu, IconPlus } from '../NavIcons';
import './BottomNav.css';

// Barra de navegación fija para Caja en celular (<768px). Reemplaza tener que
// scrollear hasta "Mesas" o "Opciones" para llegar a lo que se usa todo el
// tiempo durante el servicio: cocina, cobrar, nueva orden, resumen del día.
export default function BottomNav({ onOpenOrdenes, onOpenMenu }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="caja-bottom-nav">
      <button
        type="button"
        className={`bn-tab ${isActive('/cocina') ? 'active' : ''}`}
        onClick={() => navigate('/cocina')}
      >
        <IconCocina />
        <span>COCINA</span>
      </button>

      <button
        type="button"
        className={`bn-tab ${isActive('/centro-total') && location.state?.tab === 'listo' ? 'active' : ''}`}
        onClick={() => navigate('/centro-total', { state: { tab: 'listo' } })}
      >
        <IconCobrar />
        <span>COBRAR</span>
      </button>

      <div className="bn-fab-slot">
        <button type="button" className="bn-fab" onClick={onOpenOrdenes} aria-label="Nueva orden">
          <IconPlus />
        </button>
      </div>

      <button
        type="button"
        className={`bn-tab ${isActive('/centro') ? 'active' : ''}`}
        onClick={() => navigate('/centro')}
      >
        <IconResumen />
        <span>RESUMEN</span>
      </button>

      <button type="button" className="bn-tab" onClick={onOpenMenu}>
        <IconMenu />
        <span>MENÚ</span>
      </button>
    </nav>
  );
}
