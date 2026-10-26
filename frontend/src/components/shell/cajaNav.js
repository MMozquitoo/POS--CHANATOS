// Navegación de CAJA (rediseño 2026-10) — UNA sola definición que usan la
// barra lateral de escritorio (CajaShell), la barra inferior del celular
// (caja/BottomNav) y el cajón de menú (caja/MenuDrawer). Si se agrega una
// pantalla, va acá y aparece en los tres lugares sin duplicar rutas.

// Navegación principal (orden pedido por el dueño)
export const MAIN_NAV = [
  { key: 'resumen', label: 'Resumen', to: '/centro', icon: 'resumen' },
  { key: 'mesas', label: 'Mesas', to: '/mesas', icon: 'mesas' },
  { key: 'ordenes', label: 'Órdenes', to: '/ordenes', icon: 'ordenes' },
  { key: 'cocina', label: 'Cocina', to: '/cocina', icon: 'cocina' },
  { key: 'reportes', label: 'Reportes', to: '/reportes', icon: 'reportes' },
];

// CAJA DEL DÍA (dueño, 2026-10-25: "se usa todos los días, que sea fácil de
// encontrar"): ya no está dentro de Administración. Botón propio y destacado en
// la barra lateral y primero en el menú del celular (shell/CajaDelDiaButton).
// Con la caja cerrada el mismo botón dice "Abrir caja".
export const CIERRE_NAV = { key: 'cierre', label: 'Cierre de caja', to: '/cierre', icon: 'caja' };

// Acceso secundario "Administración": herramientas que no se usan en pleno
// servicio. Son las MISMAS pantallas y rutas de siempre (permisos intactos:
// todo vive dentro de CajaRoutes → RequireRole CAJA).
export const ADMIN_NAV = [
  { label: 'Menú y precios', to: '/menu', icon: 'menu' },
  // Contratos = fiados y pedidos grandes (ej. 200 sándwiches) que pagan
  // después: se fían al cobrar (método "Contrato") y acá se marcan pagados
  { label: 'Contratos', to: '/contratos', icon: 'cobrar' },
  // Rappi = cuadrar el depósito semanal: marcar qué pedidos ya cubrió la
  // plata que Rappi depositó (no crea pagos: la venta ya contó ese día)
  { label: 'Rappi', to: '/rappi', icon: 'domicilio' },
  // 'Compras y gastos' (/compras) oculta: compras, inventario y gastos van a
  // vivir en chanatos-plataforma-dev (dueño, 2026-10-25). El gasto rápido del
  // Cierre de caja sigue (lo necesita el conteo del efectivo).
  { label: 'Historial', to: '/historial', icon: 'historial' },
  { label: 'Auditoría', to: '/auditoria', icon: 'auditoria' },
  { label: 'Aplicación', to: '/aplicacion', icon: 'aplicacion' },
  { label: 'Conexión', to: '/conexion', icon: 'conexion' },
  // 'Impresora' (/impresora) oculta hasta que el local tenga impresora térmica
  // (dueño, 2026-10-25): la app de escritorio actual no trae la impresión
  // directa, la pantalla solo mostraba un error. Ver CLAUDE.md, Pendientes.
  { label: 'Identidad del negocio', to: '/identidad', icon: 'identidad' },
];

// Sección activa para una ruta. /mesa/:id (DetalleMesa) pertenece a la vista
// desde la que se abrió (state.from), para que la barra no "salte" de sección
// al entrar a cobrar desde Órdenes.
export function sectionFor(pathname, state) {
  if (pathname === '/centro' || pathname === '/') return 'resumen';
  if (pathname === '/mesas') return 'mesas';
  if (pathname.startsWith('/mesa/')) {
    return String(state?.from || '').startsWith('/ordenes') ? 'ordenes' : 'mesas';
  }
  if (['/ordenes', '/ventanilla', '/domicilios', '/centro-total', '/cobrar'].includes(pathname)) return 'ordenes';
  if (pathname === '/cocina') return 'cocina';
  if (pathname === '/reportes') return 'reportes';
  if (pathname === '/cierre') return 'cierre';
  return 'admin';
}
