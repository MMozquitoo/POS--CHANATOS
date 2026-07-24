import { useState, useEffect } from 'react';
import axios from 'axios';
import './SalsasChips.css';

// Salsas del restaurante: botones rápidos para mesero y caja.
// Escriben sobre el campo de notas del item, así cocina y el recibo
// las muestran sin cambios en el modelo de datos.
// Categorías donde las salsas no aplican (bebidas): no mostrar los chips
const CATEGORIAS_SIN_SALSAS = ['BEBIDAS', 'CERVEZAS', 'JUGOS_NATURALES'];

export function categoriaLlevaSalsas(category) {
  if (!category) return true; // producto personalizado u origen desconocido: mostrar
  return !CATEGORIAS_SIN_SALSAS.includes(String(category).toUpperCase().replace(/ /g, '_'));
}

// Lista de fábrica: se usa mientras carga o si /settings/salsas no responde,
// para que armar un pedido nunca dependa de que el backend esté disponible.
export const DEFAULT_SALSAS = ['Tomate', 'Ajo', 'Piña', 'BBQ', 'Mostaza', 'Tártara', 'Salsa de la casa'];

function parseParts(value) {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean);
}

export default function SalsasChips({ value, onChange }) {
  const [salsas, setSalsas] = useState(DEFAULT_SALSAS);

  useEffect(() => {
    let cancelled = false;
    axios.get('/settings/salsas')
      .then(res => {
        if (!cancelled && Array.isArray(res.data?.salsas) && res.data.salsas.length > 0) {
          setSalsas(res.data.salsas);
        }
      })
      .catch(() => {}); // se queda con DEFAULT_SALSAS, nunca truena el pedido
    return () => { cancelled = true; };
  }, []);

  const parts = parseParts(value);
  const isOn = (salsa) => parts.some(p => p.toLowerCase() === salsa.toLowerCase());
  const allOn = salsas.every(isOn);

  const toggle = (salsa) => {
    const next = isOn(salsa)
      ? parts.filter(p => p.toLowerCase() !== salsa.toLowerCase())
      : [...parts, salsa];
    onChange(next.join(', '));
  };

  const toggleAll = () => {
    onChange(allOn ? '' : salsas.join(', '));
  };

  return (
    <div className="salsas-chips">
      <button
        type="button"
        className={`salsa-chip salsa-chip-all ${allOn ? 'active' : ''}`}
        onClick={toggleAll}
      >
        {allOn ? 'Quitar todas' : 'Todas'}
      </button>
      {salsas.map(salsa => (
        <button
          key={salsa}
          type="button"
          className={`salsa-chip ${isOn(salsa) ? 'active' : ''}`}
          onClick={() => toggle(salsa)}
        >
          {salsa}
        </button>
      ))}
    </div>
  );
}
