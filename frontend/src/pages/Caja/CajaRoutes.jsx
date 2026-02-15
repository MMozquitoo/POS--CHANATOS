import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';
import SesionCaja from './SesionCaja';
import CobrarPedidos from './CobrarPedidos';
import Historial from './Historial';
import HistorialSesiones from './HistorialSesiones';
import MesasAbiertas from './MesasAbiertas';
import DetalleMesa from './DetalleMesa';
import MasCaja from './MasCaja';
import VentanillaCaja from '../Ventanilla/Ventanilla';
import DomiciliosCaja from '../Domicilios/Domicilios';
import Menu from './Menu';
import CentroTotal from './CentroTotal';
import CocinaCaja from './CocinaCaja';
import DashboardCaja from './DashboardCaja';
import ConfigImpresora from './ConfigImpresora';
import CierreCaja from './CierreCaja';
import HistorialCierres from './HistorialCierres';
import Auditoria from './Auditoria';
import ConfigServidor from './ConfigServidor';
import Diagnostico from './Diagnostico';
import AperturaCaja from './AperturaCaja';

/**
 * FIX 2: Redirección si el usuario cae a / siendo CAJA
 * Garantiza que / siempre redirija a /centro para CAJA
 */
function HomeRedirect() {
  return <Navigate to="/centro" replace />;
}

export default function CajaRoutes() {
  return (
    <RequireRole role="CAJA" redirectTo="/">
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/mesas" element={<MesasAbiertas />} />
        <Route path="/mesa/:tableId" element={<DetalleMesa />} />
        <Route path="/cobrar" element={<CobrarPedidos />} />
        <Route path="/historial" element={<Historial />} />
        <Route path="/historial-caja" element={<HistorialSesiones />} />
        <Route path="/mas" element={<MasCaja />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/ventanilla" element={<VentanillaCaja />} />
        <Route path="/domicilios" element={<DomiciliosCaja />} />
        <Route path="/centro-total" element={<CentroTotal />} />
        <Route path="/cocina" element={<CocinaCaja />} />
        <Route path="/centro" element={<DashboardCaja />} />
        <Route path="/impresora" element={<ConfigImpresora />} />
        <Route path="/cierre" element={<CierreCaja />} />
        <Route path="/historial-cierres" element={<HistorialCierres />} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/config-servidor" element={<ConfigServidor />} />
        <Route path="/diagnostico" element={<Diagnostico />} />
        <Route path="/apertura-caja" element={<AperturaCaja />} />
      </Routes>
    </RequireRole>
  );
}

