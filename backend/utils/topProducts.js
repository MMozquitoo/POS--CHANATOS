// "Más vendidos" agrupados por PRODUCTO BASE (products.name), conservando el
// detalle de variantes. Pedido del dueño (2026-10-25): "Hamburguesa Clásica -
// Sencillo" y "- Combo" son LA MISMA hamburguesa — la vista general va por
// hamburguesa y el combo queda como desglose, no como producto aparte.
//
// Entrada: filas SQL agrupadas por (base, variant), donde
//   base = COALESCE(p.name, oi.name) y variant = p.variant
// (el join por product_id arregla también filas viejas cuyo name no traía la
// variante). Salida: [{ name, qty, total, detail? }].
//   - UNA sola variante → name = "Base - Variante", sin detail: para gaseosas
//     y demás ("Coca-Cola Personal - 250 ml") no cambia nada.
//   - VARIAS variantes → name = base, detail = "8 sencillo · 4 combo"
//     (variant NULL = la versión sola del producto; se rotula "sencillo").
export function agruparTopProducts(rows) {
  const grupos = new Map();
  for (const r of rows) {
    let g = grupos.get(r.base);
    if (!g) {
      g = { base: r.base, qty: 0, total: 0, variantes: new Map() };
      grupos.set(r.base, g);
    }
    g.qty += r.qty || 0;
    g.total += r.total || 0;
    // Variante NULL (item personalizado o producto sin variante) cuenta como
    // "sencillo": filas viejas sin product_id se funden con la variante real
    // en vez de salir "2 sencillo · 2 sencillo".
    const key = (r.variant || "Sencillo").toLowerCase();
    const v = g.variantes.get(key) || { variant: r.variant || null, qty: 0 };
    v.variant = v.variant || r.variant || null;
    v.qty += r.qty || 0;
    g.variantes.set(key, v);
  }
  return [...grupos.values()].map((g) => {
    const variantes = [...g.variantes.values()];
    if (variantes.length <= 1) {
      const v = variantes[0]?.variant;
      return { name: v ? `${g.base} - ${v}` : g.base, qty: g.qty, total: g.total };
    }
    variantes.sort((a, b) => b.qty - a.qty);
    const detail = variantes
      .map((x) => `${x.qty} ${(x.variant || "Sencillo").toLowerCase()}`)
      .join(" · ");
    return { name: g.base, qty: g.qty, total: g.total, detail };
  });
}
