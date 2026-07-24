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

export const SALSAS = [
  'Tomate',
  'Ajo',
  'Piña',
  'BBQ',
  'Mostaza',
  'Tártara',
  'Salsa de la casa',
];

function parseParts(value) {
  return (value || '').split(',').map(s => s.trim()).filter(Boolean);
}

export default function SalsasChips({ value, onChange }) {
  const parts = parseParts(value);
  const isOn = (salsa) => parts.some(p => p.toLowerCase() === salsa.toLowerCase());
  const allOn = SALSAS.every(isOn);

  const toggle = (salsa) => {
    const next = isOn(salsa)
      ? parts.filter(p => p.toLowerCase() !== salsa.toLowerCase())
      : [...parts, salsa];
    onChange(next.join(', '));
  };

  const toggleAll = () => {
    onChange(allOn ? '' : SALSAS.join(', '));
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
      {SALSAS.map(salsa => (
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
