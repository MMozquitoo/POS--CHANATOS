import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD (FASE F10)
// Analítica de negocio sobre pagos válidos e items pagados.
router.get("/summary", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
      return res.status(400).json({ error: "Parámetros from y to requeridos (YYYY-MM-DD)" });
    }

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
    const topProducts = await db.all(
      `SELECT name,
              SUM(qty) as qty,
              COALESCE(SUM(qty * price), 0) as total
       FROM order_items
       WHERE voided_at IS NULL
         AND paid_at IS NOT NULL
         AND substr(paid_at, 1, 10) BETWEEN ? AND ?
       GROUP BY name
       ORDER BY total DESC`,
      [from, to]
    );

    const orders = ordersRow?.orders || 0;

    res.json({
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
      },
      byMethod,
      byService,
      byDay,
      byHour,
      ordersByHour,
      topProducts,
    });
  } catch (error) {
    console.error("Error generando reporte:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD (Contaduría)
// Junta ventas (día a día, sin importar cuántas sesiones de caja hubo en el
// rango), compras de insumos controlados (carne/pan/etc, cash-basis: el día
// que se pagaron) y gastos/ingresos generales por categoría, en una sola
// utilidad neta.
router.get("/pnl", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(from || "") || !DATE_RE.test(to || "")) {
      return res.status(400).json({ error: "Parámetros from y to requeridos (YYYY-MM-DD)" });
    }

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

    res.json({
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
    });
  } catch (error) {
    console.error("Error generando reporte de contaduría:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
