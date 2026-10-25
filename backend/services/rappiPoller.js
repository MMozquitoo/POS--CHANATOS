// backend/services/rappiPoller.js
//
// SINCRONIZACIÓN CON RAPPI (2026-10-25, dueño): los pedidos que el cliente
// hace en Rappi caen solos en el POS (Domicilios, marcados RAPPI), sin
// volverlos a digitar, y el POS le avisa al relevo cuando el pedido queda
// LISTO para que Rappi mande el domiciliario.
//
// MISMA ARQUITECTURA que los pedidos web (webOrdersPoller.js): el POS nunca
// se expone a internet. Un RELEVO en la nube (mismo estilo del servicio de
// Railway) recibe los webhooks de la API de Rappi y los deja en cola; este
// poller los consulta con conexiones SALIENTES.
//
// CONTRATO DEL RELEVO (para construirlo cuando Rappi entregue credenciales;
// autenticación: header X-Rappi-Orders-Secret en todas las llamadas):
//   GET  /rappi-orders/pending            → { pedidos: [{ id, rappiOrderId,
//          customer: { name, phone }, address, notes, paymentTotal,
//          items: [{ name, qty, unitPrice, comments }] }] }
//   POST /rappi-orders/:id/ack            → el POS ya creó la orden
//   POST /rappi-orders/:id/ready          → la orden quedó LISTA (Rappi puede
//          mandar el domiciliario); el relevo la reporta a la API de Rappi
//   POST /rappi-orders/:id/cancelled      → la orden se canceló en el POS
//
// Los precios se respetan TAL CUAL vienen de Rappi: el cliente ya le pagó a
// Rappi ese valor (distinto de los pedidos web, donde manda el precio del
// POS). Si hay un producto del menú con el mismo nombre se enlaza su
// product_id (recetas/estadísticas); si no, entra como item personalizado.
//
// No-op sin configuración: una instalación sin estas variables arranca igual.

import { getDb } from "../db/database.js";

const ENDPOINT = (process.env.RAPPI_ORDERS_ENDPOINT || "").replace(/\/$/, "");
const SECRET = process.env.RAPPI_ORDERS_SECRET || "";
const POLLER_PIN = process.env.RAPPI_POLLER_PIN || process.env.WEB_ORDERS_POLLER_PIN || "";
const POLL_INTERVAL_MS = parseInt(process.env.RAPPI_POLL_INTERVAL_MS || "15000", 10);

let sessionToken = null;
let localPort = 3000;
// Pedidos creados en esta sesión del proceso, pendientes de avisar "listo":
// relayId → { orderId, done }. Si el proceso se reinicia se pierde el mapa y
// el aviso de "listo" queda best-effort (documentado en el contrato).
const seguimiento = new Map();

async function login() {
  const res = await fetch(`http://localhost:${localPort}/api/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: POLLER_PIN }),
  });
  if (!res.ok) {
    sessionToken = null;
    throw new Error(`Login del poller de Rappi falló: HTTP ${res.status}`);
  }
  const data = await res.json();
  sessionToken = data.token;
}

async function relay(path, options = {}) {
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...options,
    headers: { "X-Rappi-Orders-Secret": SECRET, ...(options.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`Relevo de Rappi respondió HTTP ${res.status} en ${path}`);
  }
  return res;
}

async function fetchPending() {
  const res = await relay("/rappi-orders/pending");
  const data = await res.json();
  return data.pedidos || [];
}

// "hamburguesa  Clásica " ≈ "Hamburguesa Clásica" ≈ "Hamburguesa Clásica - Combo"
function clave(nombre) {
  return String(nombre || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

async function buildOrderItems(pedido) {
  const db = getDb();
  const productos = await db.all(
    "SELECT id, name, variant FROM products WHERE is_active = 1"
  );
  const porNombre = new Map();
  productos.forEach((p) => {
    porNombre.set(clave(p.name), p.id);
    if (p.variant) porNombre.set(clave(`${p.name} - ${p.variant}`), p.id);
  });

  const items = [];
  for (let i = 0; i < (pedido.items || []).length; i++) {
    const it = pedido.items[i];
    const productId = porNombre.get(clave(it.name)) || null;
    if (!productId) {
      console.warn(`⚠️  Pedido Rappi #${pedido.id}: "${it.name}" no está en el menú del POS — entra como item personalizado.`);
    }
    const notesParts = [];
    if (it.comments) notesParts.push(String(it.comments).trim());
    if (i === 0) {
      const c = pedido.customer || {};
      notesParts.push(
        `Rappi ${pedido.rappiOrderId || pedido.id} | ${c.name || "Cliente Rappi"}${c.phone ? ` | Tel: ${c.phone}` : ""}${pedido.address ? ` | ${pedido.address}` : ""}${pedido.notes ? ` | Notas: ${pedido.notes}` : ""}`
      );
    }
    items.push({
      name: it.name,
      qty: it.qty || 1,
      // Precio de RAPPI tal cual: es lo que el cliente ya pagó allá
      price: it.unitPrice,
      notes: notesParts.join("\n") || null,
      product_id: productId,
      is_custom: productId ? 0 : 1,
    });
  }
  return items;
}

async function crearOrdenLocal(pedido, reintentado = false) {
  const items = await buildOrderItems(pedido);
  const res = await fetch(`http://localhost:${localPort}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      channel: "VENTANILLA",
      service: "DOMICILIO",
      deliveryPlatform: "RAPPI",
      customerName: pedido.customer?.name || null,
      items,
      // Idempotencia: si el ack falló y el pedido vuelve, el POS devuelve la
      // orden existente en vez de duplicarla (mismo mecanismo que pedidos web)
      web_order_id: `rappi-${pedido.id}`,
    }),
  });

  if (res.status === 401 && !reintentado) {
    await login();
    return crearOrdenLocal(pedido, true);
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`El POS rechazó el pedido Rappi #${pedido.id}: HTTP ${res.status} ${detail}`);
  }
  const data = await res.json();
  return data.order;
}

// Avisar al relevo cuando una orden rastreada queda LISTA (Rappi manda el
// domiciliario) o se cancela. Un pedido Rappi se cierra solo al quedar listo
// (closeOrderIfPrepaid → PAGADA), así que PAGADA también cuenta como "listo".
async function reportarEstados() {
  const db = getDb();
  for (const [relayId, info] of seguimiento) {
    try {
      const orden = await db.get("SELECT status FROM orders WHERE id = ?", [info.orderId]);
      if (!orden) {
        seguimiento.delete(relayId);
        continue;
      }
      if (orden.status === "LISTO" || orden.status === "PAGADA") {
        await relay(`/rappi-orders/${relayId}/ready`, { method: "POST" });
        console.log(`🛵 Pedido Rappi #${relayId} reportado LISTO al relevo`);
        seguimiento.delete(relayId);
      } else if (orden.status === "CANCELADO") {
        await relay(`/rappi-orders/${relayId}/cancelled`, { method: "POST" });
        console.log(`🛵 Pedido Rappi #${relayId} reportado CANCELADO al relevo`);
        seguimiento.delete(relayId);
      }
    } catch (err) {
      // Se reintenta en el próximo ciclo; el pedido no se pierde
      console.error(`⚠️  No se pudo reportar el estado del pedido Rappi #${relayId}:`, err.message);
    }
  }
}

async function poll() {
  let pendientes;
  try {
    pendientes = await fetchPending();
  } catch (err) {
    console.error("⚠️  Error consultando la cola de Rappi:", err.message);
    return;
  }

  for (const pedido of pendientes) {
    try {
      const orden = await crearOrdenLocal(pedido);
      await relay(`/rappi-orders/${pedido.id}/ack`, { method: "POST" });
      if (orden?.id) seguimiento.set(String(pedido.id), { orderId: orden.id });
      console.log(`✅ Pedido Rappi #${pedido.id} creado en el POS (orden ${orden?.id})`);
    } catch (err) {
      // Sin ack: vuelve en el próximo ciclo; web_order_id evita duplicados
      console.error(`⚠️  No se pudo procesar el pedido Rappi #${pedido.id}:`, err.message);
    }
  }

  await reportarEstados();
}

export function startRappiPoller(port) {
  if (!ENDPOINT || !SECRET || !POLLER_PIN) {
    console.log(
      "ℹ️  Sincronización con Rappi desactivada (falta RAPPI_ORDERS_ENDPOINT / RAPPI_ORDERS_SECRET / RAPPI_POLLER_PIN)"
    );
    return;
  }

  localPort = port;
  console.log(`🛵 Poller de Rappi activo — consulta cada ${POLL_INTERVAL_MS / 1000}s`);

  // Loop auto-programado (NO setInterval): un ciclo lento no se monta sobre el siguiente
  const loop = async () => {
    if (!sessionToken) {
      try {
        await login();
      } catch (err) {
        console.error("⚠️  No se pudo iniciar sesión del poller de Rappi:", err.message);
      }
    }
    if (sessionToken) {
      await poll();
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  };

  loop();
}
