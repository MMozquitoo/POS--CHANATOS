import { useNavigate, useLocation } from 'react-router-dom';
import { IconPedidos, IconMenu, IconPlus } from '../NavIcons';
import './BottomNav.css';

// Barra de navegación fija para Mesero en celular (<768px), mismo patrón que
// la de Caja: PEDIDOS (resumen de lo que el mesero tiene abierto) a la
// izquierda, "+" al centro para elegir mesa/ventanilla/domicilios y armar
// una orden nueva, MENÚ a la derecha (por ahora solo Salir).
export default function BottomNav({ onOpenMesas, onOpenMenu }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="mesero-bottom-nav">
      <button
        type="button"
        className={`mbn-tab ${isActive('/pedidos') ? 'active' : ''}`}
        onClick={() => navigate('/pedidos')}
      >
        <IconPedidos />
        <span>PEDIDOS</span>
      </button>

      <div className="mbn-fab-slot">
        <button type="button" className="mbn-fab" onClick={onOpenMesas} aria-label="Nueva orden">
          <IconPlus />
        </button>
      </div>

      <button type="button" className="mbn-tab" onClick={onOpenMenu}>
        <IconMenu />
        <span>MENÚ</span>
      </button>
    </nav>
  );
}
