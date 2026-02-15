import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getBogotaDateString, toBogotaSQLiteTimestamp } from "../utils/timezone.js";
import { logAudit } from "../utils/audit.js";

const router = express.Router();

const formatYyyyMmDdLocal = () => {
  // YYYY-MM-DD en horario local America/Bogota
  return getBogotaDateString();
};

const formatYyyyMmDdCompact = (yyyyMmDd) => yyyyMmDd.replace(/-/g, "");

// POST /api/orders
router.post(
  "/",
  requireAuth,
  requireRole("MESERO", "CAJA"),
  async (req, res) => {
    try {
      // 1) Validar autenticación explícitamente
      if (!req.user) {
        console.error("❌ POST /orders: req.user no existe");
        return res.status(401).json({ error: "No autenticado" });
      }

      if (!req.user.id) {
        console.error("❌ POST /orders: req.user.id no existe", req.user);
        return res.status(401).json({ error: "Usuario inválido" });
      }

      // 2) Validar payload mínimo
    const { tableId, channel, items, service } = req.body;

      if (!channel) {
        return res.status(400).json({ error: "channel es requerido" });
      }

      if (!["MESA", "VENTANILLA"].includes(channel)) {
        return res
          .status(400)
          .json({ error: "Canal inválido (debe ser MESA o VENTANILLA)" });
      }

      if (channel === "MESA" && !tableId) {
        return res
          .status(400)
          .json({ error: "tableId requerido para pedidos de MESA" });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Debe incluir al menos un item" });
      }

    const db = getDb();
    
    // FASE 1: Determinar service según número de mesa si no se proporciona
    let finalTableId = tableId;
    let orderService = service;
    
    if (finalTableId) {
      // Obtener número de mesa para determinar service
      const table = await db.get("SELECT number FROM tables WHERE id = ?", [finalTableId]);
      if (table) {
        // Si no se proporciona service, determinarlo por número de mesa
        if (!orderService) {
          if (table.number === 9) {
            orderService = 'VENTANILLA';
          } else if (table.number === 10) {
            orderService = 'DOMICILIO';
          } else {
            orderService = 'MESA';
          }
        }
      }
    }
    
    // Si aún no hay service, usar channel como fallback
    if (!orderService) {
      orderService = channel; // DOMICILIO / VENTANILLA / MESA
    }
    
    // Para órdenes de VENTANILLA o DOMICILIO sin tableId, asignar automáticamente a mesa 9 o 10
    if (channel === "VENTANILLA" && !tableId) {
      if (orderService === "VENTANILLA") {
        // Buscar mesa 9 (Ventanilla)
        const ventanillaTable = await db.get("SELECT id FROM tables WHERE number = 9");
        if (ventanillaTable) {
          finalTableId = ventanillaTable.id;
        }
      } else if (orderService === "DOMICILIO") {
        // Buscar mesa 10 (Domicilio)
        const domicilioTable = await db.get("SELECT id FROM tables WHERE number = 10");
        if (domicilioTable) {
          finalTableId = domicilioTable.id;
        }
      }
    }

      // FASE 1: Verificar que no exista orden activa para esta mesa
      // Mesas normales (1–8): una sola orden activa por mesa.
      // FASE M9.0: Ventanilla (9) y Domicilios (10) permiten múltiples órdenes activas.
      if (finalTableId) {
        const tbl = await db.get(
          "SELECT number, label FROM tables WHERE id = ?",
          [finalTableId]
        );
        const isVentanillaOrDomicilios =
          tbl &&
          (tbl.number === 9 ||
            tbl.number === 10 ||
            (tbl.label && /ventanilla|domicilio/i.test(String(tbl.label).trim())));

        if (!isVentanillaOrDomicilios) {
          const existingActiveOrder = await db.get(
            `SELECT id FROM orders
             WHERE table_id = ?
               AND paid_at IS NULL
               AND status != 'CANCELADO'
             ORDER BY created_at DESC
             LIMIT 1`,
            [finalTableId]
          );

          if (existingActiveOrder) {
            return res.status(400).json({
              error:
                "Ya existe una orden activa en esta mesa. Agrega items a la orden existente o cierra la orden actual.",
            });
          }
        }
      }

      // Validar que cada item tenga nombre
      for (const item of items) {
        if (!item.name || item.name.trim() === "") {
          return res
            .status(400)
            .json({ error: "Todos los items deben tener un nombre" });
        }
        // Precio es opcional si la columna no existe (compatibilidad)
        // Pero si se envía, debe ser válido
        if (item.price !== undefined && item.price !== null) {
          if (item.price <= 0) {
            return res.status(400).json({
              error: `El item "${item.name}" debe tener un precio válido`,
            });
          }
        }
      }

    // Consecutivo diario para mostrar "ORDEN 1,2,3..."
    const businessDay = formatYyyyMmDdLocal();
    const nextDaily = await db.get(
      "SELECT COALESCE(MAX(daily_no), 0) + 1 as next FROM orders WHERE business_day = ?",
      [businessDay]
    );
    const dailyNo = nextDaily?.next || 1;

    // code debe ser único global (por el UNIQUE). Guardamos algo corto, pero único.
    // UI mostrará: "ORDEN {dailyNo}"
    const code = `${formatYyyyMmDdCompact(businessDay)}-${dailyNo}`;

      console.log("📝 Creando pedido con:", {
        code,
        tableId: finalTableId || null,
        channel,
        service: orderService,
        created_by: req.user.id,
      });

      // FASE 3: Determinar estado inicial SOLO por tableNumber (regla estricta)
      // - tableNumber === 9 (VENTANILLA) → status inicial = 'EN_PREP'
      // - tableNumber === 10 (DOMICILIOS) → status inicial = 'NUEVO'
      // - tableNumber 1-8 (MESA) → status inicial = 'NUEVO'
      
      // Obtener número de mesa para determinar status inicial
      let tableNumber = null;
      if (finalTableId) {
        const table = await db.get("SELECT number FROM tables WHERE id = ?", [finalTableId]);
        if (table) {
          tableNumber = table.number;
        }
      }
      
      // Determinar status inicial SOLO por tableNumber
      let initialStatus = 'NUEVO'; // Default para mesas 1-8 y 10
      
      if (tableNumber === 9) {
        initialStatus = 'EN_PREP'; // VENTANILLA entra directo a preparación
      } else if (tableNumber === 10) {
        initialStatus = 'NUEVO'; // DOMICILIOS empieza como NUEVO
      } else if (tableNumber >= 1 && tableNumber <= 8) {
        initialStatus = 'NUEVO'; // MESA empieza como NUEVO
      }
      
      // Log SIEMPRE antes del INSERT (sin depender de NODE_ENV)
      console.log('[CREATE ORDER]', { 
        finalTableId: finalTableId || null, 
        tableNumber: tableNumber || null,
        service: orderService, 
        initialStatus
      });

      // 3) Crear pedido (aquí ya sabemos que req.user.id existe)
      let result;
      try {
      // Insert flexible por si la DB aún no tiene columnas nuevas (compatibilidad)
      const ordersInfo = await db.all("PRAGMA table_info(orders)");
      const hasServiceCol = ordersInfo.some((c) => c.name === "service");
      const hasBusinessDayCol = ordersInfo.some((c) => c.name === "business_day");
      const hasDailyNoCol = ordersInfo.some((c) => c.name === "daily_no");

      if (hasServiceCol && hasBusinessDayCol && hasDailyNoCol) {
        result = await db.run(
          `INSERT INTO orders (code, table_id, channel, service, business_day, daily_no, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            code,
            finalTableId || null,
            channel,
            orderService,
            businessDay,
            dailyNo,
            initialStatus,
            req.user.id,
          ]
        );
      } else {
        result = await db.run(
          `INSERT INTO orders (code, table_id, channel, status, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [code, finalTableId || null, channel, initialStatus, req.user.id]
        );
      }
        console.log("✅ Pedido creado, result:", result);
        console.log('[ORDER SAVED]', {
          orderId: result.lastID,
          savedStatus: initialStatus,
          tableNumber: tableNumber || null,
          service: orderService
        });
      } catch (dbError) {
        console.error("❌ Error en db.run al crear pedido:", dbError);
        console.error("❌ Stack:", dbError.stack);
        return res.status(500).json({
          error: "Error al crear el pedido en la base de datos",
          details:
            process.env.NODE_ENV === "development"
              ? dbError.message
              : undefined,
        });
      }

      const orderId = result?.lastID;

      if (!orderId) {
        console.error(
          "❌ POST /orders: No se pudo crear el pedido (lastID no existe)"
        );
        console.error("❌ Result completo:", result);
        return res
          .status(500)
          .json({ error: "Error al crear el pedido: no se obtuvo ID" });
      }

      console.log("✅ Pedido creado con ID:", orderId);

      // Crear items
      console.log("📝 Creando", items.length, "items para pedido", orderId);
      for (const item of items) {
        try {
          console.log("📝 Insertando item:", item);
          // Validar que el item tenga precio
          if (!item.price || item.price <= 0) {
            throw new Error(`Item "${item.name}" debe tener un precio válido`);
          }
          // Validar precio
          const itemPrice = item.price || 0;
          if (itemPrice <= 0) {
            throw new Error(
              `Item "${item.name}" debe tener un precio válido`
            );
          }

          // Determinar product_id e is_custom (Fase 1)
          const productId = item.product_id || item.productId || null;
          const isCustom = productId ? 0 : (item.isCustom || item.is_custom ? 1 : 0);

          await db.run(
            "INSERT INTO order_items (order_id, name, qty, price, notes, product_id, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [orderId, item.name, item.qty || 1, itemPrice, item.notes || null, productId, isCustom]
          );
          console.log("✅ Item insertado:", item.name, "precio:", item.price);
        } catch (itemError) {
          console.error("❌ Error insertando item:", itemError);
          console.error("❌ Item que falló:", item);
          console.error("❌ Stack:", itemError.stack);
          // Si falla un item, intentar eliminar el pedido creado
          try {
            await db.run("DELETE FROM orders WHERE id = ?", [orderId]);
            console.log("✅ Pedido eliminado después de error en items");
          } catch (deleteError) {
            console.error("❌ Error eliminando pedido fallido:", deleteError);
          }
          return res.status(500).json({
            error: "Error al crear items del pedido",
            details:
              process.env.NODE_ENV === "development"
                ? itemError.message
                : undefined,
          });
        }
      }

      // Obtener pedido completo
      const order = await db.get("SELECT * FROM orders WHERE id = ?", [
        orderId,
      ]);
      if (!order) {
        console.error(
          "❌ POST /orders: Pedido creado pero no se pudo recuperar"
        );
        return res
          .status(500)
          .json({ error: "Error al recuperar el pedido creado" });
      }

      const orderItems = await db.all(
        "SELECT * FROM order_items WHERE order_id = ?",
        [orderId]
      );

      // FASE 12.3: Registrar auditoría - ORDER_CREATED
      await logAudit({
        action: 'ORDER_CREATED',
        entity_type: 'order',
        entity_id: orderId,
        table_number: tableNumber,
        order_id: orderId,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Orden ${order.daily_no || order.code || orderId} creada`,
        meta: {
          status: initialStatus,
          service: orderService,
          channel: channel,
          code: code,
          daily_no: dailyNo,
          items_count: orderItems.length
        }
      });

      // Notificar a cocina vía WebSocket
      const io = req.app.get("io");
      if (io) {
        io.emit("order:new", {
          order: { ...order, items: orderItems },
        });
      }

      res.status(201).json({
        order: { ...order, items: orderItems },
      });
    } catch (error) {
      console.error("❌ Error POST /orders (catch general):", error);
      console.error("❌ Error name:", error.name);
      console.error("❌ Error message:", error.message);
      console.error("❌ Stack:", error.stack);
      console.error("❌ Request body:", JSON.stringify(req.body, null, 2));
      console.error(
        "❌ Request user:",
        req.user
          ? { id: req.user.id, name: req.user.name, role: req.user.role }
          : "NO USER"
      );

      // Devolver error más descriptivo
      const errorMessage = error.message || "Error interno del servidor";
      return res.status(500).json({
        error: "Error interno del servidor",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
        errorType: error.name,
      });
    }
  }
);

// GET /api/orders
router.get("/", requireAuth, async (req, res) => {
  try {
    const { status, tableId, mine, kitchen } = req.query;
    const db = getDb();

    let query = `
      SELECT o.*, 
             t.number as table_number,
             t.label as table_label,
             u.name as created_by_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Filtros según rol
    if (req.user.role === "MESERO") {
      query += " AND o.created_by = ?";
      params.push(req.user.id);
    }

    const { includeDisabled, includeArchived } = req.query;

    // Archivado automático: excluir órdenes archivadas de vistas activas (a menos que includeArchived=1)
    if (includeArchived !== "1" && includeArchived !== "true") {
      query += " AND o.archived_at IS NULL";
    }

    // Cocina: solo ver pedidos no cancelados
    if (kitchen === "true" || req.user.role === "COCINA") {
      query += " AND o.status != 'CANCELADO'";
    }

    // Ocultar comandas deshabilitadas para todos excepto CAJA (a menos que includeDisabled=true)
    if (!(req.user.role === "CAJA" && includeDisabled === "true")) {
      query += " AND o.disabled_at IS NULL";
    }

    if (status) {
      query += " AND o.status = ?";
      params.push(status);
    }

    if (tableId) {
      query += " AND o.table_id = ?";
      params.push(tableId);
    }

    if (mine === "true") {
      query += " AND o.created_by = ?";
      params.push(req.user.id);
    }

    query += " ORDER BY o.created_at DESC";

    const orders = await db.all(query, params);

    // Si es consulta de cocina, limitar LISTO a las 5 últimas
    let filteredOrders = orders;
    if (kitchen === "true" || req.user.role === "COCINA") {
      const listoOrders = orders.filter(o => o.status === "LISTO");
      const otherOrders = orders.filter(o => o.status !== "LISTO");
      // Tomar solo las 5 últimas órdenes LISTO
      const limitedListo = listoOrders.slice(0, 5);
      filteredOrders = [...otherOrders, ...limitedListo].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
    }

    // Obtener items para cada pedido
    const ordersWithItems = await Promise.all(
      filteredOrders.map(async (order) => {
        const items = await db.all(
          "SELECT * FROM order_items WHERE order_id = ?",
          [order.id]
        );
        return { ...order, items };
      })
    );

    res.json(ordersWithItems);
  } catch (error) {
    console.error("Error obteniendo pedidos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/orders/service/:service - Obtener órdenes por service (VENTANILLA o DOMICILIO)
router.get("/service/:service", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const service = req.params.service.toUpperCase();
    const onlyOpen = req.query.only_open === "1" || req.query.only_open === "true";

    if (!["VENTANILLA", "DOMICILIO"].includes(service)) {
      return res.status(400).json({ error: "Service debe ser VENTANILLA o DOMICILIO" });
    }

    let query = `
      SELECT o.*, u.name as created_by_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.service = ?
    `;
    
    const params = [service];

    // Si only_open=true, solo órdenes activas (items pendientes, no archivadas).
    // FASE O1: operativa = no archivado; activa = NUEVO, EN_PREP, LISTO.
    if (onlyOpen) {
      query += `
        AND o.archived_at IS NULL
        AND o.status IN ('NUEVO', 'EN_PREP', 'LISTO')
        AND o.id IN (
          SELECT DISTINCT oi.order_id
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.voided_at IS NULL
            AND oi.paid_at IS NULL
        )
      `;
    }

    query += " ORDER BY o.created_at DESC";

    const orders = await db.all(query, params);

    // Para cada orden, calcular total de items pendientes
    const ordersWithTotals = await Promise.all(
      orders.map(async (order) => {
        const items = await db.all(
          `SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL`,
          [order.id]
        );
        
        const pendingItems = items.filter(item => !item.paid_at);
        const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
        const pendingTotal = pendingItems.reduce((sum, item) => sum + item.qty * item.price, 0);
        
        return {
          ...order,
          totalItems: items.length,
          pendingItems: pendingItems.length,
          total,
          pendingTotal,
          hasPendingItems: pendingItems.length > 0
        };
      })
    );

    // Ordenar por estado (NUEVO → EN_PREP → LISTO → PAGADA → CANCELADO) y luego por fecha descendente
    const statusOrder = { 'NUEVO': 1, 'EN_PREP': 2, 'LISTO': 3, 'PAGADA': 4, 'CANCELADO': 5 };
    const sortedOrders = ordersWithTotals.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      if (statusDiff !== 0) return statusDiff;
      // Si mismo estado, ordenar por fecha descendente (más reciente primero)
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(sortedOrders);
  } catch (error) {
    console.error("Error obteniendo órdenes por service:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/orders/table/:tableId - Obtener órdenes de una mesa (con opción only_open y active)
router.get("/table/:tableId", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const tableId = parseInt(req.params.tableId);
    const onlyOpen = req.query.only_open === "1" || req.query.only_open === "true";
    const activeOnly = req.query.active === "1" || req.query.active === "true";

    // Verificar que la mesa existe
    const table = await db.get("SELECT * FROM tables WHERE id = ?", [tableId]);
    if (!table) {
      return res.status(404).json({ error: "Mesa no encontrada" });
    }

    // Si active=1, retornar solo la orden activa (última no pagada, no archivada).
    // FASE O1: activa = {NUEVO, EN_PREP, LISTO}; excluir PAGADA, CANCELADO y archivadas.
    if (activeOnly) {
      const activeOrder = await db.get(`
        SELECT o.*, u.name as created_by_name
        FROM orders o
        LEFT JOIN users u ON o.created_by = u.id
        WHERE o.table_id = ?
          AND o.paid_at IS NULL
          AND o.archived_at IS NULL
          AND o.status IN ('NUEVO', 'EN_PREP', 'LISTO')
        ORDER BY o.created_at DESC
        LIMIT 1
      `, [tableId]);

      if (!activeOrder) {
        return res.json(null);
      }

      // Calcular totales para la orden activa
      const items = await db.all(
        `SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL`,
        [activeOrder.id]
      );
      
      const pendingItems = items.filter(item => !item.paid_at);
      const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
      const pendingTotal = pendingItems.reduce((sum, item) => sum + item.qty * item.price, 0);
      
      const activeOrderWithTotals = {
        ...activeOrder,
        totalItems: items.length,
        pendingItems: pendingItems.length,
        total,
        pendingTotal,
        hasPendingItems: pendingItems.length > 0
      };

      return res.json(activeOrderWithTotals);
    }

    // Comportamiento normal: retornar todas las órdenes
    let query = `
      SELECT o.*, u.name as created_by_name
      FROM orders o
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.table_id = ?
    `;
    
    const params = [tableId];

    // Si only_open=true, solo órdenes activas (items pendientes, no archivadas).
    // FASE O1: operativa = no archivado; activa = NUEVO, EN_PREP, LISTO.
    if (onlyOpen) {
      query += `
        AND o.archived_at IS NULL
        AND o.status IN ('NUEVO', 'EN_PREP', 'LISTO')
        AND o.id IN (
          SELECT DISTINCT oi.order_id
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.voided_at IS NULL
            AND oi.paid_at IS NULL
        )
      `;
    }

    query += " ORDER BY o.created_at DESC";

    const orders = await db.all(query, params);

    // Para cada orden, calcular total de items pendientes
    const ordersWithTotals = await Promise.all(
      orders.map(async (order) => {
        const items = await db.all(
          `SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL`,
          [order.id]
        );
        
        const pendingItems = items.filter(item => !item.paid_at);
        const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
        const pendingTotal = pendingItems.reduce((sum, item) => sum + item.qty * item.price, 0);
        
        return {
          ...order,
          totalItems: items.length,
          pendingItems: pendingItems.length,
          total,
          pendingTotal,
          hasPendingItems: pendingItems.length > 0
        };
      })
    );

    // Ordenar por estado (NUEVO → EN_PREP → LISTO → PAGADA → CANCELADO) y luego por fecha descendente
    const statusOrder = { 'NUEVO': 1, 'EN_PREP': 2, 'LISTO': 3, 'PAGADA': 4, 'CANCELADO': 5 };
    const sortedOrders = ordersWithTotals.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      if (statusDiff !== 0) return statusDiff;
      // Si mismo estado, ordenar por fecha descendente (más reciente primero)
      return new Date(b.created_at) - new Date(a.created_at);
    });

    res.json(sortedOrders);
  } catch (error) {
    console.error("Error obteniendo órdenes de mesa:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/orders/ready-to-pay - Obtener órdenes LISTO no pagadas (bandeja "Listos para cobrar")
router.get("/ready-to-pay", requireAuth, async (req, res) => {
  try {
    const db = getDb();

    // Obtener órdenes LISTO no pagadas
    const orders = await db.all(`
      SELECT o.*, 
             t.number as table_number,
             t.label as table_label,
             u.name as created_by_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.status = 'LISTO'
        AND o.paid_at IS NULL
        AND o.archived_at IS NULL
        AND o.id IN (
          SELECT DISTINCT oi.order_id
          FROM order_items oi
          WHERE oi.order_id = o.id
            AND oi.voided_at IS NULL
            AND oi.paid_at IS NULL
        )
      ORDER BY o.created_at ASC
    `);

    // Para cada orden, calcular total de items pendientes
    const ordersWithTotals = await Promise.all(
      orders.map(async (order) => {
        const items = await db.all(
          `SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL`,
          [order.id]
        );
        
        const pendingItems = items.filter(item => !item.paid_at);
        const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
        const pendingTotal = pendingItems.reduce((sum, item) => sum + item.qty * item.price, 0);
        
        return {
          ...order,
          totalItems: items.length,
          pendingItems: pendingItems.length,
          total,
          pendingTotal,
          hasPendingItems: pendingItems.length > 0
        };
      })
    );

    res.json(ordersWithTotals);
  } catch (error) {
    console.error("Error obteniendo órdenes listas para cobrar:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/orders/:id - Obtener una orden con sus items
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const order = await db.get("SELECT * FROM orders WHERE id = ?", [
      req.params.id,
    ]);

    if (!order) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    // Verificar permisos: mesero solo ve sus pedidos
    if (req.user.role === "MESERO" && order.created_by !== req.user.id) {
      return res.status(403).json({ error: "Acceso denegado" });
    }

    const items = await db.all("SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL", [
      order.id,
    ]);

    res.json({ ...order, items });
  } catch (error) {
    console.error("Error obteniendo pedido:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/orders/:id/status
// Permite a COCINA y CAJA cambiar el estado de las órdenes
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("COCINA", "CAJA"),
  async (req, res) => {
    try {
      const { status } = req.body;

      if (!["NUEVO", "EN_PREP", "LISTO", "CANCELADO"].includes(status)) {
        return res.status(400).json({ error: "Estado inválido" });
      }

      const db = getDb();

      // Verificar que el pedido existe
      const order = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      if (!order) {
        return res.status(404).json({ error: "Pedido no encontrado" });
      }

      // Obtener número de mesa para auditoría
      let tableNumber = null;
      if (order.table_id) {
        const table = await db.get("SELECT number FROM tables WHERE id = ?", [order.table_id]);
        if (table) {
          tableNumber = table.number;
        }
      }

      // Bloquear cambio a EN_PREP o LISTO si la orden no tiene items pendientes
      if (status === 'EN_PREP' || status === 'LISTO') {
        const itemsCount = await db.get(
          `SELECT COUNT(*) as c 
           FROM order_items 
           WHERE order_id = ? 
             AND voided_at IS NULL 
             AND paid_at IS NULL`,
          [req.params.id]
        );
        
        if (!itemsCount || itemsCount.c === 0) {
          return res.status(400).json({ 
            error: "No se puede cambiar estado: la orden no tiene items." 
          });
        }
      }

      const oldStatus = order.status;

      // Actualizar estado (usando zona horaria America/Bogota)
      await db.run(
        "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
        [status, toBogotaSQLiteTimestamp(new Date()), req.params.id]
      );

      const updatedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      const items = await db.all(
        "SELECT * FROM order_items WHERE order_id = ?",
        [req.params.id]
      );

      // FASE 12.3: Registrar auditoría - ORDER_STATUS_CHANGED
      await logAudit({
        action: 'ORDER_STATUS_CHANGED',
        entity_type: 'order',
        entity_id: req.params.id,
        table_number: tableNumber,
        order_id: req.params.id,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Orden ${order.daily_no || order.code || req.params.id} cambió de ${oldStatus} a ${status}`,
        meta: {
          from: oldStatus,
          to: status,
          order_code: order.code,
          daily_no: order.daily_no
        }
      });

      // Notificar cambios vía WebSocket
      const io = req.app.get("io");
      if (io) {
        io.emit("order:status-changed", {
          order: { ...updatedOrder, items },
        });
      }

      res.json({ order: { ...updatedOrder, items } });
    } catch (error) {
      console.error("Error actualizando estado:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// PATCH /api/orders/:id/cancel (FASE 9.6) - Cancelar orden con motivo obligatorio
router.patch(
  "/:id/cancel",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const db = getDb();

      // Validar motivo obligatorio
      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return res.status(400).json({ 
          error: "Motivo de cancelación es obligatorio (mínimo 3 caracteres)" 
        });
      }

      // Verificar que el pedido existe
      const order = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      if (!order) {
        return res.status(404).json({ error: "Pedido no encontrado" });
      }

      // FASE 12.4: Bloquear cancelación si la orden está PAGADA
      if (order.status === 'PAGADA') {
        // Obtener número de mesa para auditoría
        let tableNumber = null;
        if (order.table_id) {
          const table = await db.get("SELECT number FROM tables WHERE id = ?", [order.table_id]);
          if (table) {
            tableNumber = table.number;
          }
        }
        
        // Registrar auditoría de bloqueo
        await logAudit({
          action: 'BLOCKED_ACTION',
          entity_type: 'order',
          entity_id: req.params.id,
          table_number: tableNumber,
          order_id: req.params.id,
          user_id: req.user.id,
          ip: req.ip || req.connection?.remoteAddress || null,
          summary: `Intento de cancelar orden bloqueado - Orden ${order.daily_no || order.code || req.params.id} en estado PAGADA`,
          meta: {
            attempted_action: 'CANCEL_ORDER',
            status: order.status,
            endpoint: 'PATCH /api/orders/:id/cancel'
          }
        });
        
        return res.status(409).json({ 
          error: "No se puede cancelar una orden que ya está PAGADA",
          status: order.status
        });
      }
      
      // Validar que solo se puede cancelar si status IN ('NUEVO','EN_PREP','LISTO')
      if (!['NUEVO', 'EN_PREP', 'LISTO'].includes(order.status)) {
        return res.status(400).json({ 
          error: `No se puede cancelar una orden con estado ${order.status}` 
        });
      }

      // Verificar si las columnas existen (compatibilidad)
      const ordersInfo = await db.all("PRAGMA table_info(orders)");
      const hasCanceledAt = ordersInfo.some((col) => col.name === "canceled_at");
      const hasCanceledBy = ordersInfo.some((col) => col.name === "canceled_by");
      const hasCancelReason = ordersInfo.some((col) => col.name === "cancel_reason");

      const timestamp = toBogotaSQLiteTimestamp(new Date());

      // Actualizar orden: status = CANCELADO, metadata de cancelación y archivado automático
      if (hasCanceledAt && hasCanceledBy && hasCancelReason) {
        await db.run(
          `UPDATE orders 
           SET status = 'CANCELADO', 
               canceled_at = ?,
               canceled_by = ?,
               cancel_reason = ?,
               archived_at = ?,
               updated_at = ? 
           WHERE id = ?`,
          [timestamp, req.user.id, reason.trim(), timestamp, timestamp, req.params.id]
        );
      } else {
        // Fallback: cambiar status y archivar si las columnas no existen
        await db.run(
          "UPDATE orders SET status = 'CANCELADO', archived_at = ?, updated_at = ? WHERE id = ?",
          [timestamp, timestamp, req.params.id]
        );
      }

      const updatedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      const items = await db.all(
        "SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL",
        [req.params.id]
      );

      // Notificar cambios vía WebSocket
      const io = req.app.get("io");
      if (io) {
        io.emit("order:status-changed", {
          order: { ...updatedOrder, items },
        });
        io.emit("order:canceled", {
          orderId: updatedOrder.id,
          tableId: updatedOrder.table_id,
        });
      }

      res.json({ ok: true, order: { ...updatedOrder, items } });
    } catch (error) {
      console.error("Error cancelando orden:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// PATCH /api/orders/:id/disable (solo CAJA) - deshabilitar comanda (ocultar)
router.patch(
  "/:id/disable",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const { reason } = req.body;
      const db = getDb();

      const order = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      if (!order)
        return res.status(404).json({ error: "Pedido no encontrado" });

      if (order.disabled_at) {
        return res
          .status(400)
          .json({ error: "La comanda ya está deshabilitada" });
      }

      await db.run(
        "UPDATE orders SET disabled_at = ?, disabled_reason = ?, disabled_by = ?, updated_at = ? WHERE id = ?",
        [toBogotaSQLiteTimestamp(new Date()), reason || null, req.user.id, toBogotaSQLiteTimestamp(new Date()), req.params.id]
      );

      const updated = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);

      const io = req.app.get("io");
      if (io) {
        io.emit("order:disabled", {
          orderId: updated.id,
          tableId: updated.table_id,
        });
        io.emit("table:updated", { tableId: updated.table_id });
      }

      return res.json({ order: updated });
    } catch (error) {
      console.error("❌ Error deshabilitando comanda:", error);
      return res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// PATCH /api/orders/:id/enable (solo CAJA) - rehabilitar comanda
router.patch(
  "/:id/enable",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();

      const order = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      if (!order)
        return res.status(404).json({ error: "Pedido no encontrado" });

      if (!order.disabled_at) {
        return res
          .status(400)
          .json({ error: "La comanda no está deshabilitada" });
      }

      await db.run(
        "UPDATE orders SET disabled_at = NULL, disabled_reason = NULL, disabled_by = NULL, updated_at = ? WHERE id = ?",
        [toBogotaSQLiteTimestamp(new Date()), req.params.id]
      );

      const updated = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);

      const io = req.app.get("io");
      if (io) {
        io.emit("order:enabled", {
          orderId: updated.id,
          tableId: updated.table_id,
        });
        io.emit("table:updated", { tableId: updated.table_id });
      }

      return res.json({ order: updated });
    } catch (error) {
      console.error("❌ Error habilitando comanda:", error);
      return res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// PATCH /api/orders/:id/archive (COCINA y CAJA) - archivar manualmente (oculta en cocina/listas)
router.patch("/:id/archive", requireAuth, requireRole("COCINA", "CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const order = await db.get("SELECT * FROM orders WHERE id = ?", [req.params.id]);
    if (!order) return res.status(404).json({ error: "Pedido no encontrado" });

    if (order.archived_at) {
      return res.status(400).json({ error: "El pedido ya está archivado" });
    }

    await db.run("UPDATE orders SET archived_at = ?, updated_at = ? WHERE id = ?", [
      toBogotaSQLiteTimestamp(new Date()),
      toBogotaSQLiteTimestamp(new Date()),
      req.params.id,
    ]);

    const updated = await db.get("SELECT * FROM orders WHERE id = ?", [req.params.id]);

    const io = req.app.get("io");
    if (io) {
      io.emit("order:archived", { orderId: updated.id, tableId: updated.table_id });
      io.emit("table:updated", { tableId: updated.table_id });
      io.emit("order:status-changed");
    }

    return res.json({ order: updated });
  } catch (error) {
    console.error("❌ Error archivando pedido:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/orders/archive-day - Archivar todas las órdenes LISTO del día (COCINA y CAJA)
router.post("/archive-day", requireAuth, requireRole("COCINA", "CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const businessDay = formatYyyyMmDdLocal();
    
    // Archivar todas las órdenes LISTO del día que no estén ya archivadas
    const timestamp = toBogotaSQLiteTimestamp(new Date());
    const result = await db.run(
      `UPDATE orders 
       SET archived_at = ?, updated_at = ? 
       WHERE status = 'LISTO' 
       AND archived_at IS NULL 
       AND business_day = ?`,
      [timestamp, timestamp, businessDay]
    );

    const io = req.app.get("io");
    if (io) {
      io.emit("order:status-changed");
    }

    return res.json({ 
      message: "Órdenes del día archivadas",
      affected: result.changes || 0
    });
  } catch (error) {
    console.error("❌ Error archivando órdenes del día:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/orders/:id/cancel
// NOTA: En la nueva versión, solo CAJA puede cancelar
router.patch(
  "/:id/cancel",
  requireAuth,
  requireRole("CAJA"),
  async (req, res) => {
    try {
      const db = getDb();

      const order = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);
      if (!order) {
        return res.status(404).json({ error: "Pedido no encontrado" });
      }

      // Solo el mesero que creó el pedido puede cancelarlo
      if (order.created_by !== req.user.id) {
        return res
          .status(403)
          .json({ error: "Solo puedes cancelar tus propios pedidos" });
      }

      // No se puede cancelar si ya está pagado
      if (order.paid_at) {
        return res
          .status(400)
          .json({ error: "No se puede cancelar un pedido pagado" });
      }

      await db.run(
        'UPDATE orders SET status = "CANCELADO", updated_at = ? WHERE id = ?',
        [toBogotaSQLiteTimestamp(new Date()), req.params.id]
      );

      const updatedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [
        req.params.id,
      ]);

      // Notificar cancelación
      const io = req.app.get("io");
      if (io) {
        io.emit("order:cancelled", {
          order: updatedOrder,
        });
      }

      res.json({ order: updatedOrder });
    } catch (error) {
      console.error("Error cancelando pedido:", error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
);

// POST /api/orders/:id/items - Agregar items a una orden existente
// Permite a CAJA agregar items a una orden que está en NUEVO o EN_PREP
router.post("/:id/items", requireAuth, requireRole("CAJA", "MESERO"), async (req, res) => {
  try {
    const db = getDb();
    const orderId = parseInt(req.params.id);
    const { items } = req.body;

    // Verificar que la orden existe
    const order = await db.get("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // FASE 12.4: Bloquear si la orden está en estado bloqueado
    if (["LISTO", "PAGADA", "CANCELADO"].includes(order.status)) {
      // Registrar auditoría de bloqueo
      await logAudit({
        action: 'BLOCKED_ACTION',
        entity_type: 'order',
        entity_id: orderId,
        table_number: order.table_id ? (await db.get("SELECT number FROM tables WHERE id = ?", [order.table_id]))?.number : null,
        order_id: orderId,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Intento de agregar items bloqueado - Orden ${order.daily_no || order.code || orderId} en estado ${order.status}`,
        meta: {
          attempted_action: 'ADD_ITEMS',
          status: order.status,
          endpoint: 'POST /api/orders/:id/items'
        }
      });
      
      return res.status(409).json({ 
        error: "Orden bloqueada. No se puede modificar en estado LISTO/PAGADA/CANCELADO",
        status: order.status
      });
    }
    
    // Solo permitir agregar items a órdenes que estén en NUEVO o EN_PREP
    if (!["NUEVO", "EN_PREP"].includes(order.status)) {
      return res.status(400).json({ 
        error: `No se pueden agregar items a una orden con estado ${order.status}. Solo se permite para órdenes NUEVO o EN_PREP.` 
      });
    }

    // Verificar que se enviaron items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Debe incluir al menos un item" });
    }

    // Validar y agregar items
    const addedItems = [];
    for (const item of items) {
      if (!item.name || !item.name.trim()) {
        return res.status(400).json({ error: "Todos los items deben tener un nombre" });
      }
      
      if (!item.price || item.price <= 0) {
        return res.status(400).json({ error: `El item "${item.name}" debe tener un precio válido` });
      }

      const productId = item.product_id || item.productId || null;
      const isCustom = productId ? 0 : (item.isCustom || item.is_custom ? 1 : 0);
      const qty = item.qty || 1;
      const price = parseFloat(item.price);

      const result = await db.run(
        "INSERT INTO order_items (order_id, name, qty, price, notes, product_id, is_custom) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [orderId, item.name.trim(), qty, price, item.notes || null, productId, isCustom]
      );

      const newItem = await db.get("SELECT * FROM order_items WHERE id = ?", [result.lastID]);
      addedItems.push(newItem);
    }

    // Obtener orden completa actualizada
    const updatedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [orderId]);
    const allItems = await db.all("SELECT * FROM order_items WHERE order_id = ? AND voided_at IS NULL", [orderId]);

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("order:updated", {
        order: { ...updatedOrder, items: allItems },
      });
      io.emit("table:updated", { tableId: order.table_id });
    }

    res.json({ 
      order: { ...updatedOrder, items: allItems },
      addedItems 
    });
  } catch (error) {
    console.error("Error agregando items a orden:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /api/orders/items/:id - Eliminar item de orden
router.delete("/items/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const itemId = parseInt(req.params.id);

    // Verificar que el item existe
    const item = await db.get(`
      SELECT oi.*, o.status as order_status, o.id as order_id
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.id = ?
    `, [itemId]);
    
    if (!item) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    // FASE 12.4: Bloquear si la orden está en estado bloqueado
    if (["LISTO", "PAGADA", "CANCELADO"].includes(item.order_status)) {
      // Registrar auditoría de bloqueo
      await logAudit({
        action: 'BLOCKED_ACTION',
        entity_type: 'order_item',
        entity_id: itemId,
        table_number: item.order_id ? (await db.get("SELECT t.number FROM tables t JOIN orders o ON o.table_id = t.id WHERE o.id = ?", [item.order_id]))?.number : null,
        order_id: item.order_id,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Intento de eliminar item bloqueado - Orden ${item.order_id} en estado ${item.order_status}`,
        meta: {
          attempted_action: 'DELETE_ITEM',
          status: item.order_status,
          endpoint: 'DELETE /api/orders/items/:id'
        }
      });
      
      return res.status(409).json({ 
        error: "Orden bloqueada. No se puede modificar en estado LISTO/PAGADA/CANCELADO",
        status: item.order_status
      });
    }
    
    // Solo permitir eliminar items de órdenes en NUEVO o EN_PREP
    if (!["NUEVO", "EN_PREP"].includes(item.order_status)) {
      return res.status(400).json({ 
        error: `No se pueden eliminar items de una orden con estado ${item.order_status}. Solo se permite para órdenes NUEVO o EN_PREP.` 
      });
    }

    // Verificar que el item no esté pagado
    if (item.paid_at) {
      return res.status(400).json({ error: "No se puede eliminar un item ya pagado" });
    }

    // Verificar que el item no esté anulado
    if (item.voided_at) {
      return res.status(400).json({ error: "El item ya está anulado" });
    }

    // Anular el item (soft delete)
    await db.run(
      "UPDATE order_items SET voided_at = ? WHERE id = ?",
      [toBogotaSQLiteTimestamp(new Date()), itemId]
    );

    const updatedItem = await db.get("SELECT * FROM order_items WHERE id = ?", [itemId]);
    const updatedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [item.order_id]);

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("item:deleted", {
        itemId,
        orderId: item.order_id,
      });
      io.emit("table:updated", { tableId: updatedOrder.table_id });
    }

    res.json({ item: updatedItem });
  } catch (error) {
    console.error("Error eliminando item:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PATCH /api/orders/items/:id - Editar item de orden (solo CAJA)
// Permite editar nombre, precio, cantidad y notas de un item
router.patch("/items/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { name, price, qty, notes } = req.body;
    const db = getDb();
    const itemId = parseInt(req.params.id);

    // Verificar que el item existe y obtener estado de la orden
    const item = await db.get(`
      SELECT oi.*, o.status as order_status
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.id = ?
    `, [itemId]);
    
    if (!item) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    // FASE 12.4: Bloquear si la orden está en estado bloqueado
    if (["LISTO", "PAGADA", "CANCELADO"].includes(item.order_status)) {
      // Registrar auditoría de bloqueo
      await logAudit({
        action: 'BLOCKED_ACTION',
        entity_type: 'order_item',
        entity_id: itemId,
        table_number: item.order_id ? (await db.get("SELECT t.number FROM tables t JOIN orders o ON o.table_id = t.id WHERE o.id = ?", [item.order_id]))?.number : null,
        order_id: item.order_id,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Intento de editar item bloqueado - Orden ${item.order_id} en estado ${item.order_status}`,
        meta: {
          attempted_action: 'EDIT_ITEM',
          status: item.order_status,
          endpoint: 'PATCH /api/orders/items/:id'
        }
      });
      
      return res.status(409).json({ 
        error: "Orden bloqueada. No se puede modificar en estado LISTO/PAGADA/CANCELADO",
        status: item.order_status
      });
    }
    
    // Solo permitir editar items de órdenes en NUEVO o EN_PREP
    if (!["NUEVO", "EN_PREP"].includes(item.order_status)) {
      return res.status(400).json({ 
        error: `No se pueden editar items de una orden con estado ${item.order_status}. Solo se permite para órdenes NUEVO o EN_PREP.` 
      });
    }

    // Verificar que el item no esté pagado (solo permitir editar items no pagados)
    if (item.paid_at) {
      return res.status(400).json({ error: "No se puede editar un item ya pagado" });
    }

    // Verificar que el item no esté anulado
    if (item.voided_at) {
      return res.status(400).json({ error: "No se puede editar un item anulado" });
    }

    // Validaciones
    if (name && !name.trim()) {
      return res.status(400).json({ error: "El nombre no puede estar vacío" });
    }

    if (price !== undefined && (price <= 0 || isNaN(price))) {
      return res.status(400).json({ error: "El precio debe ser un número mayor a 0" });
    }

    if (qty !== undefined && (qty <= 0 || isNaN(qty) || !Number.isInteger(parseFloat(qty)))) {
      return res.status(400).json({ error: "La cantidad debe ser un entero mayor a 0" });
    }

    // Construir query de actualización dinámica
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (price !== undefined) {
      updates.push("price = ?");
      params.push(parseFloat(price));
    }

    if (qty !== undefined) {
      updates.push("qty = ?");
      params.push(parseInt(qty));
    }

    if (notes !== undefined) {
      updates.push("notes = ?");
      params.push(notes || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No se proporcionaron campos para actualizar" });
    }

    params.push(itemId);

    await db.run(
      `UPDATE order_items SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    const updatedItem = await db.get("SELECT * FROM order_items WHERE id = ?", [itemId]);

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("item:updated", {
        itemId,
        orderId: item.order_id,
      });
      io.emit("table:updated", { tableId: null });
    }

    res.json({ item: updatedItem });
  } catch (error) {
    console.error("Error editando item:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /api/orders/:id (solo CAJA) - borrar pedido (hard delete)
// Regla: solo si NO está pagado y NO tiene pagos asociados.
router.delete("/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const orderId = parseInt(req.params.id);

    const order = await db.get("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) return res.status(404).json({ error: "Pedido no encontrado" });

    if (order.paid_at) {
      return res
        .status(400)
        .json({ error: "No se puede borrar un pedido pagado" });
    }

    const paymentsCount = await db.get(
      "SELECT COUNT(*) as count FROM payments WHERE order_id = ?",
      [orderId]
    );
    if ((paymentsCount?.count || 0) > 0) {
      return res
        .status(400)
        .json({ error: "No se puede borrar un pedido con pagos registrados" });
    }

    await db.run("DELETE FROM order_items WHERE order_id = ?", [orderId]);
    await db.run("DELETE FROM orders WHERE id = ?", [orderId]);

    const io = req.app.get("io");
    if (io) {
      io.emit("order:deleted", { orderId, tableId: order.table_id });
      io.emit("table:updated", { tableId: order.table_id });
    }

    return res.json({ message: "Pedido borrado" });
  } catch (error) {
    console.error("❌ Error borrando pedido:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/orders/:id/receipt-data (FASE 12.1: Datos para reimpresión de recibo)
router.get("/:id/receipt-data", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({ error: "ID de orden inválido" });
    }

    // Obtener orden con información de mesa
    const order = await db.get(
      `SELECT o.*, t.number as table_number, t.label as table_label
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // Obtener items de la orden (solo los que fueron pagados, no anulados)
    const items = await db.all(
      `SELECT 
        oi.id,
        oi.name,
        oi.qty,
        oi.price,
        oi.notes,
        oi.is_custom,
        oi.paid_at,
        oi.voided_at
       FROM order_items oi
       WHERE oi.order_id = ? AND oi.voided_at IS NULL
       ORDER BY oi.id`,
      [orderId]
    );

    // Obtener pagos de la orden
    const payments = await db.all(
      `SELECT 
        p.id,
        p.method,
        p.amount,
        p.created_at,
        p.created_by
       FROM payments p
       WHERE p.order_id = ?
       ORDER BY p.created_at`,
      [orderId]
    );

    // Calcular total de items pagados
    const totalPaid = items
      .filter(item => item.paid_at)
      .reduce((sum, item) => sum + (item.qty * item.price), 0);

    res.json({
      order: {
        id: order.id,
        code: order.code,
        daily_no: order.daily_no,
        table_id: order.table_id,
        table_number: order.table_number,
        table_label: order.table_label || (order.table_number === 9 ? 'VENTANILLA' : order.table_number === 10 ? 'DOMICILIOS' : `Mesa ${order.table_number}`),
        created_at: order.created_at,
        status: order.status
      },
      items: items.filter(item => item.paid_at), // Solo items pagados
      payments,
      total: totalPaid
    });
  } catch (error) {
    console.error("Error obteniendo datos de recibo:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/orders/items/:id/void (FASE 12.6: Anular item con motivo obligatorio)
router.post("/items/:id/void", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { reason } = req.body;
    const itemId = parseInt(req.params.id);
    const db = getDb();

    // Validar motivo obligatorio
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ 
        error: "Motivo de anulación es obligatorio (mínimo 5 caracteres)" 
      });
    }

    // Verificar que el item existe y obtener información de la orden
    const item = await db.get(`
      SELECT oi.*, o.id as order_id, o.status as order_status, o.table_id, t.number as table_number
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE oi.id = ?
    `, [itemId]);

    if (!item) {
      return res.status(404).json({ error: "Item no encontrado" });
    }

    // Validar que el item no esté pagado
    if (item.paid_at) {
      return res.status(409).json({ 
        error: "No se puede anular un item ya pagado" 
      });
    }

    // Validar que el item no esté ya anulado
    if (item.voided_at) {
      return res.status(409).json({ 
        error: "El item ya está anulado" 
      });
    }

    const timestamp = toBogotaSQLiteTimestamp(new Date());

    // Anular el item
    await db.run(
      "UPDATE order_items SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?",
      [timestamp, req.user.id, reason.trim(), itemId]
    );

    // Obtener nombre del usuario para la respuesta
    const userInfo = await db.get("SELECT name FROM users WHERE id = ?", [req.user.id]);

    // FASE 12.6: Registrar auditoría - ITEM_VOIDED
    await logAudit({
      action: 'ITEM_VOIDED',
      entity_type: 'order_item',
      entity_id: itemId,
      table_number: item.table_number,
      order_id: item.order_id,
      user_id: req.user.id,
      ip: req.ip || req.connection?.remoteAddress || null,
      summary: `Item anulado: ${item.name} - Orden ${item.order_id}`,
      meta: {
        item_id: itemId,
        order_id: item.order_id,
        table_number: item.table_number,
        name: item.name,
        qty: item.qty,
        price: item.price,
        reason: reason.trim()
      }
    });

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("order:updated", {
        orderId: item.order_id
      });
      io.emit("table:updated", { tableId: item.table_id });
    }

    res.json({
      ok: true,
      itemId,
      orderId: item.order_id,
      voided_at: timestamp,
      voided_by: req.user.id,
      voided_by_name: userInfo?.name || null
    });
  } catch (error) {
    console.error("Error anulando item:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/orders/:id/cancel (FASE 12.6: Cancelar orden completa con motivo obligatorio)
router.post("/:id/cancel", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { reason } = req.body;
    const orderId = parseInt(req.params.id);
    const db = getDb();

    // Validar motivo obligatorio
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ 
        error: "Motivo de cancelación es obligatorio (mínimo 5 caracteres)" 
      });
    }

    // Verificar que la orden existe
    const order = await db.get(`
      SELECT o.*, t.number as table_number
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.id = ?
    `, [orderId]);

    if (!order) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    // Validar que la orden no esté PAGADA
    if (order.status === 'PAGADA') {
      return res.status(409).json({ 
        error: "No se puede cancelar una orden que ya está PAGADA" 
      });
    }

    // Validar que no tenga pagos activos
    const paymentsCount = await db.get(
      `SELECT COUNT(*) as c FROM payments WHERE order_id = ? AND voided_at IS NULL`,
      [orderId]
    );

    if (paymentsCount && paymentsCount.c > 0) {
      return res.status(409).json({ 
        error: "Hay pagos registrados. Anule los pagos primero." 
      });
    }

    const timestamp = toBogotaSQLiteTimestamp(new Date());

    // Cancelar la orden y archivar automáticamente
    await db.run(
      `UPDATE orders 
       SET status = 'CANCELADO', 
           cancelled_at = ?, 
           cancelled_by = ?, 
           cancel_reason = ?,
           archived_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [timestamp, req.user.id, reason.trim(), timestamp, timestamp, orderId]
    );

    // Anular items no pagados y no anulados
    const voidReason = `Cancelación de orden: ${reason.trim()}`;
    
    // Obtener items que se van a anular antes de actualizarlos
    const itemsToVoid = await db.all(
      `SELECT * FROM order_items 
       WHERE order_id = ? AND paid_at IS NULL AND voided_at IS NULL`,
      [orderId]
    );
    
    // Anular los items
    await db.run(
      `UPDATE order_items 
       SET voided_at = ?, voided_by = ?, void_reason = ?
       WHERE order_id = ? AND paid_at IS NULL AND voided_at IS NULL`,
      [timestamp, req.user.id, voidReason, orderId]
    );

    const itemsVoidedCount = itemsToVoid.length;

    // Obtener nombre del usuario para la respuesta
    const userInfo = await db.get("SELECT name FROM users WHERE id = ?", [req.user.id]);

    // FASE 12.6: Registrar auditoría - ORDER_CANCELLED
    await logAudit({
      action: 'ORDER_CANCELLED',
      entity_type: 'order',
      entity_id: orderId,
      table_number: order.table_number,
      order_id: orderId,
      user_id: req.user.id,
      ip: req.ip || req.connection?.remoteAddress || null,
      summary: `Orden cancelada: ${order.daily_no || order.code || orderId}`,
      meta: {
        order_id: orderId,
        from_status: order.status,
        reason: reason.trim(),
        table_number: order.table_number,
        items_voided_count: itemsVoidedCount
      }
    });

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("order:status-changed", {
        orderId: orderId
      });
      io.emit("order:archived", {
        orderId: orderId
      });
      io.emit("table:updated", { tableId: order.table_id });
    }

    res.json({
      ok: true,
      orderId,
      status: 'CANCELADO',
      cancelled_at: timestamp,
      cancelled_by: req.user.id,
      cancelled_by_name: userInfo?.name || null,
      items_voided: itemsVoidedCount,
      items_voided_list: itemsToVoid.map(item => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        price: item.price
      }))
    });
  } catch (error) {
    console.error("Error cancelando orden:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
