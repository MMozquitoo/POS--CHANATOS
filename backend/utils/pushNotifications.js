// Notificaciones push (Firebase Cloud Messaging) para celulares Android.
//
// Objetivo: que suene una notificación aunque la pantalla esté apagada o la
// app cerrada (Socket.IO no alcanza a hacer eso: Doze/App Standby suspende la
// conexión). Esto requiere credenciales reales de Firebase que el DUEÑO debe
// generar manualmente (ver guía en el reporte de esta tarea) — hasta que ese
// archivo exista, este módulo es un no-op silencioso: el POS debe arrancar y
// funcionar 100% normal sin Firebase configurado.
//
// Archivo de credenciales de cuenta de servicio (NO se versiona — está en
// .gitignore). Ruta configurable por variable de entorno.

import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getDb } from "../db/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  join(__dirname, "../data/firebase-service-account.json");

let messaging = null; // admin.messaging(), o null si no hay credenciales
let warnedOnce = false;

function warnOnce() {
  if (warnedOnce) return;
  warnedOnce = true;
  console.log(
    "🔕 Push notifications deshabilitadas (falta configurar Firebase: " +
      SERVICE_ACCOUNT_PATH +
      ")"
  );
}

// Inicialización perezosa (best-effort): se intenta UNA vez al primer uso, no
// al importar el módulo, así el import nunca puede tumbar el arranque del POS.
let initAttempted = false;

async function ensureInitialized() {
  if (initAttempted) return messaging;
  initAttempted = true;

  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    warnOnce();
    return null;
  }

  try {
    const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
    const admin = await import("firebase-admin");
    const app = admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount),
    });
    messaging = admin.default.messaging(app);
    console.log("🔔 Push notifications habilitadas (Firebase configurado)");
    return messaging;
  } catch (error) {
    console.error(
      "⚠️  Error inicializando Firebase Admin (push notifications quedan deshabilitadas):",
      error.message
    );
    messaging = null;
    return null;
  }
}

// Disparar la inicialización al cargar el módulo (= al boot del servidor, ya
// que server.js importa las rutas que importan este módulo antes de arrancar).
// Fire-and-forget: nunca debe demorar ni tumbar el arranque del POS.
ensureInitialized().catch(() => {});

/**
 * Envía una notificación push a todos los dispositivos registrados para un rol
 * (COCINA, CAJA, MESERO). Best-effort: nunca lanza — si Firebase no está
 * configurado o falla el envío, simplemente no hace nada.
 */
export async function sendPushToRole(role, { title, body }) {
  try {
    const fcm = await ensureInitialized();
    if (!fcm) return;

    const db = getDb();
    const rows = await db.all(
      "SELECT id, token FROM push_tokens WHERE role = ?",
      [role]
    );
    if (!rows || rows.length === 0) return;

    const tokens = rows.map((r) => r.token);

    const message = {
      tokens,
      notification: {
        title,
        body,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "ordenes",
          sound: "default",
        },
      },
    };

    const response = await fcm.sendEachForMulticast(message);

    // Limpiar tokens que Firebase reporta como inválidos/no registrados
    // (celular desinstaló la app, token rotado, etc.)
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            code === "messaging/invalid-argument"
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });
      if (invalidTokens.length > 0) {
        const placeholders = invalidTokens.map(() => "?").join(",");
        await db
          .run(`DELETE FROM push_tokens WHERE token IN (${placeholders})`, invalidTokens)
          .catch(() => {});
      }
    }
  } catch (error) {
    // Best-effort: un fallo de push NUNCA debe tumbar la operación que lo dispara
    console.error(`⚠️  Error enviando push a rol ${role}:`, error.message);
  }
}
