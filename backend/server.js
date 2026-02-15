import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Importar rutas
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

// Importar base de datos
import { initDatabase } from "./db/database.js";

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
app.use(express.json());

// Inicializar base de datos (incluye migración automática si es necesario)
try {
  await initDatabase();
  console.log(
    "✅ Base de datos lista (migración automática ejecutada si fue necesario)"
  );
} catch (error) {
  console.error("❌ Error inicializando base de datos:", error);
  process.exit(1);
}

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

// Health check (Render/Railway)
app.get("/api/health", (req, res) => {
  res.status(200).json({ ok: true });
});

// WebSocket para realtime
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

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
});
