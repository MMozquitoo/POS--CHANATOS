// Notificaciones push (Firebase Cloud Messaging) — SOLO celular Android nativo.
// Objetivo: que suene una notificación del sistema aunque la pantalla esté
// apagada o la app cerrada (Socket.IO no alcanza: se suspende con la pantalla
// apagada).
//
// DESACTIVADO (2026-08-19): el APK no trae `google-services.json` (no existe
// en frontend/android/app/), así que Firebase nunca se inicializa del lado
// nativo. Con Firebase sin inicializar, `PushNotifications.register()` lanza
// "Default FirebaseApp is not initialized" DENTRO del plugin nativo — un
// crash que no siempre llega como rechazo de promesa a un try/catch de JS, y
// tumbaba la app entera justo al loguearse (reporte del dueño: "el APK se
// cerraba sin explicación"). `registerPushNotifications` queda como no-op
// hasta que exista el `google-services.json` real (ver comentario en
// android/app/build.gradle, que ya condiciona el plugin de Gradle a que
// exista ese archivo).

import { Capacitor } from "@capacitor/core";
import axios from "axios";

const TOKEN_STORAGE_KEY = "pos_push_token";

/**
 * Registra este dispositivo para recibir push notifications. No-op hasta que
 * el APK tenga `google-services.json` real (ver nota arriba).
 */
export async function registerPushNotifications() {}

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
