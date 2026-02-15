import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { toBogotaSQLiteTimestamp } from "../utils/timezone.js";

const router = express.Router();

// GET /api/inventory - Obtener inventario completo con información de ingredientes
router.get("/", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const inventory = await db.all(
      `SELECT
        i.id,
        ing.id as ingredient_id,
        ing.name as ingredient_name,
        ing.unit,
        ing.cost_per_unit,
        ing.is_active,
        COALESCE(i.stock_qty, 0) as stock_qty,
        COALESCE(i.min_stock, 0) as min_stock,
        CASE
          WHEN COALESCE(i.stock_qty, 0) <= COALESCE(i.min_stock, 0) THEN 1
          ELSE 0
        END as is_low_stock,
        i.created_at,
        i.updated_at
      FROM ingredients ing
      LEFT JOIN inventory i ON i.ingredient_id = ing.id
      WHERE ing.is_active = 1
      ORDER BY ing.name`
    );

    res.json(inventory);
  } catch (error) {
    console.error("Error obteniendo inventario:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/inventory/low-stock - Obtener solo ingredientes con stock bajo
router.get("/low-stock", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const lowStock = await db.all(
      `SELECT
        i.id,
        ing.id as ingredient_id,
        ing.name as ingredient_name,
        ing.unit,
        ing.cost_per_unit,
        COALESCE(i.stock_qty, 0) as stock_qty,
        COALESCE(i.min_stock, 0) as min_stock
      FROM ingredients ing
      LEFT JOIN inventory i ON i.ingredient_id = ing.id
      WHERE ing.is_active = 1
        AND COALESCE(i.stock_qty, 0) <= COALESCE(i.min_stock, 0)
      ORDER BY (COALESCE(i.stock_qty, 0) - COALESCE(i.min_stock, 0)) ASC`
    );

    res.json(lowStock);
  } catch (error) {
    console.error("Error obteniendo stock bajo:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/inventory/ingredient/:ingredientId - Obtener inventario de un ingrediente específico
router.get("/ingredient/:ingredientId", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const ingredientId = parseInt(req.params.ingredientId);

    const inventory = await db.get(
      `SELECT 
        i.id,
        i.ingredient_id,
        ing.name as ingredient_name,
        ing.unit,
        ing.cost_per_unit,
        i.stock_qty,
        i.min_stock,
        i.created_at,
        i.updated_at
      FROM inventory i
      JOIN ingredients ing ON i.ingredient_id = ing.id
      WHERE i.ingredient_id = ?`,
      [ingredientId]
    );

    if (!inventory) {
      return res
        .status(404)
        .json({ error: "Inventario no encontrado para este ingrediente" });
    }

    res.json(inventory);
  } catch (error) {
    console.error("Error obteniendo inventario:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/inventory - Crear o inicializar inventario para un ingrediente
router.post("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { ingredient_id, stock_qty, min_stock } = req.body;
    const db = getDb();

    // Validaciones
    if (!ingredient_id) {
      return res.status(400).json({ error: "ingredient_id es requerido" });
    }

    const ingredientId = parseInt(ingredient_id);
    const stockQty = parseFloat(stock_qty || 0);
    const minStock = parseFloat(min_stock || 0);

    // Verificar que el ingrediente existe
    const ingredient = await db.get(
      "SELECT id, name, is_active FROM ingredients WHERE id = ?",
      [ingredientId]
    );
    if (!ingredient) {
      return res.status(404).json({ error: "Ingrediente no encontrado" });
    }

    // Verificar si ya existe inventario para este ingrediente
    const existing = await db.get(
      "SELECT id FROM inventory WHERE ingredient_id = ?",
      [ingredientId]
    );
    if (existing) {
      return res
        .status(400)
        .json({
          error:
            "Ya existe inventario para este ingrediente. Use PATCH para actualizar.",
        });
    }

    // Crear inventario
    const timestamp = toBogotaSQLiteTimestamp(new Date());
    const result = await db.run(
      "INSERT INTO inventory (ingredient_id, stock_qty, min_stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [ingredientId, stockQty, minStock, timestamp, timestamp]
    );

    const inventory = await db.get(
      `SELECT 
        i.*,
        ing.name as ingredient_name,
        ing.unit,
        ing.cost_per_unit
      FROM inventory i
      JOIN ingredients ing ON i.ingredient_id = ing.id
      WHERE i.id = ?`,
      [result.lastID]
    );

    res.status(201).json(inventory);
  } catch (error) {
    console.error("Error creando inventario:", error);
    if (error.message && error.message.includes("UNIQUE constraint")) {
      return res
        .status(400)
        .json({ error: "Ya existe inventario para este ingrediente" });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/inventory/:id - Actualizar stock_qty y/o min_stock
router.patch("/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { stock_qty, min_stock } = req.body;
    const inventoryId = parseInt(req.params.id);
    const db = getDb();

    // Verificar que existe
    const existing = await db.get("SELECT * FROM inventory WHERE id = ?", [
      inventoryId,
    ]);
    if (!existing) {
      return res.status(404).json({ error: "Inventario no encontrado" });
    }

    // Actualizar solo los campos proporcionados
    const updates = [];
    const values = [];

    if (stock_qty !== undefined) {
      updates.push("stock_qty = ?");
      values.push(parseFloat(stock_qty));
    }

    if (min_stock !== undefined) {
      updates.push("min_stock = ?");
      values.push(parseFloat(min_stock));
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ error: "Debe proporcionar al menos un campo para actualizar" });
    }

    values.push(inventoryId);

    await db.run(
      `UPDATE inventory SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    const updated = await db.get(
      `SELECT 
        i.*,
        ing.name as ingredient_name,
        ing.unit,
        ing.cost_per_unit
      FROM inventory i
      JOIN ingredients ing ON i.ingredient_id = ing.id
      WHERE i.id = ?`,
      [inventoryId]
    );

    res.json(updated);
  } catch (error) {
    console.error("Error actualizando inventario:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/inventory/ingredient/:ingredientId - Actualizar por ingredient_id
router.patch(
  "/ingredient/:ingredientId",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const { stock_qty, min_stock } = req.body;
      const ingredientId = parseInt(req.params.ingredientId);
      const db = getDb();

      // Verificar que existe
      const existing = await db.get(
        "SELECT * FROM inventory WHERE ingredient_id = ?",
        [ingredientId]
      );
      if (!existing) {
        return res
          .status(404)
          .json({ error: "Inventario no encontrado para este ingrediente" });
      }

      // Actualizar solo los campos proporcionados
      const updates = [];
      const values = [];

      if (stock_qty !== undefined) {
        updates.push("stock_qty = ?");
        values.push(parseFloat(stock_qty));
      }

      if (min_stock !== undefined) {
        updates.push("min_stock = ?");
        values.push(parseFloat(min_stock));
      }

      if (updates.length === 0) {
        return res
          .status(400)
          .json({
            error: "Debe proporcionar al menos un campo para actualizar",
          });
      }

      values.push(ingredientId);

      await db.run(
        `UPDATE inventory SET ${updates.join(", ")} WHERE ingredient_id = ?`,
        values
      );

      const updated = await db.get(
        `SELECT 
        i.*,
        ing.name as ingredient_name,
        ing.unit,
        ing.cost_per_unit
      FROM inventory i
      JOIN ingredients ing ON i.ingredient_id = ing.id
      WHERE i.ingredient_id = ?`,
        [ingredientId]
      );

      res.json(updated);
    } catch (error) {
      console.error("Error actualizando inventario:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

export default router;
