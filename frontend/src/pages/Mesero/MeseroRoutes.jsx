import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';
import Mesas from './Mesas';
import PedidoMesa from './PedidoMesa';
import EstadoPedidos from './EstadoPedidos';
import Mas from './Mas';
import Ventanilla from '../Ventanilla/Ventanilla';
import Domicilios from '../Domicilios/Domicilios';

export default function MeseroRoutes() {
  return (
    <RequireRole role="MESERO" redirectTo="/centro">
      <Routes>
        <Route path="/" element={<Mesas />} />
        <Route path="/mesa/:tableId" element={<PedidoMesa />} />
        <Route path="/pedidos" element={<EstadoPedidos />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/ventanilla" element={<Ventanilla />} />
        <Route path="/domicilios" element={<Domicilios />} />
        {/* FASE 18.6: /mesas → / (evita pantalla en blanco y "menú viejo" por cache) */}
        <Route path="/mesas" element={<Navigate to="/" replace />} />
      </Routes>
    </RequireRole>
  );
}

