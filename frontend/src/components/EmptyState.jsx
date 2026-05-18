// FASE 20.1 — EmptyState reutilizable

/**
 * Componente presentacional para mostrar estados vacíos claros y profesionales
 * 
 * @param {Object} props
 * @param {string} props.title - Título del estado vacío (requerido)
 * @param {string} [props.description] - Descripción opcional del estado
 * @param {string} [props.actionLabel] - Texto del botón de acción (opcional)
 * @param {Function} [props.onAction] - Callback cuando se hace click en el botón (opcional)
 */
export default function EmptyState({ title, description, actionLabel, onAction }) {
  const hasAction = actionLabel && onAction;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '3rem 1.5rem',
        maxWidth: '360px',
        margin: '0 auto'
      }}
    >
      {/* Título */}
      <h2
        style={{
          fontSize: '1.2rem',
          fontWeight: 'bold',
          color: '#333',
          marginBottom: description ? '0.5rem' : '1rem',
          marginTop: 0
        }}
      >
        {title}
      </h2>

      {/* Descripción (opcional) */}
      {description && (
        <p
          style={{
            fontSize: '0.9rem',
            color: '#666',
            marginBottom: hasAction ? '1.5rem' : 0,
            marginTop: 0,
            lineHeight: '1.5'
          }}
        >
          {description}
        </p>
      )}

      {/* Botón de acción (solo si actionLabel y onAction existen) */}
      {hasAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#F5BB4C',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#D4A03A';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F5BB4C';
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
