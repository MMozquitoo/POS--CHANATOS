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

    // Top productos por venta (items pagados, no anulados)
    const topProducts = await db.all(
      `SELECT name,
              SUM(qty) as qty,
              COALESCE(SUM(qty * price), 0) as total
       FROM order_items
       WHERE voided_at IS NULL
         AND paid_at IS NOT NULL
         AND substr(paid_at, 1, 10) BETWEEN ? AND ?
       GROUP BY name
       ORDER BY total DESC
       LIMIT 10`,
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
      },
      byMethod,
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

export default router;
