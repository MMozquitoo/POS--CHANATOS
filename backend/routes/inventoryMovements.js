import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { toBogotaSQLiteTimestamp } from "../utils/timezone.js";
import { logAudit } from "../utils/audit.js";

const router = express.Router();

// GET /api/inventory-movements - Obtener movimientos con filtros opcionales
router.get("/", requireAuth, async (req, res) => {
  try {
    const { ingredient_id, type, limit = 100 } = req.query;
    const db = getDb();

    let query = `
      SELECT 
        im.id,
        im.ingredient_id,
        ing.name as ingredient_name,
        ing.unit,
        im.type,
        im.qty,
        im.reason,
        im.purchase_qty,
        im.purchase_total_cost,
        u.name as created_by_name,
        im.created_at
      FROM inventory_movements im
      JOIN ingredients ing ON im.ingredient_id = ing.id
      JOIN users u ON im.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (ingredient_id) {
      query += " AND im.ingredient_id = ?";
      params.push(parseInt(ingredient_id));
    }

    if (type) {
      query += " AND im.type = ?";
      params.push(type);
    }

    query += " ORDER BY im.created_at DESC LIMIT ?";
    params.push(parseInt(limit));

    const movements = await db.all(query, params);

    res.json(movements);
  } catch (error) {
    console.error("Error obteniendo movimientos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/inventory-movements - Crear movimiento y actualizar inventario
router.post("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { ingredient_id, type, qty, reason, purchase_qty, purchase_total_cost } = req.body;
    const db = getDb();

    // Validaciones
    if (!ingredient_id || !type) {
      return res.status(400).json({ error: "ingredient_id y type son requeridos" });
    }

    if (!["IN", "OUT", "ADJUST"].includes(type)) {
      return res.status(400).json({ error: "type debe ser IN, OUT o ADJUST" });
    }

    const ingredientId = parseInt(ingredient_id);

    // Verificar que el ingrediente existe
    const ingredient = await db.get(
      "SELECT id, name, is_active, conversion_factor FROM ingredients WHERE id = ?", 
      [ingredientId]
    );
    if (!ingredient) {
      return res.status(404).json({ error: "Ingrediente no encontrado" });
    }

    const conversionFactor = ingredient.conversion_factor || 1;

    let quantity;
    let purchaseQty = null;
    let purchaseTotalCost = null;

    // Para compras (IN), verificar si se proporciona purchase_qty y purchase_total_cost
    if (type === "IN" && purchase_qty !== undefined && purchase_qty !== null && purchase_total_cost !== undefined && purchase_total_cost !== null) {
      // Modo compra: usar purchase_qty y purchase_total_cost
      purchaseQty = parseFloat(purchase_qty);
      purchaseTotalCost = parseInt(purchase_total_cost);

      if (purchaseQty <= 0) {
        return res.status(400).json({ error: "purchase_qty debe ser mayor a 0" });
      }
      if (purchaseTotalCost < 0) {
        return res.status(400).json({ error: "purchase_total_cost debe ser >= 0" });
      }

      // Calcular unidades reales usando el factor de conversión
      quantity = purchaseQty * conversionFactor;
    } else {
      // Modo normal: usar qty directamente
      if (qty === undefined || qty === null) {
        return res.status(400).json({ error: "qty es requerido" });
      }
      quantity = parseFloat(qty);
      if (quantity <= 0) {
        return res.status(400).json({ error: "qty debe ser mayor a 0" });
      }
    }

    // Verificar que existe inventario para este ingrediente
    const inventory = await db.get("SELECT * FROM inventory WHERE ingredient_id = ?", [ingredientId]);
    if (!inventory) {
      return res.status(400).json({ 
        error: "No existe inventario para este ingrediente. Cree el inventario primero." 
      });
    }

    // Calcular nuevo stock según el tipo de movimiento
    let newStockQty = inventory.stock_qty;
    if (type === "IN") {
      newStockQty += quantity;
    } else if (type === "OUT") {
      newStockQty -= quantity;
      // Advertencia si queda negativo (pero permitirlo)
      if (newStockQty < 0) {
        console.warn(`⚠️  Stock negativo para ingrediente ${ingredientId}: ${newStockQty}`);
      }
    } else if (type === "ADJUST") {
      newStockQty = quantity; // Ajuste establece el valor directamente
    }

    // Transacción: crear movimiento, actualizar inventario y costo unitario
    await db.run("BEGIN TRANSACTION");
    try {
      const timestamp = toBogotaSQLiteTimestamp(new Date());

      // Calcular nuevo costo unitario si es una compra con costo
      let newCostPerUnit = ingredient.cost_per_unit;
      if (type === "IN" && purchaseQty !== null && purchaseTotalCost !== null && quantity > 0) {
        newCostPerUnit = Math.round(purchaseTotalCost / quantity);
        // Actualizar costo unitario del ingrediente
        await db.run(
          "UPDATE ingredients SET cost_per_unit = ?, updated_at = datetime('now') WHERE id = ?",
          [newCostPerUnit, ingredientId]
        );
      }

      // Crear movimiento
      const movementResult = await db.run(
        "INSERT INTO inventory_movements (ingredient_id, type, qty, reason, purchase_qty, purchase_total_cost, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [ingredientId, type, quantity, reason || null, purchaseQty, purchaseTotalCost, req.user.id, timestamp]
      );

      // Actualizar inventario
      await db.run(
        "UPDATE inventory SET stock_qty = ? WHERE ingredient_id = ?",
        [newStockQty, ingredientId]
      );

      await db.run("COMMIT");

      // Obtener movimiento creado con información completa
      const movement = await db.get(
        `SELECT 
          im.*,
          ing.name as ingredient_name,
          ing.unit,
          u.name as created_by_name
        FROM inventory_movements im
        JOIN ingredients ing ON im.ingredient_id = ing.id
        JOIN users u ON im.created_by = u.id
        WHERE im.id = ?`,
        [movementResult.lastID]
      );

      // Obtener inventario actualizado
      const updatedInventory = await db.get(
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

      res.status(201).json({
        movement,
        inventory: updatedInventory
      });
    } catch (transactionError) {
      await db.run("ROLLBACK");
      throw transactionError;
    }
  } catch (error) {
    console.error("Error creando movimiento:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Calcular consumo total de ingredientes según recetas de los items (no anulados, no custom)
async function computeIngredientQuantities(db, orderItems) {
  const ingredientQuantities = {};

  for (const item of orderItems) {
    if (!item.product_id || item.is_custom === 1 || item.voided_at) {
      continue;
    }

    const recipeItems = await db.all(
      `SELECT r.ingredient_id, r.qty_used
       FROM recipes r
       JOIN ingredients i ON r.ingredient_id = i.id
       WHERE r.product_id = ? AND i.is_active = 1`,
      [item.product_id]
    );

    for (const recipeItem of recipeItems) {
      const totalQty = recipeItem.qty_used * item.qty;
      if (!ingredientQuantities[recipeItem.ingredient_id]) {
        ingredientQuantities[recipeItem.ingredient_id] = 0;
      }
      ingredientQuantities[recipeItem.ingredient_id] += totalQty;
    }
  }

  return ingredientQuantities;
}

// Aplicar movimientos de inventario (OUT al vender, IN al reponer por anulación)
async function applyInventoryMovements(db, ingredientQuantities, userId, type, reason) {
  const timestamp = toBogotaSQLiteTimestamp(new Date());
  const movements = [];

  for (const [ingredientId, totalQty] of Object.entries(ingredientQuantities)) {
    const ingredientIdNum = parseInt(ingredientId);

    const inventory = await db.get(
      "SELECT * FROM inventory WHERE ingredient_id = ?",
      [ingredientIdNum]
    );

    if (!inventory) {
      console.warn(`⚠️  No hay inventario para ingrediente ${ingredientIdNum}, saltando movimiento automático`);
      continue;
    }

    const movementResult = await db.run(
      "INSERT INTO inventory_movements (ingredient_id, type, qty, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [ingredientIdNum, type, totalQty, reason, userId, timestamp]
    );

    const newStock = type === "OUT"
      ? inventory.stock_qty - totalQty
      : inventory.stock_qty + totalQty;

    await db.run(
      "UPDATE inventory SET stock_qty = ? WHERE ingredient_id = ?",
      [newStock, ingredientIdNum]
    );

    // FASE F5: el stock negativo se permite (significa conteo inicial errado)
    // pero queda registrado en auditoría para que no pase desapercibido
    if (newStock < 0) {
      await logAudit({
        action: 'STOCK_NEGATIVE',
        entity_type: 'inventory',
        entity_id: ingredientIdNum,
        user_id: userId,
        summary: `Stock negativo del ingrediente ${ingredientIdNum} (${newStock}) tras ${reason}`,
        meta: { ingredient_id: ingredientIdNum, new_stock: newStock, qty: totalQty, type }
      }).catch(() => {});
    }

    movements.push({
      id: movementResult.lastID,
      ingredient_id: ingredientIdNum,
      qty: totalQty
    });
  }

  return movements;
}

// Descontar inventario al vender (usada en payments).
// FASE F5: ya no traga errores — el caller decide cómo manejarlos (y auditarlos).
export async function deductInventoryFromOrderItems(db, orderItems, userId) {
  const quantities = await computeIngredientQuantities(db, orderItems);
  return applyInventoryMovements(db, quantities, userId, "OUT", "Descuento automático por venta");
}

// Reponer inventario cuando se anula el pago de una orden que ya había descontado stock
export async function restoreInventoryFromOrderItems(db, orderItems, userId, orderId) {
  const quantities = await computeIngredientQuantities(db, orderItems);
  return applyInventoryMovements(db, quantities, userId, "IN", `Reposición por anulación de pago (orden ${orderId})`);
}

export default router;
