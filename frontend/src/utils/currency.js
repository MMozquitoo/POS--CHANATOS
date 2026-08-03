/**
 * Utilidades para formateo de moneda COP en el frontend
 * Formato simplificado: 8k = 8.000 COP, 10k = 10.000 COP
 */

/**
 * Formatea un monto en COP usando formato simplificado con "k"
 * @param {number} amount - Monto en pesos colombianos
 * @returns {string} Monto formateado (ej: "8k", "10.5k", "1.2k")
 */
export function formatPriceSimplified(amount) {
  if (amount === 0) return '0';
  
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(value)) return '0';
  
  // Si es menor a 1000, mostrar el número completo
  if (value < 1000) {
    return value.toString();
  }
  
  // Dividir por 1000 y mostrar con "k"
  const inThousands = value / 1000;
  
  // Si es un número entero, mostrar sin decimales
  if (inThousands % 1 === 0) {
    return `${inThousands}k`;
  }
  
  // Mostrar con un decimal si es necesario
  return `${inThousands.toFixed(1)}k`;
}

/**
 * Convierte un precio en formato simplificado a número
 * @param {string} priceStr - Precio en formato simplificado (ej: "8k", "10.5k")
 * @returns {number} Precio en pesos colombianos
 */
export function parsePriceSimplified(priceStr) {
  if (!priceStr || priceStr === '0') return 0;
  
  const str = priceStr.toString().trim().toLowerCase();
  
  // Remover espacios y convertir a número
  if (str.includes('k')) {
    const numStr = str.replace('k', '').trim();
    const num = parseFloat(numStr);
    if (isNaN(num)) return 0;
    return num * 1000;
  }
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Interpreta un monto digitado por el usuario en formato colombiano.
 * El punto (o la coma) se trata como separador de miles: "678.000" = 678000.
 * parseFloat("678.000") daba 678 — bug real del cierre de caja 2026-08-02.
 * @param {string|number} value - Lo digitado (ej: "678.000", "12,500", "9000")
 * @returns {number} Monto en pesos, o NaN si no es un número
 */
export function parseMontoCOP(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return NaN;

  let s = String(value).trim().replace(/[$\s]/g, '');
  if (!s) return NaN;

  // Un solo . o , al final con 1-2 dígitos = decimal real (ej: "1.5"); se redondea al peso
  let decimales = '';
  const m = s.match(/^(-?[\d.,]+)[.,](\d{1,2})$/);
  if (m) {
    s = m[1];
    decimales = m[2];
  }

  // Todo otro . o , es separador de miles
  s = s.replace(/[.,]/g, '');
  if (!/^-?\d+$/.test(s)) return NaN;

  const entero = parseInt(s, 10);
  return decimales ? Math.round(parseFloat(`${entero}.${decimales}`)) : entero;
}

/**
 * Formatea un monto en COP usando formato estándar colombiano (sin formato simplificado)
 * Útil para reportes o cuando se necesita el formato completo
 * @param {number} amount - Monto en pesos colombianos
 * @returns {string} Monto formateado (ej: "$ 8.000", "$ 10.500")
 */
export function formatPriceCOP(amount) {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(value)) return '$ 0';
  
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
