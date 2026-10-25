import { useEffect, useState } from 'react';
import { unlockAudio } from '../utils/kitchenSound';

// Sonido de Caja cuando una orden queda lista (dueño, 2026-10-25). Prendido
// por defecto; el estado vive en localStorage y lo comparten la barra lateral
// y el menú del celular (CajaShell es quien ESCUCHA el socket y suena).
const KEY = 'caja_sonido';
const listeners = new Set();

export function sonidoCajaOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSonidoCaja(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch { /* sin almacenamiento: queda el default */ }
  if (on) unlockAudio();
  listeners.forEach((fn) => fn(on));
}

export default function useSonidoCaja() {
  const [on, setOn] = useState(sonidoCajaOn);
  useEffect(() => {
    listeners.add(setOn);
    return () => listeners.delete(setOn);
  }, []);
  return [on, setSonidoCaja];
}
