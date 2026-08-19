// backend/services/webOrdersPoller.js
//
// Consulta la cola de pedidos web (servicio en Railway) y crea la orden
// correspondiente en el POS local. El POS nunca se expone a internet: esta
// es una conexion SALIENTE, igual que routes/update.js ya hace para buscar
// actualizaciones.
//
// Autenticacion: inicia sesion una vez con el PIN del usuario "Pedidos Web"
// (creado por la migracion en db/database.js) y reusa el token; MESERO ya
// puede crear ordenes VENTANILLA/DOMICILIO, no hace falta un rol nuevo.

import { getDb } from "../db/database.js";
import { resolveProductId } from "../config/webProductMap.js";

const ENDPOINT = (process.env.WEB_ORDERS_ENDPOINT || "").replace(/\/$/, "");
const SECRET = process.env.WEB_ORDERS_SECRET || "";
const POLLER_PIN = process.env.WEB_ORDERS_POLLER_PIN || "";
const POLL_INTERVAL_MS = parseInt(
  process.env.WEB_ORDERS_POLL_INTERVAL_MS || "20000",
  10
);

let sessionToken = null;
let localPort = 3000;

async function login() {
  const res = await fetch(`http://localhost:${localPort}/api/auth/pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: POLLER_PIN }),
  });
  if (!res.ok) {
    sessionToken = null;
    throw new Error(`Login del poller de pedidos web fallo: HTTP ${res.status}`);
  }
  const data = await res.json();
  sessionToken = data.token;
}

async function fetchPending() {
  const res = await fetch(`${ENDPOINT}/web-orders/pending`, {
    headers: { "X-Web-Orders-Secret": SECRET },
  });
  if (!res.ok) {
    throw new Error(`No se pudo consultar pedidos web pendientes: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.pedidos || [];
}

async function ack(pedidoId) {
  await fetch(`${ENDPOINT}/web-orders/${pedidoId}/ack`, {
    method: "POST",
    headers: { "X-Web-Orders-Secret": SECRET },
  });
}

function buildDeliveryNote(pedido) {
  const customer = pedido.customer || {};
  const fulfillment = pedido.fulfillment || {};
  const lugar =
    fulfillment.type === "delivery"
      ? `Dirección: ${fulfillment.address || "-"}`
      : "Recoge en local";
  return `📍 ${customer.name || "Cliente web"} | Tel: ${customer.phone || "-"} | ${lugar} | Pago: ${pedido.paymentMethod || "-"} | Notas: ${pedido.notes || "-"}`;
}

/**
 * Arma el array de items para POST /api/orders. Usa el precio ACTUAL del
 * POS (no el que mando la web) para que un pedido nunca se cobre con un
 * precio desactualizado si el menu de la web y el del POS se desincronizan;
 * si difieren, queda advertido en el log para revisar a mano.
 */
async function buildOrderItems(pedido) {
  const db = getDb();
  const items = [];

  for (let i = 0; i < pedido.items.length; i++) {
    const webItem = pedido.items[i];
    const isCombo = (webItem.modifiersLabel || "").toLowerCase().includes("combo");
    const productId = resolveProductId(webItem.webId, isCombo);

    let price = webItem.unitPrice;
    if (productId) {
      const product = await db.get("SELECT price FROM products WHERE id = ?", [
        productId,
      ]);
      if (product && product.price != null) {
        if (Math.round(product.price) !== Math.round(webItem.unitPrice)) {
          console.warn(
            `⚠️  Pedido web #${pedido.id}: precio de "${webItem.name}" en la web ($${webItem.unitPrice}) no coincide con el POS ($${product.price}). Se usa el del POS.`
          );
        }
        price = product.price;
      }
    } else {
      console.warn(
        `⚠️  Pedido web #${pedido.id}: no hay mapeo de producto para "${webItem.webId}" — se crea como item custom.`
      );
    }

    const notesParts = [];
    if (webItem.modifiersLabel) notesParts.push(webItem.modifiersLabel);
    if (i === 0) notesParts.push(buildDeliveryNote(pedido));

    items.push({
      name: webItem.name,
      qty: webItem.qty,
      price,
      notes: notesParts.join("\n") || null,
      product_id: productId,
      is_custom: productId ? 0 : 1,
    });
  }

  return items;
}

async function crearOrdenLocal(pedido, reintentado = false) {
  const items = await buildOrderItems(pedido);
  const service = pedido.fulfillment?.type === "delivery" ? "DOMICILIO" : "VENTANILLA";

  const res = await fetch(`http://localhost:${localPort}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      channel: "VENTANILLA",
      service,
      items,
      web_order_id: `web-${pedido.id}`,
    }),
  });

  if (res.status === 401 && !reintentado) {
    await login();
    return crearOrdenLocal(pedido, true);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `El POS rechazo el pedido web #${pedido.id}: HTTP ${res.status} ${detail}`
    );
  }
}

async function poll() {
  let pendientes;
  try {
    pendientes = await fetchPending();
  } catch (err) {
    console.error("⚠️  Error consultando la cola de pedidos web:", err.message);
    return;
  }

  for (const pedido of pendientes) {
    try {
      await crearOrdenLocal(pedido);
      await ack(pedido.id);
      console.log(`✅ Pedido web #${pedido.id} creado en el POS (Domicilios/Ventanilla)`);
    } catch (err) {
      // No se confirma (ack): se reintenta en el proximo ciclo. web_order_id
      // evita que quede duplicado si el error fue DESPUES de crear la orden.
      console.error(`⚠️  No se pudo procesar el pedido web #${pedido.id}:`, err.message);
    }
  }
}

/**
 * Arranca el poller. No-op si falta configuracion — asi una instalacion sin
 * estas variables sigue funcionando exactamente igual que antes.
 */
export function startWebOrdersPoller(port) {
  if (!ENDPOINT || !SECRET || !POLLER_PIN) {
    console.log(
      "ℹ️  Pedidos web desactivados (falta WEB_ORDERS_ENDPOINT / WEB_ORDERS_SECRET / WEB_ORDERS_POLLER_PIN)"
    );
    return;
  }

  localPort = port;
  console.log(
    `🛵 Poller de pedidos web activo — consulta cada ${POLL_INTERVAL_MS / 1000}s`
  );

  // Loop auto-programado (NO setInterval): si un ciclo se demora por una
  // llamada lenta a Railway, no se dispara el siguiente encima.
  const loop = async () => {
    if (!sessionToken) {
      try {
        await login();
      } catch (err) {
        console.error(
          "⚠️  No se pudo iniciar sesion del poller de pedidos web:",
          err.message
        );
      }
    }
    if (sessionToken) {
      await poll();
    }
    setTimeout(loop, POLL_INTERVAL_MS);
  };

  loop();
}
