import { useLocation, useNavigate } from 'react-router-dom';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import Icon from '../ui/Icon';
import { CIERRE_NAV } from './cajaNav';

// Botón de la caja del día (abrir por la mañana, cerrar por la noche). Se usa
// todos los días, así que va fuera de Administración y resalta: carbón con el
// icono en mostaza. Con la caja abierta → "Cierre de caja" (/cierre); cerrada
// → "Abrir caja" (Resumen con el formulario de apertura ya abierto).
// variant: 'sidebar' (barra lateral) | 'row' (menú del celular)
export default function CajaDelDiaButton({ variant = 'sidebar', onNavigate }) {
  const abierta = useCajaAbierta();
  const navigate = useNavigate();
  const location = useLocation();
  const cerrada = abierta === false;
  const label = cerrada ? 'Abrir caja' : CIERRE_NAV.label;
  const activo = location.pathname === CIERRE_NAV.to;

  const ir = () => {
    onNavigate?.();
    if (cerrada) navigate('/centro', { state: { abrirCaja: true } });
    else navigate(CIERRE_NAV.to);
  };

  return (
    <button
      type="button"
      className={`caja-dia caja-dia--${variant} ${activo ? 'is-active' : ''} ${cerrada ? 'is-cerrada' : ''}`}
      onClick={ir}
      title={label}
      aria-current={activo ? 'page' : undefined}
    >
      <span className="caja-dia__icon" aria-hidden="true">
        <Icon name={CIERRE_NAV.icon} size={20} strokeWidth={2.2} play={activo} />
      </span>
      <span className="caja-dia__text">
        <strong>{label}</strong>
        <small>{cerrada ? 'La caja está cerrada' : abierta ? 'Contar y cerrar el día' : ''}</small>
      </span>
      {variant === 'row' && <Icon name="chevronRight" size={18} className="caja-dia__chevron" />}
    </button>
  );
}
