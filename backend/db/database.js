import sqlite3 from "sqlite3";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync, mkdirSync } from "fs";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH =
  process.env.DB_PATH || join(__dirname, "../data/pos_chanatos.db");

// Asegurar que existe el directorio data
const dataDir = join(__dirname, "../data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

let db = null;

// Promisificar métodos de sqlite3
const promisifyDb = (db) => {
  // db.run necesita un wrapper especial para capturar lastID
  const originalRun = db.run.bind(db);
  db.run = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      originalRun(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes,
          });
        }
      });
    });
  };

  db.get = promisify(db.get.bind(db));
  db.all = promisify(db.all.bind(db));
  return db;
};

export const getDb = () => {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Error conectando a la base de datos:", err);
      } else {
        console.log("✅ Conectado a SQLite:", DB_PATH);
      }
    });
    db = promisifyDb(db);
    // Enable foreign key enforcement
    db.run("PRAGMA foreign_keys = ON");
  }
  return db;
};

export const initDatabase = async () => {
  const database = getDb();

  // Crear tablas
  await database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('MESERO', 'COCINA', 'CAJA')),
      pin_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER UNIQUE NOT NULL,
      label TEXT,
      zone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      variant TEXT,
      is_active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      table_id INTEGER,
      channel TEXT CHECK(channel IN ('MESA', 'VENTANILLA')),
      service TEXT,
      business_day TEXT,
      daily_no INTEGER,
      status TEXT NOT NULL DEFAULT 'NUEVO' CHECK(status IN ('NUEVO', 'EN_PREP', 'LISTO', 'PAGADA', 'CANCELADO')),
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      archived_at DATETIME,
      disabled_at DATETIME,
      disabled_reason TEXT,
      disabled_by INTEGER,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (disabled_by) REFERENCES users(id)
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      notes TEXT,
      paid_at DATETIME,
      voided_at DATETIME,
      ready_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA')),
      amount REAL NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      cash_session_id INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_at DATETIME NOT NULL,
      closed_at DATETIME,
      initial_cash REAL NOT NULL DEFAULT 0,
      final_cash REAL,
      opened_by INTEGER NOT NULL,
      closed_by INTEGER,
      FOREIGN KEY (opened_by) REFERENCES users(id),
      FOREIGN KEY (closed_by) REFERENCES users(id)
    )
  `);

  await database.run(`
    CREATE TABLE IF NOT EXISTS manual_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('INGRESO', 'EGRESO')),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // FASE F5 (naranja): sesiones persistentes — sobreviven reinicios del servidor
  await database.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Crear índices
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_orders_business_day ON orders(business_day)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_payments_cash_session ON payments(cash_session_id)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened ON cash_sessions(opened_at)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_manual_transactions_date ON manual_transactions(transaction_date)`
  );
  await database.run(
    `CREATE INDEX IF NOT EXISTS idx_manual_transactions_created ON manual_transactions(created_at)`
  );

  // Insertar usuarios iniciales (solo si no existen)
  const existingUsers = await database.get(
    "SELECT COUNT(*) as count FROM users"
  );
  if (existingUsers.count === 0) {
    console.log("📝 Creando usuarios iniciales...");

    // PINs por defecto (cambiar en producción)
    const defaultUsers = [
      { name: "Mesero 1", role: "MESERO", pin: "1234" },
      { name: "Cocina 1", role: "COCINA", pin: "5678" },
      { name: "Caja 1", role: "CAJA", pin: "9012" },
    ];

    for (const user of defaultUsers) {
      const pinHash = await bcrypt.hash(user.pin, 10);
      await database.run(
        "INSERT INTO users (name, role, pin_hash) VALUES (?, ?, ?)",
        [user.name, user.role, pinHash]
      );
      console.log(
        `  ✅ Usuario creado: ${user.name} (PIN: ${user.pin}) - ROL: ${user.role}`
      );
    }
  }

  // Insertar productos del menú (solo si no existen)
  // PRIMERO: Intentar cargar desde products.json (fuente de verdad)
  const existingProducts = await database.get(
    "SELECT COUNT(*) as count FROM products"
  );
  if (existingProducts.count === 0) {
    console.log("📝 Cargando productos desde products.json...");
    
    try {
      const { loadProductsFromSource } = await import("../utils/productsSource.js");
      const productsFromJson = loadProductsFromSource();
      
      if (productsFromJson && productsFromJson.length > 0) {
        console.log(`📦 Cargando ${productsFromJson.length} productos desde products.json`);
        
        for (const product of productsFromJson) {
          await database.run(
            "INSERT INTO products (name, category, price, variant, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            [
              product.name,
              product.category,
              product.price,
              product.variant || null,
              product.display_order || 0,
              product.is_active === true || product.is_active === 1 ? 1 : 0,
            ]
          );
        }
        
        console.log("  ✅ Productos del menú cargados desde products.json");
      } else {
        // Si no hay JSON, crear productos por defecto
        console.log("📝 Creando productos del menú por defecto...");

        // HAMBURGUESAS
    let order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Hamburguesa Clásica", "HAMBURGUESAS", 12000, "Sencillo", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Hamburguesa Clásica", "HAMBURGUESAS", 16000, "Combo", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Hamburguesa Chanata", "HAMBURGUESAS", 16000, "Sencillo", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Hamburguesa Chanata", "HAMBURGUESAS", 20000, "Combo", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Hamburguesa Doble Carne", "HAMBURGUESAS", 18000, "Sencillo", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Hamburguesa Doble Carne", "HAMBURGUESAS", 22000, "Combo", order++]
    );

    // PERROS CALIENTES
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Perro Clásico", "PERROS_CALIENTES", 8000, "Sencillo", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Perro Especial", "PERROS_CALIENTES", 10000, "Sencillo", order++]
    );

    // SÁNDWICH
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Sándwich de Pollo", "SANDWICH", 10000, "Sencillo", 1]
    );

    // PAPAS
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Porción de Papas Sencilla", "PAPAS", 5000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Salchipapa Sencilla", "PAPAS", 7000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Papa LoKa", "PAPAS", 18000, null, order++]
    );

    // FILETES
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Filete de Pollo", "FILETES", 12000, "Sin Papas", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Filete de Pollo", "FILETES", 16000, "Con Papas", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Filete de Cerdo", "FILETES", 12000, "Sin Papas", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Filete de Cerdo", "FILETES", 16000, "Con Papas", order++]
    );

    // BEBIDAS
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Pepsi Personal", "BEBIDAS", 2000, "250 ml", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Jugo Hit", "BEBIDAS", 3500, "500 ml", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Mr Tea", "BEBIDAS", 3500, "500 ml", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Coca-Cola Personal", "BEBIDAS", 4000, "250 ml", order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Pepsi", "BEBIDAS", 5000, "1 L", order++]
    );

    // CERVEZAS
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Cerveza Andina", "CERVEZAS", 4000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Cerveza Poker", "CERVEZAS", 5000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Cerveza Heineken", "CERVEZAS", 5000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Cerveza Club Colombia", "CERVEZAS", 6000, null, order++]
    );

    // JUGOS NATURALES
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Jugo Natural en Agua", "JUGOS_NATURALES", 7000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Jugo Natural en Leche", "JUGOS_NATURALES", 8000, null, order++]
    );

    // OTROS
    order = 1;
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Michelada", "OTROS", 8000, null, order++]
    );
    await database.run(
      "INSERT INTO products (name, category, price, variant, display_order) VALUES (?, ?, ?, ?, ?)",
      ["Limonada Natural", "OTROS", 10000, null, order++]
    );

        console.log("  ✅ Productos del menú creados por defecto");
      }
    } catch (error) {
      console.error("⚠️  Error cargando desde products.json, usando productos por defecto:", error);
      // Si hay error, continuar sin productos iniciales (se cargarán después)
    }
  } else {
    // CRÍTICO: Si los productos ya existen, NO actualizar precios
    // Respetar los cambios que el usuario haya hecho
    // Los productos se sincronizan con products.json cuando se editan
    console.log("✅ Productos ya existen en la base de datos, respetando precios actuales");
    
    // Opcional: Sincronizar BD -> JSON si hay cambios en BD que no están en JSON
    // (Esto solo sería útil si se editaron productos directamente en BD)
    // Por ahora, confiamos en que products.json se actualiza al editar desde la app
  }

  // Insertar mesas de ejemplo (solo si no existen)
  const existingTables = await database.get(
    "SELECT COUNT(*) as count FROM tables"
  );
  if (existingTables.count === 0) {
    console.log("📝 Creando mesas iniciales...");
    for (let i = 1; i <= 8; i++) {
      await database.run("INSERT INTO tables (number, label) VALUES (?, ?)", [
        i,
        `Mesa ${i}`,
      ]);
    }
    // Crear mesas especiales
    await database.run("INSERT INTO tables (number, label) VALUES (?, ?)", [
      9,
      "Ventanilla",
    ]);
    await database.run("INSERT INTO tables (number, label) VALUES (?, ?)", [
      10,
      "Domicilio",
    ]);
    console.log("  ✅ 10 mesas creadas (8 regulares + 2 especiales)");
  } else {
    // Asegurar que las mesas 9 y 10 existan y tengan los labels correctos
    const mesa9 = await database.get("SELECT * FROM tables WHERE number = 9");
    if (!mesa9) {
      await database.run("INSERT INTO tables (number, label) VALUES (?, ?)", [
        9,
        "Ventanilla",
      ]);
      console.log("  ✅ Mesa 9 (Ventanilla) creada");
    } else if (mesa9.label !== "Ventanilla") {
      await database.run("UPDATE tables SET label = ? WHERE number = 9", [
        "Ventanilla",
      ]);
      console.log("  ✅ Mesa 9 actualizada con label 'Ventanilla'");
    }

    const mesa10 = await database.get("SELECT * FROM tables WHERE number = 10");
    if (!mesa10) {
      await database.run("INSERT INTO tables (number, label) VALUES (?, ?)", [
        10,
        "Domicilio",
      ]);
      console.log("  ✅ Mesa 10 (Domicilio) creada");
    } else if (mesa10.label !== "Domicilio") {
      await database.run("UPDATE tables SET label = ? WHERE number = 10", [
        "Domicilio",
      ]);
      console.log("  ✅ Mesa 10 actualizada con label 'Domicilio'");
    }
  }

  // Verificar y ejecutar migración si es necesario
  try {
    const orderItemsInfo = await database.all("PRAGMA table_info(order_items)");
    const hasPrice = orderItemsInfo.some((col) => col.name === "price");
    const hasPaidAt = orderItemsInfo.some((col) => col.name === "paid_at");
    // Nota: hasItemVoidedAt se declara más abajo en FASE 12.6, no duplicar aquí
    const hasProductId = orderItemsInfo.some((col) => col.name === "product_id");
    const hasIsCustom = orderItemsInfo.some((col) => col.name === "is_custom");

    const ordersInfo = await database.all("PRAGMA table_info(orders)");
    const hasArchivedAt = ordersInfo.some((col) => col.name === "archived_at");
    const hasDisabledAt = ordersInfo.some((col) => col.name === "disabled_at");
    const hasDisabledReason = ordersInfo.some(
      (col) => col.name === "disabled_reason"
    );
    const hasDisabledBy = ordersInfo.some((col) => col.name === "disabled_by");
    const hasService = ordersInfo.some((col) => col.name === "service");
    const hasBusinessDay = ordersInfo.some(
      (col) => col.name === "business_day"
    );
    const hasDailyNo = ordersInfo.some((col) => col.name === "daily_no");
    
    // FASE 9.6: Verificar columnas de cancelación (estandarizado a cancelled_at/cancelled_by)
    const hasCancelReason = ordersInfo.some((col) => col.name === "cancel_reason");

    // Verificar campos KPI en cash_sessions (Fase 1 y 2.3)
    const cashSessionsInfo = await database.all("PRAGMA table_info(cash_sessions)");
    const hasGrossSales = cashSessionsInfo.some((col) => col.name === "gross_sales");
    const hasCogsTotal = cashSessionsInfo.some((col) => col.name === "cogs_total");
    const hasGrossProfit = cashSessionsInfo.some((col) => col.name === "gross_profit");
    const hasCogsPercent = cashSessionsInfo.some((col) => col.name === "cogs_percent");
    
    // FASE 9.3: Verificar columnas de cierre
    const hasClosingCash = cashSessionsInfo.some((col) => col.name === "closing_cash");
    const hasExpectedCash = cashSessionsInfo.some((col) => col.name === "expected_cash");
    const hasDiffCash = cashSessionsInfo.some((col) => col.name === "diff_cash");
    const hasTotalCash = cashSessionsInfo.some((col) => col.name === "total_cash");
    const hasTotalCard = cashSessionsInfo.some((col) => col.name === "total_card");
    const hasTotalTransfer = cashSessionsInfo.some((col) => col.name === "total_transfer");
    const hasTotalSales = cashSessionsInfo.some((col) => col.name === "total_sales");
    const hasPaymentCount = cashSessionsInfo.some((col) => col.name === "payment_count");
    // FASE 12.2: Verificar columna close_snapshot
    const hasCloseSnapshot = cashSessionsInfo.some((col) => col.name === "close_snapshot");

    // Verificar si existe tabla manual_transactions
    const tablesCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='manual_transactions'"
    );
    const hasManualTransactionsTable = tablesCheck.length > 0;

    // Verificar si existe tabla products
    const productsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='products'"
    );
    const hasProductsTable = productsCheck.length > 0;

    // Verificar si existen tablas de inventario (Fase 3)
    const inventoryCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'"
    );
    const hasInventoryTable = inventoryCheck.length > 0;
    const inventoryMovementsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_movements'"
    );
    const hasInventoryMovementsTable = inventoryMovementsCheck.length > 0;
    // Verificar si existe tabla audit_log (Fase 5)
    const auditLogCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
    );
    const hasAuditLogTable = auditLogCheck.length > 0;
    // FASE 12.3: Verificar si existe tabla audit_logs (auditoría general)
    const auditLogsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
    );
    const hasAuditLogsTable = auditLogsCheck.length > 0;

    // Verificar campos nuevos (conversion_factor, purchase_qty, purchase_total_cost)
    const ingredientsInfo = await database.all("PRAGMA table_info(ingredients)");
    const hasConversionFactor = ingredientsInfo.some((col) => col.name === "conversion_factor");
    const inventoryMovementsInfo = await database.all("PRAGMA table_info(inventory_movements)");
    const hasPurchaseQty = inventoryMovementsInfo.some((col) => col.name === "purchase_qty");
    const hasPurchaseTotalCost = inventoryMovementsInfo.some((col) => col.name === "purchase_total_cost");

    // FASE 9.2: Verificar cash_session_id en payments
    const paymentsInfo = await database.all("PRAGMA table_info(payments)");
    const hasCashSessionId = paymentsInfo.some((col) => col.name === "cash_session_id");
    // FASE 12.5: Verificar campos de anulación en payments
    const hasPaymentVoidedAt = paymentsInfo.some((col) => col.name === "voided_at");
    const hasPaymentVoidedBy = paymentsInfo.some((col) => col.name === "voided_by");
    const hasPaymentVoidReason = paymentsInfo.some((col) => col.name === "void_reason");
    
    // FASE 12.6: Verificar campos de anulación en order_items (reutilizar orderItemsInfo de línea 483)
    const hasItemVoidedAt = orderItemsInfo.some((col) => col.name === "voided_at");
    const hasItemVoidedBy = orderItemsInfo.some((col) => col.name === "voided_by");
    const hasItemVoidReason = orderItemsInfo.some((col) => col.name === "void_reason");
    
    // FASE 12.6: Verificar campos de cancelación en orders (reutilizar ordersInfo de línea 490)
    const hasCancelledAt = ordersInfo.some((col) => col.name === "cancelled_at");
    const hasCancelledBy = ordersInfo.some((col) => col.name === "cancelled_by");

    if (
      !hasPrice ||
      !hasPaidAt ||
      !hasProductId ||
      !hasIsCustom ||
      !hasArchivedAt ||
      !hasDisabledAt ||
      !hasDisabledReason ||
      !hasDisabledBy ||
      !hasService ||
      !hasBusinessDay ||
      !hasDailyNo ||
      !hasGrossSales ||
      !hasCogsTotal ||
      !hasGrossProfit ||
      !hasCogsPercent ||
      !hasClosingCash ||
      !hasExpectedCash ||
      !hasDiffCash ||
      !hasTotalCash ||
      !hasTotalCard ||
      !hasTotalTransfer ||
      !hasTotalSales ||
      !hasPaymentCount ||
      !hasCloseSnapshot ||
      !hasManualTransactionsTable ||
      !hasProductsTable ||
      !hasInventoryTable ||
      !hasInventoryMovementsTable ||
      !hasAuditLogTable ||
      !hasConversionFactor ||
      !hasPurchaseQty ||
      !hasPurchaseTotalCost ||
      !hasCashSessionId ||
      !hasCancelReason ||
      !hasAuditLogsTable ||
      !hasPaymentVoidedAt ||
      !hasPaymentVoidedBy ||
      !hasPaymentVoidReason ||
      !hasItemVoidedAt ||
      !hasItemVoidedBy ||
      !hasItemVoidReason ||
      !hasCancelledAt ||
      !hasCancelledBy
    ) {
      console.log("🔄 Ejecutando migración automática...");
      await migrateDatabase(database);
    }
  } catch (migrateError) {
    console.error("⚠️  Error en migración automática:", migrateError);
    // Continuar de todas formas
  }

  // FASE F7: ready_at en order_items (cocina plato por plato) — chequeo incondicional
  try {
    const itemsCols = await database.all("PRAGMA table_info(order_items)");
    if (!itemsCols.some((c) => c.name === "ready_at")) {
      console.log("  ➕ Agregando ready_at a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN ready_at DATETIME");
      console.log("  ✅ Campo ready_at agregado a order_items");
    }
  } catch (readyError) {
    console.error("⚠️  Error agregando ready_at:", readyError);
  }

  // FASE F8: descuentos (por orden) y propinas (por pago) — chequeos incondicionales
  try {
    const ordersCols = await database.all("PRAGMA table_info(orders)");
    // FASE F10: cuándo quedó LISTA la orden (métrica pedido → mesa)
    if (!ordersCols.some((c) => c.name === "ready_at")) {
      console.log("  ➕ Agregando ready_at a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN ready_at DATETIME");
      console.log("  ✅ Campo ready_at agregado a orders");
    }
    if (!ordersCols.some((c) => c.name === "discount_amount")) {
      console.log("  ➕ Agregando discount_amount/discount_reason a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0");
      await database.run("ALTER TABLE orders ADD COLUMN discount_reason TEXT");
      console.log("  ✅ Campos de descuento agregados a orders");
    }
    const paymentsCols = await database.all("PRAGMA table_info(payments)");
    if (!paymentsCols.some((c) => c.name === "tip_amount")) {
      console.log("  ➕ Agregando tip_amount a payments...");
      await database.run("ALTER TABLE payments ADD COLUMN tip_amount REAL NOT NULL DEFAULT 0");
      console.log("  ✅ Campo tip_amount agregado a payments");
    }
  } catch (discountError) {
    console.error("⚠️  Error agregando descuento/propina:", discountError);
  }

  console.log("✅ Base de datos inicializada correctamente");
};

// Función de migración (extraída del script migrate.js)
async function migrateDatabase(database) {
  try {
    const ordersInfo = await database.all("PRAGMA table_info(orders)");
    const orderItemsInfo = await database.all("PRAGMA table_info(order_items)");

    const hasArchivedAt = ordersInfo.some((col) => col.name === "archived_at");
    const hasDisabledAt = ordersInfo.some((col) => col.name === "disabled_at");
    const hasDisabledReason = ordersInfo.some(
      (col) => col.name === "disabled_reason"
    );
    const hasDisabledBy = ordersInfo.some((col) => col.name === "disabled_by");
    const hasService = ordersInfo.some((col) => col.name === "service");
    const hasBusinessDay = ordersInfo.some(
      (col) => col.name === "business_day"
    );
    const hasDailyNo = ordersInfo.some((col) => col.name === "daily_no");
    // FASE 9.6: Verificar columnas de cancelación (estandarizado a cancelled_at/cancelled_by)
    const hasCancelReason = ordersInfo.some((col) => col.name === "cancel_reason");
    const hasPrice = orderItemsInfo.some((col) => col.name === "price");
    const hasPaidAt = orderItemsInfo.some((col) => col.name === "paid_at");
    const hasItemVoidedAtMigrate = orderItemsInfo.some((col) => col.name === "voided_at");
    const hasProductId = orderItemsInfo.some((col) => col.name === "product_id");
    const hasIsCustom = orderItemsInfo.some((col) => col.name === "is_custom");

    if (!hasArchivedAt) {
      console.log("  ➕ Agregando archived_at a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN archived_at DATETIME");
    }
    if (!hasDisabledAt) {
      console.log("  ➕ Agregando disabled_at a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN disabled_at DATETIME");
    }
    if (!hasDisabledReason) {
      console.log("  ➕ Agregando disabled_reason a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN disabled_reason TEXT");
    }
    if (!hasDisabledBy) {
      console.log("  ➕ Agregando disabled_by a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN disabled_by INTEGER");
    }
    if (!hasService) {
      console.log("  ➕ Agregando service a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN service TEXT");
    }
    if (!hasBusinessDay) {
      console.log("  ➕ Agregando business_day a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN business_day TEXT");
    }
    if (!hasDailyNo) {
      console.log("  ➕ Agregando daily_no a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN daily_no INTEGER");
    }
    
    // FASE 9.6: Agregar columna de motivo de cancelación
    if (!hasCancelReason) {
      console.log("  ➕ Agregando cancel_reason a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN cancel_reason TEXT");
    }

    if (!hasPrice) {
      console.log("  ➕ Agregando price a order_items...");
      await database.run(
        "ALTER TABLE order_items ADD COLUMN price REAL NOT NULL DEFAULT 0"
      );
    }

    if (!hasPaidAt) {
      console.log("  ➕ Agregando paid_at a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN paid_at DATETIME");
    }

    if (!hasItemVoidedAtMigrate) {
      console.log("  ➕ Agregando voided_at a order_items...");
      await database.run(
        "ALTER TABLE order_items ADD COLUMN voided_at DATETIME"
      );
    }

    if (!hasProductId) {
      console.log("  ➕ Agregando product_id a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN product_id INTEGER");
    }

    if (!hasIsCustom) {
      console.log("  ➕ Agregando is_custom a order_items...");
      await database.run(
        "ALTER TABLE order_items ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0"
      );
      // Marcar items existentes sin product_id como custom
      await database.run(
        "UPDATE order_items SET is_custom = 1 WHERE product_id IS NULL"
      );
    }

    // Actualizar precios de items existentes si no tienen precio
    const itemsWithoutPrice = await database.all(
      "SELECT id, name FROM order_items WHERE price = 0 OR price IS NULL"
    );

    if (itemsWithoutPrice.length > 0) {
      const defaultPrices = {
        "Hamburguesa Clásica": 120,
        "Hamburguesa Doble": 180,
        "Papas Fritas": 60,
        Refresco: 40,
        Agua: 25,
      };

      for (const item of itemsWithoutPrice) {
        const price = defaultPrices[item.name] || 100;
        await database.run("UPDATE order_items SET price = ? WHERE id = ?", [
          price,
          item.id,
        ]);
      }
      console.log(
        `  ✅ ${itemsWithoutPrice.length} items actualizados con precios`
      );
    }

    // Crear tabla manual_transactions si no existe
    const tablesCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='manual_transactions'"
    );
    if (tablesCheck.length === 0) {
      console.log("  ➕ Creando tabla manual_transactions...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS manual_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_date TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('INGRESO', 'EGRESO')),
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          created_by INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id)
        )
      `);
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_manual_transactions_date ON manual_transactions(transaction_date)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_manual_transactions_created ON manual_transactions(created_at)`
      );
      console.log("  ✅ Tabla manual_transactions creada");
    }

    // Crear tabla products si no existe
    const productsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='products'"
    );
    if (productsCheck.length === 0) {
      console.log("  ➕ Creando tabla products...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          variant TEXT,
          is_active INTEGER DEFAULT 1,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("  ✅ Tabla products creada");
    }

    // Crear tablas ingredients y recipes (Fase 2.1)
    const ingredientsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ingredients'"
    );
    if (ingredientsCheck.length === 0) {
      console.log("  ➕ Creando tabla ingredients...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS ingredients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          unit TEXT NOT NULL DEFAULT 'unidad',
          cost_per_unit INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      console.log("  ✅ Tabla ingredients creada");
    }

    const recipesCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'"
    );
    if (recipesCheck.length === 0) {
      console.log("  ➕ Creando tabla recipes...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS recipes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          ingredient_id INTEGER NOT NULL,
          qty_used INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(product_id, ingredient_id),
          FOREIGN KEY(product_id) REFERENCES products(id),
          FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
        )
      `);
      // Triggers para updated_at
      await database.run(`
        CREATE TRIGGER IF NOT EXISTS trg_ingredients_updated
        AFTER UPDATE ON ingredients
        BEGIN
          UPDATE ingredients SET updated_at = datetime('now') WHERE id = NEW.id;
        END
      `);
      await database.run(`
        CREATE TRIGGER IF NOT EXISTS trg_recipes_updated
        AFTER UPDATE ON recipes
        BEGIN
          UPDATE recipes SET updated_at = datetime('now') WHERE id = NEW.id;
        END
      `);
      console.log("  ✅ Tabla recipes creada");
    }

    // Migración: Agregar campos KPI a cash_sessions (Fase 1)
    const cashSessionsInfo = await database.all("PRAGMA table_info(cash_sessions)");
    const hasGrossSales = cashSessionsInfo.some((col) => col.name === "gross_sales");
    const hasOrdersCount = cashSessionsInfo.some((col) => col.name === "orders_count");
    const hasAvgTicket = cashSessionsInfo.some((col) => col.name === "avg_ticket");
    const hasPaymentsByMethod = cashSessionsInfo.some((col) => col.name === "payments_by_method");
    const hasTheoreticalCash = cashSessionsInfo.some((col) => col.name === "theoretical_cash");
    const hasDeclaredCash = cashSessionsInfo.some((col) => col.name === "declared_cash");
    const hasCashDiff = cashSessionsInfo.some((col) => col.name === "cash_diff");
    // Migración Fase 2.3: Verificar campos CMV
    const hasCogsTotal = cashSessionsInfo.some((col) => col.name === "cogs_total");
    const hasGrossProfit = cashSessionsInfo.some((col) => col.name === "gross_profit");
    const hasCogsPercent = cashSessionsInfo.some((col) => col.name === "cogs_percent");

    if (!hasGrossSales) {
      console.log("  ➕ Agregando gross_sales a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN gross_sales REAL DEFAULT 0");
    }
    if (!hasOrdersCount) {
      console.log("  ➕ Agregando orders_count a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN orders_count INTEGER DEFAULT 0");
    }
    if (!hasAvgTicket) {
      console.log("  ➕ Agregando avg_ticket a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN avg_ticket REAL DEFAULT 0");
    }
    if (!hasPaymentsByMethod) {
      console.log("  ➕ Agregando payments_by_method a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN payments_by_method TEXT");
    }
    if (!hasTheoreticalCash) {
      console.log("  ➕ Agregando theoretical_cash a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN theoretical_cash REAL DEFAULT 0");
    }
    if (!hasDeclaredCash) {
      console.log("  ➕ Agregando declared_cash a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN declared_cash REAL");
    }
    if (!hasCashDiff) {
      console.log("  ➕ Agregando cash_diff a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN cash_diff REAL DEFAULT 0");
    }

    // Migración Fase 2.3: Agregar campos CMV a cash_sessions
    if (!hasCogsTotal) {
      console.log("  ➕ Agregando cogs_total a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN cogs_total INTEGER NOT NULL DEFAULT 0");
    }
    if (!hasGrossProfit) {
      console.log("  ➕ Agregando gross_profit a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN gross_profit INTEGER NOT NULL DEFAULT 0");
    }
    if (!hasCogsPercent) {
      console.log("  ➕ Agregando cogs_percent a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN cogs_percent REAL NOT NULL DEFAULT 0");
    }

    // FASE 9.3: Migración - Agregar columnas de cierre a cash_sessions
    // Verificar columnas de cierre usando PRAGMA table_info
    const cashSessionsInfoForClosing = await database.all("PRAGMA table_info(cash_sessions)");
    const hasClosingCash = cashSessionsInfoForClosing.some((col) => col.name === "closing_cash");
    const hasExpectedCash = cashSessionsInfoForClosing.some((col) => col.name === "expected_cash");
    const hasDiffCash = cashSessionsInfoForClosing.some((col) => col.name === "diff_cash");
    const hasTotalCash = cashSessionsInfoForClosing.some((col) => col.name === "total_cash");
    const hasTotalCard = cashSessionsInfoForClosing.some((col) => col.name === "total_card");
    const hasTotalTransfer = cashSessionsInfoForClosing.some((col) => col.name === "total_transfer");
    const hasTotalSales = cashSessionsInfoForClosing.some((col) => col.name === "total_sales");
    const hasPaymentCount = cashSessionsInfoForClosing.some((col) => col.name === "payment_count");
    const hasClosedBy = cashSessionsInfoForClosing.some((col) => col.name === "closed_by");

    // Helper para asegurar columnas de cash_sessions
    const ensureCashSessionColumn = async (name, ddl) => {
      const exists = cashSessionsInfoForClosing.some((col) => col.name === name);
      if (!exists) {
        console.log(`  ➕ Agregando ${name} a cash_sessions...`);
        await database.run(`ALTER TABLE cash_sessions ADD COLUMN ${ddl}`);
        console.log(`  ✅ ${name} agregado a cash_sessions`);
      }
    };

    await ensureCashSessionColumn("closing_cash", "closing_cash REAL");
    await ensureCashSessionColumn("expected_cash", "expected_cash REAL");
    await ensureCashSessionColumn("diff_cash", "diff_cash REAL");
    await ensureCashSessionColumn("total_cash", "total_cash REAL DEFAULT 0");
    await ensureCashSessionColumn("total_card", "total_card REAL DEFAULT 0");
    await ensureCashSessionColumn("total_transfer", "total_transfer REAL DEFAULT 0");
    await ensureCashSessionColumn("total_sales", "total_sales REAL DEFAULT 0");
    await ensureCashSessionColumn("payment_count", "payment_count INTEGER DEFAULT 0");
    // closed_by ya existe en la tabla inicial, pero verificamos por si acaso
    if (!hasClosedBy) {
      console.log("  ➕ Agregando closed_by a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN closed_by INTEGER");
      console.log("  ✅ closed_by agregado a cash_sessions");
    }
    // FASE 12.2: Agregar close_snapshot
    const hasCloseSnapshot = cashSessionsInfoForClosing.some((col) => col.name === "close_snapshot");
    if (!hasCloseSnapshot) {
      console.log("  ➕ Agregando close_snapshot a cash_sessions...");
      await database.run("ALTER TABLE cash_sessions ADD COLUMN close_snapshot TEXT");
      console.log("  ✅ close_snapshot agregado a cash_sessions");
    }

    // FASE 9.2: Migración - Agregar cash_session_id a payments
    const paymentsInfo = await database.all("PRAGMA table_info(payments)");
    const hasCashSessionId = paymentsInfo.some((col) => col.name === "cash_session_id");
    if (!hasCashSessionId) {
      console.log("  ➕ Agregando cash_session_id a payments...");
      await database.run("ALTER TABLE payments ADD COLUMN cash_session_id INTEGER");
      console.log("  ✅ cash_session_id agregado a payments");
    }

    // Migración Fase 3: Crear tablas de inventario
    const inventoryCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory'"
    );
    if (inventoryCheck.length === 0) {
      console.log("  ➕ Creando tabla inventory...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ingredient_id INTEGER NOT NULL UNIQUE,
          stock_qty REAL NOT NULL DEFAULT 0,
          min_stock REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
        )
      `);
      // Trigger para updated_at
      await database.run(`
        CREATE TRIGGER IF NOT EXISTS trg_inventory_updated
        AFTER UPDATE ON inventory
        BEGIN
          UPDATE inventory SET updated_at = datetime('now') WHERE id = NEW.id;
        END
      `);
      console.log("  ✅ Tabla inventory creada");
    }

    const inventoryMovementsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_movements'"
    );
    if (inventoryMovementsCheck.length === 0) {
      console.log("  ➕ Creando tabla inventory_movements...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS inventory_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ingredient_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'ADJUST')),
          qty REAL NOT NULL,
          reason TEXT,
          created_by INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(ingredient_id) REFERENCES ingredients(id),
          FOREIGN KEY(created_by) REFERENCES users(id)
        )
      `);
      // Índices para consultas rápidas
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_inventory_movements_ingredient ON inventory_movements(ingredient_id)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at)`
      );
      console.log("  ✅ Tabla inventory_movements creada");
    }

    // Migración FASE 5: Crear tabla audit_log (para productos)
    const auditLogCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'"
    );
    if (auditLogCheck.length === 0) {
      console.log("  ➕ Creando tabla audit_log...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          action TEXT NOT NULL,
          product_id INTEGER,
          before_json TEXT,
          after_json TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY(user_id) REFERENCES users(id),
          FOREIGN KEY(product_id) REFERENCES products(id)
        )
      `);
      // Índices para consultas rápidas
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_log_product ON audit_log(product_id)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action)`
      );
      console.log("  ✅ Tabla audit_log creada");
    }

    // FASE 12.3: Crear tabla audit_logs (auditoría general del POS)
    const auditLogsCheck = await database.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'"
    );
    if (auditLogsCheck.length === 0) {
      console.log("  ➕ Creando tabla audit_logs...");
      await database.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id INTEGER,
          table_number INTEGER,
          order_id INTEGER,
          user_id INTEGER,
          ip TEXT,
          summary TEXT,
          meta TEXT,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `);
      // Índices para consultas rápidas
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_table_number ON audit_logs(table_number)`
      );
      await database.run(
        `CREATE INDEX IF NOT EXISTS idx_audit_logs_order_id ON audit_logs(order_id)`
      );
      console.log("  ✅ Tabla audit_logs creada");
    }

    // Migración: Agregar conversion_factor a ingredients
    const ingredientsInfo = await database.all("PRAGMA table_info(ingredients)");
    const hasConversionFactor = ingredientsInfo.some((col) => col.name === "conversion_factor");
    if (!hasConversionFactor) {
      console.log("  ➕ Agregando conversion_factor a ingredients...");
      await database.run("ALTER TABLE ingredients ADD COLUMN conversion_factor REAL NOT NULL DEFAULT 1");
      console.log("  ✅ Campo conversion_factor agregado a ingredients");
    }

    // Migración: Agregar campos de compra a inventory_movements
    const inventoryMovementsInfo = await database.all("PRAGMA table_info(inventory_movements)");
    const hasPurchaseQty = inventoryMovementsInfo.some((col) => col.name === "purchase_qty");
    const hasPurchaseTotalCost = inventoryMovementsInfo.some((col) => col.name === "purchase_total_cost");
    if (!hasPurchaseQty) {
      console.log("  ➕ Agregando purchase_qty a inventory_movements...");
      await database.run("ALTER TABLE inventory_movements ADD COLUMN purchase_qty REAL");
      console.log("  ✅ Campo purchase_qty agregado a inventory_movements");
    }
    if (!hasPurchaseTotalCost) {
      console.log("  ➕ Agregando purchase_total_cost a inventory_movements...");
      await database.run("ALTER TABLE inventory_movements ADD COLUMN purchase_total_cost INTEGER");
      console.log("  ✅ Campo purchase_total_cost agregado a inventory_movements");
    }

    // FASE 12.5: Agregar campos de anulación a payments
    // Reutilizar paymentsInfo declarado arriba (línea 979)
    const hasPaymentVoidedAt = paymentsInfo.some((col) => col.name === "voided_at");
    const hasPaymentVoidedBy = paymentsInfo.some((col) => col.name === "voided_by");
    const hasPaymentVoidReason = paymentsInfo.some((col) => col.name === "void_reason");
    
    if (!hasPaymentVoidedAt) {
      console.log("  ➕ Agregando voided_at a payments...");
      await database.run("ALTER TABLE payments ADD COLUMN voided_at TEXT");
      console.log("  ✅ Campo voided_at agregado a payments");
    }
    if (!hasPaymentVoidedBy) {
      console.log("  ➕ Agregando voided_by a payments...");
      await database.run("ALTER TABLE payments ADD COLUMN voided_by INTEGER");
      console.log("  ✅ Campo voided_by agregado a payments");
    }
    if (!hasPaymentVoidReason) {
      console.log("  ➕ Agregando void_reason a payments...");
      await database.run("ALTER TABLE payments ADD COLUMN void_reason TEXT");
      console.log("  ✅ Campo void_reason agregado a payments");
    }

    // FASE 12.6: Agregar campos de anulación a order_items
    // Nota: hasItemVoidedAtMigrate se declara arriba en migrateDatabase
    if (!hasItemVoidedAtMigrate) {
      console.log("  ➕ Agregando voided_at a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN voided_at TEXT");
      console.log("  ✅ Campo voided_at agregado a order_items");
    }
    // Nota: hasItemVoidedBy y hasItemVoidReason no se declaran en migrateDatabase,
    // solo se agregan si no existen (la verificación se hace en initDatabase)
    // Por ahora, agregar directamente si no existen
    const orderItemsInfoMigrate = await database.all("PRAGMA table_info(order_items)");
    const hasItemVoidedByMigrate = orderItemsInfoMigrate.some((col) => col.name === "voided_by");
    const hasItemVoidReasonMigrate = orderItemsInfoMigrate.some((col) => col.name === "void_reason");
    
    if (!hasItemVoidedByMigrate) {
      console.log("  ➕ Agregando voided_by a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN voided_by INTEGER");
      console.log("  ✅ Campo voided_by agregado a order_items");
    }
    if (!hasItemVoidReasonMigrate) {
      console.log("  ➕ Agregando void_reason a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN void_reason TEXT");
      console.log("  ✅ Campo void_reason agregado a order_items");
    }

    // FASE F7: cocina plato por plato — cuándo se terminó cada item
    const hasItemReadyAt = orderItemsInfoMigrate.some((col) => col.name === "ready_at");
    if (!hasItemReadyAt) {
      console.log("  ➕ Agregando ready_at a order_items...");
      await database.run("ALTER TABLE order_items ADD COLUMN ready_at DATETIME");
      console.log("  ✅ Campo ready_at agregado a order_items");
    }

    // FASE 12.6: Agregar campos de cancelación a orders
    // Nota: hasCancelledAt y hasCancelledBy se declaran en initDatabase, verificar aquí también
    const hasCancelledAtMigrate = ordersInfo.some((col) => col.name === "cancelled_at");
    const hasCancelledByMigrate = ordersInfo.some((col) => col.name === "cancelled_by");
    
    if (!hasCancelledAtMigrate) {
      console.log("  ➕ Agregando cancelled_at a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN cancelled_at TEXT");
      console.log("  ✅ Campo cancelled_at agregado a orders");
    }
    if (!hasCancelledByMigrate) {
      console.log("  ➕ Agregando cancelled_by a orders...");
      await database.run("ALTER TABLE orders ADD COLUMN cancelled_by INTEGER");
      console.log("  ✅ Campo cancelled_by agregado a orders");
    }

    // FASE 16.2.3: Migración del CHECK constraint de orders.status para incluir 'PAGADA'
    try {
      const ordersTableSql = await database.get(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'"
      );
      
      if (ordersTableSql && ordersTableSql.sql) {
        const sql = ordersTableSql.sql;
        // Verificar si el CHECK constraint NO incluye 'PAGADA'
        const hasPagadaInCheck = sql.includes("'PAGADA'") || sql.includes('"PAGADA"');
        
        if (!hasPagadaInCheck) {
          console.log("  🔄 Actualizando CHECK constraint de orders.status para incluir 'PAGADA'...");
          
          // Obtener todas las columnas de la tabla actual
          const currentColumns = await database.all("PRAGMA table_info(orders)");
          
          // Construir lista de columnas para el INSERT
          const columnNames = currentColumns.map(col => col.name).filter(name => name !== 'id');
          const columnList = columnNames.join(', ');
          const placeholders = columnNames.map(() => '?').join(', ');
          
          // Desactivar foreign keys temporalmente
          await database.run("PRAGMA foreign_keys=off");
          await database.run("BEGIN TRANSACTION");
          
          // Crear tabla nueva con CHECK actualizado
          const newTableSql = sql.replace(
            /CHECK\(status\s+IN\s*\([^)]+\)\)/i,
            "CHECK(status IN ('NUEVO','EN_PREP','LISTO','PAGADA','CANCELADO'))"
          );
          
          await database.run(newTableSql.replace('CREATE TABLE orders', 'CREATE TABLE orders_new'));
          
          // Copiar datos
          await database.run(`INSERT INTO orders_new (${columnList}) SELECT ${columnList} FROM orders`);
          
          // Reemplazar tabla
          await database.run("DROP TABLE orders");
          await database.run("ALTER TABLE orders_new RENAME TO orders");
          
          // Reactivar foreign keys
          await database.run("COMMIT");
          await database.run("PRAGMA foreign_keys=on");
          
          console.log("  ✅ CHECK constraint de orders.status actualizado para incluir 'PAGADA'");

          // Recreate indexes lost during table recreation
          await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
          await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id)`);
          await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by)`);
          await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at)`);
          await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_business_day ON orders(business_day)`);
          await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service)`);
          console.log("  ✅ Índices de orders recreados");
        }
      }
    } catch (checkError) {
      console.error("  ⚠️  Error al verificar/actualizar CHECK constraint:", checkError);
      // No lanzar error, continuar con la migración
    }

    // Ensure indexes exist (may have been lost during table recreation)
    await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id)`);
    await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by)`);
    await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at)`);
    await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_business_day ON orders(business_day)`);
    await database.run(`CREATE INDEX IF NOT EXISTS idx_orders_service ON orders(service)`);
    await database.run(`CREATE INDEX IF NOT EXISTS idx_payments_cash_session ON payments(cash_session_id)`);

    console.log("✅ Migración automática completada");
  } catch (error) {
    console.error("❌ Error en migración:", error);
    throw error;
  }
}
