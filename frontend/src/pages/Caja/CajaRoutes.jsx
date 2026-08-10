import React, { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';
import BottomNav from '../../components/caja/BottomNav';
import OrdenesDrawer from '../../components/OrdenesDrawer';
import MenuDrawer from '../../components/caja/MenuDrawer';

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
const Compras = lazy(() => import('./Compras'));
const HistorialGeneral = lazy(() => import('./HistorialGeneral'));
const Conexion = lazy(() => import('./Conexion'));
const Aplicacion = lazy(() => import('./Aplicacion'));

/**
 * FIX 2: Redirección si el usuario cae a / siendo CAJA
 * Garantiza que / siempre redirija a /centro para CAJA
 */
function HomeRedirect() {
  return <Navigate to="/centro" replace />;
}

export default function CajaRoutes() {
  // FASE M14: barra inferior + cajones de Mesas/Menú, fijos sobre TODAS las
  // rutas de Caja (mobile-only vía BottomNav.css) — un solo estado acá arriba
  // para no montar dos veces "Órdenes abiertas" (el ☰ Menú también abre este
  // mismo drawer en vez de duplicar la lista de mesas).
  const [ordenesOpen, setOrdenesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RequireRole role="CAJA" redirectTo="/">
      <Suspense fallback={<div style={{padding:'2rem',textAlign:'center'}}>Cargando...</div>}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/mesas" element={<MesasAbiertas />} />
        <Route path="/mesa/:tableId" element={<DetalleMesa />} />
        {/* La bandeja de cobro única es la pestaña LISTO del Centro (botón COBRAR
            de la barra). La página vieja generaba dos menús en paralelo (dueño,
            2026-08-03) — cualquier link viejo cae en la bandeja real. */}
        <Route path="/cobrar" element={<Navigate to="/centro-total" state={{ tab: 'listo' }} replace />} />
        {/* /historial ahora es la vista combinada (pestañas Pagos/Cierres) —
            junta lo que antes eran dos entradas de menú separadas. */}
        <Route path="/historial" element={<HistorialGeneral />} />
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
        {/* Compras junta lo que antes eran tres entradas de menú separadas
            (Registrar compra / Ingredientes / Gastos generales) en una sola
            pantalla con pestañas — igual que Historial y Conexión. */}
        <Route path="/compras" element={<Compras />} />
        {/* Conexión y Aplicación juntan pantallas que antes eran entradas
            sueltas en OPCIONES (SERVIDOR+DIAGNÓSTICO; ACTUALIZAR+BACKUPS) */}
        <Route path="/conexion" element={<Conexion />} />
        <Route path="/aplicacion" element={<Aplicacion />} />
        {/* FASE F11: URL de otro rol tras cambiar de sesión → al home (evita pantalla en blanco) */}
        <Route path="*" element={<Navigate to="/centro" replace />} />
      </Routes>
      </Suspense>

      <BottomNav
        onOpenOrdenes={() => setOrdenesOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />
      <OrdenesDrawer open={ordenesOpen} onClose={() => setOrdenesOpen(false)} />
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenOrdenes={() => setOrdenesOpen(true)}
      />
    </RequireRole>
  );
}

