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
