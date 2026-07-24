import './SaboresChips.css';

// Sabores configurables por producto (ej. gaseosas personales: Colombiana, Manzana, Pepsi).
// A diferencia de las salsas (selección múltiple), un producto solo tiene UN sabor a la vez.
// Igual que SalsasChips: no se toca el modelo de datos, se escribe texto legible en `notes`,
// así cocina ("(Sabor: Colombiana)") y el recibo ("Nota: Sabor: Colombiana") lo muestran igual
// que cualquier otra nota, sin mezclar formatos raros.
const SABOR_PREFIX = 'Sabor: ';

// El producto define sus sabores en `flavors` como texto separado por comas (ej. "Colombiana, Manzana, Pepsi")
export function parseFlavors(flavors) {
  return (flavors || '').split(',').map((s) => s.trim()).filter(Boolean);
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

export default function SaboresChips({ flavors, value, onChange }) {
  const sabores = parseFlavors(flavors);
  if (sabores.length === 0) return null;

  const current = extractSabor(value);
  const rest = removeSaborSegment(value);
  const isSelected = (sabor) => current && current.toLowerCase() === sabor.toLowerCase();

  const selectSabor = (sabor) => {
    const next = isSelected(sabor) ? null : sabor; // tocar de nuevo el mismo sabor lo quita
    onChange(combineNotes(rest, next));
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
          </button>
        ))}
      </div>
    </div>
  );
}
