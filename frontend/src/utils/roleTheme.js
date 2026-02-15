/**
 * Theme helper por rol
 * FASE 18.1: Colores y estilos consistentes por rol
 */
export function getRoleTheme(role) {
  const isCaja = role === "CAJA";
  return {
    role,
    accent: isCaja ? "#dc3545" : "#0d6efd",      // caja rojo / mesero azul
    badgeBg: isCaja ? "#eaf7ea" : "#eaf2ff",
    badgeBorder: isCaja ? "#1f7a1f" : "#1e5aa8",
    title: isCaja ? "CAJA" : "MESERO",
  };
}
