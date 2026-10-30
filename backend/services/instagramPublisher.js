// backend/services/instagramPublisher.js
//
// PUBLICACIÓN EN INSTAGRAM (2026-10-29): la cuenta @chanatoss ya quedó
// conectada como activo del portfolio de negocio "Chanatos" en Meta Business,
// con un token de usuario del sistema (nunca caduca, permiso
// instagram_content_publish). El flujo de la API de Instagram (vía
// graph.facebook.com) es: crear un "contenedor" con la imagen (ya debe estar
// en una URL pública, ver instagramBlob.js) y luego publicarlo. Para
// historias se manda media_type=STORIES (sin texto: Instagram no muestra
// caption en historias subidas por la API).
//
// No-op sin configuración: una instalación sin estas variables no publica
// nada (la pantalla de Instagram avisa que falta configurar).

const GRAPH_BASE = "https://graph.facebook.com/v23.0";

function token() {
  return process.env.INSTAGRAM_ACCESS_TOKEN || "";
}

function accountId() {
  return process.env.INSTAGRAM_ACCOUNT_ID || "";
}

export function instagramConfigurado() {
  return !!(token() && accountId());
}

async function llamarGraph(path, params) {
  const res = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Instagram respondió HTTP ${res.status}`);
  }
  return data;
}

// type: 'POST' | 'STORY'
export async function publicarEnInstagram({ imageUrl, caption, type }) {
  if (!instagramConfigurado()) {
    throw new Error("Falta configurar INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID en el servidor");
  }
  const params = { access_token: token(), image_url: imageUrl };
  if (type === "STORY") {
    params.media_type = "STORIES";
  } else if (caption) {
    params.caption = caption;
  }
  const contenedor = await llamarGraph(`${accountId()}/media`, params);
  const publicado = await llamarGraph(`${accountId()}/media_publish`, {
    access_token: token(),
    creation_id: contenedor.id,
  });

  // Best-effort: el link real para "Ver en Instagram" desde el POS. Si falla
  // (ej. historia que ya expiró de los 24h) no bloquea la publicación.
  let permalink = null;
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${publicado.id}?fields=permalink&access_token=${encodeURIComponent(token())}`
    );
    const data = await res.json();
    permalink = data?.permalink || null;
  } catch {
    /* ignorar */
  }

  return { mediaId: publicado.id, permalink };
}

export async function borrarDeInstagram(mediaId) {
  if (!instagramConfigurado()) {
    throw new Error("Falta configurar INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID en el servidor");
  }
  const res = await fetch(`${GRAPH_BASE}/${mediaId}?access_token=${encodeURIComponent(token())}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error?.message || "No se pudo borrar la publicación de Instagram");
  }
  return true;
}
