import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getBogotaDateString } from "../utils/timezone.js";

const router = express.Router();

// GET /api/audit (FASE 12.3: Auditoría PRO con filtros)
router.get("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { from, to, type, tableNumber, orderCode, limit = 200 } = req.query;

    // Construir WHERE dinámico
    const conditions = [];
    const params = [];

    // Filtro por fecha
    if (from) {
      conditions.push("(DATE(al.created_at) >= ? OR substr(al.created_at, 1, 10) >= ?)");
      params.push(from, from);
    }
    if (to) {
      conditions.push("(DATE(al.created_at) <= ? OR substr(al.created_at, 1, 10) <= ?)");
      params.push(to, to);
    }

    // Filtro por tipo de entidad
    if (type && type !== 'ALL') {
      const typeMap = {
        'PAYMENTS': 'payment',
        'ORDERS': 'order',
        'ITEMS': 'order_item',
        'CASH': 'cash_session'
      };
      const entityType = typeMap[type];
      if (entityType) {
        conditions.push("al.entity_type = ?");
        params.push(entityType);
      }
    }

    // Filtro por mesa
    if (tableNumber) {
      const tableNum = parseInt(tableNumber);
      if (!isNaN(tableNum)) {
        conditions.push("al.table_number = ?");
        params.push(tableNum);
      }
    }

    // Filtro por código de orden (join con orders)
    if (orderCode) {
      conditions.push("(o.daily_no LIKE ? OR o.code LIKE ?)");
      const searchCode = `%${orderCode}%`;
      params.push(searchCode, searchCode);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Validar limit
    const limitNum = parseInt(limit);
    const finalLimit = isNaN(limitNum) || limitNum <= 0 || limitNum > 500 ? 200 : limitNum;

    // Query con JOINs para obtener información completa
    const events = await db.all(
      `SELECT 
        al.id,
        al.created_at,
        al.action,
        al.summary,
        al.entity_type,
        al.entity_id,
        al.table_number,
        al.order_id,
        al.user_id,
        u.name as user_name,
        al.meta
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN orders o ON al.order_id = o.id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT ?`,
      [...params, finalLimit]
    );

    // Parsear meta JSON
    const eventsWithParsedMeta = events.map(event => ({
      ...event,
      meta: event.meta ? JSON.parse(event.meta) : null
    }));

    res.json({ events: eventsWithParsedMeta, count: eventsWithParsedMeta.length });
  } catch (error) {
    console.error("Error obteniendo auditoría:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
