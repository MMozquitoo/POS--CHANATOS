import { getDb } from "../db/database.js";

async function resetDay() {
  const db = getDb();

  console.log("🧹 Reset del día: borrando órdenes/pagos/caja (mantiene users y tables)...");

  try {
    await db.run("DELETE FROM payments");
    await db.run("DELETE FROM order_items");
    await db.run("DELETE FROM orders");
    await db.run("DELETE FROM cash_sessions");

    // Resetear autoincrement (opcional, deja IDs limpios para pruebas)
    await db.run(
      "DELETE FROM sqlite_sequence WHERE name IN ('payments','order_items','orders','cash_sessions')"
    );

    console.log("✅ Listo: sistema limpio para probar hoy");
  } catch (error) {
    console.error("❌ Error reseteando:", error);
    process.exit(1);
  }
}

resetDay().then(() => process.exit(0));


