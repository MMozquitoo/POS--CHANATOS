import './SalsasChips.css';
import { productoLlevaSalsas } from './SalsasChips';
import { formatPriceCOP } from '../utils/currency.js';

// Adicionales (queso extra, tocineta, carne adicional...) de un item.
//
// Los adicionales son PRODUCTOS de la categoría ADICIONALES del menú (CAJA los
// crea y les pone precio en Menú/Precios, igual que a cualquier producto —
// no hay una pantalla aparte). Al elegirlos para una hamburguesa:
//   - se escriben en las notas del item como "+ Queso" (cocina y recibo los
//     ven pegados al plato, no como una línea suelta sin saber de qué plato es)
//   - su precio se SUMA al precio unitario del item (ver adicionalesExtra).
// Trade-off asumido: el adicional no descuenta inventario por receta (viaja
// dentro del plato, sin product_id propio). Si eso importa, agregarlo como
// item aparte desde la pestaña ADICIONALES.
const ADICIONAL_PREFIX = '+ ';
const CATEGORIA_ADICIONALES = /^ADICIONAL/i;

export function getAdicionales(productsByCategory) {
  const key = Object.keys(productsByCategory || {}).find((k) => CATEGORIA_ADICIONALES.test(k.replace(/ /g, '_')));
  if (!key) return [];
  return (productsByCategory[key] || []).map((p) => ({
    id: p.id,
    name: p.displayName || p.name,
    price: p.price || 0,
  }));
}

// Un adicional no lleva adicionales; las bebidas tampoco (misma regla que salsas)
export function productoLlevaAdicionales(product, category) {
  if (category && CATEGORIA_ADICIONALES.test(String(category).replace(/ /g, '_'))) return false;
  return productoLlevaSalsas(product, category);
}

function parseParts(value) {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function esTokenAdicional(part) {
  return part.startsWith(ADICIONAL_PREFIX) || part.startsWith('+');
}

function nombreDeToken(part) {
  return part.replace(/^\+\s*/, '').trim().toLowerCase();
}

// Adicionales marcados en las notas (solo los que existen en la lista)
export function parseAdicionales(notes, adicionales) {
  const lista = adicionales || [];
  return parseParts(notes)
    .filter(esTokenAdicional)
    .map((p) => lista.find((a) => a.name.toLowerCase() === nombreDeToken(p)))
    .filter(Boolean);
}

// Cuánto suman al precio unitario los adicionales marcados en las notas
export function adicionalesExtra(notes, adicionales) {
  return parseAdicionales(notes, adicionales).reduce((s, a) => s + (a.price || 0), 0);
}

export default function AdicionalesChips({ adicionales, value, onChange }) {
  const lista = adicionales || [];
  if (lista.length === 0) return null;

  const parts = parseParts(value);
  const isOn = (a) => parts.some((p) => esTokenAdicional(p) && nombreDeToken(p) === a.name.toLowerCase());

  const toggle = (a) => {
    const rest = parts.filter((p) => !(esTokenAdicional(p) && nombreDeToken(p) === a.name.toLowerCase()));
    const next = isOn(a) ? rest : [...rest, `${ADICIONAL_PREFIX}${a.name}`];
    onChange(next.join(', '));
  };

  return (
    <div className="salsas-chips adicionales-chips">
      {lista.map((a) => (
        <button
          key={a.id ?? a.name}
          type="button"
          className={`salsa-chip ${isOn(a) ? 'active' : ''}`}
          onClick={() => toggle(a)}
        >
          + {a.name}
          {a.price > 0 && <span style={{ opacity: 0.75, fontWeight: 500 }}> · {formatPriceCOP(a.price)}</span>}
        </button>
      ))}
    </div>
  );
}
