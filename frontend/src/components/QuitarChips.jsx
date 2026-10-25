import { useEffect, useState } from 'react';
import axios from 'axios';
import './SalsasChips.css';

// "Quitar" en el panel de un producto: lo que más se pide cambiar, a un toque.
// Se escribe en las notas del item como "Sin queso" (mismo formato de lista
// separada por comas que las salsas, así cocina y el recibo lo muestran
// igual), y se respeta todo lo demás que haya en las notas.
//
// La lista se edita en Menú → "Salsas, quitar y sabores" (GET/PUT
// /settings/quitar, como las salsas). Si queda vacía, la sección no aparece.
// Cada producto puede tener la suya (products.quitar, prop `lista`).
export const QUITAR_OPCIONES = ['Sin queso', 'Sin cebolla', 'Sin verduras'];

// Lo que cocina resalta y el resumen de cada unidad reconoce como "quitar"
export const esQuitar = (texto) => /^(sin|no)\s/i.test(String(texto || '').trim());

// "tomate" → "Sin tomate" (para que cocina lo resalte siempre igual)
export function normalizarQuitar(texto) {
  const v = String(texto || '').replace(/,/g, ' ').trim();
  if (!v) return '';
  const conPrefijo = esQuitar(v) ? v : `Sin ${v}`;
  return conPrefijo.charAt(0).toUpperCase() + conPrefijo.slice(1);
}

function parseParts(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// lista: las opciones propias del producto (array). Sin lista → la general.
export default function QuitarChips({ value, onChange, label = 'Quitar', lista = null }) {
  const [generales, setOpciones] = useState(QUITAR_OPCIONES);
  const opciones = Array.isArray(lista) ? lista : generales;

  useEffect(() => {
    if (Array.isArray(lista)) return undefined;
    let cancelled = false;
    axios.get('/settings/quitar')
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.quitar)) setOpciones(res.data.quitar);
      })
      .catch(() => {}); // se queda con la lista de fábrica, nunca truena el pedido
    return () => { cancelled = true; };
  }, [Array.isArray(lista)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (opciones.length === 0) return null;

  const parts = parseParts(value);
  const isOn = (op) => parts.some((p) => p.toLowerCase() === op.toLowerCase());
  const toggle = (op) => {
    const next = isOn(op)
      ? parts.filter((p) => p.toLowerCase() !== op.toLowerCase())
      : [...parts, op];
    onChange(next.join(', '));
  };

  return (
    <div className="form-group">
      <label>{label}</label>
      <div className="salsas-chips">
        {opciones.map((op) => (
          <button
            key={op}
            type="button"
            className={`salsa-chip salsa-chip--quitar ${isOn(op) ? 'active' : ''}`}
            onClick={() => toggle(op)}
            aria-pressed={isOn(op)}
          >
            {op}
          </button>
        ))}
      </div>
    </div>
  );
}
