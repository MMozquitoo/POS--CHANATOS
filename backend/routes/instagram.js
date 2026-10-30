// backend/routes/instagram.js
//
// INSTAGRAM (2026-10-29, calendario 2026-10-30): Administración → Instagram
// es un calendario donde se arman publicaciones/historias (nuevas o desde la
// biblioteca ya generada) y se programan; instagramPoller.js las publica
// solas a la hora indicada. La imagen llega como data URL (igual que el logo
// del negocio en settings.js) y se sube de una vez a Vercel Blob — así el
// poller solo tiene que llamar a la API de Instagram con la URL ya lista.

import express from "express";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { toBogotaSQLiteTimestamp, getBogotaTime } from "../utils/timezone.js";
import { subirImagenInstagram } from "../services/instagramBlob.js";
import { instagramConfigurado, borrarDeInstagram } from "../services/instagramPublisher.js";
import { publicarUnPost } from "../services/instagramPoller.js";

const router = express.Router();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EXT_POR_TIPO = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// "2026-10-30T14:30" (datetime-local, ya en hora de Bogotá: el celular/PC del
// restaurante está en esa zona) → "2026-10-30 14:30:00" para SQLite.
function parsearFechaProgramada(valor) {
  const m = String(valor || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/);
  if (!m) return null;
  return `${m[1]} ${m[2]}${m[3] || ":00"}`;
}

// GET /api/instagram/status — para que la pantalla avise si falta configurar
router.get("/status", requireAuth, requireRole("CAJA"), async (req, res) => {
  res.json({ configurado: instagramConfigurado() });
});

// GET /api/instagram/library — banco de piezas ya generadas (ver scripts/import-instagram-library.js)
router.get("/library", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const items = await db.all(
      `SELECT * FROM instagram_library ORDER BY day_order ASC, id ASC`
    );
    res.json({ items });
  } catch (error) {
    console.error("Error listando la biblioteca de Instagram:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/instagram/posts
router.get("/posts", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const posts = await db.all(
      `SELECT * FROM instagram_posts ORDER BY scheduled_at DESC LIMIT 400`
    );
    res.json({ posts });
  } catch (error) {
    console.error("Error listando publicaciones de Instagram:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST /api/instagram/posts — crea una publicación/historia programada, desde
// una imagen nueva (image: data URL) o desde la biblioteca (libraryId).
router.post("/posts", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    if (!instagramConfigurado()) {
      return res.status(503).json({
        error: "Instagram no está configurado en este servidor (falta el token de acceso).",
      });
    }

    const db = getDb();
    const { type, caption, image, libraryId, scheduledAt } = req.body;

    let tipoFinal = type;
    let imageUrl;
    let captionFinal;

    if (libraryId) {
      const item = await db.get(`SELECT * FROM instagram_library WHERE id = ?`, [libraryId]);
      if (!item) return res.status(404).json({ error: "No existe esa pieza en la biblioteca" });
      tipoFinal = item.type;
      imageUrl = item.image_url;
      captionFinal = caption !== undefined ? caption : item.caption;
    } else {
      if (!["POST", "STORY"].includes(type)) {
        return res.status(400).json({ error: "type debe ser POST o STORY" });
      }
      const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(image || "");
      if (!match) {
        return res.status(400).json({ error: "La imagen debe ser PNG, JPG o WEBP" });
      }
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > MAX_IMAGE_BYTES) {
        return res.status(400).json({ error: "La imagen es muy pesada (máximo 8 MB)" });
      }
      const ext = EXT_POR_TIPO[match[1]];
      const nombreArchivo = `${Date.now()}-${type.toLowerCase()}.${ext}`;
      imageUrl = await subirImagenInstagram(buffer, match[1], nombreArchivo);
      captionFinal = caption || null;
    }

    if (tipoFinal === "STORY") captionFinal = null;

    let scheduledTimestamp;
    if (!scheduledAt) {
      scheduledTimestamp = toBogotaSQLiteTimestamp(getBogotaTime());
    } else {
      scheduledTimestamp = parsearFechaProgramada(scheduledAt);
      if (!scheduledTimestamp) {
        return res.status(400).json({ error: "Fecha/hora programada inválida" });
      }
    }

    const result = await db.run(
      `INSERT INTO instagram_posts (type, caption, image_url, scheduled_at, status, library_id, created_by, created_at)
       VALUES (?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)`,
      [
        tipoFinal,
        captionFinal,
        imageUrl,
        scheduledTimestamp,
        libraryId || null,
        req.user.id,
        toBogotaSQLiteTimestamp(getBogotaTime()),
      ]
    );

    // "Publicar ahora": no hacer esperar al próximo ciclo del poller (60s)
    if (scheduledTimestamp <= toBogotaSQLiteTimestamp(getBogotaTime())) {
      const recienCreado = await db.get(`SELECT * FROM instagram_posts WHERE id = ?`, [result.lastID]);
      await publicarUnPost(db, recienCreado);
    }

    const post = await db.get(`SELECT * FROM instagram_posts WHERE id = ?`, [result.lastID]);
    res.status(201).json({ post });
  } catch (error) {
    console.error("Error creando publicación de Instagram:", error);
    res.status(500).json({ error: error.message || "Error interno del servidor" });
  }
});

// PATCH /api/instagram/posts/:id — mover de fecha (arrastrar en el
// calendario) o editar el texto. Solo mientras no esté publicada; un ERROR
// se puede reprogramar (vuelve a PENDIENTE y el poller la reintenta).
router.patch("/posts/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const post = await db.get(`SELECT * FROM instagram_posts WHERE id = ?`, [req.params.id]);
    if (!post) return res.status(404).json({ error: "No existe esa publicación" });
    if (post.status === "PUBLICADO") {
      return res.status(409).json({ error: "Ya está publicada; no se puede mover ni editar" });
    }

    const updates = { status: "PENDIENTE", error_message: null };

    if (req.body.scheduledAt !== undefined) {
      const ts = parsearFechaProgramada(req.body.scheduledAt);
      if (!ts) return res.status(400).json({ error: "Fecha/hora inválida" });
      updates.scheduled_at = ts;
    }
    if (req.body.caption !== undefined && post.type !== "STORY") {
      updates.caption = req.body.caption || null;
    }

    const campos = Object.keys(updates);
    await db.run(
      `UPDATE instagram_posts SET ${campos.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
      [...campos.map((c) => updates[c]), req.params.id]
    );

    const actualizado = await db.get(`SELECT * FROM instagram_posts WHERE id = ?`, [req.params.id]);

    // Si quedó programada para "ya" (ej. se movió a hoy a una hora pasada), publicar de una vez
    if (actualizado.status === "PENDIENTE" && actualizado.scheduled_at <= toBogotaSQLiteTimestamp(getBogotaTime())) {
      await publicarUnPost(db, actualizado);
    }

    const final = await db.get(`SELECT * FROM instagram_posts WHERE id = ?`, [req.params.id]);
    res.json({ post: final });
  } catch (error) {
    console.error("Error editando publicación de Instagram:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /api/instagram/posts/:id — cancela una pendiente, o borra una ya
// publicada (de Instagram y del POS). Si falla el borrado en Instagram no se
// toca el registro local, para no perder el rastro de algo que sigue público.
router.delete("/posts/:id", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const db = getDb();
    const post = await db.get(`SELECT * FROM instagram_posts WHERE id = ?`, [req.params.id]);
    if (!post) return res.status(404).json({ error: "No existe esa publicación" });

    if (post.status === "PUBLICADO" && post.ig_media_id) {
      try {
        await borrarDeInstagram(post.ig_media_id);
      } catch (error) {
        return res.status(502).json({ error: error.message || "No se pudo borrar de Instagram" });
      }
    }

    await db.run(`DELETE FROM instagram_posts WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error borrando publicación de Instagram:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
