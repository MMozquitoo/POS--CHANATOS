import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getBogotaDateString, toBogotaSQLiteTimestamp } from "../utils/timezone.js";
import { deductInventoryFromOrderItems, restoreInventoryFromOrderItems } from "./inventoryMovements.js";
import { logAudit } from "../utils/audit.js";

const router = express.Router();

// POST /api/payments/items (pago parcial por items)
// Permite pagar por mesa (tableId) o por pedido (orderId) para casos ventanilla/domicilio.
// PASO 16.2.1: Instrumentación + validación robusta + normalización
router.post("/items", requireAuth, requireRole("CAJA"), async (req, res) => {
  const db = getDb();
  let transactionStarted = false;
  const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();

  // PASO 16.2.1: Logging mínimo al inicio (sin spammear)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${timestamp}] POST /api/payments/items`, {
      userId: req.user?.id,
      bodyKeys: Object.keys(req.body || {}),
      hasItemIds: !!req.body?.itemIds
    });
  }

  try {
    // PASO 16.2.1: Validar que req.body sea objeto
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: 'req.body debe ser un objeto',
        errorId,
        receivedType: Array.isArray(req.body) ? 'array' : typeof req.body
      });
    }

    // PASO 16.2.1: Normalización de campos (compatibilidad)
    const body = req.body;
    const orderId = body.orderId ?? body.order_id ?? null;
    const tableId = body.tableId ?? body.table_id ?? null;
    const itemIds = body.itemIds ?? body.items ?? body.paidItems ?? body.order_items ?? null;
    const method = body.method ?? body.payment_method ?? body.paymentMethod ?? null;
    const amount = body.amount ?? body.total ?? body.totalAmount ?? null;

    // PASO 16.2.1: Validación robusta con mensajes claros
    const validationErrors = [];

    // Validar itemIds
    if (!itemIds) {
      validationErrors.push('Falta itemIds (o items/paidItems/order_items)');
    } else if (!Array.isArray(itemIds)) {
      validationErrors.push('itemIds debe ser un array');
    } else if (itemIds.length === 0) {
      validationErrors.push('itemIds debe tener al menos un elemento');
    } else {
      // Validar que cada item tenga id
      const invalidItems = itemIds.filter(item => {
        if (typeof item === 'number') return false; // itemIds puede ser array de números
        if (typeof item === 'object') {
          const itemId = item.id ?? item.order_item_id ?? item.itemId ?? item.item_id;
          return !itemId;
        }
        return true;
      });
      if (invalidItems.length > 0) {
        validationErrors.push(`Algunos items no tienen id válido: ${invalidItems.length}`);
      }
    }

    // Validar method
    if (!method) {
      validationErrors.push('Falta method (o payment_method/paymentMethod)');
    } else if (!["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(method)) {
      validationErrors.push(`method inválido: ${method}. Debe ser EFECTIVO, TARJETA o TRANSFERENCIA`);
    }

    // Validar tableId u orderId
    if (!tableId && !orderId) {
      validationErrors.push('Se requiere tableId (o table_id) u orderId (o order_id)');
    }

    // Validar amount si viene (debe ser number >= 0)
    if (amount !== null && amount !== undefined) {
      const amountNum = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
      if (isNaN(amountNum) || amountNum < 0) {
        validationErrors.push(`amount inválido: ${amount}. Debe ser un número >= 0`);
      }
    }

    // Si hay errores de validación, retornar 400
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: validationErrors.join('; '),
        errorId,
        receivedKeys: Object.keys(body)
      });
    }

    // Normalizar valores numéricos
    const tableIdNum = tableId ? parseInt(tableId) : null;
    const orderIdNum = orderId ? parseInt(orderId) : null;

    if (tableId && (isNaN(tableIdNum) || tableIdNum <= 0)) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: `tableId inválido: ${tableId}. Debe ser un número > 0`,
        errorId
      });
    }

    if (orderId && (isNaN(orderIdNum) || orderIdNum <= 0)) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: `orderId inválido: ${orderId}. Debe ser un número > 0`,
        errorId
      });
    }

    // Normalizar itemIds: si viene como array de objetos, extraer los ids
    let normalizedItemIds;
    if (Array.isArray(itemIds)) {
      if (itemIds.length > 0 && typeof itemIds[0] === 'object') {
        normalizedItemIds = itemIds.map(item => item.id ?? item.order_item_id ?? item.itemId ?? item.item_id).filter(Boolean);
      } else {
        normalizedItemIds = itemIds.filter(id => id != null);
      }
    } else {
      normalizedItemIds = [];
    }

    if (normalizedItemIds.length === 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: 'No se pudieron extraer itemIds válidos del payload',
        errorId,
        receivedItemIds: itemIds
      });
    }

    // amount puede venir pero NO se usa para calcular (solo para logs)
    const amountReceived = amount !== undefined ? (typeof amount === 'string' ? parseFloat(amount) : Number(amount)) : null;

    // Verificar que existe sesión de caja abierta ANTES de cualquier operación
    const cashSession = await db.get(
      "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1"
    );
    if (!cashSession || !cashSession.id) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: 'No hay caja abierta. Debe abrir caja antes de cobrar.',
        errorId
      });
    }
    const cashSessionId = cashSession.id;

    // 2) IN clause seguro con placeholders dinámicos (usar normalizedItemIds)
    const placeholders = normalizedItemIds.map(() => '?').join(',');
    const whereScope = orderIdNum ? "o.id = ?" : "o.table_id = ?";
    const scopeValue = orderIdNum || tableIdNum;

    // 3) Recalcular total desde DB (fuente de verdad)
    const itemsQuery = `
      SELECT oi.id, oi.qty, oi.price, oi.paid_at, oi.voided_at, oi.order_id, o.table_id, o.status as order_status
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id IN (${placeholders})
        AND ${whereScope}
        AND (oi.paid_at IS NULL)
        AND (oi.voided_at IS NULL)
    `;

    const items = await db.all(itemsQuery, [...normalizedItemIds, scopeValue]);

    // PASO 16.2.2-B: Guarda defensiva - Si SELECT devuelve 0 rows
    if (!items || items.length === 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: `No se encontraron items válidos. Verifica que los itemIds existan, pertenezcan a la orden/mesa indicada y no estén ya pagados/anulados.`,
        errorId,
        requestedItemIds: normalizedItemIds,
        tableId: tableIdNum,
        orderId: orderIdNum
      });
    }

    // Si el resultado trae menos filas que normalizedItemIds -> algunos items no son válidos
    if (items.length !== normalizedItemIds.length) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: `Algunos items no son válidos o ya están pagados/anulados. Esperados: ${normalizedItemIds.length}, encontrados: ${items.length}`,
        errorId,
        requestedItemIds: normalizedItemIds,
        foundItemIds: items.map(it => it.id)
      });
    }

    // PASO 16.2.2-B: Validar que todos los items tengan campos requeridos
    const invalidItems = items.filter(it => !it.id || !it.order_id || it.qty == null || it.price == null);
    if (invalidItems.length > 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: `Algunos items tienen datos incompletos (falta id, order_id, qty o price)`,
        errorId,
        invalidItemIds: invalidItems.map(it => it.id)
      });
    }

    // FASE 12.4: Validar que todas las órdenes estén en estado LISTO
    const orderStatuses = [...new Set(items.map(it => it.order_status).filter(Boolean))];
    if (orderStatuses.length === 0) {
      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: 'No se pudo determinar el estado de las órdenes asociadas a los items',
        errorId
      });
    }

    for (const status of orderStatuses) {
      if (status !== 'LISTO') {
        // Obtener información de la orden para auditoría
        const firstOrderId = items.find(it => it.order_status === status)?.order_id;
        if (firstOrderId) {
          try {
            const orderInfo = await db.get(
              "SELECT o.*, t.number as table_number FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?",
              [firstOrderId]
            );
            
            // Registrar auditoría de bloqueo (solo si orderInfo existe)
            if (orderInfo) {
              await logAudit({
                action: 'BLOCKED_ACTION',
                entity_type: 'payment',
                entity_id: null,
                table_number: orderInfo.table_number || null,
                order_id: firstOrderId,
                user_id: req.user.id,
                ip: req.ip || req.connection?.remoteAddress || null,
                summary: `Intento de cobro bloqueado - Orden ${orderInfo.daily_no || orderInfo.code || firstOrderId} en estado ${status}`,
                meta: {
                  attempted_action: 'PAY_ORDER',
                  status: status,
                  endpoint: 'POST /api/payments/items'
                }
              });
            }
          } catch (auditError) {
            // No bloquear por error de auditoría
            console.error(`[${timestamp}] Error en auditoría de bloqueo:`, auditError);
          }
        }
        
        return res.status(409).json({
          error: "Solo se puede cobrar cuando la orden está LISTO",
          status: status,
          errorId
        });
      }
    }

    // FASE F8: una orden con descuento se cobra completa (el descuento es sobre
    // el total; repartirlo item por item generaría descuadres)
    const affectedOrderIdsSet = [...new Set(items.map(it => it.order_id))];
    for (const oid of affectedOrderIdsSet) {
      const orderDiscount = await db.get(
        "SELECT discount_amount FROM orders WHERE id = ?",
        [oid]
      );
      if ((orderDiscount?.discount_amount || 0) > 0) {
        return res.status(409).json({
          error: "Esta orden tiene descuento aplicado: cóbrala completa o con pago dividido (no por items).",
          errorId
        });
      }
    }

    // Calcular totalDb = SUM(qty*price) desde DB
    const totalDb = items.reduce((sum, it) => {
      const qty = it.qty || 0;
      const price = it.price || 0;
      return sum + (qty * price);
    }, 0);

    // Validar que totalDb > 0
    if (totalDb <= 0) {
      return res.status(400).json({ error: "Total inválido. Revisa precios o items." });
    }

    // 4) Transacción atómica
    await db.run("BEGIN IMMEDIATE");
    transactionStarted = true;

    const timestamp = toBogotaSQLiteTimestamp(new Date());
    const paidItemIds = [];
    const archivedOrderIds = [];

    // PASO 16.2.2-B: Marcar items como pagados con validación
    for (const it of items) {
      if (!it.id) {
        throw new Error(`Item sin id válido: ${JSON.stringify(it)}`);
      }
      const updateResult = await db.run("UPDATE order_items SET paid_at = ? WHERE id = ?", [timestamp, it.id]);
      if (!updateResult || updateResult.changes === 0) {
        throw new Error(`No se pudo actualizar item ${it.id}. Puede que no exista o ya esté pagado.`);
      }
      paidItemIds.push(it.id);
    }

    // Insertar payments por orden afectada
    const affectedOrderIds = [...new Set(items.map((it) => it.order_id))];
    const createdPayments = [];
    let firstPaymentOfRequest = true; // FASE F10: la propina va en el primer pago

    for (const oid of affectedOrderIds) {
      // PASO 16.2.2-B: Validar que orderId existe antes de insertar payment
      if (!oid || isNaN(oid)) {
        throw new Error(`Order ID inválido: ${oid}`);
      }

      const orderItems = items.filter((it) => it.order_id === oid);
      if (orderItems.length === 0) {
        throw new Error(`No hay items asociados a la orden ${oid}`);
      }

      const orderAmount = orderItems.reduce((sum, it) => {
        const qty = it.qty || 0;
        const price = it.price || 0;
        return sum + (qty * price);
      }, 0);

      if (orderAmount <= 0) {
        throw new Error(`Monto inválido para orden ${oid}: ${orderAmount}`);
      }

      // PASO 16.2.2-B: Validar que la orden existe antes de insertar payment
      const orderInfo = await db.get(
        "SELECT o.*, t.number as table_number FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?",
        [oid]
      );

      if (!orderInfo) {
        throw new Error(`La orden ${oid} no existe en la base de datos`);
      }

      const paymentTimestamp = toBogotaSQLiteTimestamp(new Date());
      if (process.env.NODE_ENV === 'development') {
        console.log(`💰 Creando pago: order_id=${oid}, method=${method}, amount=${orderAmount}, cash_session_id=${cashSessionId}, timestamp=${paymentTimestamp}`);
      }
      
      // PASO 16.2.2-B: Validar que req.user.id existe
      if (!req.user || !req.user.id) {
        throw new Error('Usuario no autenticado o sin id');
      }

      // FASE F10: propina opcional (una sola vez, en el primer pago del cobro)
      const itemsTip = firstPaymentOfRequest ? Math.max(0, Number(req.body.tipAmount) || 0) : 0;
      firstPaymentOfRequest = false;

      const paymentResult = await db.run(
        "INSERT INTO payments (order_id, method, amount, created_by, created_at, cash_session_id, tip_amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [oid, method, orderAmount, req.user.id, paymentTimestamp, cashSessionId, itemsTip]
      );

      // PASO 16.2.2-B: Validar que el INSERT fue exitoso
      if (!paymentResult || !paymentResult.lastID) {
        throw new Error(`No se pudo insertar el pago para la orden ${oid}. paymentResult: ${JSON.stringify(paymentResult)}`);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Pago insertado con ID: ${paymentResult.lastID}`);
      }
      
      const payment = await db.get(
        "SELECT * FROM payments WHERE id = ?",
        [paymentResult.lastID]
      );

      // PASO 16.2.2-B: Validar que el payment se recuperó correctamente
      if (!payment) {
        throw new Error(`No se pudo recuperar el pago recién insertado (ID: ${paymentResult.lastID})`);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Pago recuperado:`, payment);
      }
      createdPayments.push(payment);

      // FASE 12.3: Registrar auditoría - PAYMENT_CREATED (con try/catch para no bloquear)
      try {
        await logAudit({
          action: 'PAYMENT_CREATED',
          entity_type: 'payment',
          entity_id: paymentResult.lastID,
          table_number: orderInfo.table_number || null,
          order_id: oid,
          user_id: req.user.id,
          ip: req.ip || req.connection?.remoteAddress || null,
          summary: `Pago ${method} por ${orderAmount} - Orden ${orderInfo.daily_no || orderInfo.code || oid}`,
          meta: {
            amount: orderAmount,
            method: method,
            cash_session_id: cashSessionId,
            itemIdsCount: orderItems.length
          }
        });
      } catch (auditError) {
        // No bloquear por error de auditoría
        console.error(`[${timestamp}] Error en auditoría PAYMENT_CREATED:`, auditError);
      }

      // Si todos los items (no anulados) están pagados, marcar order pagado y (si LISTO) archivarlo
      const agg = await db.get(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN paid_at IS NOT NULL THEN 1 ELSE 0 END) as paid
         FROM order_items
         WHERE order_id = ? AND voided_at IS NULL`,
        [oid]
      );

      // PASO 16.2.2-B: Validar que agg existe y tiene valores válidos
      if (!agg) {
        throw new Error(`No se pudo obtener agregación de items para orden ${oid}`);
      }

      const total = Number(agg.total) || 0;
      const paid = Number(agg.paid) || 0;

      if (total > 0 && total === paid) {
        const paidTimestamp = toBogotaSQLiteTimestamp(new Date());
        const updateResult = await db.run(
          "UPDATE orders SET paid_at = ?, status = 'PAGADA', archived_at = ? WHERE id = ?",
          [paidTimestamp, paidTimestamp, oid]
        );
        // PASO 16.2.2-B: Validar que el UPDATE fue exitoso
        if (!updateResult || updateResult.changes === 0) {
          console.warn(`[${timestamp}] No se pudo actualizar orden ${oid} a PAGADA. Puede que no exista.`);
        } else {
          archivedOrderIds.push(oid);
        }
      }
    }

    // Commit transacción
    await db.run("COMMIT");
    transactionStarted = false;

    // Fase 3: Descontar inventario automáticamente usando recetas (fuera de transacción para no bloquear)
    try {
      await deductInventoryFromOrderItems(db, items, req.user.id);
    } catch (inventoryError) {
      // FASE F5: el fallo no bloquea el pago, pero queda en auditoría (antes se perdía en consola)
      console.error("⚠️  Error descontando inventario (no bloquea el pago):", inventoryError);
      await logAudit({
        action: 'INVENTORY_ERROR',
        entity_type: 'order',
        entity_id: affectedOrderIds[0] || null,
        user_id: req.user.id,
        summary: `Fallo descontando inventario tras pago por items: ${inventoryError.message}`,
        meta: { order_ids: affectedOrderIds, error: inventoryError.message }
      }).catch(() => {});
    }

    // Notificar vía WebSocket (con guardas defensivas)
    try {
      const io = req.app.get("io");
      if (io) {
        if (createdPayments.length > 0 && affectedOrderIds.length > 0) {
          io.emit("payment:created", { payment: createdPayments[0], orderId: affectedOrderIds[0] });
        }
        io.emit("items:paid", { tableId: tableIdNum || null, orderId: orderIdNum || null, itemIds: paidItemIds });
        for (const oid of archivedOrderIds) {
          const ord = await db.get("SELECT table_id FROM orders WHERE id = ?", [oid]);
          io.emit("order:archived", { orderId: oid, tableId: ord?.table_id ?? null });
        }
      }
    } catch (socketError) {
      // No bloquear por error de WebSocket
      console.error(`[${timestamp}] Error en notificación WebSocket:`, socketError);
    }

    // 6) Respuesta 200 con ok:true, amount, paidItemIds
    return res.status(200).json({ 
      ok: true, 
      amount: totalDb, 
      paidItemIds: paidItemIds,
      payments: createdPayments 
    });

  } catch (error) {
    // Rollback si la transacción estaba activa
    if (transactionStarted) {
      try {
        await db.run("ROLLBACK");
      } catch (rollbackError) {
        console.error(`[${timestamp}] [PAYMENTS/ITEMS ROLLBACK ERROR]`, rollbackError);
      }
    }

    // PASO 16.2.2-B: Detectar errores de validación/lógica y convertir a 400
    const errorMessage = error.message || String(error);
    const isValidationError = 
      errorMessage.includes('no existe') ||
      errorMessage.includes('no se pudo') ||
      errorMessage.includes('inválido') ||
      errorMessage.includes('No se encontraron') ||
      errorMessage.includes('tienen datos incompletos') ||
      errorMessage.includes('No hay items asociados') ||
      errorMessage.includes('Monto inválido') ||
      errorMessage.includes('Usuario no autenticado');

    // PASO 16.2.2-B: Detectar errores SQL (constraint, foreign key, etc.)
    const isSQLError = 
      error.code === 'SQLITE_CONSTRAINT' ||
      error.code === 'SQLITE_ERROR' ||
      error.code === 'SQLITE_BUSY' ||
      errorMessage.includes('SQLITE_') ||
      errorMessage.includes('FOREIGN KEY constraint failed') ||
      errorMessage.includes('UNIQUE constraint failed');

    // Si es error de validación/lógica, retornar 400
    if (isValidationError) {
      console.error(`[${timestamp}] [PAYMENTS/ITEMS VALIDATION ERROR] ${errorId}`);
      console.error("- message:", error.message);
      console.error("- req.body:", JSON.stringify(req.body, null, 2));
      console.error("- req.user?.id:", req.user?.id);

      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: error.message || 'Error de validación en el procesamiento',
        errorId
      });
    }

    // Si es error SQL de constraint/foreign key, retornar 400 con detalles
    if (isSQLError && (errorMessage.includes('FOREIGN KEY') || errorMessage.includes('constraint'))) {
      console.error(`[${timestamp}] [PAYMENTS/ITEMS SQL CONSTRAINT ERROR] ${errorId}`);
      console.error("- message:", error.message);
      console.error("- code:", error.code);
      console.error("- req.body:", JSON.stringify(req.body, null, 2));

      return res.status(400).json({
        error: 'BAD_REQUEST',
        details: 'Violación de integridad de datos. Verifica que las órdenes e items existan y estén en estado válido.',
        errorId,
        sqlError: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // PASO 16.2.1: Logging completo para diagnóstico (error real del servidor)
    console.error(`[${timestamp}] [PAYMENTS/ITEMS ERROR] ${errorId}`);
    console.error("- message:", error.message);
    console.error("- stack:", error.stack);
    console.error("- req.body:", JSON.stringify(req.body, null, 2));
    console.error("- req.user?.id:", req.user?.id);
    console.error("- error.code:", error.code);
    console.error("- error.name:", error.name);

    // Respuesta según entorno (solo para errores reales del servidor)
    if (process.env.NODE_ENV === 'development') {
      return res.status(500).json({
        error: "Error interno del servidor",
        errorId,
        message: error.message,
        code: error.code,
        sqlite: error.sqliteErrorCode
      });
    } else {
      return res.status(500).json({ 
        error: "Error interno del servidor",
        errorId
      });
    }
  }
});

// POST /api/payments
router.post("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { orderId, method, amount, payments: paymentsInput } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Faltan campos requeridos" });
    }

    // FASE F3: aceptar pago simple {method, amount} o dividido {payments: [{method, amount}, ...]}
    let paymentLines;
    if (Array.isArray(paymentsInput) && paymentsInput.length > 0) {
      paymentLines = paymentsInput;
    } else if (method && amount) {
      paymentLines = [{ method, amount }];
    } else {
      return res.status(400).json({ error: "Faltan campos requeridos (method/amount o payments[])" });
    }

    // Validar cada línea de pago
    const normalizedLines = [];
    for (const line of paymentLines) {
      if (!["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(line.method)) {
        return res.status(400).json({ error: "Método de pago inválido. Debe ser EFECTIVO, TARJETA o TRANSFERENCIA" });
      }
      const amountNum = typeof line.amount === 'string' ? parseFloat(line.amount) : Number(line.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: "Cada pago debe tener un monto mayor a 0" });
      }
      normalizedLines.push({ method: line.method, amount: amountNum });
    }

    const db = getDb();

    // Verificar que existe sesión de caja abierta ANTES de cualquier operación
    const cashSession = await db.get(
      "SELECT id FROM cash_sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1"
    );

    if (!cashSession) {
      return res.status(400).json({ error: "No hay caja abierta. Debe abrir caja antes de cobrar." });
    }
    const cashSessionId = cashSession.id;

    // Verificar que el pedido existe y está LISTO
    const order = await db.get("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    // FASE 12.4: Validar que la orden esté en estado LISTO
    if (order.status !== "LISTO") {
      // Registrar auditoría de bloqueo
      const tableInfo = await db.get("SELECT t.number FROM tables t WHERE t.id = ?", [order.table_id]);
      await logAudit({
        action: 'BLOCKED_ACTION',
        entity_type: 'payment',
        entity_id: null,
        table_number: tableInfo?.number || null,
        order_id: orderId,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Intento de cobro bloqueado - Orden ${order.daily_no || order.code || orderId} en estado ${order.status}`,
        meta: {
          attempted_action: 'PAY_ORDER',
          status: order.status,
          endpoint: 'POST /api/payments'
        }
      });
      
      return res.status(409).json({ 
        error: "Solo se puede cobrar cuando la orden está LISTO",
        status: order.status
      });
    }

    if (order.paid_at) {
      return res.status(400).json({ error: "El pedido ya está pagado" });
    }

    // FASE F3: validar montos contra el saldo real de la orden
    const orderItems = await db.all(
      `SELECT oi.*, o.id as order_id
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.order_id = ? AND oi.voided_at IS NULL`,
      [orderId]
    );

    const totalItems = orderItems.reduce((sum, item) => {
      const qty = item.qty || 0;
      const price = item.price || 0;
      return sum + (qty * price);
    }, 0);
    // FASE F8: el total a cobrar descuenta el descuento de la orden
    const totalOrden = Math.max(0, totalItems - (order.discount_amount || 0));

    const yaPagado = await db.get(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM payments
       WHERE order_id = ? AND voided_at IS NULL`,
      [orderId]
    );
    const yaPagadoNum = yaPagado?.total || 0;
    const saldoPendiente = totalOrden - yaPagadoNum;

    // FASE F8: propina opcional (se registra aparte, no infla las ventas)
    const tipAmount = Number(req.body.tipAmount) || 0;
    if (tipAmount < 0) {
      return res.status(400).json({ error: "La propina no puede ser negativa" });
    }

    if (saldoPendiente <= 0) {
      return res.status(400).json({ error: "El pedido ya está pagado" });
    }

    const sumLines = normalizedLines.reduce((s, l) => s + l.amount, 0);
    // Tolerancia de 1 peso por redondeos
    if (sumLines > saldoPendiente + 1) {
      return res.status(400).json({
        error: `El monto a cobrar (${sumLines}) supera el saldo pendiente de la orden (${saldoPendiente})`,
        saldoPendiente,
      });
    }

    const paymentTimestamp = toBogotaSQLiteTimestamp(new Date());
    const timestamp = paymentTimestamp;
    const quedaPagada = yaPagadoNum + sumLines >= totalOrden - 1;
    const insertedIds = [];

    await db.run("BEGIN IMMEDIATE");
    try {
      let first = true;
      for (const line of normalizedLines) {
        // La propina se registra en el primer pago del cobro
        const result = await db.run(
          "INSERT INTO payments (order_id, method, amount, created_by, created_at, cash_session_id, tip_amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [orderId, line.method, line.amount, req.user.id, paymentTimestamp, cashSessionId, first ? tipAmount : 0]
        );
        insertedIds.push(result.lastID);
        first = false;
      }

      if (quedaPagada) {
        // Marcar items como pagados y cerrar la orden
        for (const item of orderItems) {
          if (!item.paid_at) {
            await db.run("UPDATE order_items SET paid_at = ? WHERE id = ?", [timestamp, item.id]);
          }
        }
        await db.run(
          "UPDATE orders SET status = 'PAGADA', paid_at = ?, archived_at = ? WHERE id = ?",
          [timestamp, timestamp, orderId]
        );
      }
      // Pago parcial: la orden sigue LISTO y sin paid_at (la mesa sigue activa con saldo)

      await db.run("COMMIT");
    } catch (txError) {
      try { await db.run("ROLLBACK"); } catch (rbErr) { /* ignore */ }
      throw txError;
    }

    console.log(`💰 Cobro orden ${orderId}: ${normalizedLines.map(l => `${l.method} ${l.amount}`).join(' + ')} | pagada=${quedaPagada}`);

    // Descontar inventario SOLO cuando la orden queda totalmente pagada
    if (quedaPagada) {
      try {
        await deductInventoryFromOrderItems(db, orderItems, req.user.id);
      } catch (inventoryError) {
        // FASE F5: el fallo no bloquea el pago, pero queda en auditoría
        console.error("⚠️  Error descontando inventario (no bloquea el pago):", inventoryError);
        await logAudit({
          action: 'INVENTORY_ERROR',
          entity_type: 'order',
          entity_id: orderId,
          user_id: req.user.id,
          summary: `Fallo descontando inventario tras pago de orden ${orderId}: ${inventoryError.message}`,
          meta: { order_id: orderId, error: inventoryError.message }
        }).catch(() => {});
      }
    }

    // Obtener información de la orden para auditoría
    const orderInfo = await db.get(
      "SELECT o.*, t.number as table_number FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?",
      [orderId]
    );

    const insertedPayments = [];
    for (const pid of insertedIds) {
      const p = await db.get("SELECT * FROM payments WHERE id = ?", [pid]);
      insertedPayments.push(p);

      // FASE 12.3: Registrar auditoría - PAYMENT_CREATED (uno por método)
      await logAudit({
        action: 'PAYMENT_CREATED',
        entity_type: 'payment',
        entity_id: pid,
        table_number: orderInfo?.table_number || null,
        order_id: orderId,
        user_id: req.user.id,
        ip: req.ip || req.connection?.remoteAddress || null,
        summary: `Pago ${p.method} por ${p.amount} - Orden ${orderInfo?.daily_no || orderInfo?.code || orderId}${normalizedLines.length > 1 ? ' (pago dividido)' : ''}`,
        meta: {
          amount: p.amount,
          method: p.method,
          cash_session_id: cashSessionId,
          split: normalizedLines.length > 1
        }
      });
    }

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      for (const p of insertedPayments) {
        io.emit("payment:created", { payment: p, orderId });
      }
      if (quedaPagada) {
        io.emit("order:status-changed", { order: { ...orderInfo, items: orderItems } });
        io.emit("order:archived", { orderId });
        io.emit("table:updated", { tableId: orderInfo?.table_id });
      }
    }

    res.status(201).json({
      payment: insertedPayments[0],
      payments: insertedPayments,
      fullyPaid: quedaPagada,
      saldoPendiente: quedaPagada ? 0 : saldoPendiente - sumLines,
    });
  } catch (error) {
    console.error("[PAYMENTS ERROR]", {
      message: error.message,
      stack: error.stack,
      body: req.body,
      userId: req.user?.id
    });
    res.status(500).json({ 
      error: process.env.NODE_ENV === 'development' ? error.message : "Error interno del servidor"
    });
  }
});

// GET /api/payments/today (mantener para compatibilidad)
router.get("/today", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const today = getBogotaDateString(); // Usar zona horaria America/Bogota (YYYY-MM-DD)

    // Buscar pagos del día actual usando la fecha en formato YYYY-MM-DD
    // SQLite almacena fechas como strings 'YYYY-MM-DD HH:mm:ss', así que comparamos el inicio del string
    const payments = await db.all(
      `SELECT p.*, o.code as order_code, u.name as created_by_name
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       JOIN users u ON p.created_by = u.id
       WHERE DATE(p.created_at) = ? OR substr(p.created_at, 1, 10) = ?
       ORDER BY p.created_at DESC`,
      [today, today]
    );

    res.json(payments);
  } catch (error) {
    console.error("Error obteniendo pagos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/payments (FASE 12.1: Historial de Pagos PRO con filtros)
router.get("/", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const { from, to, method, tableNumber, orderCode, limit = 200 } = req.query;

    // Construir WHERE dinámico
    const conditions = [];
    const params = [];

    // Filtro por fecha
    if (from) {
      conditions.push("(DATE(p.created_at) >= ? OR substr(p.created_at, 1, 10) >= ?)");
      params.push(from, from);
    }
    if (to) {
      conditions.push("(DATE(p.created_at) <= ? OR substr(p.created_at, 1, 10) <= ?)");
      params.push(to, to);
    }

    // Filtro por método
    if (method && ["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(method)) {
      conditions.push("p.method = ?");
      params.push(method);
    }

    // Filtro por mesa
    if (tableNumber) {
      const tableNum = parseInt(tableNumber);
      if (!isNaN(tableNum)) {
        conditions.push("t.number = ?");
        params.push(tableNum);
      }
    }

    // Filtro por código de orden
    if (orderCode) {
      conditions.push("(o.daily_no LIKE ? OR o.code LIKE ?)");
      const searchCode = `%${orderCode}%`;
      params.push(searchCode, searchCode);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Validar limit
    const limitNum = parseInt(limit);
    const finalLimit = isNaN(limitNum) || limitNum <= 0 || limitNum > 500 ? 200 : limitNum;

    // Query con JOINs para obtener información completa (FASE 12.5: incluir campos de anulación)
    // Intentar query con columnas de anulación, si falla usar query sin ellas (para compatibilidad)
    let payments;
    try {
      payments = await db.all(
        `SELECT 
          p.id,
          p.order_id,
          p.method,
          p.amount,
          p.created_at,
          p.created_by,
          p.cash_session_id,
          p.voided_at,
          p.voided_by,
          p.void_reason,
          o.id as order_id_full,
          o.code as order_code,
          o.daily_no,
          o.table_id,
          o.status as order_status,
          t.number as table_number,
          t.label as table_label,
          u.name as created_by_name,
          u2.name as voided_by_name
         FROM payments p
         JOIN orders o ON p.order_id = o.id
         LEFT JOIN tables t ON o.table_id = t.id
         JOIN users u ON p.created_by = u.id
         LEFT JOIN users u2 ON p.voided_by = u2.id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT ?`,
        [...params, finalLimit]
      );
    } catch (error) {
      // Si las columnas de anulación no existen, usar query sin ellas
      if (error.message && error.message.includes('no such column')) {
        console.warn('[PAYMENTS] Columnas de anulación no encontradas, usando query compatible');
        payments = await db.all(
          `SELECT 
            p.id,
            p.order_id,
            p.method,
            p.amount,
            p.created_at,
            p.created_by,
            p.cash_session_id,
            NULL as voided_at,
            NULL as voided_by,
            NULL as void_reason,
            o.id as order_id_full,
            o.code as order_code,
            o.daily_no,
            o.table_id,
            o.status as order_status,
            t.number as table_number,
            t.label as table_label,
            u.name as created_by_name,
            NULL as voided_by_name
           FROM payments p
           JOIN orders o ON p.order_id = o.id
           LEFT JOIN tables t ON o.table_id = t.id
           JOIN users u ON p.created_by = u.id
           ${whereClause}
           ORDER BY p.created_at DESC
           LIMIT ?`,
          [...params, finalLimit]
        );
      } else {
        throw error; // Re-lanzar si es otro tipo de error
      }
    }

    res.json({ payments, count: payments.length });
  } catch (error) {
    console.error("Error obteniendo pagos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/payments/:id/void (FASE 12.5: Anular pago con motivo obligatorio)
router.post("/:id/void", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const { reason } = req.body;
    const paymentId = parseInt(req.params.id);
    const db = getDb();

    // Validar motivo obligatorio
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ 
        error: "Motivo de anulación es obligatorio (mínimo 5 caracteres)" 
      });
    }

    // Buscar el pago
    const payment = await db.get("SELECT * FROM payments WHERE id = ?", [paymentId]);
    if (!payment) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    // Verificar si ya está anulado
    if (payment.voided_at) {
      return res.status(409).json({ error: "Pago ya anulado" });
    }

    // FASE F5: no anular pagos de una caja ya cerrada (descuadraría el arqueo histórico).
    if (payment.cash_session_id) {
      const paymentSession = await db.get(
        "SELECT closed_at FROM cash_sessions WHERE id = ?",
        [payment.cash_session_id]
      );
      if (paymentSession?.closed_at) {
        return res.status(409).json({
          error: "No se puede anular un pago de una caja ya cerrada. Registra un egreso manual para corregirlo.",
        });
      }
    } else {
      // Pagos antiguos sin sesión asociada: exigir al menos una caja abierta
      const openSession = await db.get(
        "SELECT id FROM cash_sessions WHERE closed_at IS NULL LIMIT 1"
      );
      if (!openSession) {
        return res.status(409).json({
          error: "No hay caja abierta. Abre caja antes de anular pagos.",
        });
      }
    }

    // Obtener información de la orden para auditoría
    const orderInfo = await db.get(
      "SELECT o.*, t.number as table_number FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE o.id = ?",
      [payment.order_id]
    );

    const timestamp = toBogotaSQLiteTimestamp(new Date());

    // Anular el pago (soft cancel)
    await db.run(
      "UPDATE payments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?",
      [timestamp, req.user.id, reason.trim(), paymentId]
    );

    // Recalcular estado de la orden relacionada
    const totalPagado = await db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM payments 
       WHERE order_id = ? AND voided_at IS NULL`,
      [payment.order_id]
    );

    const totalPagadoNum = totalPagado?.total || 0;

    // Obtener total de la orden (suma de items pagados)
    const orderItems = await db.all(
      `SELECT oi.* FROM order_items oi 
       WHERE oi.order_id = ? AND oi.voided_at IS NULL`,
      [payment.order_id]
    );

    const totalOrden = orderItems.reduce((sum, item) => {
      const qty = item.qty || 0;
      const price = item.price || 0;
      return sum + (qty * price);
    }, 0);

    let statusUpdatedTo = null;
    const order = await db.get("SELECT * FROM orders WHERE id = ?", [payment.order_id]);

    // Archivado automático: recalcular estado y archivar/desarchivar según corresponda
    if (totalPagadoNum <= 0 && order && order.status === 'PAGADA') {
      // Si no hay pagos válidos y la orden estaba PAGADA, cambiar a LISTO y desarchivar
      await db.run("UPDATE orders SET status = 'LISTO', paid_at = NULL, archived_at = NULL WHERE id = ?", [payment.order_id]);
      // FASE F5: sin pagos válidos, los items vuelven a estar pendientes de cobro
      await db.run("UPDATE order_items SET paid_at = NULL WHERE order_id = ? AND voided_at IS NULL", [payment.order_id]);
      statusUpdatedTo = 'LISTO';
      console.log(`✅ Orden ${payment.order_id} vuelve a LISTO y se desarchiva (pago anulado)`);
    } else if (totalPagadoNum > 0 && totalPagadoNum >= totalOrden) {
      // Si hay pagos suficientes, marcar como PAGADA y archivar (si no estaba archivada)
      if (order && order.status !== 'PAGADA') {
        // Cambiar de LISTO/NUEVO/EN_PREP a PAGADA y archivar
        await db.run("UPDATE orders SET status = 'PAGADA', paid_at = ?, archived_at = ? WHERE id = ?", [timestamp, timestamp, payment.order_id]);
        statusUpdatedTo = 'PAGADA';
        console.log(`✅ Orden ${payment.order_id} marcada como PAGADA y archivada (total pagado: ${totalPagadoNum} >= ${totalOrden})`);
      } else if (order && order.status === 'PAGADA' && !order.archived_at) {
        // Si ya estaba PAGADA pero no archivada, archivar ahora
        await db.run("UPDATE orders SET archived_at = ? WHERE id = ?", [timestamp, payment.order_id]);
        console.log(`✅ Orden ${payment.order_id} ya estaba PAGADA, ahora archivada`);
      }
      // Si ya estaba PAGADA y archivada, no hacer nada
    } else if (totalPagadoNum > 0 && totalPagadoNum < totalOrden && order && order.status === 'PAGADA') {
      // Si había pagos suficientes pero ahora no, cambiar a LISTO y desarchivar
      await db.run("UPDATE orders SET status = 'LISTO', archived_at = NULL WHERE id = ?", [payment.order_id]);
      statusUpdatedTo = 'LISTO';
      console.log(`✅ Orden ${payment.order_id} vuelve a LISTO y se desarchiva (pago parcial anulado: ${totalPagadoNum} < ${totalOrden})`);
    }

    // FASE F5: si la orden deja de estar PAGADA, reponer el inventario descontado al cobrar
    if (order?.status === 'PAGADA' && statusUpdatedTo === 'LISTO') {
      try {
        await restoreInventoryFromOrderItems(db, orderItems, req.user.id, payment.order_id);
        console.log(`✅ Inventario repuesto por anulación de pago (orden ${payment.order_id})`);
      } catch (restoreError) {
        console.error("⚠️  Error reponiendo inventario tras anulación:", restoreError);
        await logAudit({
          action: 'INVENTORY_ERROR',
          entity_type: 'order',
          entity_id: payment.order_id,
          user_id: req.user.id,
          summary: `Fallo reponiendo inventario tras anular pago ${paymentId}: ${restoreError.message}`,
          meta: { payment_id: paymentId, order_id: payment.order_id, error: restoreError.message }
        }).catch(() => {});
      }
    }

    // FASE 12.5: Registrar auditoría - PAYMENT_VOIDED
    await logAudit({
      action: 'PAYMENT_VOIDED',
      entity_type: 'payment',
      entity_id: paymentId,
      table_number: orderInfo?.table_number || null,
      order_id: payment.order_id,
      user_id: req.user.id,
      ip: req.ip || req.connection?.remoteAddress || null,
      summary: `Pago anulado - Orden ${orderInfo?.daily_no || orderInfo?.code || payment.order_id}`,
      meta: {
        payment_id: paymentId,
        order_id: payment.order_id,
        amount: payment.amount,
        method: payment.method,
        cash_session_id: payment.cash_session_id,
        reason: reason.trim()
      }
    });

    // Notificar vía WebSocket
    const io = req.app.get("io");
    if (io) {
      io.emit("payment:voided", {
        paymentId,
        orderId: payment.order_id
      });
      io.emit("order:status-changed", { orderId: payment.order_id });
    }

    res.json({
      ok: true,
      paymentId,
      orderId: payment.order_id,
      statusUpdatedTo,
      voided_at: timestamp
    });
  } catch (error) {
    console.error("Error anulando pago:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
