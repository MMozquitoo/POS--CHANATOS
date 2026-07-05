import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RequireRole from '../../components/RequireRole';

const Mesas = lazy(() => import('./Mesas'));
const PedidoMesa = lazy(() => import('./PedidoMesa'));
const EstadoPedidos = lazy(() => import('./EstadoPedidos'));
const Mas = lazy(() => import('./Mas'));
const Ventanilla = lazy(() => import('../Ventanilla/Ventanilla'));
const Domicilios = lazy(() => import('../Domicilios/Domicilios'));

export default function MeseroRoutes() {
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
        {/* FASE 18.6: /mesas → / (evita pantalla en blanco y "menú viejo" por cache) */}
        <Route path="/mesas" element={<Navigate to="/" replace />} />
        {/* FASE F11: URL de otro rol tras cambiar de sesión → al home (evita pantalla en blanco) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </RequireRole>
  );
}

