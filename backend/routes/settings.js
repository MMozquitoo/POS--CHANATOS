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

// "QUITAR" (2026-10): botones rápidos del panel de producto ("Sin queso",
// "Sin cebolla"…). Se editan en Menú → Salsas, quitar y sabores, igual que las
// salsas; se guardan en settings para que todos los equipos vean la misma
// lista. Puede quedar vacía (el panel esconde la sección).
const DEFAULT_QUITAR = ["Sin queso", "Sin cebolla", "Sin verduras"];

router.get("/quitar", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const row = await db.get("SELECT value FROM settings WHERE key = 'quitar'");
    const quitar = row
      ? String(row.value || "").split(",").map((s) => s.trim()).filter(Boolean)
      : DEFAULT_QUITAR;
    res.json({ quitar });
  } catch (error) {
    console.error("Error obteniendo opciones de quitar:", error);
    res.json({ quitar: DEFAULT_QUITAR });
  }
});

router.put("/quitar", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { quitar } = req.body;
    if (!Array.isArray(quitar)) {
      return res.status(400).json({ error: "quitar debe ser una lista" });
    }
    // Sin comas (las notas del item son una lista separada por comas)
    const cleaned = quitar.map((s) => String(s).replace(/,/g, " ").trim()).filter(Boolean).slice(0, 20);
    const db = getDb();
    await db.run(
      `INSERT INTO settings (key, value) VALUES ('quitar', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [cleaned.join(",")]
    );
    res.json({ quitar: cleaned });
  } catch (error) {
    console.error("Error guardando opciones de quitar:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// ---------------------------------------------------------------------------
// IDENTIDAD DEL NEGOCIO (rediseño 2026-10): nombre comercial, logo, mensaje al
// pie del recibo y datos del negocio. Vive en la tabla settings (servidor), así
// TODOS los dispositivos ven lo mismo — no en el navegador de cada uno.
// Los datos fiscales arrancan VACÍOS a propósito: el recibo no muestra NIT,
// dirección ni teléfono hasta que alguien los escriba (nada inventado).
const BUSINESS_DEFAULTS = {
  business_name: "Chanatos",
  receipt_footer: "Gracias por venir a Chanatos",
  business_nit: "",
  business_address: "",
  business_phone: "",
  business_logo: "", // vacío = logo oficial empaquetado (/icon-192.png)
};
const BUSINESS_KEYS = Object.keys(BUSINESS_DEFAULTS);
// El logo va como data URL (imagen chica); el límite evita llenar la BD
const MAX_LOGO_CHARS = 400_000;

async function readBusiness(db) {
  const rows = await db.all(
    `SELECT key, value FROM settings WHERE key IN (${BUSINESS_KEYS.map(() => "?").join(",")})`,
    BUSINESS_KEYS
  );
  const out = { ...BUSINESS_DEFAULTS };
  for (const r of rows) if (r.value != null) out[r.key] = r.value;
  return out;
}

// GET /api/settings/business — SIN sesión: la pantalla de acceso también
// muestra el nombre y el logo (no hay nada sensible acá).
router.get("/business", async (req, res) => {
  try {
    res.json(await readBusiness(getDb()));
  } catch (error) {
    console.error("Error obteniendo identidad del negocio:", error);
    res.json({ ...BUSINESS_DEFAULTS });
  }
});

// PUT /api/settings/business — solo CAJA. Acepta cualquier subconjunto de campos.
router.put("/business", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const updates = {};
    for (const key of BUSINESS_KEYS) {
      if (req.body[key] === undefined) continue;
      const value = String(req.body[key] ?? "").trim();
      if (key === "business_name" && !value) {
        return res.status(400).json({ error: "El nombre comercial no puede quedar vacío" });
      }
      if (key === "business_logo" && value) {
        if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(value)) {
          return res.status(400).json({ error: "El logo debe ser una imagen PNG, JPG, WEBP o SVG" });
        }
        if (value.length > MAX_LOGO_CHARS) {
          return res.status(400).json({ error: "El logo es muy pesado. Usa una imagen de menos de 250 KB." });
        }
      }
      updates[key] = value;
    }
    for (const [key, value] of Object.entries(updates)) {
      await db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
      );
    }
    const business = await readBusiness(db);
    // Los demás dispositivos actualizan nombre/logo/recibo sin recargar
    req.app.get("io")?.emit("settings:business-updated", business);
    res.json(business);
  } catch (error) {
    console.error("Error guardando identidad del negocio:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
