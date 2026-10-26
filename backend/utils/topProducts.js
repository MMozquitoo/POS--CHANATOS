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
// SOLO el Resumen del turno (dueño, 2026-10-25): la pantalla principal cuenta
// PRODUCCIÓN, no referencias del menú — todas las hamburguesas en UNA línea
// (la Doble Carne cuenta por 2: son dos carnes), todos los perros juntos
// (sencillo y especial cuentan igual), y el resto igual que
// agruparTopProducts. Reportes NO usa esto: allá sigue producto por producto.
const FAMILIAS = {
  HAMBURGUESAS: { nombre: "Hamburguesas", prefijo: /^hamburguesa\s+/i },
  PERROS_CALIENTES: { nombre: "Perros calientes", prefijo: /^perro\s+/i },
};

// "Doble" vale por 2 (dos carnes), "Triple" por 3; el resto por 1
const pesoUnidad = (base) => (/triple/i.test(base) ? 3 : /doble/i.test(base) ? 2 : 1);

export function agruparTopResumen(rows) {
  const familias = new Map();
  const resto = [];
  for (const r of rows) {
    const fam = FAMILIAS[r.category];
    if (!fam) {
      resto.push(r);
      continue;
    }
    let f = familias.get(r.category);
    if (!f) {
      f = { name: fam.nombre, qty: 0, total: 0, porBase: new Map() };
      familias.set(r.category, f);
    }
    const peso = pesoUnidad(r.base);
    f.qty += (r.qty || 0) * peso;
    f.total += r.total || 0;
    // Etiqueta corta para el desglose: "Hamburguesa Clásica" → "clásica"
    const label = r.base.replace(fam.prefijo, "").toLowerCase() || r.base.toLowerCase();
    const e = f.porBase.get(label) || { label, qty: 0, peso };
    e.qty += r.qty || 0;
    f.porBase.set(label, e);
  }
  const famRows = [...familias.values()].map((f) => {
    const detail = [...f.porBase.values()]
      .sort((a, b) => b.qty - a.qty)
      .map((e) => `${e.qty} ${e.label}${e.peso > 1 ? ` ×${e.peso}` : ""}`)
      .join(" · ");
    return { name: f.name, qty: f.qty, total: f.total, detail };
  });
  return [...famRows, ...agruparTopProducts(resto)];
}

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
