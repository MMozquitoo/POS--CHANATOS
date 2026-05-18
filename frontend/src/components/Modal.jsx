import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, title, children, actions }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    modalRef.current?.focus();
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      prev?.focus();
    };
  }, [open, onClose]);

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
