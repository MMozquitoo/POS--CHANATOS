/**
 * HOTFIX M7.1 / FASE M8.2 — Helper para mesas especiales (VENTANILLA / DOMICILIOS).
 * Regla: specialTables solo en bloque superior; NUNCA en grid/listado.
 * Cada mesa va a exactamente un array (sin duplicados).
 */

const VENTANILLA_NUMBER = 9;
const DOMICILIOS_NUMBER = 10;

function normalize(x) {
  if (x == null) return '';
  return String(x).toLowerCase().trim();
}

function labelMatches(text, ...keys) {
  const t = normalize(text);
  return keys.some((k) => t.includes(normalize(k)));
}

/**
 * true si la mesa es Ventanilla o Domicilios.
 * Criterios (OR): number 9|10, o label/name incluye 'VENTANILLA'|'DOMICILIO' (case-insensitive).
 */
export function isSpecialTable(t) {
  if (!t || typeof t !== 'object') return false;
  const n = t.number != null ? Number(t.number) : NaN;
  if (n === VENTANILLA_NUMBER || n === DOMICILIOS_NUMBER) return true;
  const raw = [t.label, t.name].filter(Boolean).join(' ');
  if (!raw) return false;
  return labelMatches(raw, 'VENTANILLA', 'DOMICILIO', 'DOMICILIOS');
}

/**
 * 'VENTANILLA' | 'DOMICILIOS' | null
 */
export function getSpecialType(t) {
  if (!t || !isSpecialTable(t)) return null;
  const n = t.number != null ? Number(t.number) : t.id;
  if (Number(n) === VENTANILLA_NUMBER) return 'VENTANILLA';
  if (Number(n) === DOMICILIOS_NUMBER) return 'DOMICILIOS';
  const raw = normalize([t.label, t.name].filter(Boolean).join(' '));
  if (raw.includes('ventanilla')) return 'VENTANILLA';
  if (raw.includes('domicilio')) return 'DOMICILIOS';
  return null;
}

/**
 * splitTables(tables) → { regularTables, specialTables }
 *
 * - specialTables: mesas con number 9|10 O label/name que incluye 'VENTANILLA'|'DOMICILIO' (case-insensitive).
 * - regularTables: el resto (p. ej. number 1..8).
 * - Sin duplicados: cada mesa está en uno y solo uno de los dos arrays.
 *
 * Cuando existan mesas 9 y 10, specialTables.length === 2.
 */
export function splitTables(tables = []) {
  const regularTables = [];
  const specialTables = [];

  for (const t of tables) {
    if (!t || typeof t !== 'object') continue;
    if (isSpecialTable(t)) {
      specialTables.push(t);
    } else {
      regularTables.push(t);
    }
  }

  return { regularTables, specialTables };
}
