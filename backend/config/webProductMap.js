// backend/config/webProductMap.js
//
// Mapea los ids del menú de chanatos-web (src/data/menu.ts) a los product_id
// reales del POS (tabla `products`). No hay una columna compartida entre los
// dos sistemas — este mapeo se mantiene a mano y hay que actualizarlo si
// cambia el menú de cualquiera de los dos lados.
//
// Las 3 hamburguesas tienen variante Sencillo/Combo en el POS (dos filas de
// producto separadas); el resto es un solo product_id.

export const WEB_PRODUCT_MAP = {
  "hamburguesa-clasica": { sencillo: 16, combo: 17 },
  "hamburguesa-chanata": { sencillo: 18, combo: 19 },
  "hamburguesa-doble-carne": { sencillo: 20, combo: 21 },
  "perro-clasico": 29,
  "perro-especial": 30,
  "sandwich-pollo": 31,
  "filete-pollo": 11,
  "filete-cerdo": 12,
  "papas-sencilla": 26,
  "salchipapa-sencilla": 27,
  "papa-loka": 28,
  "gaseosa-personal": 1,
  "jugo-hit": 2,
  "mr-tea": 3,
  "coca-personal": 4,
  "gaseosa-litro": 5,
  "cerveza-andina": 6,
  "cerveza-poker": 7,
  "cerveza-heineken": 8,
  "cerveza-corona": 9,
  "jugos-agua": 22,
  "jugos-leche": 23,
  michelada: 24,
  "limonada-natural": 25,
};

/**
 * Retorna el product_id del POS para un item de la web, o null si no hay
 * mapeo (ítem custom: se crea igual en el POS, solo que sin product_id ni
 * descuento de inventario).
 *
 * @param {string} webId - id del item en menu.ts (ej. "hamburguesa-clasica")
 * @param {boolean} isCombo - true si modifiersLabel incluye "Combo"
 */
export function resolveProductId(webId, isCombo) {
  const entry = WEB_PRODUCT_MAP[webId];
  if (entry == null) return null;
  if (typeof entry === "number") return entry;
  return isCombo ? entry.combo : entry.sencillo;
}
