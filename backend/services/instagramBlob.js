// backend/services/instagramBlob.js
//
// Instagram exige una URL publica (https) para la imagen de un post/historia:
// no acepta subir el archivo directo. El POS vive en la red local del
// restaurante, sin IP publica, asi que la imagen se sube primero a Vercel
// Blob (un store gratis en la cuenta del dueño) y se usa esa URL.
//
// @vercel/blob se carga DIFERIDO (mismo patron que exceljs en backup.js): un
// servidor actualizado por el boton "Buscar actualizaciones" no reinstala
// node_modules, asi que sin esto el POS seguiria arrancando igual si faltara.

async function cargarBlob() {
  try {
    return await import("@vercel/blob");
  } catch {
    return null;
  }
}

export async function subirImagenInstagram(buffer, contentType, nombreArchivo) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error("Falta configurar BLOB_READ_WRITE_TOKEN en el servidor");
  }
  const mod = await cargarBlob();
  if (!mod) {
    throw new Error(
      "Esta version del servidor no tiene el modulo de Vercel Blob. Instala la version nueva del POS."
    );
  }
  const { put } = mod;
  const { url } = await put(`instagram/${nombreArchivo}`, buffer, {
    access: "public",
    contentType,
    token,
    addRandomSuffix: true,
  });
  return url;
}
