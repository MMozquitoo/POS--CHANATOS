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

// Bebidas que viven en otras categorías (Limonada y Michelada están en OTROS):
// a esas tampoco se les ofrecen salsas, decida lo que decida la categoría.
const NOMBRE_BEBIDA = /limonada|michelada|gaseosa|jugo|agua|cerveza|refresco|malteada|batido|caf[eé]|soda|avena|t[eé]\b|tea\b/i;

export function productoLlevaSalsas(product, category) {
  if (!categoriaLlevaSalsas(category ?? product?.category)) return false;
  const nombre = `${product?.displayName || product?.name || ''}`;
  return !NOMBRE_BEBIDA.test(nombre);
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

  // Con TODAS las salsas puestas, las notas dicen solo "Todas las salsas"
  // (listarlas una por una ocupaba media observación — dueño, 2026-08-02).
  const ALL_TOKEN = 'Todas las salsas';
  const parts = parseParts(value);
  const isToken = (p) => p.toLowerCase() === ALL_TOKEN.toLowerCase();
  const hasAllToken = parts.some(isToken);
  const esSalsa = (p) => salsas.some(s => s.toLowerCase() === p.toLowerCase());
  const isOn = (salsa) => hasAllToken || parts.some(p => p.toLowerCase() === salsa.toLowerCase());
  const allOn = hasAllToken || salsas.every(isOn);

  // Conservar SIEMPRE lo que no es salsa ni el token (observaciones a mano,
  // "Sabor: X") — antes se borraba la observación del mesero (bug real).
  const rest = () => parts.filter(p => !isToken(p) && !esSalsa(p));

  const toggle = (salsa) => {
    // Si estaba el token, expandir a la lista completa antes de quitar una
    const seleccionadas = hasAllToken ? [...salsas] : parts.filter(esSalsa);
    const on = seleccionadas.some(p => p.toLowerCase() === salsa.toLowerCase());
    const nuevas = on
      ? seleccionadas.filter(p => p.toLowerCase() !== salsa.toLowerCase())
      : [...seleccionadas, salsa];
    // Si quedaron todas marcadas, colapsar al token
    const next = nuevas.length === salsas.length ? [...rest(), ALL_TOKEN] : [...rest(), ...nuevas];
    onChange(next.join(', '));
  };

  const toggleAll = () => {
    const next = allOn ? rest() : [...rest(), ALL_TOKEN];
    onChange(next.join(', '));
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
