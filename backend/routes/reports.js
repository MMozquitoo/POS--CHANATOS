import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { agruparTopProducts } from "../utils/topProducts.js";

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// exceljs se carga SOLO cuando se usa (mismo patrón que backup.js): si un
// equipo actualizado por el botón remoto no la tiene, el POS igual arranca.
async function cargarExcelJS() {
  try {
    return (await import("exceljs")).default;
  } catch {
    return null;
  }
}

// Analítica de negocio sobre pagos válidos e items pagados (FASE F10).
// Compartida entre GET /summary (JSON) y GET /summary/excel (descarga).
async function computeSummary(db, from, to) {
  // Ventas por método (pagos no anulados)
  const byMethod = await db.all(
    `SELECT method,
            COUNT(*) as count,
            COALESCE(SUM(amount), 0) as total,
            COALESCE(SUM(tip_amount), 0) as tips
     FROM payments
     WHERE voided_at IS NULL AND substr(created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY method
     ORDER BY total DESC`,
    [from, to]
  );

  const totals = byMethod.reduce(
    (acc, r) => ({
      sales: acc.sales + r.total,
      tips: acc.tips + r.tips,
      payments: acc.payments + r.count,
    }),
    { sales: 0, tips: 0, payments: 0 }
  );

  // Ventas por canal (mesas / ventanilla / domicilios)
  const byService = await db.all(
    `SELECT COALESCE(o.service, 'MESA') as service,
            COUNT(*) as count,
            COALESCE(SUM(p.amount), 0) as total,
            COALESCE(SUM(p.tip_amount), 0) as tips
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.voided_at IS NULL AND substr(p.created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY COALESCE(o.service, 'MESA')
     ORDER BY total DESC`,
    [from, to]
  );

  // Órdenes pagadas y descuentos otorgados
  const ordersRow = await db.get(
    `SELECT COUNT(*) as orders, COALESCE(SUM(discount_amount), 0) as discounts
     FROM orders
     WHERE status = 'PAGADA' AND substr(paid_at, 1, 10) BETWEEN ? AND ?`,
    [from, to]
  );

  // Canceladas de verdad (las fusiones de cuentas no cuentan)
  const cancelledRow = await db.get(
    `SELECT COUNT(*) as cancelled
     FROM orders
     WHERE status = 'CANCELADO'
       AND substr(cancelled_at, 1, 10) BETWEEN ? AND ?
       AND (cancel_reason IS NULL OR cancel_reason NOT LIKE 'Unida a%')`,
    [from, to]
  );

  // Ventas por día
  const byDay = await db.all(
    `SELECT substr(created_at, 1, 10) as day,
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
     FROM payments
     WHERE voided_at IS NULL AND substr(created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY day
     ORDER BY day`,
    [from, to]
  );

  // Ventas por hora del día (para ver las horas pico)
  const byHour = await db.all(
    `SELECT substr(created_at, 12, 2) as hour,
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
     FROM payments
     WHERE voided_at IS NULL AND substr(created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY hour
     ORDER BY hour`,
    [from, to]
  );

  // FASE F10: tiempo de preparación (pedido creado → orden LISTA)
  const prepRow = await db.get(
    `SELECT COUNT(*) as count,
            AVG((julianday(ready_at) - julianday(created_at)) * 24 * 60) as avg_min,
            MAX((julianday(ready_at) - julianday(created_at)) * 24 * 60) as max_min
     FROM orders
     WHERE ready_at IS NOT NULL
       AND substr(created_at, 1, 10) BETWEEN ? AND ?
       AND julianday(ready_at) >= julianday(created_at)`,
    [from, to]
  );

  // Pedidos por hora de CREACIÓN (cuándo llega la gente — para staffing).
  // Incluye todas las órdenes creadas: una cancelada o fusionada también fue demanda.
  const ordersByHour = await db.all(
    `SELECT substr(created_at, 12, 2) as hour, COUNT(*) as count
     FROM orders
     WHERE substr(created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY hour
     ORDER BY hour`,
    [from, to]
  );

  // Productos vendidos (items pagados, no anulados). SIN LIMIT: con LIMIT 10
  // los productos baratos (ej. gaseosa 250 ml a $2.000) quedaban por fuera y
  // parecía que no se estaban contando (reporte del dueño 2026-08-04).
  // Agrupado por producto BASE (sencillo + combo = la misma hamburguesa), con
  // el desglose de variantes en `detail` — ver utils/topProducts.js
  const topRows = await db.all(
    `SELECT COALESCE(p.name, oi.name) as base,
            p.variant as variant,
            SUM(oi.qty) as qty,
            COALESCE(SUM(oi.qty * oi.price), 0) as total
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.voided_at IS NULL
       AND oi.paid_at IS NOT NULL
       AND substr(oi.paid_at, 1, 10) BETWEEN ? AND ?
     GROUP BY base, variant`,
    [from, to]
  );
  const topProducts = agruparTopProducts(topRows).sort((a, b) => b.total - a.total);

  // Hamburguesas vendidas (unidades pagadas de productos categoría
  // HAMBURGUESAS, sencillas y dobles cuentan igual — el dueño pidió el
  // conteo de unidades separado del consumo de carne, ver abajo)
  const burgersRow = await db.get(
    `SELECT COALESCE(SUM(oi.qty), 0) as qty
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.voided_at IS NULL AND oi.paid_at IS NOT NULL
       AND substr(oi.paid_at, 1, 10) BETWEEN ? AND ?
       AND p.category = 'HAMBURGUESAS'`,
    [from, to]
  );

  // Consumo de insumos según receta (carne, pan, etc.) de los items pagados
  // en el rango — independiente de si se compró ese insumo ese mismo día
  // (eso es "Compras de insumos" en /pnl, esto es lo que de verdad se usó).
  const ingredientConsumption = await db.all(
    `SELECT r.ingredient_id, i.name as ingredient_name, i.unit,
            COALESCE(SUM(r.qty_used * oi.qty), 0) as qty_consumed
     FROM order_items oi
     JOIN recipes r ON r.product_id = oi.product_id
     JOIN ingredients i ON i.id = r.ingredient_id
     WHERE oi.voided_at IS NULL AND oi.paid_at IS NOT NULL
       AND substr(oi.paid_at, 1, 10) BETWEEN ? AND ?
       AND oi.is_custom = 0
       AND i.is_active = 1
     GROUP BY r.ingredient_id
     ORDER BY qty_consumed DESC`,
    [from, to]
  );

  const orders = ordersRow?.orders || 0;
  // RAPPI: la plataforma le paga al local después (no es plata del día — se
  // excluye del arqueo en cash.js), pero SÍ es venta del período: entra en
  // totals.sales y se informa aparte para que el dueño sepa cuánto de ese
  // total todavía está "en Rappi".
  const rappiSales = byMethod.find((r) => r.method === "RAPPI")?.total || 0;

  // RAPPI (2026-10-25, dueño): Rappi recauda y transfiere después (semanal).
  // Esta sección es para cuadrar ese depósito: cuánto debe Rappi por los
  // pedidos del período, día por día. El pago RAPPI se registra cuando el
  // pedido queda listo (closeOrderIfPrepaid) — con o sin caja abierta, por eso
  // NO se saca de cash_sessions sino directo de payments.
  const rappiRow = byMethod.find((r) => r.method === "RAPPI");
  const rappiByDay = await db.all(
    `SELECT substr(created_at, 1, 10) as day,
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
     FROM payments
     WHERE voided_at IS NULL AND method = 'RAPPI'
       AND substr(created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY day
     ORDER BY day`,
    [from, to]
  );

  // CONTRATO (2026-10-25): fiados/pedidos grandes que pagan después. Entra en
  // totals.sales (es venta del período, como Rappi) y se informa aparte:
  // cuánto de eso fue a contrato y cuánto sigue pendiente de cobrar. El
  // detalle (quién, cuándo, si ya pagó) va a la hoja "Contratos" del Excel.
  const contratoRow = byMethod.find((r) => r.method === "CONTRATO");
  const contratosDetalle = await db.all(
    `SELECT p.amount, p.created_at, p.debtor_name, p.settled_at, p.settled_method,
            o.daily_no, o.code, o.customer_name
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     WHERE p.voided_at IS NULL AND p.method = 'CONTRATO'
       AND substr(p.created_at, 1, 10) BETWEEN ? AND ?
     ORDER BY p.created_at`,
    [from, to]
  );

  return {
    from,
    to,
    totals: {
      sales: totals.sales,
      tips: totals.tips,
      payments: totals.payments,
      orders,
      avgTicket: orders > 0 ? Math.round(totals.sales / orders) : 0,
      discounts: ordersRow?.discounts || 0,
      cancelled: cancelledRow?.cancelled || 0,
      prepCount: prepRow?.count || 0,
      avgPrepMin: prepRow?.avg_min != null ? Math.round(prepRow.avg_min) : null,
      maxPrepMin: prepRow?.max_min != null ? Math.round(prepRow.max_min) : null,
      burgersSold: burgersRow?.qty || 0,
      rappi: rappiSales,
      contrato: contratoRow?.total || 0,
    },
    rappi: {
      total: rappiSales,
      count: rappiRow?.count || 0,
      byDay: rappiByDay,
    },
    contratos: {
      total: contratoRow?.total || 0,
      count: contratoRow?.count || 0,
      pendiente: contratosDetalle.filter((c) => !c.settled_at).reduce((s, c) => s + (c.amount || 0), 0),
      rows: contratosDetalle,
    },
    byMethod,
    byService,
    byDay,
    byHour,
    ordersByHour,
    topProducts,
    ingredientConsumption,
  };
}

// Contaduría: ventas (día a día, sin importar cuántas sesiones de caja hubo
// en el rango), compras de insumos controlados (carne/pan/etc, cash-basis:
// el día que se pagaron) y gastos/ingresos generales por categoría, en una
// sola utilidad neta. Compartida entre GET /pnl (JSON) y GET /summary/excel.
async function computePnl(db, from, to) {
  // Ventas: mismo criterio que /summary (pagos no anulados en el rango)
  const salesRow = await db.get(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
     FROM payments
     WHERE voided_at IS NULL AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    [from, to]
  );
  const sales = salesRow?.total || 0;

  // Compras de insumos controlados (carne, pan, etc.): lo que se pagó ese
  // día, no lo que se consumió — cash-basis, tal como se pidió.
  const controlledPurchasesRow = await db.get(
    `SELECT COALESCE(SUM(purchase_total_cost), 0) as total, COUNT(*) as count
     FROM inventory_movements
     WHERE type = 'IN'
       AND purchase_total_cost IS NOT NULL
       AND substr(created_at, 1, 10) BETWEEN ? AND ?`,
    [from, to]
  );
  const controlledPurchases = controlledPurchasesRow?.total || 0;

  // Desglose de esas mismas compras por insumo (cuánto se gastó en pollo,
  // cuánto en carne, etc.) — mismo criterio cash-basis que el total de arriba.
  const controlledPurchasesByIngredient = await db.all(
    `SELECT ing.id as ingredient_id, ing.name as ingredient_name,
            COALESCE(SUM(im.purchase_total_cost), 0) as total,
            COUNT(*) as count
     FROM inventory_movements im
     JOIN ingredients ing ON ing.id = im.ingredient_id
     WHERE im.type = 'IN'
       AND im.purchase_total_cost IS NOT NULL
       AND substr(im.created_at, 1, 10) BETWEEN ? AND ?
     GROUP BY ing.id, ing.name
     ORDER BY total DESC`,
    [from, to]
  );

  // Gastos generales por categoría (categoría NULL → "Sin categoría")
  const expensesByCategory = await db.all(
    `SELECT COALESCE(category, 'SIN_CATEGORIA') as category,
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
     FROM manual_transactions
     WHERE type = 'EGRESO' AND transaction_date BETWEEN ? AND ?
     GROUP BY COALESCE(category, 'SIN_CATEGORIA')
     ORDER BY total DESC`,
    [from, to]
  );
  const generalExpenses = expensesByCategory.reduce((sum, r) => sum + r.total, 0);

  // Ingresos generales por categoría (aportes de capital, etc.)
  const incomeByCategory = await db.all(
    `SELECT COALESCE(category, 'SIN_CATEGORIA') as category,
            COALESCE(SUM(amount), 0) as total,
            COUNT(*) as count
     FROM manual_transactions
     WHERE type = 'INGRESO' AND transaction_date BETWEEN ? AND ?
     GROUP BY COALESCE(category, 'SIN_CATEGORIA')
     ORDER BY total DESC`,
    [from, to]
  );
  const manualIncome = incomeByCategory.reduce((sum, r) => sum + r.total, 0);

  const netProfit = sales - controlledPurchases - generalExpenses + manualIncome;

  return {
    from,
    to,
    sales,
    salesCount: salesRow?.count || 0,
    controlledPurchases,
    controlledPurchasesCount: controlledPurchasesRow?.count || 0,
    controlledPurchasesByIngredient,
    generalExpenses,
    expensesByCategory,
    manualIncome,
    incomeByCategory,
    netProfit,
  };
}

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD (FASE F10)
router.get("/summary", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
      return res.status(400).json({ error: "Parámetros from y to requeridos (YYYY-MM-DD)" });
    }
    res.json(await computeSummary(db, from, to));
  } catch (error) {
    console.error("Error generando reporte:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD (Contaduría)
router.get("/pnl", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
      return res.status(400).json({ error: "Parámetros from y to requeridos (YYYY-MM-DD)" });
    }
    res.json(await computePnl(db, from, to));
  } catch (error) {
    console.error("Error generando reporte de contaduría:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});


const METHOD_LABELS = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia", RAPPI: "Rappi", CONTRATO: "Contrato" };
const SERVICE_LABELS = { MESA: "Mesa", VENTANILLA: "Ventanilla", DOMICILIO: "Domicilio" };

// GET /api/reports/summary/excel?from=&to= → el reporte de ventas del rango
// en un .xlsx con una hoja por sección, para llevar/archivar fuera del POS.
router.get("/summary/excel", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
      return res.status(400).json({ error: "Parámetros from y to requeridos (YYYY-MM-DD)" });
    }

    const ExcelJS = await cargarExcelJS();
    if (!ExcelJS) {
      return res.status(503).json({
        error: "Esta versión del servidor no tiene el módulo de Excel. Instala la versión nueva del POS.",
      });
    }

    const db = getDb();
    const summary = await computeSummary(db, from, to);

    const wb = new ExcelJS.Workbook();
    wb.creator = "POS Chanatos";

    const negrita = (hoja) => { hoja.getRow(1).font = { bold: true }; };

    // Resumen
    const resumen = wb.addWorksheet("Resumen");
    resumen.columns = [{ header: "Concepto", key: "k", width: 32 }, { header: "Valor", key: "v", width: 20 }];
    resumen.addRows([
      { k: "Periodo", v: `${from} a ${to}` },
      { k: "Ventas", v: summary.totals.sales },
      { k: "Órdenes pagadas", v: summary.totals.orders },
      { k: "Ticket promedio", v: summary.totals.avgTicket },
      { k: "Propinas", v: summary.totals.tips },
      { k: "Descuentos dados", v: summary.totals.discounts },
      { k: "Canceladas", v: summary.totals.cancelled },
      { k: "Hamburguesas vendidas", v: summary.totals.burgersSold },
      { k: "Preparación promedio (min)", v: summary.totals.avgPrepMin ?? "" },
      { k: "Preparación más lenta (min)", v: summary.totals.maxPrepMin ?? "" },
    ]);
    negrita(resumen);

    // Productos vendidos
    const productos = wb.addWorksheet("Productos vendidos");
    productos.columns = [
      { header: "Producto", key: "name", width: 32 },
      { header: "Unidades", key: "qty", width: 12 },
      { header: "Total vendido", key: "total", width: 16 },
      { header: "Detalle", key: "detail", width: 26 },
    ];
    productos.addRows(summary.topProducts);
    negrita(productos);

    // Por método de pago
    const metodos = wb.addWorksheet("Por método de pago");
    metodos.columns = [
      { header: "Método", key: "method", width: 20 },
      { header: "Pagos", key: "count", width: 10 },
      { header: "Total", key: "total", width: 16 },
      { header: "Propinas", key: "tips", width: 14 },
    ];
    metodos.addRows(summary.byMethod.map((r) => ({ ...r, method: METHOD_LABELS[r.method] || r.method })));
    negrita(metodos);

    // Por canal
    const canales = wb.addWorksheet("Por canal");
    canales.columns = [
      { header: "Canal", key: "service", width: 20 },
      { header: "Pagos", key: "count", width: 10 },
      { header: "Total", key: "total", width: 16 },
      { header: "Propinas", key: "tips", width: 14 },
    ];
    canales.addRows(summary.byService.map((r) => ({ ...r, service: SERVICE_LABELS[r.service] || r.service })));
    negrita(canales);

    // Por día
    const dias = wb.addWorksheet("Por día");
    dias.columns = [
      { header: "Día", key: "day", width: 14 },
      { header: "Pagos", key: "count", width: 10 },
      { header: "Total", key: "total", width: 16 },
    ];
    dias.addRows(summary.byDay);
    negrita(dias);

    // Rappi: para cuadrar el depósito semanal (Rappi recauda y paga después)
    const rappi = wb.addWorksheet("Rappi");
    rappi.columns = [
      { header: "Día", key: "day", width: 14 },
      { header: "Pedidos", key: "count", width: 10 },
      { header: "Total", key: "total", width: 16 },
    ];
    rappi.addRows(summary.rappi.byDay);
    rappi.addRow([]);
    rappi.addRow(["Total que Rappi debe transferir", "", summary.rappi.total]).font = { bold: true };
    negrita(rappi);

    // Contratos: fiados y pedidos grandes del período, quién debe y si ya pagó
    if (summary.contratos.count > 0) {
      const contratos = wb.addWorksheet("Contratos");
      contratos.columns = [
        { header: "Cliente", key: "cliente", width: 28 },
        { header: "Orden", key: "orden", width: 12 },
        { header: "Día", key: "dia", width: 14 },
        { header: "Total", key: "total", width: 16 },
        { header: "Estado", key: "estado", width: 26 },
      ];
      contratos.addRows(summary.contratos.rows.map((c) => ({
        cliente: c.debtor_name || c.customer_name || "Sin nombre",
        orden: c.daily_no || c.code || "",
        dia: String(c.created_at || "").slice(0, 10),
        total: c.amount,
        estado: c.settled_at
          ? `Pagado ${String(c.settled_at).slice(0, 10)}${c.settled_method ? ` (${METHOD_LABELS[c.settled_method] || c.settled_method})` : ""}`
          : "Pendiente",
      })));
      contratos.addRow([]);
      contratos.addRow(["Pendiente por cobrar", "", "", summary.contratos.pendiente]).font = { bold: true };
      negrita(contratos);
    }

    // (Hoja "Consumo de insumos" quitada el 2026-10-25: el inventario va a
    // vivir en chanatos-plataforma-dev, igual que en la pantalla de Reportes.)

    // (Hoja "Contaduría" quitada el 2026-10-25, igual que en la pantalla:
    // la contabilidad va a vivir en chanatos-plataforma-dev.)

    const buffer = await wb.xlsx.writeBuffer();
    const nombre = `Reporte-Ventas-${from}-a-${to}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error generando el Excel del reporte:", error);
    res.status(500).json({ error: "No se pudo generar el archivo de Excel" });
  }
});

export default router;
