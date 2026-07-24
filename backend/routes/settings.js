import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Lista de fábrica si nunca se configuró nada (o si settings está vacía).
const DEFAULT_SALSAS = ["Tomate", "Ajo", "Piña", "BBQ", "Mostaza", "Tártara", "Salsa de la casa"];

// GET /api/settings/salsas - lista de salsas configurable desde Menú (Precios)
router.get("/salsas", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const row = await db.get("SELECT value FROM settings WHERE key = 'salsas'");
    const salsas = row?.value
      ? row.value.split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_SALSAS;
    res.json({ salsas: salsas.length > 0 ? salsas : DEFAULT_SALSAS });
  } catch (error) {
    console.error("Error obteniendo salsas:", error);
    // Nunca bloquear el armado de pedidos por esto: devolver la lista de fábrica.
    res.json({ salsas: DEFAULT_SALSAS });
  }
});

// PUT /api/settings/salsas - guardar la lista (solo CAJA, desde el panel de Menú)
router.put("/salsas", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { salsas } = req.body;
    if (!Array.isArray(salsas)) {
      return res.status(400).json({ error: "salsas debe ser una lista" });
    }
    const cleaned = salsas.map((s) => String(s).trim()).filter(Boolean);
    if (cleaned.length === 0) {
      return res.status(400).json({ error: "Debe quedar al menos una salsa" });
    }
    const db = getDb();
    await db.run(
      `INSERT INTO settings (key, value) VALUES ('salsas', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [cleaned.join(",")]
    );
    res.json({ salsas: cleaned });
  } catch (error) {
    console.error("Error guardando salsas:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
