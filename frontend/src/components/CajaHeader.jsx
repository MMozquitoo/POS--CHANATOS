import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RoleBadge from './RoleBadge';
import { getRoleTheme } from '../utils/roleTheme';
import '../pages/Caja/Caja.css';

const MOBILE_BREAKPOINT = 480;

/**
 * Componente header unificado para pantallas de CAJA
 * FASE 13.3: Header unificado con navegación consistente
 * FASE 13.4: backTo opcional (home sin botón VOLVER)
 * FASE M3: variant compact en móvil (< 480px), header ~64px, sin texto partido
 *
 * @param {string} title - Título principal (ej: "CENTRO DE CONTROL")
 * @param {string} [subtitle] - Subtítulo opcional (ej: "Dashboard")
 * @param {string|Function|null|undefined} [backTo] - Ruta o callback para "VOLVER"
 * @param {Object} [rightButton] - { label: string, to: string|Function }
 * @param {string} [variant] - "compact" | "default" | undefined (auto-detect por innerWidth < 480)
 */
export default function CajaHeader({ title, subtitle, backTo, rightButton, variant }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isCompact, setIsCompact] = useState(
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  
  // FASE 18.1 y 18.5: Tema por rol
  const roleTheme = user?.role ? getRoleTheme(user.role) : null;
  const isCaja = user?.role === "CAJA";

  useEffect(() => {
    const check = () => setIsCompact(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const compact = variant === 'compact' || (variant !== 'default' && isCompact);

  const handleBack = () => {
    if (typeof backTo === 'function') {
      backTo();
    } else if (backTo) {
      navigate(backTo);
    }
  };

  const handleRightButton = () => {
    if (!rightButton) return;
    if (typeof rightButton.to === 'function') {
      rightButton.to();
    } else if (rightButton.to !== '#') {
      navigate(rightButton.to);
    }
  };

  const headerStyle = {
    flexShrink: 0,
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    background: '#fff',
    pointerEvents: 'auto',
    // FASE 18.5: Borde inferior por rol (rojo para CAJA, azul para MESERO)
    borderBottom: roleTheme ? `3px solid ${roleTheme.accent}` : '1px solid #e0e0e0',
    padding: compact ? '0.5rem 0.75rem' : '1rem',
    maxHeight: compact ? 64 : undefined,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: compact ? '0.5rem' : '0.75rem',
    boxSizing: 'border-box',
  };

  const backBtnStyle = {
    pointerEvents: 'auto',
    position: 'relative',
    zIndex: 1001,
    cursor: 'pointer',
    padding: compact ? '0.4rem 0.75rem' : '0.5rem 1rem',
    minHeight: 44,
    background: '#f8f9fa',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontWeight: 'bold',
    fontSize: compact ? '0.85rem' : '0.9rem',
    color: '#333',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const rightBtnStyle = {
    pointerEvents: 'auto',
    position: 'relative',
    zIndex: 1001,
    cursor: 'pointer',
    background: '#6c757d',
    color: 'white',
    padding: compact ? '0.4rem 0.75rem' : '0.5rem 1rem',
    minHeight: 44,
    fontSize: compact ? '0.85rem' : '0.9rem',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  // FASE 20.C: Jerarquía visual clara - título principal más prominente
  const titleStyle = {
    margin: 0,
    fontSize: compact ? '1.1rem' : '1.2rem',
    fontWeight: 600,
    color: '#333',
    textAlign: 'center',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  // FASE 20.C: Subtítulos con color y tamaño más sutiles
  const subtitleStyle = {
    fontSize: compact ? '0.75rem' : '0.85rem',
    color: '#666',
    marginTop: compact ? '0.125rem' : '0.25rem',
    fontWeight: 400
  };

  const spacer = compact ? 64 : 80;

  return (
    <header className="caja-header" style={headerStyle}>
      {backTo ? (
        <button onClick={handleBack} className="back-btn" style={backBtnStyle}>
          ← VOLVER
        </button>
      ) : (
        <div style={{ width: spacer, flexShrink: 0 }} />
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          minWidth: 0,
          pointerEvents: 'none',
        }}
      >
        {/* FASE 18.1: Título con badge de rol */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <h1 style={titleStyle}>{title}</h1>
          {user?.role && !compact && <RoleBadge role={user.role} />}
        </div>
        {subtitle && !compact && <div style={subtitleStyle}>{subtitle}</div>}
      </div>

      {rightButton ? (
        <button
          onClick={handleRightButton}
          className="logout-btn"
          style={rightBtnStyle}
        >
          {rightButton.label}
        </button>
      ) : (
        <div style={{ width: spacer, flexShrink: 0 }} />
      )}
    </header>
  );
}
