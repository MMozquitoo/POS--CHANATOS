/**
 * FASE 16.4.2.1 — Componente reutilizable TableCard
 * FASE 16.4.3.C — Optimizado para móvil con memo y hover condicional
 */

import { useState, memo, useEffect } from 'react';

function TableCard({
  title,
  subtitle,
  number,
  status,
  badge,
  onClick,
  variant = 'waiter',
  highlight = false,
  disabled = false
}) {
  // FASE 16.4.3.C: Detectar si el dispositivo soporta hover (solo desktop)
  const [canHover, setCanHover] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Detectar capacidad de hover al montar
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(hover: hover)');
      setCanHover(mediaQuery.matches);
      
      // Escuchar cambios (por si se conecta/desconecta un dispositivo)
      const handleChange = (e) => setCanHover(e.matches);
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  // Colores según variant y highlight
  const getBorderColor = () => {
    if (disabled) return '#e0e0e0';
    if (highlight) {
      if (variant === 'waiter') {
        // Ventanilla: amarillo, Domicilios: verde
        return number === 9 ? '#F5BB4C' : '#28a745';
      }
      return '#007bff';
    }
    // Status colors
    if (status === 'libre' || status === 'LIBRE') return '#51cf66';
    if (status === 'pedido_activo' || status === 'ACTIVO' || status === 'OCUPADA') return '#ffd43b';
    if (status === 'pedido_listo' || status === 'LISTO') return '#ff6b6b';
    return '#e0e0e0';
  };

  const getNumberColor = () => {
    if (disabled) return '#999';
    if (highlight) {
      if (variant === 'waiter') {
        return number === 9 ? '#F5BB4C' : '#28a745';
      }
      return '#007bff';
    }
    return '#333';
  };

  const getStatusLabel = (status) => {
    if (!status) return '';
    const labels = {
      libre: 'Libre',
      LIBRE: 'Libre',
      pedido_activo: 'Pedido activo',
      ACTIVO: 'Pedido activo',
      OCUPADA: 'Ocupada',
      pedido_listo: 'Pedido listo',
      LISTO: 'Pedido listo'
    };
    return labels[status] || status;
  };

  const getStatusClass = (status) => {
    if (!status) return '';
    const classes = {
      libre: 'status-libre',
      LIBRE: 'status-libre',
      pedido_activo: 'status-activo',
      ACTIVO: 'status-activo',
      OCUPADA: 'status-activo',
      pedido_listo: 'status-listo',
      LISTO: 'status-listo'
    };
    return classes[status] || '';
  };

  const borderColor = getBorderColor();
  const numberColor = getNumberColor();
  const statusLabel = getStatusLabel(status);
  const statusClass = getStatusClass(status);

  // FASE 16.4.3.C: Solo aplicar hover si el dispositivo lo soporta
  const handleMouseEnter = canHover ? () => setIsHovered(true) : undefined;
  const handleMouseLeave = canHover ? () => setIsHovered(false) : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        background: 'white',
        border: `2px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '1.5rem',
        textAlign: 'center',
        boxShadow: (isHovered && canHover && !disabled)
          ? '0 4px 12px rgba(0, 0, 0, 0.15)'
          : '0 2px 8px rgba(0, 0, 0, 0.1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        transform: (isHovered && canHover && !disabled) ? 'translateY(-2px)' : 'translateY(0)',
        opacity: disabled ? 0.6 : 1
      }}
    >
      {/* Número grande */}
      {number != null && (
        <div
          style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            color: numberColor,
            marginBottom: '0.5rem'
          }}
        >
          {number}
        </div>
      )}

      {/* Título */}
      <div
        style={{
          fontSize: '1rem',
          fontWeight: 'bold',
          color: '#333',
          marginBottom: subtitle ? '0.25rem' : '0.5rem'
        }}
      >
        {title}
      </div>

      {/* Subtítulo (contador de pedidos, etc.) */}
      {subtitle && (
        <div
          style={{
            fontSize: '0.85rem',
            color: '#666',
            marginTop: '0.25rem'
          }}
        >
          {subtitle}
        </div>
      )}

      {/* Badge de status */}
      {badge && (
        <div
          className={statusClass}
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            background: status === 'libre' || status === 'LIBRE' ? '#d4edda' :
                        status === 'pedido_activo' || status === 'ACTIVO' || status === 'OCUPADA' ? '#fff3cd' :
                        status === 'pedido_listo' || status === 'LISTO' ? '#f8d7da' : '#e9ecef',
            color: status === 'libre' || status === 'LIBRE' ? '#155724' :
                   status === 'pedido_activo' || status === 'ACTIVO' || status === 'OCUPADA' ? '#856404' :
                   status === 'pedido_listo' || status === 'LISTO' ? '#721c24' : '#495057',
            fontWeight: '500'
          }}
        >
          {badge}
        </div>
      )}

      {/* Status label si no hay badge pero hay status */}
      {!badge && statusLabel && (
        <div
          className={statusClass}
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            background: status === 'libre' || status === 'LIBRE' ? '#d4edda' :
                        status === 'pedido_activo' || status === 'ACTIVO' || status === 'OCUPADA' ? '#fff3cd' :
                        status === 'pedido_listo' || status === 'LISTO' ? '#f8d7da' : '#e9ecef',
            color: status === 'libre' || status === 'LIBRE' ? '#155724' :
                   status === 'pedido_activo' || status === 'ACTIVO' || status === 'OCUPADA' ? '#856404' :
                   status === 'pedido_listo' || status === 'LISTO' ? '#721c24' : '#495057',
            fontWeight: '500'
          }}
        >
          {statusLabel}
        </div>
      )}
    </button>
  );
}

// FASE 16.4.3.C: Memoizar componente para evitar rerenders innecesarios
export default memo(TableCard, (prevProps, nextProps) => {
  // Comparación personalizada para evitar rerenders si props no cambian
  return (
    prevProps.title === nextProps.title &&
    prevProps.subtitle === nextProps.subtitle &&
    prevProps.number === nextProps.number &&
    prevProps.status === nextProps.status &&
    prevProps.badge === nextProps.badge &&
    prevProps.variant === nextProps.variant &&
    prevProps.highlight === nextProps.highlight &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.onClick === nextProps.onClick
  );
});
