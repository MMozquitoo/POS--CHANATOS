import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth } from "../middleware/auth.js";
import { toBogotaSQLiteTimestamp } from "../utils/timezone.js";

const router = express.Router();

// POST /api/push/register
// Guarda (o actualiza) el token de push de este dispositivo para el usuario/rol
// autenticado. Se llama al iniciar sesión desde la app nativa Android.
router.post("/register", requireAuth, async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token es requerido" });
    }

    const db = getDb();
    const timestamp = toBogotaSQLiteTimestamp(new Date());

    // El token es UNIQUE: si el dispositivo ya estaba registrado (con otro rol
    // u otro usuario, ej. cambio de turno en el mismo celular), se actualiza.
    await db.run(
      `INSERT INTO push_tokens (token, role, user_id, platform, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET
         role = excluded.role,
         user_id = excluded.user_id,
         platform = excluded.platform,
         created_at = excluded.created_at`,
      [token, req.user.role, req.user.id, platform || "android", timestamp]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Error registrando token push:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/push/unregister
// Borra el token de este dispositivo (se llama al cerrar sesión).
router.post("/unregister", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token es requerido" });
    }

    const db = getDb();
    await db.run("DELETE FROM push_tokens WHERE token = ?", [token]);

    res.json({ ok: true });
  } catch (error) {
    console.error("Error eliminando token push:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
