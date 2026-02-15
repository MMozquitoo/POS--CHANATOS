/**
 * Utilidades para manejo de zona horaria America/Bogota en el frontend
 * El sistema debe operar exclusivamente con hora local del restaurante
 */

/**
 * Obtiene la fecha/hora actual en zona horaria America/Bogota
 * @returns {Date} Fecha actual en zona horaria de Bogotá
 */
export function getBogotaTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
}

/**
 * Formatea una fecha a string en zona horaria America/Bogota
 * @param {Date|string} date - Fecha a formatear
 * @param {Object} options - Opciones de formato
 * @returns {string} Fecha formateada en zona horaria de Bogotá
 */
export function formatBogotaDate(date, options = {}) {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  
  const defaultOptions = {
    timeZone: 'America/Bogota',
    locale: 'es-CO',
    ...options
  };
  
  return new Intl.DateTimeFormat('es-CO', defaultOptions).format(d);
}

/**
 * Formatea una fecha completa (fecha + hora) en zona horaria America/Bogota
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha y hora formateada
 */
export function formatBogotaDateTime(date) {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Formatea solo la hora en zona horaria America/Bogota
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Hora formateada (HH:mm)
 */
export function formatBogotaTime(date) {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Formatea solo la fecha en zona horaria America/Bogota
 * @param {Date|string} date - Fecha a formatear
 * @returns {string} Fecha formateada (YYYY-MM-DD)
 */
export function formatBogotaDateOnly(date) {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  
  // Usar Intl.DateTimeFormat para obtener partes de la fecha en zona horaria de Bogotá
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  
  return `${year}-${month}-${day}`;
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD en zona horaria America/Bogota
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function getBogotaDateString() {
  return formatBogotaDateOnly(new Date());
}
