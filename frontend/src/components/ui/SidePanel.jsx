import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import './ui.css';

// Panel de detalle (rediseño 2026-10). Un solo componente, tres formas según
// el ancho (todo por CSS, ver ui.css):
//   ≥1280px  columna fija a la derecha (~360px) dentro de .workspace
//   769–1279 panel flotante a la derecha sobre el contenido, con velo
//   ≤768px   hoja desde abajo de altura suficiente (vista de detalle)
// Abre con desplazamiento corto + opacidad (--dur-panel); al cerrar espera la
// salida antes de desmontar. El contenido de atrás (plano, lista) NO se toca:
// su scroll y su selección se conservan.
export default function SidePanel({ open, onClose, title, subtitle, badge, children, footer, panelKey }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <>
      <div className={`side-panel-scrim ${closing ? 'is-closing' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside
        className={`side-panel ${closing ? 'is-closing' : ''}`}
        role="dialog"
        aria-label={typeof title === 'string' ? title : 'Detalle'}
      >
        <div className="side-panel__grabber" aria-hidden="true" />
        <header className="side-panel__header">
          <div className="side-panel__titles">
            <div className="side-panel__title-row">
              <h2 className="side-panel__title">{title}</h2>
              {badge}
            </div>
            {subtitle && <div className="side-panel__subtitle">{subtitle}</div>}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        {/* key: al cambiar de mesa/orden el cuerpo entra con un fundido corto,
            el panel en sí no se cierra ni salta */}
        <div className="side-panel__body" key={panelKey}>
          {children}
        </div>
        {footer && <footer className="side-panel__footer">{footer}</footer>}
      </aside>
    </>
  );
}

// Lugar reservado en escritorio ancho cuando no hay nada seleccionado: evita
// que el plano/lista cambie de ancho al elegir algo. Oculto en anchos menores.
export function SidePanelIdle({ children }) {
  return <aside className="side-panel side-panel--idle">{children}</aside>;
}
