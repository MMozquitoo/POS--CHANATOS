import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/ingredients - Obtener todos los ingredientes (activos por defecto)
router.get("/", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { includeInactive } = req.query;

    let query = "SELECT * FROM ingredients";
    const params = [];

    if (includeInactive !== "true") {
      query += " WHERE is_active = 1";
    }

    query += " ORDER BY name";

    const ingredients = await db.all(query, params);
    res.json(ingredients);
  } catch (error) {
    console.error("Error obteniendo ingredientes:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/ingredients/:id - Obtener un ingrediente por ID
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const ingredient = await db.get(
      "SELECT * FROM ingredients WHERE id = ?",
      [req.params.id]
    );

    if (!ingredient) {
      return res.status(404).json({ error: "Ingrediente no encontrado" });
    }

    res.json(ingredient);
  } catch (error) {
    console.error("Error obteniendo ingrediente:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/ingredients - Crear nuevo ingrediente
router.post("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { name, cost_per_unit, unit, conversion_factor } = req.body;
    const db = getDb();

    // Validaciones
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    if (cost_per_unit === undefined || cost_per_unit === null) {
      return res.status(400).json({ error: "El costo unitario es requerido" });
    }

    const cost = parseInt(cost_per_unit);
    if (isNaN(cost) || cost < 0) {
      return res.status(400).json({
        error: "El costo unitario debe ser un número entero >= 0",
      });
    }

    const conversionFactor = conversion_factor !== undefined && conversion_factor !== null 
      ? parseFloat(conversion_factor) 
      : 1;
    
    if (isNaN(conversionFactor) || conversionFactor <= 0) {
      return res.status(400).json({
        error: "El factor de conversión debe ser un número > 0",
      });
    }

    // Verificar que el nombre no exista
    const existing = await db.get(
      "SELECT id FROM ingredients WHERE name = ?",
      [name.trim()]
    );
    if (existing) {
      return res.status(400).json({ error: "Ya existe un ingrediente con ese nombre" });
    }

    // Insertar
    const result = await db.run(
      "INSERT INTO ingredients (name, unit, cost_per_unit, conversion_factor) VALUES (?, ?, ?, ?)",
      [name.trim(), unit || "unidad", cost, conversionFactor]
    );

    const ingredient = await db.get(
      "SELECT * FROM ingredients WHERE id = ?",
      [result.lastID]
    );

    res.status(201).json(ingredient);
  } catch (error) {
    console.error("Error creando ingrediente:", error);
    if (error.message && error.message.includes("UNIQUE constraint")) {
      return res.status(400).json({ error: "Ya existe un ingrediente con ese nombre" });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/ingredients/:id - Actualizar ingrediente
router.patch("/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { name, cost_per_unit, unit, is_active, conversion_factor } = req.body;
    const db = getDb();
    const ingredientId = parseInt(req.params.id);

    // Verificar que existe
    const ingredient = await db.get(
      "SELECT * FROM ingredients WHERE id = ?",
      [ingredientId]
    );
    if (!ingredient) {
      return res.status(404).json({ error: "Ingrediente no encontrado" });
    }

    // Construir actualización dinámica
    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: "El nombre no puede estar vacío" });
      }
      // Verificar unicidad solo si el nombre cambió
      if (name.trim() !== ingredient.name) {
        const existing = await db.get(
          "SELECT id FROM ingredients WHERE name = ? AND id != ?",
          [name.trim(), ingredientId]
        );
        if (existing) {
          return res.status(400).json({ error: "Ya existe un ingrediente con ese nombre" });
        }
      }
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (cost_per_unit !== undefined) {
      const cost = parseInt(cost_per_unit);
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({
          error: "El costo unitario debe ser un número entero >= 0",
        });
      }
      updates.push("cost_per_unit = ?");
      params.push(cost);
    }

    if (unit !== undefined) {
      updates.push("unit = ?");
      params.push(unit);
    }

    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (conversion_factor !== undefined && conversion_factor !== null) {
      const conversionFactor = parseFloat(conversion_factor);
      if (isNaN(conversionFactor) || conversionFactor <= 0) {
        return res.status(400).json({
          error: "El factor de conversión debe ser un número > 0",
        });
      }
      updates.push("conversion_factor = ?");
      params.push(conversionFactor);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No hay campos para actualizar" });
    }

    // Actualizar
    params.push(ingredientId);
    await db.run(
      `UPDATE ingredients SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      params
    );

    const updated = await db.get(
      "SELECT * FROM ingredients WHERE id = ?",
      [ingredientId]
    );

    res.json(updated);
  } catch (error) {
    console.error("Error actualizando ingrediente:", error);
    if (error.message && error.message.includes("UNIQUE constraint")) {
      return res.status(400).json({ error: "Ya existe un ingrediente con ese nombre" });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/ingredients/:id/toggle - Activar/desactivar ingrediente
router.patch("/:id/toggle", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const ingredientId = parseInt(req.params.id);

    const ingredient = await db.get(
      "SELECT * FROM ingredients WHERE id = ?",
      [ingredientId]
    );
    if (!ingredient) {
      return res.status(404).json({ error: "Ingrediente no encontrado" });
    }

    const newStatus = ingredient.is_active ? 0 : 1;
    await db.run(
      "UPDATE ingredients SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
      [newStatus, ingredientId]
    );

    const updated = await db.get(
      "SELECT * FROM ingredients WHERE id = ?",
      [ingredientId]
    );

    res.json(updated);
  } catch (error) {
    console.error("Error activando/desactivando ingrediente:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
