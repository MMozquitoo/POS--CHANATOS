import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /api/recipes/product/:productId - Obtener receta de un producto
router.get("/product/:productId", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const productId = parseInt(req.params.productId);

    // Verificar que el producto existe
    const product = await db.get("SELECT id, name FROM products WHERE id = ?", [productId]);
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Obtener receta con información de ingredientes
    const recipeItems = await db.all(
      `SELECT 
        r.id,
        r.ingredient_id,
        i.name as ingredient_name,
        i.cost_per_unit,
        i.unit,
        r.qty_used
      FROM recipes r
      JOIN ingredients i ON r.ingredient_id = i.id
      WHERE r.product_id = ?
      ORDER BY i.name`,
      [productId]
    );

    // Calcular costo unitario total
    const unitCost = recipeItems.reduce(
      (sum, item) => sum + item.qty_used * item.cost_per_unit,
      0
    );

    res.json({
      product_id: productId,
      product_name: product.name,
      items: recipeItems.map((item) => ({
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient_name,
        qty_used: item.qty_used,
        cost_per_unit: item.cost_per_unit,
        unit: item.unit,
        subtotal: item.qty_used * item.cost_per_unit,
      })),
      unit_cost: unitCost,
    });
  } catch (error) {
    console.error("Error obteniendo receta:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /api/recipes/product/:productId - Reemplazar receta completa de un producto
router.put("/product/:productId", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { items } = req.body;
    const db = getDb();
    const productId = parseInt(req.params.productId);

    // Validaciones
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items debe ser un array" });
    }

    // Verificar que el producto existe
    const product = await db.get("SELECT id, name FROM products WHERE id = ?", [productId]);
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Validar items: deben tener ingredient_id y qty_used >= 1
    const validItems = items.filter(
      (item) =>
        item.ingredient_id !== undefined &&
        item.qty_used !== undefined &&
        parseInt(item.qty_used) >= 1
    );

    if (validItems.length === 0 && items.length > 0) {
      return res.status(400).json({
        error: "Todos los items deben tener ingredient_id y qty_used >= 1",
      });
    }

    // Verificar que los ingredientes existen y están activos
    if (validItems.length > 0) {
      const ingredientIds = validItems.map((item) => parseInt(item.ingredient_id));
      const placeholders = ingredientIds.map(() => "?").join(",");
      const ingredients = await db.all(
        `SELECT id, name, is_active FROM ingredients WHERE id IN (${placeholders})`,
        ingredientIds
      );

      if (ingredients.length !== ingredientIds.length) {
        return res.status(400).json({ error: "Uno o más ingredientes no existen" });
      }

      const inactiveIngredients = ingredients.filter((ing) => !ing.is_active);
      if (inactiveIngredients.length > 0) {
        return res.status(400).json({
          error: `Los siguientes ingredientes están inactivos: ${inactiveIngredients.map((ing) => ing.name).join(", ")}`,
        });
      }
    }

    // Transacción: borrar receta actual e insertar nueva
    await db.run("BEGIN TRANSACTION");
    try {
      // Borrar receta actual
      await db.run("DELETE FROM recipes WHERE product_id = ?", [productId]);

      // Insertar nuevos items
      for (const item of validItems) {
        const ingredientId = parseInt(item.ingredient_id);
        const qtyUsed = parseInt(item.qty_used);

        await db.run(
          "INSERT INTO recipes (product_id, ingredient_id, qty_used) VALUES (?, ?, ?)",
          [productId, ingredientId, qtyUsed]
        );
      }

      await db.run("COMMIT");

      // Obtener receta actualizada
      const recipeItems = await db.all(
        `SELECT 
          r.id,
          r.ingredient_id,
          i.name as ingredient_name,
          i.cost_per_unit,
          i.unit,
          r.qty_used
        FROM recipes r
        JOIN ingredients i ON r.ingredient_id = i.id
        WHERE r.product_id = ?
        ORDER BY i.name`,
        [productId]
      );

      const unitCost = recipeItems.reduce(
        (sum, item) => sum + item.qty_used * item.cost_per_unit,
        0
      );

      res.json({
        product_id: productId,
        product_name: product.name,
        items: recipeItems.map((item) => ({
          ingredient_id: item.ingredient_id,
          ingredient_name: item.ingredient_name,
          qty_used: item.qty_used,
          cost_per_unit: item.cost_per_unit,
          unit: item.unit,
          subtotal: item.qty_used * item.cost_per_unit,
        })),
        unit_cost: unitCost,
      });
    } catch (transactionError) {
      await db.run("ROLLBACK");
      throw transactionError;
    }
  } catch (error) {
    console.error("Error guardando receta:", error);
    if (error.message && error.message.includes("UNIQUE constraint")) {
      return res.status(400).json({
        error: "No puedes agregar el mismo ingrediente dos veces a la receta",
      });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
