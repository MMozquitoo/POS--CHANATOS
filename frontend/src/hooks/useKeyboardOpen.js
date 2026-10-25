import { useEffect } from 'react';

// Teclado abierto en celular (rediseño 2026-10): mientras se escribe en un
// campo, el body lleva .kb-open y mobile-polish.css esconde las barras
// inferiores fijas. En Android la barra sube con el teclado y tapaba el campo
// o el botón principal justo cuando se estaba escribiendo.
const TEXT_INPUT = /^(text|search|tel|number|email|password|url)$/;

function isTyping(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
  if (el.tagName === 'INPUT') return TEXT_INPUT.test(el.type || 'text');
  return false;
}

export default function useKeyboardOpen() {
  useEffect(() => {
    const update = () => {
      document.body.classList.toggle('kb-open', isTyping(document.activeElement));
    };
    // focusout dispara antes de que el foco llegue al siguiente campo: se
    // espera un tick para no esconder/mostrar la barra entre dos campos
    const onFocusOut = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', onFocusOut);
      document.body.classList.remove('kb-open');
    };
  }, []);
}
