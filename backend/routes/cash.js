import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { 
  getBogotaDateString, 
  toBogotaSQLiteTimestamp,
  formatBogotaDate 
} from "../utils/timezone.js";
import { logAudit } from "../utils/audit.js";

const router = express.Router();

// Función helper para calcular resumen de un día
async function calculateDaySummary(db, date) {
  // Total ventas del día (usar substr para comparar fecha YYYY-MM-DD)
  const totalSales = await db.get(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payments
     WHERE substr(created_at, 1, 10) = ? OR DATE(created_at) = ?`,
    [date, date]
  );

  // Número total de pedidos pagados
  const totalOrders = await db.get(
    `SELECT COUNT(DISTINCT order_id) as count
     FROM payments
     WHERE substr(created_at, 1, 10) = ? OR DATE(created_at) = ?`,
    [date, date]
  );

  // Ticket promedio
  const avgTicket = totalOrders?.count > 0 
    ? (totalSales?.total || 0) / totalOrders.count 
    : 0;

  // Ventas por método de pago
  const paymentsByMethod = await db.all(
    `SELECT 
       method,
       COUNT(*) as count,
       COALESCE(SUM(amount), 0) as total
     FROM payments
     WHERE substr(created_at, 1, 10) = ? OR DATE(created_at) = ?
     GROUP BY method`,
    [date, date]
  );

  // Top productos (Top 3)
  const topProducts = await db.all(
    `SELECT 
       oi.name,
       SUM(oi.qty) as total_qty,
       SUM(oi.qty * oi.price) as total_sales
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE (substr(o.created_at, 1, 10) = ? OR DATE(o.created_at) = ?)
       AND oi.voided_at IS NULL
       AND oi.paid_at IS NOT NULL
     GROUP BY oi.name
     ORDER BY total_qty DESC
     LIMIT 3`,
    [date, date]
  );

  // Mesas atendidas
  const tablesServed = await db.get(
    `SELECT COUNT(DISTINCT o.table_id) as count
     FROM orders o
     JOIN payments p ON p.order_id = o.id
     WHERE (substr(o.created_at, 1, 10) = ? OR DATE(o.created_at) = ?)
       AND o.table_id IS NOT NULL`,
    [date, date]
  );

  // Mesa con mayor consumo
  const topTable = await db.get(
    `SELECT 
       o.table_id,
       t.label as table_label,
       t.number as table_number,
       SUM(p.amount) as total_sales,
       COUNT(DISTINCT o.id) as order_count
     FROM orders o
     JOIN payments p ON p.order_id = o.id
     LEFT JOIN tables t ON o.table_id = t.id
     WHERE (substr(o.created_at, 1, 10) = ? OR DATE(o.created_at) = ?)
       AND o.table_id IS NOT NULL
     GROUP BY o.table_id, t.label, t.number
     ORDER BY total_sales DESC
     LIMIT 1`,
    [date, date]
  );

  // Sesión de caja del día
  const session = await db.get(
    `SELECT * FROM cash_sessions 
     WHERE substr(opened_at, 1, 10) = ? OR DATE(opened_at) = ?
     ORDER BY opened_at DESC LIMIT 1`,
    [date, date]
  );

  // Duración del turno (si hay sesión cerrada)
  let shiftDuration = null;
  if (session && session.closed_at) {
    const opened = new Date(session.opened_at);
    const closed = new Date(session.closed_at);
    const diffMs = closed - opened;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    shiftDuration = `${diffHours}h ${diffMinutes}m`;
  }

  return {
    date,
    totalSales: totalSales?.total || 0,
    totalOrders: totalOrders?.count || 0,
    avgTicket: avgTicket,
    paymentsByMethod: paymentsByMethod || [],
    topProducts: topProducts || [],
    tablesServed: tablesServed?.count || 0,
    topTable: topTable || null,
    session: session ? {
      openedAt: session.opened_at,
      closedAt: session.closed_at,
      initialCash: session.initial_cash,
      finalCash: session.final_cash,
      shiftDuration,
      // Fase 2.3: Incluir CMV y utilidad
      gross_sales: session.gross_sales || 0,
      cogs_total: session.cogs_total || 0,
      gross_profit: session.gross_profit || 0,
      cogs_percent: session.cogs_percent || 0,
    } : null
  };
}

// Función helper para comparar con día anterior
async function compareWithPreviousDay(db, todayDate) {
  // Obtener fecha de ayer (usando zona horaria America/Bogota)
  const yesterday = new Date(todayDate + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = formatBogotaDate(yesterday, 'YYYY-MM-DD');

  const todaySummary = await calculateDaySummary(db, todayDate);
  const yesterdaySummary = await calculateDaySummary(db, yesterdayDate);

  // Calcular comparaciones
  const salesDiff = todaySummary.totalSales - yesterdaySummary.totalSales;
  const salesPercentChange = yesterdaySummary.totalSales > 0
    ? ((salesDiff / yesterdaySummary.totalSales) * 100).toFixed(1)
    : todaySummary.totalSales > 0 ? '100.0' : '0.0';

  const ordersDiff = todaySummary.totalOrders - yesterdaySummary.totalOrders;
  
  const avgTicketDiff = todaySummary.avgTicket - yesterdaySummary.avgTicket;
  const avgTicketPercentChange = yesterdaySummary.avgTicket > 0
    ? ((avgTicketDiff / yesterdaySummary.avgTicket) * 100).toFixed(1)
    : todaySummary.avgTicket > 0 ? '100.0' : '0.0';

  // Generar alertas
  const alerts = [];
  
  if (yesterdaySummary.avgTicket > 0 && parseFloat(avgTicketPercentChange) < -15) {
    alerts.push({
      type: 'warning',
      message: `⚠️ Ticket promedio ↓ ${Math.abs(parseFloat(avgTicketPercentChange))}% vs ayer`
    });
  }

  if (salesDiff < 0 && ordersDiff > 0) {
    alerts.push({
      type: 'warning',
      message: '⚠️ Ventas ↓ pero pedidos ↑ → gente pide menos'
    });
  }

  // Verificar diferencia de efectivo si hay sesión cerrada
  if (todaySummary.session && todaySummary.session.closedAt) {
    const expectedCash = todaySummary.session.initialCash + todaySummary.totalSales;
    const actualCash = todaySummary.session.finalCash || 0;
    const cashDifference = actualCash - expectedCash;
    
    if (Math.abs(cashDifference) > 100) { // Más de $100 de diferencia
      alerts.push({
        type: cashDifference > 0 ? 'info' : 'error',
        message: `⚠️ Diferencia de efectivo: $${cashDifference.toFixed(2)}`
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      type: 'success',
      message: '✓ Operación normal'
    });
  }

  return {
    today: todaySummary,
    yesterday: yesterdaySummary,
    comparison: {
      salesDiff,
      salesPercentChange,
      ordersDiff,
      avgTicketDiff,
      avgTicketPercentChange
    },
    alerts
  };
}

// GET /api/cash/session/active - Endpoint simple para verificar si hay sesión activa (FASE 9.1)
router.get("/session/active", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const session = await db.get(
      "SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1"
    );

    if (!session) {
      return res.json({ active: false });
    }

    return res.json({ active: true, session });
  } catch (error) {
    console.error("Error verificando sesión activa:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/cash/session/close - Cerrar sesión de caja con arqueo (FASE 9.3)
router.post("/session/close", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { closing_cash } = req.body;
    const db = getDb();

    // Validar closing_cash
    if (closing_cash === undefined || closing_cash === null) {
      return res.status(400).json({ error: "closing_cash es requerido" });
    }
    const closingCash = parseFloat(closing_cash);
    if (isNaN(closingCash) || closingCash < 0) {
      return res.status(400).json({ error: "closing_cash debe ser un número >= 0" });
    }

    // 1. Buscar sesión activa
    const session = await db.get(
      "SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1"
    );

    if (!session) {
      return res.status(400).json({ error: "No hay sesión activa" });
    }

    // (Opcional recomendado FASE 9.5) Verificar órdenes LISTO pendientes
    // FASE 9.6: No contar CANCELADO (ni PENDIENTE si se implementa)
    const pendingReadyOrders = await db.all(`
      SELECT COUNT(DISTINCT o.id) as count
      FROM orders o
      WHERE o.status = 'LISTO'
        AND o.paid_at IS NULL
        AND o.archived_at IS NULL
        AND o.status != 'CANCELADO'
        AND EXISTS (
          SELECT 1
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.voided_at IS NULL
            AND oi.paid_at IS NULL
        )
    `);
    
    if (pendingReadyOrders[0]?.count > 0) {
      return res.status(409).json({ 
        error: "Hay órdenes LISTO pendientes de cobro. Debes cobrarlas o cancelarlas antes de cerrar caja." 
      });
    }

    // 2. Calcular resumen desde payments usando cash_session_id
    const paymentsByMethodResult = await db.all(
      `SELECT 
         method,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE cash_session_id = ?
       GROUP BY method`,
      [session.id]
    );

    // 3. Derivar totales
    let totalCash = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let paymentCount = 0;

    paymentsByMethodResult.forEach((row) => {
      paymentCount += row.count;
      if (row.method === 'EFECTIVO') {
        totalCash = row.total;
      } else if (row.method === 'TARJETA') {
        totalCard = row.total;
      } else if (row.method === 'TRANSFERENCIA') {
        totalTransfer = row.total;
      }
    });

    const totalSales = totalCash + totalCard + totalTransfer;

    // 4. Calcular expected_cash
    const expectedCash = (session.initial_cash || 0) + totalCash;

    // 5. Calcular diff_cash
    const diffCash = closingCash - expectedCash;

    // 6. Construir snapshot del cierre (FASE 12.2)
    const closeTimestamp = toBogotaSQLiteTimestamp(new Date());
    const snapshot = JSON.stringify({
      sessionId: session.id,
      opened_at: session.opened_at,
      closed_at: closeTimestamp,
      initial_cash: session.initial_cash || 0,
      closing_cash: closingCash,
      expected_cash: expectedCash,
      diff_cash: diffCash,
      totals: {
        total_cash: totalCash,
        total_card: totalCard,
        total_transfer: totalTransfer,
        total_sales: totalSales,
        payment_count: paymentCount
      },
      closed_by: req.user.id
    });

    // 7. Update de cash_sessions (solo si sigue activa) - incluyendo snapshot
    const updateResult = await db.run(
      `UPDATE cash_sessions 
       SET closed_at = ?,
           closing_cash = ?,
           expected_cash = ?,
           diff_cash = ?,
           total_cash = ?,
           total_card = ?,
           total_transfer = ?,
           total_sales = ?,
           payment_count = ?,
           closed_by = ?,
           close_snapshot = ?
       WHERE id = ?
         AND closed_at IS NULL`,
      [
        closeTimestamp,
        closingCash,
        expectedCash,
        diffCash,
        totalCash,
        totalCard,
        totalTransfer,
        totalSales,
        paymentCount,
        req.user.id,
        snapshot,
        session.id
      ]
    );

    // Si no se actualizó ninguna fila, la sesión ya fue cerrada
    if (updateResult.changes === 0) {
      return res.status(409).json({ error: "La sesión ya fue cerrada" });
    }

    // 8. Obtener sesión cerrada actualizada
    const closedSession = await db.get(
      "SELECT * FROM cash_sessions WHERE id = ?",
      [session.id]
    );

    // FASE 12.3: Registrar auditoría - CASH_CLOSED
    await logAudit({
      action: 'CASH_CLOSED',
      entity_type: 'cash_session',
      entity_id: closedSession.id,
      user_id: req.user.id,
      ip: req.ip || req.connection?.remoteAddress || null,
      summary: `Caja cerrada - Efectivo contado: ${closingCash}, Diferencia: ${diffCash}`,
      meta: {
        closing_cash: closingCash,
        expected_cash: expectedCash,
        diff_cash: diffCash,
        total_sales: totalSales,
        payment_count: paymentCount
      }
    });

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("cash:session-closed", { sessionId: session.id });
    }

    // 9. Responder con resumen completo incluyendo snapshot (FASE 12.2)
    res.json({
      sessionId: closedSession.id,
      closed_at: closedSession.closed_at,
      closing_cash: closingCash,
      expected_cash: expectedCash,
      diff_cash: diffCash,
      totals: {
        total_cash: totalCash,
        total_card: totalCard,
        total_transfer: totalTransfer,
        total_sales: totalSales,
        payment_count: paymentCount
      },
      snapshot: closedSession.close_snapshot ? JSON.parse(closedSession.close_snapshot) : null
    });
  } catch (error) {
    console.error("Error cerrando sesión de caja:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/current
router.get("/current", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const session = await db.get(
      "SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1"
    );

    // Verificar si hay sesión del día anterior sin cerrar (usando zona horaria America/Bogota)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = formatBogotaDate(yesterday, 'YYYY-MM-DD');

    // Buscar sesiones del día anterior sin cerrar (usando zona horaria de Bogotá)
    const previousDaySession = await db.get(
      `SELECT * FROM cash_sessions 
       WHERE closed_at IS NULL 
       AND (substr(opened_at, 1, 10) = ? OR DATE(opened_at) = ?)
       ORDER BY opened_at DESC LIMIT 1`,
      [yesterdayDate, yesterdayDate]
    );

    let previousDaySummary = null;
    if (previousDaySession) {
      // Calcular resumen del día anterior (usando zona horaria de Bogotá)
      previousDaySummary = await calculateDaySummary(db, yesterdayDate);
    }

    if (!session) {
      return res.json({ 
        session: null,
        previousDayPending: !!previousDaySession,
        previousDaySummary: previousDaySummary
      });
    }

    // Verificar si la sesión actual es de otro día (usando zona horaria America/Bogota)
    const sessionDate = formatBogotaDate(session.opened_at, 'YYYY-MM-DD');
    const todayDate = getBogotaDateString();
    const isOldSession = sessionDate < todayDate;

    // Calcular total de pagos en esta sesión
    const payments = await db.all(
      `SELECT SUM(amount) as total
       FROM payments
       WHERE created_at >= ?`,
      [session.opened_at]
    );

    const totalPayments = payments[0]?.total || 0;

    // Calcular ventas teóricas: suma de todos los items activos (no anulados) de la sesión activa
    const theoreticalSales = await db.get(
      `SELECT COALESCE(SUM(oi.qty * oi.price), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.created_at >= ?
         AND oi.voided_at IS NULL`,
      [session.opened_at]
    );

    const theoreticalSalesTotal = theoreticalSales?.total || 0;

    // Calcular pagos por método de pago en esta sesión
    const paymentsByMethod = await db.all(
      `SELECT 
         method,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE created_at >= ?
       GROUP BY method`,
      [session.opened_at]
    );

    const difference = totalPayments - theoreticalSalesTotal;

    res.json({
      session: {
        ...session,
        totalPayments,
        isOldSession,
      },
      salesSummary: {
        theoreticalSales: theoreticalSalesTotal,
        totalPayments: totalPayments,
        difference: difference,
        paymentsByMethod: paymentsByMethod || []
      },
      previousDayPending: !!previousDaySession,
      previousDaySummary: previousDaySummary
    });
  } catch (error) {
    console.error("Error obteniendo sesión de caja:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/session/:id/summary - Resumen de pagos por sesión (FASE 9.2)
router.get("/session/:id/summary", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: "ID de sesión inválido" });
    }

    const db = getDb();

    // Verificar que la sesión existe
    const session = await db.get("SELECT * FROM cash_sessions WHERE id = ?", [sessionId]);
    if (!session) {
      return res.status(404).json({ error: "Sesión no encontrada" });
    }

    // Obtener pagos por método
    const paymentsByMethod = await db.all(
      `SELECT 
         method,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE cash_session_id = ?
       GROUP BY method`,
      [sessionId]
    );

    // Total general
    const totalResult = await db.get(
      `SELECT 
         COUNT(*) as payment_count,
         COALESCE(SUM(amount), 0) as total_amount
       FROM payments
       WHERE cash_session_id = ?`,
      [sessionId]
    );

    res.json({
      sessionId,
      total: totalResult?.total_amount || 0,
      paymentCount: totalResult?.payment_count || 0,
      byMethod: paymentsByMethod || []
    });
  } catch (error) {
    console.error("Error obteniendo resumen de sesión:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/session/:id/close-report - Reporte completo de cierre (FASE 9.3)
router.get("/session/:id/close-report", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) {
      return res.status(400).json({ error: "ID de sesión inválido" });
    }

    const db = getDb();

    // Obtener sesión con todos los datos
    const session = await db.get("SELECT * FROM cash_sessions WHERE id = ?", [sessionId]);
    if (!session) {
      return res.status(404).json({ error: "Sesión no encontrada" });
    }

    // Obtener pagos por método (reutilizar lógica de summary)
    const paymentsByMethod = await db.all(
      `SELECT 
         method,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE cash_session_id = ?
       GROUP BY method`,
      [sessionId]
    );

    // FASE 12.2: Si existe snapshot, parsearlo y retornarlo
    let snapshot = null;
    if (session.close_snapshot) {
      try {
        snapshot = JSON.parse(session.close_snapshot);
      } catch (e) {
        console.error("Error parseando snapshot:", e);
      }
    }

    res.json({
      session,
      snapshot, // FASE 12.2: Agregar snapshot si existe
      byMethod: paymentsByMethod || [],
      totals: {
        total_cash: session.total_cash || 0,
        total_card: session.total_card || 0,
        total_transfer: session.total_transfer || 0,
        total_sales: session.total_sales || 0,
        payment_count: session.payment_count || 0
      },
      cash: {
        initial_cash: session.initial_cash || 0,
        expected_cash: session.expected_cash || null,
        closing_cash: session.closing_cash || null,
        diff_cash: session.diff_cash || null
      }
    });
  } catch (error) {
    console.error("Error obteniendo reporte de cierre:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/sessions - Lista de sesiones cerradas (FASE 9.4)
router.get("/sessions", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    
    // Validar y parsear limit
    let limit = parseInt(req.query.limit) || 50;
    if (isNaN(limit) || limit < 1) {
      limit = 50;
    }
    if (limit > 200) {
      limit = 200;
    }

    // Obtener sesiones cerradas ordenadas por closed_at DESC
    const sessions = await db.all(
      `SELECT 
         id,
         opened_at,
         closed_at,
         initial_cash,
         total_cash,
         total_card,
         total_transfer,
         total_sales,
         expected_cash,
         closing_cash,
         diff_cash,
         payment_count,
         closed_by
       FROM cash_sessions
       WHERE closed_at IS NOT NULL
       ORDER BY closed_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({ sessions });
  } catch (error) {
    console.error("Error obteniendo sesiones cerradas:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/tables (todas las mesas + estado + si hay comandas deshabilitadas)
router.get("/tables", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const tables = await db.all("SELECT * FROM tables ORDER BY number");

    const result = [];
    for (const t of tables) {
      const disabledCount = await db.get(
        "SELECT COUNT(*) as count FROM orders WHERE table_id = ? AND disabled_at IS NOT NULL AND paid_at IS NULL",
        [t.id]
      );
      const pending = await db.get(
        `SELECT COUNT(*) as pending_items,
                COALESCE(SUM(oi.qty * oi.price), 0) as pending_total
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.table_id = ?
           AND o.status != 'CANCELADO'
           AND o.disabled_at IS NULL
           AND oi.voided_at IS NULL
           AND oi.paid_at IS NULL`,
        [t.id]
      );

      result.push({
        ...t,
        pending_items: pending?.pending_items || 0,
        pending_total: pending?.pending_total || 0,
        has_disabled_orders: (disabledCount?.count || 0) > 0,
      });
    }

    return res.json(result);
  } catch (error) {
    console.error("Error obteniendo mesas:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/open-tables
router.get(
  "/open-tables",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();

      // Mesas abiertas: tienen items no pagados y no anulados
      const openTables = await db.all(`
      SELECT DISTINCT
        t.id as table_id,
        t.number as table_number,
        t.label as table_label,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT oi.id) as pending_items_count,
        SUM(oi.qty * oi.price) as pending_total,
        MAX(o.updated_at) as last_activity
      FROM tables t
      INNER JOIN orders o ON o.table_id = t.id
      INNER JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status != 'CANCELADO'
        AND oi.voided_at IS NULL
        AND oi.paid_at IS NULL
      GROUP BY t.id, t.number, t.label
      HAVING pending_items_count > 0
      ORDER BY last_activity DESC
    `);

      res.json(openTables);
    } catch (error) {
      console.error("Error obteniendo mesas abiertas:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// GET /api/cash/table/:tableId
router.get(
  "/table/:tableId",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();
      const tableId = parseInt(req.params.tableId);

      // Obtener información de la mesa
      const table = await db.get("SELECT * FROM tables WHERE id = ?", [
        tableId,
      ]);
      if (!table) {
        return res.status(404).json({ error: "Mesa no encontrada" });
      }

      // Obtener todas las órdenes de esta mesa (CAJA ve TODO: canceladas y deshabilitadas también)
      const orders = await db.all(
        `
      SELECT o.*, u.name as created_by_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.table_id = ?
      ORDER BY o.created_at DESC
    `,
        [tableId]
      );

      // Obtener todos los items de estas órdenes
      const allItems = [];
      for (const order of orders) {
        const items = await db.all(
          `
        SELECT oi.*, 
               o.code as order_code,
               o.status as order_status
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.order_id = ? AND oi.voided_at IS NULL
        ORDER BY oi.created_at
      `,
          [order.id]
        );

        allItems.push(...items);
      }

      // Calcular totales
      const pendingItems = allItems.filter((item) => !item.paid_at);
      const paidItems = allItems.filter((item) => item.paid_at);

      const pendingTotal = pendingItems.reduce(
        (sum, item) => sum + item.qty * item.price,
        0
      );
      const paidTotal = paidItems.reduce(
        (sum, item) => sum + item.qty * item.price,
        0
      );

      res.json({
        table,
        orders,
        items: allItems,
        summary: {
          totalItems: allItems.length,
          pendingItems: pendingItems.length,
          paidItems: paidItems.length,
          pendingTotal,
          paidTotal,
          grandTotal: pendingTotal + paidTotal,
        },
      });
    } catch (error) {
      console.error("Error obteniendo detalle de mesa:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// POST /api/cash/open
router.post("/open", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { initialCash } = req.body;
    const db = getDb();

    // Verificar que no hay sesión abierta (FASE 9.5)
    const existingSession = await db.get(
      "SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1"
    );

    if (existingSession) {
      return res
        .status(409)
        .json({ error: "Ya hay una caja abierta." });
    }

    // REGLA OPERATIVA: Al abrir caja, se inicia un nuevo día operativo
    // - Archivar todas las órdenes activas (no archivadas y no canceladas)
    // - Esto hace que cocina inicie vacía y no haya pedidos activos visibles
    const timestamp = toBogotaSQLiteTimestamp(new Date());
    const archiveResult = await db.run(
      `UPDATE orders 
       SET archived_at = ?, updated_at = ? 
       WHERE archived_at IS NULL 
       AND status != 'CANCELADO'`,
      [timestamp, timestamp]
    );
    
    console.log(`📦 Archivadas ${archiveResult.changes || 0} órdenes al abrir nueva sesión de caja`);

    // Crear nueva sesión (usando zona horaria America/Bogota)
    const result = await db.run(
      "INSERT INTO cash_sessions (opened_at, initial_cash, opened_by) VALUES (?, ?, ?)",
      [timestamp, initialCash || 0, req.user.id]
    );

    const session = await db.get("SELECT * FROM cash_sessions WHERE id = ?", [
      result.lastID,
    ]);

    // FASE 12.3: Registrar auditoría - CASH_OPENED
    await logAudit({
      action: 'CASH_OPENED',
      entity_type: 'cash_session',
      entity_id: session.id,
      user_id: req.user.id,
      ip: req.ip || req.connection?.remoteAddress || null,
      summary: `Caja abierta con efectivo inicial ${initialCash || 0}`,
      meta: {
        initial_cash: initialCash || 0,
        archived_orders: archiveResult.changes || 0
      }
    });

    // Notificar vía WebSocket que se abrió una nueva sesión
    const io = req.app.get("io");
    if (io) {
      io.emit("cash:session-opened", { session });
      io.emit("order:status-changed"); // Notificar cambio en órdenes
    }

    res.status(201).json({ 
      session,
      archivedOrders: archiveResult.changes || 0
    });
  } catch (error) {
    console.error("Error abriendo caja:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/cash/close
router.post("/close", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { finalCash } = req.body;
    const db = getDb();

    // Buscar sesión abierta
    const session = await db.get(
      "SELECT * FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1"
    );

    if (!session) {
      return res.status(400).json({ error: "No hay sesión de caja abierta" });
    }

    // Calcular KPIs de la sesión (Fase 1)
    // Ajuste B: gross_sales debe basarse en órdenes PAGADAS en la sesión (no todas las creadas)
    // 1. Gross sales: suma de items no anulados de órdenes que tienen pagos en la sesión
    const grossSalesResult = await db.get(
      `SELECT COALESCE(SUM(oi.qty * oi.price), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.voided_at IS NULL
         AND EXISTS (
           SELECT 1 FROM payments p 
           WHERE p.order_id = o.id 
           AND p.created_at >= ?
         )`,
      [session.opened_at]
    );
    const grossSales = grossSalesResult?.total || 0;

    // Ajuste A: orders_count debe ser COUNT(DISTINCT order_id) desde payments
    // 2. Orders count: número de pedidos únicos pagados en la sesión
    const ordersCountResult = await db.get(
      `SELECT COUNT(DISTINCT order_id) as count
       FROM payments
       WHERE created_at >= ?`,
      [session.opened_at]
    );
    const ordersCount = ordersCountResult?.count || 0;

    // 3. Average ticket
    const avgTicket = ordersCount > 0 ? grossSales / ordersCount : 0;

    // 4. Payments by method (JSON)
    const paymentsByMethodResult = await db.all(
      `SELECT 
         method,
         COUNT(*) as count,
         COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE created_at >= ?
       GROUP BY method`,
      [session.opened_at]
    );
    const paymentsByMethod = JSON.stringify(paymentsByMethodResult);

    // 5. Theoretical cash: solo pagos EFECTIVO
    const theoreticalCashResult = await db.get(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE created_at >= ? AND method = 'EFECTIVO'`,
      [session.opened_at]
    );
    const theoreticalCash = theoreticalCashResult?.total || 0;

    // 6. Declared cash (viene del body como finalCash)
    const declaredCash = finalCash ? parseFloat(finalCash) : null;

    // 7. Cash diff
    const cashDiff = declaredCash !== null ? declaredCash - theoreticalCash : null;

    // Fase 2.3: Calcular CMV (Costo de lo Vendido)
    // Solo items con product_id (no custom) y que tienen recetas con ingredientes activos
    const cogsResult = await db.get(
      `SELECT COALESCE(SUM(oi.qty * r.qty_used * i.cost_per_unit), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN recipes r ON oi.product_id = r.product_id
       JOIN ingredients i ON r.ingredient_id = i.id
       WHERE oi.voided_at IS NULL
         AND oi.product_id IS NOT NULL
         AND oi.is_custom = 0
         AND i.is_active = 1
         AND EXISTS (
           SELECT 1 FROM payments p 
           WHERE p.order_id = o.id 
           AND p.created_at >= ?
         )`,
      [session.opened_at]
    );
    const cogsTotal = Math.round(cogsResult?.total || 0);

    // 8. Gross profit y cogs_percent
    const grossProfit = Math.round(grossSales) - cogsTotal;
    const cogsPercent = grossSales > 0 ? cogsTotal / grossSales : 0;

    // Cerrar sesión (usando zona horaria America/Bogota)
    const closeTimestamp = toBogotaSQLiteTimestamp(new Date());
    await db.run(
      `UPDATE cash_sessions 
       SET closed_at = ?, final_cash = ?, closed_by = ?,
           gross_sales = ?, orders_count = ?, avg_ticket = ?,
           payments_by_method = ?, theoretical_cash = ?, declared_cash = ?, cash_diff = ?,
           cogs_total = ?, gross_profit = ?, cogs_percent = ?
       WHERE id = ?`,
      [
        closeTimestamp,
        finalCash || session.initial_cash + theoreticalCash,
        req.user.id,
        grossSales,
        ordersCount,
        avgTicket,
        paymentsByMethod,
        theoreticalCash,
        declaredCash,
        cashDiff,
        cogsTotal,
        grossProfit,
        cogsPercent,
        session.id,
      ]
    );

    const closedSession = await db.get(
      "SELECT * FROM cash_sessions WHERE id = ?",
      [session.id]
    );

    // Calcular resumen completo del día (usando zona horaria America/Bogota)
    const todayDate = getBogotaDateString();
    const summary = await compareWithPreviousDay(db, todayDate);
    
    // Notificar vía WebSocket que se cerró la sesión
    const io = req.app.get("io");
    if (io) {
      io.emit("cash:session-closed", { sessionId: session.id });
    }

    res.json({ 
      session: closedSession,
      summary: summary
    });
  } catch (error) {
    console.error("Error cerrando caja:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/previous-day-summary - Obtener resumen del día anterior
router.get("/previous-day-summary", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    
    // Obtener fecha de ayer (usando zona horaria America/Bogota)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = formatBogotaDate(yesterday, 'YYYY-MM-DD');

    // Verificar si hay sesión sin cerrar del día anterior (usando zona horaria de Bogotá)
    const previousDaySession = await db.get(
      `SELECT * FROM cash_sessions 
       WHERE closed_at IS NULL 
       AND (substr(opened_at, 1, 10) = ? OR DATE(opened_at) = ?)
       ORDER BY opened_at DESC LIMIT 1`,
      [yesterdayDate, yesterdayDate]
    );

    if (!previousDaySession) {
      return res.json({ 
        hasUnclosedSession: false,
        summary: null
      });
    }

    // Calcular resumen del día anterior
    const summary = await calculateDaySummary(db, yesterdayDate);

    res.json({
      hasUnclosedSession: true,
      summary: summary
    });
  } catch (error) {
    console.error("Error obteniendo resumen del día anterior:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/history - Obtener historial de sesiones de caja
router.get("/history", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { month, year } = req.query;

    // Si no se especifica, usar mes y año actual
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;

    // Obtener todas las sesiones del mes
    const sessions = await db.all(
      `
      SELECT 
        cs.*,
        u_open.name as opened_by_name,
        u_close.name as closed_by_name
      FROM cash_sessions cs
      LEFT JOIN users u_open ON cs.opened_by = u_open.id
      LEFT JOIN users u_close ON cs.closed_by = u_close.id
      WHERE strftime('%Y', cs.opened_at) = ?
        AND strftime('%m', cs.opened_at) = ?
      ORDER BY cs.opened_at DESC
    `,
      [String(targetYear), String(targetMonth).padStart(2, "0")]
    );

    // Obtener días con sesiones para el calendario
    const daysWithSessions = await db.all(
      `
      SELECT DISTINCT substr(opened_at, 1, 10) as date
      FROM cash_sessions
      WHERE strftime('%Y', opened_at) = ?
        AND strftime('%m', opened_at) = ?
    `,
      [String(targetYear), String(targetMonth).padStart(2, "0")]
    );

    res.json({
      sessions,
      daysWithSessions: daysWithSessions.map((d) => d.date),
      month: targetMonth,
      year: targetYear,
    });
  } catch (error) {
    console.error("Error obteniendo historial de caja:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/cash/stats/:date - Estadísticas de un día específico
router.get(
  "/stats/:date",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();
      const { date } = req.params; // Formato: YYYY-MM-DD

      // Validar formato de fecha
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res
          .status(400)
          .json({ error: "Formato de fecha inválido. Use YYYY-MM-DD" });
      }

      // Obtener sesiones del día
      const sessions = await db.all(
        `
      SELECT 
        cs.*,
        u_open.name as opened_by_name,
        u_close.name as closed_by_name
      FROM cash_sessions cs
      LEFT JOIN users u_open ON cs.opened_by = u_open.id
      LEFT JOIN users u_close ON cs.closed_by = u_close.id
      WHERE substr(cs.opened_at, 1, 10) = ? OR DATE(cs.opened_at) = ?
      ORDER BY cs.opened_at ASC
    `,
        [date, date]
      );

      // Obtener pagos del día agrupados por método
      const paymentsByMethod = await db.all(
        `
      SELECT 
        method,
        COUNT(*) as count,
        SUM(amount) as total
      FROM payments
      WHERE substr(created_at, 1, 10) = ? OR DATE(created_at) = ?
      GROUP BY method
    `,
        [date, date]
      );

      // Total de pagos del día
      const totalPayments = await db.get(
        `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM payments
      WHERE substr(created_at, 1, 10) = ? OR DATE(created_at) = ?
    `,
        [date, date]
      );

      // Órdenes del día
      const ordersStats = await db.get(
        `
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'NUEVO' THEN 1 ELSE 0 END) as nuevos,
        SUM(CASE WHEN status = 'EN_PREP' THEN 1 ELSE 0 END) as en_prep,
        SUM(CASE WHEN status = 'LISTO' THEN 1 ELSE 0 END) as listos,
        SUM(CASE WHEN status = 'CANCELADO' THEN 1 ELSE 0 END) as cancelados,
        SUM(CASE WHEN paid_at IS NOT NULL THEN 1 ELSE 0 END) as pagados
      FROM orders
      WHERE substr(created_at, 1, 10) = ? OR DATE(created_at) = ?
    `,
        [date, date]
      );

      // Items más vendidos del día
      const topItems = await db.all(
        `
      SELECT 
        oi.name,
        SUM(oi.qty) as total_qty,
        SUM(oi.qty * oi.price) as total_sales
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE (substr(o.created_at, 1, 10) = ? OR DATE(o.created_at) = ?)
        AND oi.voided_at IS NULL
        AND oi.paid_at IS NOT NULL
      GROUP BY oi.name
      ORDER BY total_qty DESC
      LIMIT 10
    `,
        [date, date]
      );

      // Calcular diferencia de caja (si hay sesiones cerradas)
      let cashDifference = 0;
      let expectedCash = 0;
      let actualCash = 0;

      for (const session of sessions) {
        if (session.closed_at) {
          // Calcular pagos durante esta sesión
          const sessionPayments = await db.get(
            `
          SELECT COALESCE(SUM(amount), 0) as total
          FROM payments
          WHERE created_at >= ? AND created_at <= ?
        `,
            [session.opened_at, session.closed_at]
          );

          const sessionExpected =
            session.initial_cash + (sessionPayments?.total || 0);
          expectedCash += sessionExpected;
          actualCash += session.final_cash || 0;
        }
      }
      cashDifference = actualCash - expectedCash;

      res.json({
        date,
        sessions,
        payments: {
          byMethod: paymentsByMethod,
          total: totalPayments?.total || 0,
          count: totalPayments?.count || 0,
        },
        orders: ordersStats || {
          total_orders: 0,
          nuevos: 0,
          en_prep: 0,
          listos: 0,
          cancelados: 0,
          pagados: 0,
        },
        topItems,
        cashSummary: {
          expectedCash,
          actualCash,
          difference: cashDifference,
        },
      });
    } catch (error) {
      console.error("Error obteniendo estadísticas:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// PATCH /api/cash/items/:id/void
router.patch(
  "/items/:id/void",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();
      const itemId = parseInt(req.params.id);

      // Verificar que el item existe
      const item = await db.get("SELECT * FROM order_items WHERE id = ?", [
        itemId,
      ]);
      if (!item) {
        return res.status(404).json({ error: "Item no encontrado" });
      }

      // Verificar que no esté ya anulado
      if (item.voided_at) {
        return res.status(400).json({ error: "El item ya está anulado" });
      }

      // Verificar que no esté pagado (opcional: puedes permitir anular pagados)
      if (item.paid_at) {
        return res
          .status(400)
          .json({ error: "No se puede anular un item ya pagado" });
      }

      // Anular el item (usando zona horaria America/Bogota)
      await db.run(
        "UPDATE order_items SET voided_at = ? WHERE id = ?",
        [toBogotaSQLiteTimestamp(new Date()), itemId]
      );

      const updatedItem = await db.get(
        "SELECT * FROM order_items WHERE id = ?",
        [itemId]
      );

      // Notificar vía WebSocket
      const io = req.app.get("io");
      if (io) {
        io.emit("item:voided", {
          itemId,
          orderId: item.order_id,
        });
      }

      res.json({ item: updatedItem });
    } catch (error) {
      console.error("Error anulando item:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// GET /api/cash/manual-transactions/:date - Obtener transacciones manuales de un día
router.get(
  "/manual-transactions/:date",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();
      const { date } = req.params; // Formato: YYYY-MM-DD

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res
          .status(400)
          .json({ error: "Formato de fecha inválido. Use YYYY-MM-DD" });
      }

      const transactions = await db.all(
        `
        SELECT mt.*, u.name as created_by_name
        FROM manual_transactions mt
        JOIN users u ON mt.created_by = u.id
        WHERE mt.transaction_date = ?
        ORDER BY mt.created_at ASC
      `,
        [date]
      );

      res.json(transactions);
    } catch (error) {
      console.error("Error obteniendo transacciones manuales:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// POST /api/cash/manual-transactions - Crear transacción manual (ingreso/egreso)
router.post(
  "/manual-transactions",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const { transaction_date, type, description, amount } = req.body;
      const db = getDb();

      // Validaciones
      if (!transaction_date || !/^\d{4}-\d{2}-\d{2}$/.test(transaction_date)) {
        return res
          .status(400)
          .json({ error: "Fecha inválida. Use formato YYYY-MM-DD" });
      }

      if (!type || !["INGRESO", "EGRESO"].includes(type)) {
        return res
          .status(400)
          .json({ error: "Tipo inválido. Debe ser INGRESO o EGRESO" });
      }

      if (!description || description.trim() === "") {
        return res.status(400).json({ error: "Descripción requerida" });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Monto debe ser mayor a 0" });
      }

      // Crear transacción
      const result = await db.run(
        `INSERT INTO manual_transactions (transaction_date, type, description, amount, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [transaction_date, type, description.trim(), amount, req.user.id]
      );

      const transaction = await db.get(
        `SELECT mt.*, u.name as created_by_name
         FROM manual_transactions mt
         JOIN users u ON mt.created_by = u.id
         WHERE mt.id = ?`,
        [result.lastID]
      );

      // Notificar vía WebSocket
      const io = req.app.get("io");
      if (io) {
        io.emit("manual-transaction:created", {
          transaction,
          date: transaction_date,
        });
      }

      res.status(201).json({ transaction });
    } catch (error) {
      console.error("Error creando transacción manual:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// DELETE /api/cash/manual-transactions/:id - Borrar transacción manual
router.delete(
  "/manual-transactions/:id",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();
      const transactionId = parseInt(req.params.id);

      // Verificar que existe
      const transaction = await db.get(
        "SELECT * FROM manual_transactions WHERE id = ?",
        [transactionId]
      );

      if (!transaction) {
        return res.status(404).json({ error: "Transacción no encontrada" });
      }

      // Borrar
      await db.run("DELETE FROM manual_transactions WHERE id = ?", [
        transactionId,
      ]);

      // Notificar vía WebSocket
      const io = req.app.get("io");
      if (io) {
        io.emit("manual-transaction:deleted", {
          transactionId,
          date: transaction.transaction_date,
        });
      }

      res.json({ message: "Transacción eliminada correctamente" });
    } catch (error) {
      console.error("Error borrando transacción manual:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

export default router;
