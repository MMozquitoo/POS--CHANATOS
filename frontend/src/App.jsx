import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ConnectionProvider } from './contexts/ConnectionContext';
import ErrorBoundary from './components/ErrorBoundary';
import ConnectionBanner from './components/ConnectionBanner';
import Login from './pages/Login';
import ConfigServidor from './pages/ConfigServidor';
import MeseroRoutes from './pages/Mesero/MeseroRoutes';
import Cocina from './pages/Cocina/Cocina';
import CajaRoutes from './pages/Caja/CajaRoutes';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Acceso denegado</div>;
  }

  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // Hardening: no mostrar rutas ni Login hasta tener auth resuelta (evita race/cache "menú viejo")
  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  }

  if (!user) {
    return <Login />;
  }

  if (!user.role) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  }

  // Redirigir según rol
  let routes;
  if (user.role === 'MESERO') {
    routes = <MeseroRoutes />;
  } else if (user.role === 'COCINA') {
    routes = <Cocina />;
  } else if (user.role === 'CAJA') {
    routes = <CajaRoutes />;
  } else {
    routes = <Navigate to="/login" />;
  }

  return routes;
}

function App() {
  return (
    <ErrorBoundary>
      <ConnectionProvider>
        <ConnectionBanner />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/config-servidor" element={<ConfigServidor />} />
            <Route path="/*" element={<AppRoutes />} />
          </Routes>
        </AuthProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );
}

export default App;

