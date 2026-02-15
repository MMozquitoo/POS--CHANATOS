import { getDb } from "../db/database.js";

async function migrate() {
  const db = getDb();

  console.log("🔄 Iniciando migración de base de datos...");

  try {
    // Verificar si las columnas ya existen
    const ordersInfo = await db.all("PRAGMA table_info(orders)");
    const orderItemsInfo = await db.all("PRAGMA table_info(order_items)");

    const hasArchivedAt = ordersInfo.some((col) => col.name === "archived_at");
    const hasDisabledAt = ordersInfo.some((col) => col.name === "disabled_at");
    const hasDisabledReason = ordersInfo.some(
      (col) => col.name === "disabled_reason"
    );
    const hasDisabledBy = ordersInfo.some((col) => col.name === "disabled_by");
    const hasService = ordersInfo.some((col) => col.name === "service");
    const hasBusinessDay = ordersInfo.some((col) => col.name === "business_day");
    const hasDailyNo = ordersInfo.some((col) => col.name === "daily_no");
    const hasPrice = orderItemsInfo.some((col) => col.name === "price");
    const hasPaidAt = orderItemsInfo.some((col) => col.name === "paid_at");
    const hasVoidedAt = orderItemsInfo.some((col) => col.name === "voided_at");

    // Agregar archived_at a orders si no existe
    if (!hasArchivedAt) {
      console.log("  ➕ Agregando archived_at a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN archived_at DATETIME");
      console.log("  ✅ archived_at agregado");
    } else {
      console.log("  ⏭️  archived_at ya existe en orders");
    }

    if (!hasDisabledAt) {
      console.log("  ➕ Agregando disabled_at a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN disabled_at DATETIME");
      console.log("  ✅ disabled_at agregado");
    } else {
      console.log("  ⏭️  disabled_at ya existe en orders");
    }

    if (!hasDisabledReason) {
      console.log("  ➕ Agregando disabled_reason a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN disabled_reason TEXT");
      console.log("  ✅ disabled_reason agregado");
    } else {
      console.log("  ⏭️  disabled_reason ya existe en orders");
    }

    if (!hasDisabledBy) {
      console.log("  ➕ Agregando disabled_by a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN disabled_by INTEGER");
      console.log("  ✅ disabled_by agregado");
    } else {
      console.log("  ⏭️  disabled_by ya existe en orders");
    }

    if (!hasService) {
      console.log("  ➕ Agregando service a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN service TEXT");
      console.log("  ✅ service agregado");
    } else {
      console.log("  ⏭️  service ya existe en orders");
    }

    if (!hasBusinessDay) {
      console.log("  ➕ Agregando business_day a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN business_day TEXT");
      console.log("  ✅ business_day agregado");
    } else {
      console.log("  ⏭️  business_day ya existe en orders");
    }

    if (!hasDailyNo) {
      console.log("  ➕ Agregando daily_no a orders...");
      await db.run("ALTER TABLE orders ADD COLUMN daily_no INTEGER");
      console.log("  ✅ daily_no agregado");
    } else {
      console.log("  ⏭️  daily_no ya existe en orders");
    }

    // Agregar price a order_items si no existe
    if (!hasPrice) {
      console.log("  ➕ Agregando price a order_items...");
      await db.run(
        "ALTER TABLE order_items ADD COLUMN price REAL NOT NULL DEFAULT 0"
      );
      console.log("  ✅ price agregado");
    } else {
      console.log("  ⏭️  price ya existe en order_items");
    }

    // Agregar paid_at a order_items si no existe
    if (!hasPaidAt) {
      console.log("  ➕ Agregando paid_at a order_items...");
      await db.run("ALTER TABLE order_items ADD COLUMN paid_at DATETIME");
      console.log("  ✅ paid_at agregado");
    } else {
      console.log("  ⏭️  paid_at ya existe en order_items");
    }

    // Agregar voided_at a order_items si no existe
    if (!hasVoidedAt) {
      console.log("  ➕ Agregando voided_at a order_items...");
      await db.run("ALTER TABLE order_items ADD COLUMN voided_at DATETIME");
      console.log("  ✅ voided_at agregado");
    } else {
      console.log("  ⏭️  voided_at ya existe en order_items");
    }

    // Actualizar precios de items existentes si no tienen precio
    console.log("  🔄 Actualizando precios de items existentes...");
    const itemsWithoutPrice = await db.all(
      "SELECT id, name FROM order_items WHERE price = 0 OR price IS NULL"
    );

    if (itemsWithoutPrice.length > 0) {
      // Precios por defecto (deberías ajustarlos según tu menú)
      const defaultPrices = {
        "Hamburguesa Clásica": 120,
        "Hamburguesa Doble": 180,
        "Papas Fritas": 60,
        Refresco: 40,
        Agua: 25,
      };

      for (const item of itemsWithoutPrice) {
        const price = defaultPrices[item.name] || 100;
        await db.run("UPDATE order_items SET price = ? WHERE id = ?", [
          price,
          item.id,
        ]);
      }
      console.log(
        `  ✅ ${itemsWithoutPrice.length} items actualizados con precios`
      );
    } else {
      console.log("  ⏭️  No hay items sin precio");
    }

    console.log("✅ Migración completada exitosamente");
  } catch (error) {
    console.error("❌ Error en migración:", error);
    throw error;
  }
}

migrate()
  .then(() => {
    console.log("✅ Migración finalizada");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error fatal en migración:", error);
    process.exit(1);
  });
