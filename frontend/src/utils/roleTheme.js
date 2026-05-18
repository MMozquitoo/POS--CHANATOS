/**
 * Theme helper por rol
 * FASE 18.1: Colores y estilos consistentes por rol
 * Updated to use Chanatos amber brand colors
 */

const themes = {
  MESERO: {
    primary: '#F5BB4C',
    primaryDark: '#D4A03A',
    bg: '#FFF8E7',
  },
  COCINA: {
    primary: '#F5BB4C',
    primaryDark: '#D4A03A',
    bg: '#FFF8E7',
  },
  CAJA: {
    primary: '#F5BB4C',
    primaryDark: '#D4A03A',
    bg: '#FFF8E7',
  },
};

export function getRoleTheme(role) {
  const theme = themes[role] || themes.MESERO;
  return {
    role,
    accent: theme.primary,
    badgeBg: theme.bg,
    badgeBorder: theme.primaryDark,
    title: role || "MESERO",
  };
}

export default themes;
