// backend/scripts/import-instagram-library.js
//
// Importa una campaña ya generada (carpeta con Otros/calendario.json e
// Imágenes/, el formato que arma la campaña "30 días") a la biblioteca de
// Instagram del POS (instagram_library): sube cada imagen a Vercel Blob y
// guarda título + tipo (POST/STORY). Después aparecen en Administración →
// Instagram, listas para arrastrar al calendario.
//
// Uso: cd backend && node scripts/import-instagram-library.js "<carpeta>"
// (la carpeta debe tener Otros/calendario.json e Imágenes/ adentro)

import fs from "fs";
import path from "path";
import { initDatabase, getDb } from "../db/database.js";
import { subirImagenInstagram } from "../services/instagramBlob.js";

const EXT_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function importarLista(db, carpeta, lista, type) {
  let importados = 0;
  for (const item of lista) {
    const nombreArchivo = path.basename(item.file);
    const imgPath = path.join(carpeta, "Imágenes", nombreArchivo);
    if (!fs.existsSync(imgPath)) {
      console.warn(`  ⚠️  No existe ${imgPath}, se salta`);
      continue;
    }
    const buffer = fs.readFileSync(imgPath);
    const ext = path.extname(nombreArchivo).toLowerCase();
    const contentType = EXT_MIME[ext] || "image/jpeg";
    const url = await subirImagenInstagram(buffer, contentType, nombreArchivo);
    await db.run(
      `INSERT INTO instagram_library (type, caption, image_url, label, day_order) VALUES (?, ?, ?, ?, ?)`,
      [type, item.headline || null, url, `Día ${item.day}${item.series ? ` · ${item.series}` : ""}`, item.day || null]
    );
    importados += 1;
    console.log(`  ✅ ${type === "STORY" ? "Historia" : "Publicación"} día ${item.day}: ${item.headline}`);
  }
  return importados;
}

async function run() {
  const carpeta = process.argv[2];
  if (!carpeta) {
    console.error('Uso: node scripts/import-instagram-library.js "<carpeta con Otros/calendario.json>"');
    process.exit(1);
  }

  const calendarioPath = path.join(carpeta, "Otros", "calendario.json");
  if (!fs.existsSync(calendarioPath)) {
    console.error(`❌ No se encontró ${calendarioPath}`);
    process.exit(1);
  }
  const calendario = JSON.parse(fs.readFileSync(calendarioPath, "utf-8"));

  await initDatabase();
  const db = getDb();

  console.log(`Importando ${calendario.feed?.length || 0} publicaciones...`);
  const nPosts = await importarLista(db, carpeta, calendario.feed || [], "POST");

  console.log(`Importando ${calendario.stories?.length || 0} historias...`);
  const nStories = await importarLista(db, carpeta, calendario.stories || [], "STORY");

  console.log(`\n✅ Listo: ${nPosts} publicaciones y ${nStories} historias en la biblioteca de Instagram.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Error importando la biblioteca de Instagram:", err);
  process.exit(1);
});
