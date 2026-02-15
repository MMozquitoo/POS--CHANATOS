// Layout de mesas 1-10 con posiciones x, y, w, h en porcentaje
export const tablesLayout = [
  // Fila superior (8,4,3) - y = 12
  { id: 8, x: 50, y: 12, w: 12, h: 16 },
  { id: 4, x: 66, y: 12, w: 12, h: 16 },
  { id: 3, x: 82, y: 12, w: 12, h: 16 },

  // Fila media (5,2) - y = 40
  { id: 5, x: 66, y: 40, w: 12, h: 16 },
  { id: 2, x: 82, y: 40, w: 12, h: 16 },

  // Fila inferior (7,6,1) - y = 68
  { id: 7, x: 50, y: 68, w: 12, h: 16 },
  { id: 6, x: 66, y: 68, w: 12, h: 16 },
  { id: 1, x: 82, y: 68, w: 12, h: 16 },
  
  // Estaciones como mesas (9, 10) - y = 10 (izquierda)
  { id: 9, x: 6, y: 10, w: 14, h: 14 },  // VENTANILLA
  { id: 10, x: 24, y: 10, w: 14, h: 14 }, // DOMICILIOS
];
