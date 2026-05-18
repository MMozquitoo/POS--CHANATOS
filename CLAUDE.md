# POS Chanatos

Sistema POS web para el restaurante **Chanatos**. Aplicacion monorepo con backend y frontend separados.

## Stack

- **Backend:** Node.js (ES modules), Express 4, SQLite3 (archivo `backend/data/pos_chanatos.db`), Socket.IO, bcrypt
- **Frontend:** React 18, Vite 5, React Router 6, Axios, Socket.IO Client, PWA (vite-plugin-pwa)
- **Sin TypeScript, sin tests, sin ORM**

## Estructura

```
backend/
  server.js              # Entry point, Express + Socket.IO setup, puerto 3000
  db/database.js         # Conexion SQLite, schema, seed data, migraciones (~1200 lineas)
  middleware/auth.js      # Middleware requireAuth (valida token de sesion)
  routes/
    auth.js              # Login por PIN, sesiones en memoria (Map)
    orders.js            # CRUD ordenes, items, cancelacion (~1800 lineas)
    payments.js          # Pagos por item y por orden completa
    cash.js              # Sesiones de caja, apertura/cierre, reportes
    tables.js            # Mesas del restaurante
    products.js          # Menu, categorias, precios
    ingredients.js       # Ingredientes para recetas
    recipes.js           # Recetas (producto -> ingredientes)
    inventory.js         # Stock de ingredientes
    inventoryMovements.js # Movimientos de inventario, deduccion automatica
    audit.js             # Log de auditoria
  utils/                 # Helpers: timezone (Bogota), currency (COP), audit logger
  scripts/               # init-db, migrate, reset-day, update-menu-prices
  data/                  # SQLite DB y products.json (seed)

frontend/
  src/
    App.jsx              # Router principal, RequireRole para proteccion por rol
    styles/
      chanatos-theme.css # Design tokens CSS (colores, spacing, typography, componentes)
    contexts/
      AuthContext.jsx    # Auth state, token en localStorage, axios interceptors (con cleanup)
      ConnectionContext.jsx # Estado de conexion al backend
    pages/
      Login.jsx          # Login por PIN
      Mesero/            # Vista mesero: mesas, pedidos, estado pedidos, ventanilla
      Cocina/            # Vista cocina: pedidos pendientes
      Caja/              # Vista caja: dashboard, cobrar, cierre, historial, auditoria (lazy loaded)
      Ventanilla/        # Pedidos para llevar
      Domicilios/        # Pedidos a domicilio
    components/
      Modal.jsx          # Modal reutilizable con accesibilidad (focus trap, ESC)
      Recibo.jsx, Comanda, Calculadora, etc.
    utils/
      api.js             # getApiBaseUrl centralizado
      payments.js        # normalizePaymentItemsPayload compartido
      timezone.js, currency.js, roleTheme.js, tables.js
    hooks/
      useModal.js        # useAlert y useConfirm (reemplazan alert/confirm nativos)
      useDebounce.js     # Debounce para inputs de busqueda
      useReconnectRefresh.js, useOrdersRefresh.js
    layouts/             # tablesLayout (disposicion de mesas)
```

## Comandos

```bash
# Backend
cd backend && npm install
npm run dev          # Inicia servidor en puerto 3000
npm run init-db      # Inicializa base de datos
npm run migrate      # Ejecuta migraciones

# Frontend
cd frontend && npm install
npm run dev          # Inicia dev server en puerto 5173
npm run build        # Build de produccion
```

## Roles y acceso

- **MESERO** (PIN default: 1234) — Mesas, crear pedidos, ver estado
- **COCINA** (PIN default: 5678) — Ver pedidos pendientes, marcar listos
- **CAJA** (PIN default: 9012) — Cobrar, abrir/cerrar caja, historial, auditoria, reportes

## Branding

- Nombre: **Chanatos** (siempre con esta ortografia)
- Colores: amarillo/ambar como color principal
- Moneda: COP (pesos colombianos), zona horaria America/Bogota

## Convenciones

- Archivos en espanol (nombres de componentes, variables mixtas espanol/ingles)
- API REST bajo `/api/` sin versionado
- WebSocket para actualizaciones en tiempo real (ordenes, cocina), con autenticacion
- Base de datos SQLite single-file, PRAGMA foreign_keys ON, migraciones manuales
- Sesiones en memoria (Map) con tokens criptograficos (crypto.randomBytes)
- CSS design tokens en `chanatos-theme.css` (--chanatos-primary, etc.)
- Colores: amber #F5BB4C como primario en toda la UI
- Modales custom (Modal.jsx + useModal) en vez de alert()/confirm()
- Lazy loading en CajaRoutes y MeseroRoutes
- getApiBaseUrl centralizado en utils/api.js
- Indices en tablas principales (orders, payments, cash_sessions, etc.)
- Transacciones en creacion de ordenes
