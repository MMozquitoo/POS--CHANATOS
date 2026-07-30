import React, { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';
import OrdenesDrawer from '../../components/OrdenesDrawer';
import BottomNav from '../../components/mesero/BottomNav';
import MenuDrawer from '../../components/mesero/MenuDrawer';

const Mesas = lazy(() => import('./Mesas'));
const PedidoMesa = lazy(() => import('./PedidoMesa'));
const EstadoPedidos = lazy(() => import('./EstadoPedidos'));
const Mas = lazy(() => import('./Mas'));
const Ventanilla = lazy(() => import('../Ventanilla/Ventanilla'));
const Domicilios = lazy(() => import('../Domicilios/Domicilios'));
const Sabores = lazy(() => import('./Sabores'));

export default function MeseroRoutes() {
  // FASE M16: misma barra inferior que Caja, adaptada a lo que el mesero
  // necesita: PEDIDOS (resumen), "+" (elegir mesa/ventanilla/domicilios),
  // MENÚ (por ahora solo Salir).
  const [mesasOpen, setMesasOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <RequireRole role="MESERO" redirectTo="/centro">
      <Suspense fallback={<div style={{padding:'2rem',textAlign:'center'}}>Cargando...</div>}>
      <Routes>
        <Route path="/" element={<Mesas />} />
        <Route path="/mesa/:tableId" element={<PedidoMesa />} />
        <Route path="/pedidos" element={<EstadoPedidos />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/ventanilla" element={<Ventanilla />} />
        <Route path="/domicilios" element={<Domicilios />} />
        <Route path="/sabores" element={<Sabores />} />
        {/* FASE 18.6: /mesas → / (evita pantalla en blanco y "menú viejo" por cache) */}
        <Route path="/mesas" element={<Navigate to="/" replace />} />
        {/* FASE F11: URL de otro rol tras cambiar de sesión → al home (evita pantalla en blanco) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>

      <BottomNav
        onOpenMesas={() => setMesasOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />
      <OrdenesDrawer open={mesasOpen} onClose={() => setMesasOpen(false)} />
      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </RequireRole>
  );
}

