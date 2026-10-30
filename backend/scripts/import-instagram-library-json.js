// backend/scripts/import-instagram-library-json.js
//
// Carga la biblioteca de Instagram desde un JSON ya exportado (ver
// scripts/instagram-library-30-dias.json, generado una vez con
// import-instagram-library.js contra el Drive del dueño). NO sube imágenes:
// usa las URLs de Vercel Blob tal cual, así que no hace falta tener la
// carpeta original de fotos en este equipo. Idempotente: si una URL ya está
// en la biblioteca, se salta (se puede correr de nuevo sin duplicar).
//
// Uso: cd backend && node scripts/import-instagram-library-json.js scripts/instagram-library-30-dias.json

import fs from "fs";
import { initDatabase, getDb } from "../db/database.js";

async function run() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error("Uso: node scripts/import-instagram-library-json.js <archivo.json>");
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(archivo, "utf-8"));

  await initDatabase();
  const db = getDb();

  let nuevos = 0;
  let saltados = 0;
  for (const item of items) {
    const existe = await db.get(`SELECT id FROM instagram_library WHERE image_url = ?`, [item.image_url]);
    if (existe) {
      saltados += 1;
      continue;
    }
    await db.run(
      `INSERT INTO instagram_library (type, caption, image_url, label, day_order) VALUES (?, ?, ?, ?, ?)`,
      [item.type, item.caption || null, item.image_url, item.label || null, item.day_order || null]
    );
    nuevos += 1;
  }

  console.log(`✅ Listo: ${nuevos} piezas nuevas, ${saltados} ya existían.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Error importando la biblioteca de Instagram:", err);
  process.exit(1);
});
