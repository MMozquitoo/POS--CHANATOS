import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import fs from "fs";

// Importar rutas
import { validateSession, loadSessionsFromDb } from "./routes/auth.js";
import authRoutes from "./routes/auth.js";
import ordersRoutes from "./routes/orders.js";
import paymentsRoutes from "./routes/payments.js";
import cashRoutes from "./routes/cash.js";
import tablesRoutes from "./routes/tables.js";
import productsRoutes from "./routes/products.js";
import ingredientsRoutes from "./routes/ingredients.js";
import recipesRoutes from "./routes/recipes.js";
import inventoryRoutes from "./routes/inventory.js";
import inventoryMovementsRoutes from "./routes/inventoryMovements.js";
import auditRoutes from "./routes/audit.js";
import reportsRoutes from "./routes/reports.js";
import updateRoutes from "./routes/update.js";

// Importar base de datos
import { initDatabase, getDb } from "./db/database.js";

// Configuración
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const PORT = process.env.PORT || 3000;

// CORS: FRONTEND_ORIGIN si existe; si no, "*" solo si no es production
const corsOrigin = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN
  : process.env.NODE_ENV !== "production"
    ? "*"
    : false;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST", "PATCH"],
  },
});

// Middleware
app.use(
  cors({
    origin: corsOrigin,
    credentials: corsOrigin ? true : false,
  })
);
app.use(express.json({ limit: '1mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Chrome/WebView exige esta cabecera para permitir peticiones hacia la red privada
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

// FASE F5: SQLite usa UNA conexión compartida; dos transacciones concurrentes se
// entrelazan y corrompen ("cannot start a transaction within a transaction").
// Serializar todas las ESCRITURAS garantiza transacciones atómicas sin refactor
// de cada ruta. Las lecturas (GET) no se encolan.
let writeQueue = Promise.resolve();
app.use((req, res, next) => {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();
  const prev = writeQueue;
  let release;
  writeQueue = new Promise((resolve) => { release = resolve; });
  prev.then(() => {
    // Liberar el turno al terminar la respuesta (o si el cliente aborta)
    res.on("finish", release);
    res.on("close", release);
    next();
  });
});

// Inicializar base de datos (incluye migración automática si es necesario)
try {
  await initDatabase();
  console.log(
    "✅ Base de datos lista (migración automática ejecutada si fue necesario)"
  );
  // FASE F5 (naranja): restaurar sesiones persistidas (sobreviven reinicios)
  await loadSessionsFromDb();
} catch (error) {
  console.error("❌ Error inicializando base de datos:", error);
  process.exit(1);
}

// FASE F5 (naranja): respaldo automático de la base de datos.
// VACUUM INTO produce una copia consistente aunque el servidor esté en uso.
// Un respaldo por día, conserva los últimos 14, corre al arrancar y cada 6 horas.
const BACKUPS_DIR = join(__dirname, "data", "backups");
const BACKUPS_TO_KEEP = 14;

async function backupDatabase() {
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }); // YYYY-MM-DD
    const file = join(BACKUPS_DIR, `pos_chanatos-${stamp}.db`);
    if (fs.existsSync(file)) return; // ya existe el respaldo de hoy

    await getDb().run(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    console.log(`💾 Respaldo de base de datos creado: ${file}`);

    const backups = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith(".db")).sort();
    while (backups.length > BACKUPS_TO_KEEP) {
      fs.unlinkSync(join(BACKUPS_DIR, backups.shift()));
    }
  } catch (error) {
    console.error("⚠️  Error creando respaldo de base de datos:", error);
  }
}

backupDatabase();
setInterval(backupDatabase, 6 * 60 * 60 * 1000);

// Rutas API - IMPORTANTE: Estas deben estar ANTES del middleware estático
app.use("/api/auth", authRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/ingredients", ingredientsRoutes);
app.use("/api/recipes", recipesRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/inventory-movements", inventoryMovementsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/update", updateRoutes);

// Health check (Render/Railway)
app.get("/api/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// Descubrimiento automático: la app móvil escanea la red buscando esta firma
app.get("/api/discover", (req, res) => {
  res.status(200).json({ app: "pos-chanatos", name: "POS Chanatos" });
});

// WebSocket authentication
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    // Allow unauthenticated connections but mark them
    socket.authenticated = false;
    return next();
  }
  // Validate token against sessions
  const session = validateSession(token);
  if (session) {
    socket.authenticated = true;
    socket.userId = session.userId;
    socket.userRole = session.role;
  } else {
    socket.authenticated = false;
  }
  next();
});

// WebSocket para realtime
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id, "autenticado:", socket.authenticated);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// Exportar io para usar en rutas
app.set("io", io);

/* ================================
   FRONTEND estático (solo cuando NO es producción web)
   En producción (Render) el frontend está en Vercel; no servir frontend/dist
   ================================ */
if (process.env.NODE_ENV !== "production") {
  const frontendPath = process.env.RESOURCES_PATH
    ? join(process.env.RESOURCES_PATH, "frontend", "dist")
    : join(__dirname, "../frontend/dist");

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    express.static(frontendPath)(req, res, next);
  });

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(join(frontendPath, "index.html"));
  });
}

// Iniciar servidor
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor POS Chanatos corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📱 Accesible desde la red local`);

  // Anunciar el servicio por mDNS/Bonjour para que la app lo encuentre sola
  import("bonjour-service")
    .then(({ Bonjour }) => {
      const bonjour = new Bonjour();
      bonjour.publish({
        name: "POS Chanatos",
        type: "pos-chanatos",
        port: Number(PORT),
      });
      console.log(`📡 Servicio anunciado por mDNS (_pos-chanatos._tcp.local)`);
    })
    .catch((err) => {
      console.warn("⚠️ No se pudo anunciar por mDNS:", err.message);
    });
});
