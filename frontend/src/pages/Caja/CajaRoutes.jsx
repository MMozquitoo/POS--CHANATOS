import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';

const SesionCaja = lazy(() => import('./SesionCaja'));
const CobrarPedidos = lazy(() => import('./CobrarPedidos'));
const Historial = lazy(() => import('./Historial'));
const HistorialSesiones = lazy(() => import('./HistorialSesiones'));
const MesasAbiertas = lazy(() => import('./MesasAbiertas'));
const DetalleMesa = lazy(() => import('./DetalleMesa'));
const MasCaja = lazy(() => import('./MasCaja'));
const VentanillaCaja = lazy(() => import('../Ventanilla/Ventanilla'));
const DomiciliosCaja = lazy(() => import('../Domicilios/Domicilios'));
const Menu = lazy(() => import('./Menu'));
const CentroTotal = lazy(() => import('./CentroTotal'));
const CocinaCaja = lazy(() => import('./CocinaCaja'));
const DashboardCaja = lazy(() => import('./DashboardCaja'));
const ConfigImpresora = lazy(() => import('./ConfigImpresora'));
const CierreCaja = lazy(() => import('./CierreCaja'));
const HistorialCierres = lazy(() => import('./HistorialCierres'));
const Reportes = lazy(() => import('./Reportes'));
const Auditoria = lazy(() => import('./Auditoria'));
const ConfigServidor = lazy(() => import('./ConfigServidor'));
const Diagnostico = lazy(() => import('./Diagnostico'));
const AperturaCaja = lazy(() => import('./AperturaCaja'));

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
      <Suspense fallback={<div style={{padding:'2rem',textAlign:'center'}}>Cargando...</div>}>
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
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/config-servidor" element={<ConfigServidor />} />
        <Route path="/diagnostico" element={<Diagnostico />} />
        <Route path="/apertura-caja" element={<AperturaCaja />} />
        {/* FASE F11: URL de otro rol tras cambiar de sesión → al home (evita pantalla en blanco) */}
        <Route path="*" element={<Navigate to="/centro" replace />} />
      </Routes>
      </Suspense>
    </RequireRole>
  );
}

