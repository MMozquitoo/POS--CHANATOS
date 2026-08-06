// Layout de mesas 1-10 con posiciones x, y, w, h en porcentaje
// Ajuste 2026-08-06 (pedido del dueño): se intercambiaron 7<->8 y 1<->3
// para que el plano coincida con la numeración física del local.
export const tablesLayout = [
  // Fila superior (7,4,1) - y = 12
  { id: 7, x: 50, y: 12, w: 12, h: 16 },
  { id: 4, x: 66, y: 12, w: 12, h: 16 },
  { id: 1, x: 82, y: 12, w: 12, h: 16 },

  // Fila media (5,2) - y = 40
  { id: 5, x: 66, y: 40, w: 12, h: 16 },
  { id: 2, x: 82, y: 40, w: 12, h: 16 },

  // Fila inferior (8,6,3) - y = 68
  { id: 8, x: 50, y: 68, w: 12, h: 16 },
  { id: 6, x: 66, y: 68, w: 12, h: 16 },
  { id: 3, x: 82, y: 68, w: 12, h: 16 },
  
  // Estaciones como mesas (9, 10) - y = 10 (izquierda)
  { id: 9, x: 6, y: 10, w: 14, h: 14 },  // VENTANILLA
  { id: 10, x: 24, y: 10, w: 14, h: 14 }, // DOMICILIOS
];
