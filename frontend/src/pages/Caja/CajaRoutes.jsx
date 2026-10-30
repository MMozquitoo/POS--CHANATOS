import React, { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';
import BottomNav from '../../components/caja/BottomNav';
import OrdenesDrawer from '../../components/OrdenesDrawer';
import MenuDrawer from '../../components/caja/MenuDrawer';
import CajaShell from '../../components/shell/CajaShell';
import OrderWorkspaceHost from '../../components/orders/OrderWorkspaceHost';

// Rediseño 2026-10: Mesas (plano + detalle) y Órdenes (tarjetas + detalle)
// reemplazan a MesasAbiertas y al "Centro de control" (CentroTotal) como
// pantallas de trabajo; sus rutas viejas redirigen acá.
const Mesas = lazy(() => import('./Mesas'));
const Ordenes = lazy(() => import('./Ordenes'));
const IdentidadNegocio = lazy(() => import('./IdentidadNegocio'));
const DetalleMesa = lazy(() => import('./DetalleMesa'));
const MasCaja = lazy(() => import('./MasCaja'));
const VentanillaCaja = lazy(() => import('../Ventanilla/Ventanilla'));
const DomiciliosCaja = lazy(() => import('../Domicilios/Domicilios'));
const Menu = lazy(() => import('./Menu'));
const CocinaCaja = lazy(() => import('./CocinaCaja'));
const DashboardCaja = lazy(() => import('./DashboardCaja'));
// ConfigImpresora (./ConfigImpresora.jsx) se conserva para cuando haya impresora térmica
const CierreCaja = lazy(() => import('./CierreCaja'));
const HistorialCierres = lazy(() => import('./HistorialCierres'));
const Reportes = lazy(() => import('./Reportes'));
const Auditoria = lazy(() => import('./Auditoria'));
const ConfigServidor = lazy(() => import('./ConfigServidor'));
const Diagnostico = lazy(() => import('./Diagnostico'));
const AperturaCaja = lazy(() => import('./AperturaCaja'));
const HistorialGeneral = lazy(() => import('./HistorialGeneral'));
const Contratos = lazy(() => import('./Contratos'));
const Rappi = lazy(() => import('./Rappi'));
const Instagram = lazy(() => import('./Instagram'));
const Conexion = lazy(() => import('./Conexion'));
const Aplicacion = lazy(() => import('./Aplicacion'));

/**
 * FIX 2: Redirección si el usuario cae a / siendo CAJA
 * Garantiza que / siempre redirija a /centro para CAJA
 */
function HomeRedirect() {
  return <Navigate to="/centro" replace />;
}

// /centro-total (Centro de control) se dividió en Mesas / Órdenes / Cocina.
// Links viejos (y el state.tab que usaban) caen en la vista equivalente.
function CentroTotalRedirect() {
  const location = useLocation();
  const tab = location.state?.tab;
  if (tab === 'listo') return <Navigate to="/ordenes?estado=LISTO" replace />;
  if (tab === 'cocina') return <Navigate to="/cocina" replace />;
  return <Navigate to="/mesas" replace />;
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
      <OrderWorkspaceHost>
      <CajaShell>
      <Suspense fallback={<div style={{padding:'2rem',textAlign:'center'}}>Cargando...</div>}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/mesas" element={<Mesas />} />
        <Route path="/ordenes" element={<Ordenes />} />
        <Route path="/identidad" element={<IdentidadNegocio />} />
        <Route path="/mesa/:tableId" element={<DetalleMesa />} />
        {/* La bandeja de cobro única es la pestaña LISTO del Centro (botón COBRAR
            de la barra). La página vieja generaba dos menús en paralelo (dueño,
            2026-08-03) — cualquier link viejo cae en la bandeja real. */}
        <Route path="/cobrar" element={<Navigate to="/ordenes?estado=LISTO" replace />} />
        {/* /historial ahora es la vista combinada (pestañas Pagos/Cierres) —
            junta lo que antes eran dos entradas de menú separadas. */}
        <Route path="/historial" element={<HistorialGeneral />} />
        {/* Contratos: fiados y pedidos grandes que pagan después (método
            Contrato al cobrar); marcar pagado no exige caja abierta */}
        <Route path="/contratos" element={<Contratos />} />
        {/* Rappi: cuadrar el depósito semanal — marcar qué pedidos ya pagó Rappi */}
        <Route path="/rappi" element={<Rappi />} />
        {/* Instagram: armar y programar publicaciones/historias */}
        <Route path="/instagram" element={<Instagram />} />
        <Route path="/mas" element={<MasCaja />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/ventanilla" element={<VentanillaCaja />} />
        <Route path="/domicilios" element={<DomiciliosCaja />} />
        <Route path="/centro-total" element={<CentroTotalRedirect />} />
        <Route path="/cocina" element={<CocinaCaja />} />
        <Route path="/centro" element={<DashboardCaja />} />
        {/* Oculta hasta tener impresora térmica: un link viejo cae en Administración */}
        <Route path="/impresora" element={<Navigate to="/mas" replace />} />
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
        {/* Oculta (dueño, 2026-10-25: compras, inventario y contabilidad van a vivir en chanatos-plataforma-dev); Compras.jsx se conserva */}
        <Route path="/compras" element={<Navigate to="/mas" replace />} />
        {/* Conexión y Aplicación juntan pantallas que antes eran entradas
            sueltas en OPCIONES (SERVIDOR+DIAGNÓSTICO; ACTUALIZAR+BACKUPS) */}
        <Route path="/conexion" element={<Conexion />} />
        <Route path="/aplicacion" element={<Aplicacion />} />
        {/* FASE F11: URL de otro rol tras cambiar de sesión → al home (evita pantalla en blanco) */}
        <Route path="*" element={<Navigate to="/centro" replace />} />
      </Routes>
      </Suspense>
      </CajaShell>

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
      </OrderWorkspaceHost>
    </RequireRole>
  );
}

