/**
 * Utilidades para formateo de moneda COP
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
