import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/**
 * Wrapper que protege rutas por rol
 * FASE 18.2: Guardrails - separación real por roles
 * 
 * @param {string} role - Rol requerido ('CAJA' o 'MESERO')
 * @param {ReactNode} children - Componentes a renderizar si el rol coincide
 * @param {string} redirectTo - Ruta a la que redirigir si el rol no coincide
 */
export default function RequireRole({ role, children, redirectTo = "/" }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (role && user.role !== role) {
    return <Navigate to={redirectTo} replace />;
  }
  
  return children;
}
