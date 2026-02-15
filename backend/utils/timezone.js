/**
 * Utilidades para manejo de zona horaria America/Bogota
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
 * @param {string} format - Formato deseado ('ISO', 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} Fecha formateada en zona horaria de Bogotá
 */
export function formatBogotaDate(date, format = 'ISO') {
  const d = date instanceof Date ? date : new Date(date);
  const bogotaDate = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  
  if (format === 'ISO') {
    return bogotaDate.toISOString();
  }
  
  if (format === 'YYYY-MM-DD') {
    const yyyy = bogotaDate.getFullYear();
    const mm = String(bogotaDate.getMonth() + 1).padStart(2, '0');
    const dd = String(bogotaDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  
  if (format === 'YYYY-MM-DD HH:mm:ss') {
    const yyyy = bogotaDate.getFullYear();
    const mm = String(bogotaDate.getMonth() + 1).padStart(2, '0');
    const dd = String(bogotaDate.getDate()).padStart(2, '0');
    const hh = String(bogotaDate.getHours()).padStart(2, '0');
    const min = String(bogotaDate.getMinutes()).padStart(2, '0');
    const ss = String(bogotaDate.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }
  
  return bogotaDate.toISOString();
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD en zona horaria America/Bogota
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function getBogotaDateString() {
  return formatBogotaDate(new Date(), 'YYYY-MM-DD');
}

/**
 * Convierte una fecha UTC/local a zona horaria America/Bogota para SQLite
 * SQLite almacena fechas como strings, pero necesitamos asegurar que se guardan en hora local
 * @param {Date|string} date - Fecha a convertir
 * @returns {string} Fecha en formato SQLite (YYYY-MM-DD HH:mm:ss) en zona horaria de Bogotá
 */
export function toBogotaSQLiteTimestamp(date) {
  return formatBogotaDate(date || new Date(), 'YYYY-MM-DD HH:mm:ss');
}

/**
 * Convierte un timestamp SQLite a Date en zona horaria America/Bogota
 * @param {string} sqliteTimestamp - Timestamp de SQLite (YYYY-MM-DD HH:mm:ss)
 * @returns {Date} Date object interpretado como hora local de Bogotá
 */
export function fromBogotaSQLiteTimestamp(sqliteTimestamp) {
  if (!sqliteTimestamp) return null;
  // SQLite almacena como string, lo interpretamos como hora local de Bogotá
  const [datePart, timePart] = sqliteTimestamp.split(' ');
  return new Date(`${datePart}T${timePart || '00:00:00'}`);
}
