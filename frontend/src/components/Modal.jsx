import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, title, children, actions }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  // onClose suele ser una arrow nueva en cada render: si estuviera en las deps,
  // este efecto correría en cada tecleo y el focus() del modal le robaría el foco
  // al input (bug de "solo deja escribir una letra"). Ref estable + deps [open].
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    // Enfocar el modal solo si el foco no está ya dentro (p.ej. un input con autoFocus)
    if (!modalRef.current?.contains(document.activeElement)) {
      modalRef.current?.focus();
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', handleKey);
    // Bloquear el scroll del fondo mientras el modal está abierto: evita que
    // el usuario desplace la página detrás y, en páginas muy largas (ej. Menú
    // con muchos productos), evita un glitch de renderizado donde el fondo se
    // asoma por debajo del overlay fijo.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="chanatos-modal-overlay"
      onClick={(e) => e.target === overlayRef.current && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div ref={modalRef} className="chanatos-modal" tabIndex={-1}>
        {title && <h3>{title}</h3>}
        <div>{children}</div>
        {actions && <div className="chanatos-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
