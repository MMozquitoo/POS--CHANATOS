/**
 * Tarjeta de mesa (Mesero y Caja). Restyle v2 (2026-08): sin bordes gruesos
 * de color — el estado se lee por un tinte suave de fondo + pill, estilo iOS.
 */

import { useState, memo, useEffect } from 'react';

// Estado → esquema visual. En tarjeta tinteada la pill va blanca (contraste);
// en tarjeta blanca (libre) la pill va tinteada.
const SCHEMES = {
  libre: {
    card: '#fff',
    number: 'var(--gray-900)',
    pillBg: 'var(--green-tint)',
    pillColor: 'var(--green-text)',
  },
  activo: {
    card: 'var(--brand-tint)',
    number: 'var(--gray-900)',
    pillBg: '#fff',
    pillColor: 'var(--brand-deep)',
  },
  listo: {
    card: 'var(--red-tint)',
    number: 'var(--gray-900)',
    pillBg: '#fff',
    pillColor: 'var(--red-text)',
  },
};

function normalizeStatus(status) {
  if (status === 'libre' || status === 'LIBRE') return 'libre';
  if (status === 'pedido_activo' || status === 'ACTIVO' || status === 'OCUPADA') return 'activo';
  if (status === 'pedido_listo' || status === 'LISTO') return 'listo';
  return null;
}

const STATUS_TEXT = {
  libre: 'Libre',
  activo: 'Pedido activo',
  listo: 'Pedido listo',
};

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
  // Hover solo en dispositivos que lo soportan (desktop)
  const [canHover, setCanHover] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(hover: hover)');
      setCanHover(mediaQuery.matches);
      const handleChange = (e) => setCanHover(e.matches);
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  const key = normalizeStatus(status);
  const scheme = (key && SCHEMES[key]) || SCHEMES.libre;

  // Ventanilla (9) ámbar / Domicilios (10) verde: tarjeta tinteada siempre
  let cardBg = scheme.card;
  let numberColor = scheme.number;
  if (highlight) {
    const esVentanilla = number === 9;
    cardBg = esVentanilla ? 'var(--brand-tint)' : 'var(--green-tint)';
    numberColor = esVentanilla ? 'var(--brand-deep)' : 'var(--green-text)';
  }
  if (disabled) {
    cardBg = 'var(--gray-50)';
    numberColor = 'var(--gray-400)';
  }

  const tintedCard = cardBg !== '#fff';
  const pillBg = tintedCard ? '#fff' : scheme.pillBg;
  const pillColor = scheme.pillColor;
  const statusLabel = key ? STATUS_TEXT[key] : '';

  const handleMouseEnter = canHover ? () => setIsHovered(true) : undefined;
  const handleMouseLeave = canHover ? () => setIsHovered(false) : undefined;
  const hovered = isHovered && canHover && !disabled;

  const pillStyle = {
    marginTop: '0.5rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
    background: pillBg,
    color: pillColor,
    boxShadow: tintedCard ? 'var(--shadow-sm)' : 'none',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        background: cardBg,
        border: 'none',
        borderRadius: 'var(--radius-xl)',
        padding: '1.4rem 1rem',
        textAlign: 'center',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        minHeight: '120px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        opacity: disabled ? 0.6 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {number != null && (
        <div
          className="tnum"
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            lineHeight: 1.1,
            color: numberColor,
            marginBottom: '0.35rem',
            letterSpacing: 'var(--tracking-title)',
          }}
        >
          {number}
        </div>
      )}

      <div
        style={{
          fontSize: '0.9375rem',
          fontWeight: 700,
          color: 'var(--gray-900)',
          marginBottom: subtitle ? '0.15rem' : 0,
        }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--gray-500)',
            marginTop: '0.15rem',
          }}
        >
          {subtitle}
        </div>
      )}

      {badge ? (
        <div style={pillStyle}>{badge}</div>
      ) : (
        statusLabel && <div style={pillStyle}>{statusLabel}</div>
      )}
    </button>
  );
}

export default memo(TableCard, (prevProps, nextProps) => {
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
