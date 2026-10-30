// backend/services/instagramPoller.js
//
// PUBLICACIÓN PROGRAMADA EN INSTAGRAM (2026-10-29): revisa cada cierto
// intervalo si hay publicaciones/historias en instagram_posts con
// status='PENDIENTE' y scheduled_at <= ahora, y las publica. La imagen ya
// quedó subida a Vercel Blob al crear el registro (routes/instagram.js); acá
// solo falta llamar a la API de Instagram.
//
// MISMO PATRÓN que rappiPoller.js: loop auto-programado con setTimeout (no
// setInterval, para que un ciclo lento no se monte sobre el siguiente).
// No-op sin INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID: una instalación sin
// esas variables arranca igual, la pantalla de Instagram avisa que falta
// configurar.

import { getDb } from "../db/database.js";
import { toBogotaSQLiteTimestamp } from "../utils/timezone.js";
import { instagramConfigurado, publicarEnInstagram } from "./instagramPublisher.js";

const POLL_INTERVAL_MS = parseInt(process.env.INSTAGRAM_POLL_INTERVAL_MS || "60000", 10);

// Publica UNA fila ya en PENDIENTE y actualiza su estado. Usado por el ciclo
// del poller y, para "publicar ahora", directo desde routes/instagram.js
// (así no hay que esperar hasta el próximo ciclo de 60s).
export async function publicarUnPost(db, post) {
  try {
    const { mediaId, permalink } = await publicarEnInstagram({
      imageUrl: post.image_url,
      caption: post.caption,
      type: post.type,
    });
    await db.run(
      `UPDATE instagram_posts SET status = 'PUBLICADO', ig_media_id = ?, permalink = ?, published_at = ?, error_message = NULL WHERE id = ?`,
      [mediaId, permalink, toBogotaSQLiteTimestamp(new Date()), post.id]
    );
    console.log(`✅ Instagram: ${post.type === "STORY" ? "historia" : "publicación"} #${post.id} publicada (media ${mediaId})`);
    return true;
  } catch (err) {
    await db.run(
      `UPDATE instagram_posts SET status = 'ERROR', error_message = ? WHERE id = ?`,
      [err.message, post.id]
    );
    console.error(`⚠️  Instagram: error publicando #${post.id}:`, err.message);
    return false;
  }
}

async function procesarPendientes() {
  const db = getDb();
  const pendientes = await db.all(
    `SELECT * FROM instagram_posts WHERE status = 'PENDIENTE' AND scheduled_at <= ? ORDER BY scheduled_at ASC`,
    [toBogotaSQLiteTimestamp(new Date())]
  );

  for (const post of pendientes) {
    await publicarUnPost(db, post);
  }
}

export function startInstagramPoller() {
  if (!instagramConfigurado()) {
    console.log(
      "ℹ️  Publicación programada en Instagram desactivada (falta INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID)"
    );
    return;
  }

  console.log(`📸 Poller de Instagram activo — revisa cada ${POLL_INTERVAL_MS / 1000}s`);

  const loop = async () => {
    try {
      await procesarPendientes();
    } catch (err) {
      console.error("⚠️  Error en el ciclo del poller de Instagram:", err.message);
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  };

  loop();
}
