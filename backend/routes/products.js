import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { toBogotaSQLiteTimestamp } from "../utils/timezone.js";
import { saveProductsToSource } from "../utils/productsSource.js";

const router = express.Router();

// Función helper para registrar auditoría (mantenida para uso futuro con nuevo botón MENU)
async function logAudit(db, userId, action, productId, beforeJson = null, afterJson = null) {
  try {
    const timestamp = toBogotaSQLiteTimestamp(new Date());
    await db.run(
      "INSERT INTO audit_log (user_id, action, product_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId,
        action,
        productId,
        beforeJson ? JSON.stringify(beforeJson) : null,
        afterJson ? JSON.stringify(afterJson) : null,
        timestamp,
      ]
    );
  } catch (error) {
    console.error("Error registrando auditoría:", error);
    // No lanzar error para no interrumpir la operación principal
  }
}

// GET /api/products - Obtener todos los productos activos, agrupados por categoría
router.get("/", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { category } = req.query;

    let query = `
      SELECT id, name, category, price, variant, display_order
      FROM products
      WHERE is_active = 1
    `;
    const params = [];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    query += " ORDER BY category, display_order, name";

    const products = await db.all(query, params);

    // Agrupar por categoría
    const productsByCategory = {};
    products.forEach((product) => {
      if (!productsByCategory[product.category]) {
        productsByCategory[product.category] = [];
      }
      productsByCategory[product.category].push({
        id: product.id,
        name: product.name,
        price: product.price,
        variant: product.variant,
        displayName: product.variant 
          ? `${product.name} - ${product.variant}` 
          : product.name,
      });
    });

    res.json(productsByCategory);
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/products/flat - Obtener todos los productos en lista plana (para compatibilidad)
router.get("/flat", requireAuth, async (req, res) => {
  try {
    const db = getDb();

    const products = await db.all(
      `SELECT id, name, category, price, variant, display_order
       FROM products
       WHERE is_active = 1
       ORDER BY category, display_order, name`
    );

    const flatProducts = products.map((product) => ({
      id: product.id,
      name: product.variant 
        ? `${product.name} - ${product.variant}` 
        : product.name,
      price: product.price,
      category: product.category,
      variant: product.variant,
    }));

    res.json(flatProducts);
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/products/categories - Obtener lista de categorías
router.get("/categories", requireAuth, async (req, res) => {
  try {
    const db = getDb();

    const categories = await db.all(
      `SELECT DISTINCT category
       FROM products
       WHERE is_active = 1
       ORDER BY category`
    );

    res.json(categories.map((c) => c.category));
  } catch (error) {
    console.error("Error obteniendo categorías:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/products/admin - Obtener TODOS los productos (activos e inactivos) para administración (FASE 1)
// Solo lectura - Caja puede ver todo
router.get("/admin", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { category, search } = req.query;

    let query = `
      SELECT id, name, category, price, variant, is_active, display_order, created_at
      FROM products
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    if (search) {
      query += " AND name LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY category, display_order, name";

    const products = await db.all(query, params);

    res.json(products);
  } catch (error) {
    console.error("Error obteniendo productos para admin:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/products/admin/categories - Obtener todas las categorías (incluyendo productos inactivos)
router.get("/admin/categories", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();

    const categories = await db.all(
      `SELECT DISTINCT category
       FROM products
       ORDER BY category`
    );

    res.json(categories.map((c) => c.category));
  } catch (error) {
    console.error("Error obteniendo categorías para admin:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/products - Crear nuevo producto
router.post("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { name, category, price, variant, display_order, is_active } = req.body;
    const db = getDb();

    // Validaciones
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    if (!category || !category.trim()) {
      return res.status(400).json({ error: "La categoría es requerida" });
    }

    if (price === undefined || price === null) {
      return res.status(400).json({ error: "El precio es requerido" });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: "El precio debe ser un número >= 0" });
    }

    // Convertir a entero (COP)
    const priceInt = Math.round(priceNum);
    if (priceInt < 0) {
      return res.status(400).json({ error: "El precio debe ser >= 0" });
    }

    const displayOrder = display_order !== undefined ? parseInt(display_order) : 0;
    if (isNaN(displayOrder) || displayOrder < 0) {
      return res.status(400).json({ error: "El orden debe ser un número entero >= 0" });
    }

    const isActive = is_active === true || is_active === 1 ? 1 : 0;

    // Crear producto
    const result = await db.run(
      "INSERT INTO products (name, category, price, variant, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [
        name.trim(),
        category.trim(),
        priceInt,
        variant ? variant.trim() : null,
        displayOrder,
        isActive,
      ]
    );

    // Obtener producto creado
    const newProduct = await db.get("SELECT * FROM products WHERE id = ?", [result.lastID]);

    // Registrar auditoría
    await logAudit(db, req.user.id, "PRODUCT_CREATE", newProduct.id, null, newProduct);

    // CRÍTICO: Sincronizar con products.json (fuente de verdad)
    try {
      const allProducts = await db.all("SELECT * FROM products ORDER BY category, display_order, name");
      saveProductsToSource(allProducts);
    } catch (error) {
      console.error("⚠️  Error sincronizando con products.json:", error);
      // No fallar la operación si hay error en JSON
    }

    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error creando producto:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/products/:id - Editar producto
router.patch("/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, category, price, variant, display_order, is_active } = req.body;
    const db = getDb();

    // Verificar que el producto existe
    const existingProduct = await db.get("SELECT * FROM products WHERE id = ?", [productId]);
    if (!existingProduct) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Guardar estado anterior para auditoría
    const beforeState = { ...existingProduct };

    // Validaciones
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    if (category !== undefined && (!category || !category.trim())) {
      return res.status(400).json({ error: "La categoría es requerida" });
    }

    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: "El precio debe ser un número >= 0" });
      }
      // Convertir a entero (COP)
      const priceInt = Math.round(priceNum);
      if (priceInt < 0) {
        return res.status(400).json({ error: "El precio debe ser >= 0" });
      }
    }

    if (display_order !== undefined) {
      const orderNum = parseInt(display_order);
      if (isNaN(orderNum) || orderNum < 0) {
        return res.status(400).json({ error: "El orden debe ser un número entero >= 0" });
      }
    }

    // Construir query de actualización
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (category !== undefined) {
      updates.push("category = ?");
      params.push(category.trim());
    }

    if (price !== undefined) {
      updates.push("price = ?");
      params.push(Math.round(parseFloat(price)));
    }

    if (variant !== undefined) {
      updates.push("variant = ?");
      params.push(variant ? variant.trim() : null);
    }

    if (display_order !== undefined) {
      updates.push("display_order = ?");
      params.push(parseInt(display_order));
    }

    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active === true || is_active === 1 ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "Debe proporcionar al menos un campo para actualizar" });
    }

    params.push(productId);

    // Actualizar producto
    await db.run(
      `UPDATE products SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    // Obtener producto actualizado
    const updatedProduct = await db.get("SELECT * FROM products WHERE id = ?", [productId]);

    // Registrar auditoría
    await logAudit(db, req.user.id, "PRODUCT_UPDATE", productId, beforeState, updatedProduct);

    // CRÍTICO: Sincronizar con products.json (fuente de verdad)
    try {
      const allProducts = await db.all("SELECT * FROM products ORDER BY category, display_order, name");
      saveProductsToSource(allProducts);
    } catch (error) {
      console.error("⚠️  Error sincronizando con products.json:", error);
      // No fallar la operación si hay error en JSON
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error actualizando producto:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/products/:id/toggle - Activar/Desactivar producto
router.patch("/:id/toggle", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const db = getDb();

    // Verificar que el producto existe
    const product = await db.get("SELECT * FROM products WHERE id = ?", [productId]);
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Guardar estado anterior para auditoría
    const beforeState = { ...product };

    // Cambiar estado (toggle)
    const newIsActive = product.is_active === 1 ? 0 : 1;

    await db.run(
      "UPDATE products SET is_active = ? WHERE id = ?",
      [newIsActive, productId]
    );

    // Obtener producto actualizado
    const updatedProduct = await db.get("SELECT * FROM products WHERE id = ?", [productId]);

    // Registrar auditoría
    await logAudit(db, req.user.id, "PRODUCT_TOGGLE", productId, beforeState, updatedProduct);

    // CRÍTICO: Sincronizar con products.json (fuente de verdad)
    try {
      const allProducts = await db.all("SELECT * FROM products ORDER BY category, display_order, name");
      saveProductsToSource(allProducts);
    } catch (error) {
      console.error("⚠️  Error sincronizando con products.json:", error);
      // No fallar la operación si hay error en JSON
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error activando/desactivando producto:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/products/:id/audit-log - Obtener historial de auditoría de un producto (FASE 5)
router.get("/:id/audit-log", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const db = getDb();

    // Verificar que el producto existe
    const product = await db.get("SELECT id, name FROM products WHERE id = ?", [productId]);
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // Obtener logs de auditoría
    const logs = await db.all(
      `SELECT 
        al.id,
        al.action,
        al.before_json,
        al.after_json,
        al.created_at,
        u.name as user_name
      FROM audit_log al
      JOIN users u ON al.user_id = u.id
      WHERE al.product_id = ?
      ORDER BY al.created_at DESC
      LIMIT 50`,
      [productId]
    );

    // Parsear JSON strings
    const parsedLogs = logs.map(log => ({
      ...log,
      before_json: log.before_json ? JSON.parse(log.before_json) : null,
      after_json: log.after_json ? JSON.parse(log.after_json) : null,
    }));

    res.json({
      product_id: productId,
      product_name: product.name,
      logs: parsedLogs,
    });
  } catch (error) {
    console.error("Error obteniendo auditoría:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
