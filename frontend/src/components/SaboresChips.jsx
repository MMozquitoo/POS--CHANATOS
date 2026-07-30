import './SaboresChips.css';
import { formatPriceCOP } from '../utils/currency.js';

// Sabores configurables por producto (ej. gaseosas personales: Colombiana, Manzana, Pepsi).
// A diferencia de las salsas (selección múltiple), un producto solo tiene UN sabor a la vez.
// Igual que SalsasChips: no se toca el modelo de datos, se escribe texto legible en `notes`,
// así cocina ("(Sabor: Colombiana)") y el recibo ("Nota: Sabor: Colombiana") lo muestran igual
// que cualquier otra nota, sin mezclar formatos raros.
//
// Algunos productos (ej. Michelada: no vale lo mismo con Poker que con Club Colombia) sí
// cambian de precio según el sabor elegido. Ese caso usa `flavor_prices`, un JSON
// {"Sabor": precioAbsoluto} guardado en el producto; el sabor que no aparezca ahí usa el
// precio base normal. Cuando el producto no tiene flavor_prices, los chips se comportan
// exactamente igual que antes (solo texto, sin tocar el precio).
const SABOR_PREFIX = 'Sabor: ';

// El producto define sus sabores en `flavors` como texto separado por comas (ej. "Colombiana, Manzana, Pepsi")
export function parseFlavors(flavors) {
  return (flavors || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseFlavorPrices(flavorPrices) {
  if (!flavorPrices) return {};
  if (typeof flavorPrices === 'object') return flavorPrices;
  try {
    const parsed = JSON.parse(flavorPrices);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function productTieneSabores(flavors) {
  return parseFlavors(flavors).length > 0;
}

// El sabor elegido vive dentro de las notas como "Sabor: X" (junto con el resto de texto libre,
// separado por " • " si hay más notas — mismo separador que ya usa Domicilios para combinar notas).
function extractSabor(value) {
  const match = (value || '').match(/Sabor:\s*([^•]+)/i);
  return match ? match[1].trim() : null;
}

// Para pantallas que arman el item de una sola vez (ej. PedidoMesa: el precio
// no se muestra mientras se elige el sabor, solo importa al agregar), resuelve
// el precio final leyendo el sabor directamente de las notas ya guardadas.
export function resolveSaborPrice(flavorPrices, basePrice, notes) {
  const priceMap = parseFlavorPrices(flavorPrices);
  if (Object.keys(priceMap).length === 0) return basePrice;
  const sabor = extractSabor(notes);
  if (!sabor) return basePrice;
  const key = Object.keys(priceMap).find((k) => k.toLowerCase() === sabor.toLowerCase());
  return key ? priceMap[key] : basePrice;
}

function removeSaborSegment(value) {
  if (!value) return '';
  let rest = value.replace(/Sabor:\s*[^•]+/i, '');
  rest = rest.replace(/•\s*•/g, '•'); // dos separadores seguidos, por si el sabor estaba en medio
  rest = rest.replace(/^\s*•\s*/, '').replace(/\s*•\s*$/, '').trim();
  return rest;
}

function combineNotes(rest, sabor) {
  if (!sabor) return rest;
  const saborText = `${SABOR_PREFIX}${sabor}`;
  return rest ? `${saborText} • ${rest}` : saborText;
}

export default function SaboresChips({ flavors, flavorPrices, basePrice, value, onChange, onPriceChange }) {
  const sabores = parseFlavors(flavors);
  if (sabores.length === 0) return null;

  const priceMap = parseFlavorPrices(flavorPrices);
  const hasPricing = Object.keys(priceMap).length > 0;

  const current = extractSabor(value);
  const rest = removeSaborSegment(value);
  const isSelected = (sabor) => current && current.toLowerCase() === sabor.toLowerCase();

  const selectSabor = (sabor) => {
    const next = isSelected(sabor) ? null : sabor; // tocar de nuevo el mismo sabor lo quita
    onChange(combineNotes(rest, next));
    if (hasPricing && onPriceChange) {
      onPriceChange(next ? (priceMap[next] ?? basePrice) : basePrice);
    }
  };

  return (
    <div className="sabores-chips">
      <div className="sabores-chips-label">Sabor</div>
      <div className="sabores-chips-row">
        {sabores.map((sabor) => (
          <button
            key={sabor}
            type="button"
            className={`sabor-chip ${isSelected(sabor) ? 'active' : ''}`}
            onClick={() => selectSabor(sabor)}
          >
            {sabor}
            {hasPricing && (
              <span className="sabor-chip-price"> · {formatPriceCOP(priceMap[sabor] ?? basePrice)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
