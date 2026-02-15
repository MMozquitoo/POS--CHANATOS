/**
 * Script para actualizar los precios del menú según los valores oficiales
 * Moneda: Pesos Colombianos (COP)
 * Ejecutar: node scripts/update-menu-prices.js
 */

import { getDb, initDatabase } from "../db/database.js";

const priceUpdates = [
  // HAMBURGUESAS
  { name: "Hamburguesa Clásica", variant: "Sencillo", price: 12000 },
  { name: "Hamburguesa Clásica", variant: "Combo", price: 16000 },
  { name: "Hamburguesa Chanata", variant: "Sencillo", price: 16000 },
  { name: "Hamburguesa Chanata", variant: "Combo", price: 20000 },
  { name: "Hamburguesa Doble Carne", variant: "Sencillo", price: 18000 },
  { name: "Hamburguesa Doble Carne", variant: "Combo", price: 22000 },
  // PERROS CALIENTES
  { name: "Perro Clásico", variant: "Sencillo", price: 8000 },
  { name: "Perro Especial", variant: "Sencillo", price: 10000 },
  // SÁNDWICH
  { name: "Sándwich de Pollo", variant: "Sencillo", price: 10000 },
  // PAPAS
  { name: "Porción de Papas Sencilla", variant: null, price: 5000 },
  { name: "Salchipapa Sencilla", variant: null, price: 7000 },
  { name: "Papa LoKa", variant: null, price: 18000 },
  // FILETES
  { name: "Filete de Pollo", variant: "Sin Papas", price: 12000 },
  { name: "Filete de Pollo", variant: "Con Papas", price: 16000 },
  { name: "Filete de Cerdo", variant: "Sin Papas", price: 12000 },
  { name: "Filete de Cerdo", variant: "Con Papas", price: 16000 },
  // BEBIDAS
  { name: "Pepsi Personal", variant: "250 ml", price: 2000 },
  { name: "Jugo Hit", variant: "500 ml", price: 3500 },
  { name: "Mr Tea", variant: "500 ml", price: 3500 },
  { name: "Coca-Cola Personal", variant: "250 ml", price: 4000 },
  { name: "Pepsi", variant: "1 L", price: 5000 },
  // CERVEZAS
  { name: "Cerveza Andina", variant: null, price: 4000 },
  { name: "Cerveza Poker", variant: null, price: 5000 },
  { name: "Cerveza Heineken", variant: null, price: 5000 },
  { name: "Cerveza Club Colombia", variant: null, price: 6000 },
  // JUGOS NATURALES
  { name: "Jugo Natural en Agua", variant: null, price: 7000 },
  { name: "Jugo Natural en Leche", variant: null, price: 8000 },
  // OTROS
  { name: "Michelada", variant: null, price: 8000 },
  { name: "Limonada Natural", variant: null, price: 10000 },
];

async function updateMenuPrices() {
  try {
    console.log("🔄 Inicializando base de datos...");
    await initDatabase();
    
    const db = getDb();
    console.log("📝 Actualizando precios del menú...");
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    for (const update of priceUpdates) {
      if (update.variant) {
        const result = await db.run(
          "UPDATE products SET price = ? WHERE name = ? AND variant = ?",
          [update.price, update.name, update.variant]
        );
        if (result.changes > 0) {
          updatedCount++;
          console.log(`  ✅ ${update.name} (${update.variant}): ${update.price} COP`);
        } else {
          notFoundCount++;
          console.log(`  ⚠️  No encontrado: ${update.name} (${update.variant})`);
        }
      } else {
        const result = await db.run(
          "UPDATE products SET price = ? WHERE name = ? AND (variant IS NULL OR variant = '')",
          [update.price, update.name]
        );
        if (result.changes > 0) {
          updatedCount++;
          console.log(`  ✅ ${update.name}: ${update.price} COP`);
        } else {
          notFoundCount++;
          console.log(`  ⚠️  No encontrado: ${update.name}`);
        }
      }
    }
    
    console.log("\n📊 Resumen:");
    console.log(`  ✅ Productos actualizados: ${updatedCount}`);
    if (notFoundCount > 0) {
      console.log(`  ⚠️  Productos no encontrados: ${notFoundCount}`);
    }
    console.log("✅ Actualización de precios completada");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error actualizando precios:", error);
    process.exit(1);
  }
}

updateMenuPrices();
