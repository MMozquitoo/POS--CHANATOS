import { useState, useCallback } from 'react';

export function useAlert() {
  const [state, setState] = useState({ open: false, message: '', title: '' });

  const showAlert = useCallback((message, title = 'Aviso') => {
    return new Promise((resolve) => {
      setState({ open: true, message, title, resolve });
    });
  }, []);

  const close = useCallback(() => {
    state.resolve?.();
    setState({ open: false, message: '', title: '' });
  }, [state]);

  return { alertState: state, showAlert, closeAlert: close };
}

// Reemplazo de prompt(): modal con campo de texto. Resuelve el texto o null si cancela.
export function usePrompt() {
  const [state, setState] = useState({ open: false, message: '', title: '', value: '', placeholder: '' });

  const showPrompt = useCallback((message, title = 'Escribe', placeholder = '') => {
    return new Promise((resolve) => {
      setState({ open: true, message, title, value: '', placeholder, resolve });
    });
  }, []);

  const setValue = useCallback((value) => {
    setState((prev) => ({ ...prev, value }));
  }, []);

  const accept = useCallback(() => {
    state.resolve?.(state.value);
    setState({ open: false, message: '', title: '', value: '', placeholder: '' });
  }, [state]);

  const cancel = useCallback(() => {
    state.resolve?.(null);
    setState({ open: false, message: '', title: '', value: '', placeholder: '' });
  }, [state]);

  return { promptState: state, showPrompt, setPromptValue: setValue, acceptPrompt: accept, cancelPrompt: cancel };
}

export function useConfirm() {
  const [state, setState] = useState({ open: false, message: '', title: '' });

  const showConfirm = useCallback((message, title = 'Confirmar') => {
    return new Promise((resolve) => {
      setState({ open: true, message, title, resolve });
    });
  }, []);

  const accept = useCallback(() => {
    state.resolve?.(true);
    setState({ open: false, message: '', title: '' });
  }, [state]);

  const cancel = useCallback(() => {
    state.resolve?.(false);
    setState({ open: false, message: '', title: '' });
  }, [state]);

  return { confirmState: state, showConfirm, acceptConfirm: accept, cancelConfirm: cancel };
}
