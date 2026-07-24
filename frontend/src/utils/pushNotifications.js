// Notificaciones push (Firebase Cloud Messaging) — SOLO celular Android nativo.
// Objetivo: que suene una notificación del sistema aunque la pantalla esté
// apagada o la app cerrada (Socket.IO no alcanza: se suspende con la pantalla
// apagada). Sin `google-services.json` real, el plugin nativo simplemente no
// entrega token (o falla el registro) — todo aquí está envuelto en try/catch
// para que nunca rompa el login ni el resto de la app.
//
// Sigue el mismo patrón de `utils/discovery.js`: import dinámico + guard por
// Capacitor.isNativePlatform(), así el bundle web/PWA no carga el plugin nativo.

import { Capacitor } from "@capacitor/core";
import axios from "axios";

const CHANNEL_ID = "ordenes";
const TOKEN_STORAGE_KEY = "pos_push_token";

let listenersRegistered = false;

/**
 * Crea (o actualiza) el canal de notificación de Android: importancia alta +
 * sonido, para que la notificación suene y aparezca como heads-up.
 */
async function ensureChannel(PushNotifications) {
  try {
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Órdenes",
      description: "Nuevas órdenes y órdenes listas para cobrar",
      importance: 5, // IMPORTANCE_HIGH: heads-up + sonido
      visibility: 1,
      vibration: true,
    });
  } catch {
    // No crítico: si falla, Android usa el canal por defecto del plugin
  }
}

/**
 * Registra este dispositivo para recibir push notifications y manda el token
 * al backend asociado al rol del usuario logueado. Solo hace algo en Android
 * nativo (Capacitor); en web/PWA es un no-op silencioso.
 */
export async function registerPushNotifications(role) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    await ensureChannel(PushNotifications);

    const permStatus = await PushNotifications.checkPermissions();
    let receive = permStatus.receive;
    if (receive === "prompt" || receive === "prompt-with-rationale") {
      const req = await PushNotifications.requestPermissions();
      receive = req.receive;
    }
    if (receive !== "granted") {
      console.warn("[push] Permiso de notificaciones no concedido");
      return;
    }

    if (!listenersRegistered) {
      listenersRegistered = true;

      await PushNotifications.addListener("registration", async (token) => {
        try {
          localStorage.setItem(TOKEN_STORAGE_KEY, token.value);
          await axios.post("/push/register", {
            token: token.value,
            platform: "android",
          });
        } catch (error) {
          console.warn("[push] No se pudo registrar el token en el backend:", error.message);
        }
      });

      await PushNotifications.addListener("registrationError", (error) => {
        console.warn("[push] Error de registro FCM:", error?.error || error);
      });
    }

    await PushNotifications.register();
  } catch (error) {
    // Plugin no disponible, sin credenciales de Firebase en el build nativo, etc.
    console.warn("[push] Push notifications no disponibles:", error.message);
  }
}

/**
 * Borra el token de este dispositivo (login de otro rol o cierre de sesión).
 * No-op fuera de Android nativo o si nunca se registró un token.
 */
export async function unregisterPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;

    await axios.post("/push/unregister", { token }).catch(() => {});
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Best-effort: nunca debe bloquear el logout
  }
}
