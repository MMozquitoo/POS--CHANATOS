import { useNavigate } from 'react-router-dom';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import Icon from './Icon';

// Aviso en Mesas y Órdenes cuando no hay caja abierta. Los pedidos se toman
// igual (mesero, caja y cocina siguen trabajando), pero para cobrar hay que
// abrirla — puede ser con $ 0 — y mientras tanto la página web no recibe
// pedidos. Abrir caja NO borra ni esconde los pedidos en curso: pasan a la
// caja nueva (cash.js /open, CUENTAS ABIERTAS).
export default function CajaCerradaAviso() {
  const abierta = useCajaAbierta();
  const navigate = useNavigate();
  if (abierta !== false) return null;
  return (
    <div className="caja-cerrada" role="status">
      <span className="caja-cerrada__icon" aria-hidden="true">
        <Icon name="caja" size={22} strokeWidth={2.2} />
      </span>
      <div className="caja-cerrada__text">
        <strong>La caja está cerrada</strong>
        <span>
          Los pedidos se toman normal, pero para cobrar hay que abrirla (puede ser con $ 0).
          Mientras esté cerrada, la página web no recibe pedidos.
        </span>
      </div>
      <button type="button" className="btn btn--dark" onClick={() => navigate('/centro', { state: { abrirCaja: true } })}>
        Abrir caja
      </button>
    </div>
  );
}
