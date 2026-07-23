# POS Chanatos

Sistema POS para el restaurante **Chanatos** (hamburguesas, Colombia). Monorepo con backend y frontend separados. Corre en un computador local ("el servidor" del restaurante); meseros/cocina/caja lo usan desde celulares (APK Android o PWA) y navegador, todos en la misma red Wi-Fi.

## Stack

- **Backend:** Node.js (ES modules), Express 4, SQLite3 (archivo `backend/data/pos_chanatos.db`), Socket.IO, bcryptjs (JS puro — NO usar bcrypt nativo, rompe el empaquetado Windows), bonjour-service (anuncio mDNS)
- **Frontend:** React 18, Vite 5, React Router 6, Axios, Socket.IO Client, PWA (vite-plugin-pwa)
- **Móvil:** Capacitor 6 (Android; `frontend/android/`), CapacitorHttp nativo habilitado (evita bloqueos del WebView hacia la LAN), plugin capacitor-zeroconf v3 (mDNS)
- **Sin TypeScript, sin tests unitarios** (verificación: curl contra la API + capturas con Playwright, ver abajo)

## Estructura

```
backend/
  server.js              # Express + Socket.IO puerto 3000; sirve frontend/dist si NODE_ENV != production;
                         #   cola de ESCRITURAS serializadas (SQLite = 1 conexión; ver Concurrencia);
                         #   respaldo automático de BD (VACUUM INTO data/backups/, diario, conserva 14);
                         #   anuncio mDNS _pos-chanatos._tcp; endpoint /api/discover con firma
  db/database.js         # Schema, seed, migraciones. Las migraciones NUEVAS van como "chequeo
                         #   incondicional" al final de initDatabase (la sección migrateDatabase vieja
                         #   solo corre si faltan columnas de una lista antigua — trampa conocida)
  routes/
    auth.js              # Login por PIN (4 dígitos). Sesiones: Map en memoria + tabla sessions
                         #   (SOBREVIVEN reinicios; loadSessionsFromDb al boot). validateSession es síncrona.
    orders.js            # CRUD órdenes. Máquina de estados NUEVO→EN_PREP→LISTO (reversas de 1 paso);
                         #   agregar items a LISTO la regresa a EN_PREP; /:id/merge (unir cuentas);
                         #   /:id/discount (descuento con motivo, bloqueado si hay pagos);
                         #   /items/:id/ready (cocina plato por plato; al completar todos → LISTO solo);
                         #   MESERO puede: crear, agregar items, NUEVO→EN_PREP, cancelar NUEVO/EN_PREP,
                         #   ver cualquier orden (piso compartido). Cancelar exige motivo ≥3 y cero pagos.
    payments.js          # /payments (orden completa; acepta payments:[{method,amount}] dividido y
                         #   tipAmount); /payments/items (por items; incompatible con descuento → 409);
                         #   valida montos contra el saldo REAL; pago parcial NO libera la mesa;
                         #   inventario se descuenta solo al quedar PAGADA; anular pago: bloqueado si
                         #   su caja ya cerró, repone inventario y devuelve items a pendiente
    cash.js              # Caja: POST /cash/open {initialCash} y /cash/session/close {closing_cash}
                         #   (OJO: /cash/session/open NO existe). Arqueo excluye pagos anulados e
                         #   incluye propinas en efectivo en el esperado.
    reports.js           # /reports/summary?from&to: ventas/propinas/descuentos/canceladas, ticket
                         #   promedio, top productos, por método/día/hora, pedidos por hora de llegada,
                         #   tiempo de preparación (orders.ready_at). Todo lo monetario cuenta AL PAGAR.
    inventory.js         # /inventory/low-stock ya existe (stock <= min_stock)
    backup.js            # Respaldo movible: GET /backup/excel (un .xlsx con una hoja por tabla,
                         #   sin `sessions`), GET /backup/db (VACUUM INTO → copia exacta) y
                         #   POST /backup/import (sube el .xlsx y REEMPLAZA las tablas; FKs off
                         #   ANTES del BEGIN — el PRAGMA es no-op dentro de una transacción).
                         #   exceljs se carga con import DIFERIDO: el botón de actualizar no
                         #   reinstala node_modules, así el POS arranca igual sin la dependencia.
    inventoryMovements.js # deduct/restoreInventoryFromOrderItems; stock negativo permitido pero
                         #   auditado (STOCK_NEGATIVE); errores auditados (INVENTORY_ERROR)
  scripts/               # init-db, migrate, reset-day
  data/                  # pos_chanatos.db (gitignored), products.json (seed), backups/

frontend/
  src/
    App.jsx              # Rutas: /login, /config-servidor (pública), catch-all por rol
    utils/
      api.js             # getApiBaseUrl: localStorage pos_api_url > VITE_API_URL > hostname:3000
      discovery.js       # Encuentra el servidor: 1) último conocido con 3 reintentos (el Wi-Fi del
                         #   teléfono tarda en despertar) 2) mDNS 3) escaneo de subredes. En nativo usa
                         #   CapacitorHttp con timeouts. Verifica firma {app:"pos-chanatos"}.
      statusLabels.js    # Enums → texto legible. NUNCA mostrar EN_PREP etc. al usuario.
      kitchenSound.js    # Chime Web Audio (sin archivos); unlockAudio en primer toque
    components/
      Modal.jsx          # OJO: efecto de foco con deps [open] y onCloseRef — NO agregar onClose a las
                         #   deps (robaba el foco al input en cada tecla: bug "solo deja una letra")
      ModalHost.jsx      # Render de alert/confirm/prompt de marca (useAlert/useConfirm/usePrompt)
      SalsasChips.jsx    # Chips de salsas → escriben en notes del item. categoriaLlevaSalsas()
                         #   las oculta en BEBIDAS/CERVEZAS/JUGOS_NATURALES. Lista central aquí.
      CajaHeader.jsx     # En compacto (<480px) oculta RoleBadge y subtítulo
      caja/PagoDividido.jsx # Split multi-método con botón "Resto" y validación exacta
    pages/
      Login.jsx          # PIN 4 dígitos con auto-ingreso (sin botón ENTRAR); autodescubrimiento al abrir
      ConfigServidor.jsx # Búsqueda automática + manual con prueba (pública, /config-servidor)
      Mesero/            # Mesas (tarjetas 9/10 → /ventanilla y /domicilios), PedidoMesa (separa
                         #   "Ya en la orden" de "Nuevos items" — NUNCA reenviar items existentes),
                         #   MeseroRoutes con catch-all → "/" (evita pantalla en blanco al cambiar rol)
      Ventanilla/ Domicilios/  # Multi-orden (fila de clientes), unir cuentas (caja), importan Caja.css
                         #   OJO: loadOrders es function declaration (hoisting) — useVentanillaRefresh
                         #   la referencia antes de su línea (TDZ crasheaba la página)
      Cocina/            # Plato por plato (tocar item = listo, N/M, auto-LISTO), sonido con toggle,
                         #   cronómetro con semáforo (10/20 min), orden por antigüedad
      Caja/              # DetalleMesa (layout altura natural + rieles sticky desktop / apilado móvil,
                         #   propina y descuento en el panel de cobro; con descuento COBRAR usa orden
                         #   completa), CobrarPedidos (split/propina/descuento/recibo), CocinaCaja
                         #   (vista cocina de caja, también plato por plato), Reportes, CajaRoutes
                         #   con catch-all → /centro
    styles/
      chanatos-theme.css # Design tokens (modales z-index 3000: SIEMPRE encima de recibos)
      mobile-polish.css  # Capa global móvil: targets 46px, safe-areas (notch), grillas de categorías
                         #   TODAS visibles (no carrusel), colores explícitos en botones (iOS los pinta
                         #   azul), headers sticky. Los ajustes móviles nuevos van AQUÍ.
  android/               # Proyecto Capacitor (generado, committeado). usesCleartextTraffic=true.
  assets/logo.png        # Fuente del icono (C oscura; @capacitor/assets genera los 74 recursos)

desktop/                 # APP DE ESCRITORIO REAL (Electron) — ENTREGA WINDOWS ACTUAL (2026-07-15).
                         #   main.js arranca el backend como proceso hijo (node.exe+sqlite de Windows),
                         #   muestra la ventana con icono Chanatos, limpia caché al iniciar y reinicia el
                         #   backend solo tras actualizar (watchdog). preload expone window.posElectron.
                         #   installer.nsh limpia la instalación vieja de Edge y crea arranque automático.
scripts/build-desktop.sh # Genera ~/Desktop/Instalar-POS-Chanatos.exe (electron-builder --win nsis --x64;
                         #   OJO: forzar x64, el PC del local es Intel). Empaqueta node win + backend +
                         #   frontend/dist + VERSION + app.ico. POS_VERSION fija la versión (usar la del
                         #   último release publicado para que el botón "Buscar actualizaciones" diga "al día").
scripts/build-windows.sh # SUPERSEDIDO por build-desktop.sh. Genera el zip viejo que abría en Edge modo
                         #   app (POSChanatos.vbs). El dueño lo rechazó ("no quiero un navegador"). No usar
                         #   salvo que se quiera el método liviano sin Electron.
scripts/publicar-actualizacion.sh # "Botón Publicar" desde la Mac: compila el frontend y sube un
                         #   Release "latest" a GitHub (MMozquitoo/POS--CHANATOS) con el payload de
                         #   actualización (backend sin node_modules/data + frontend/dist + VERSION +
                         #   version.txt). El PC Windows lo baja con Actualizar.bat. Ver "Actualización
                         #   remota" abajo. Requiere gh autenticado.
```

## Comandos

```bash
# Backend (desarrollo)
cd backend && npm install && npm run init-db && npm run dev   # puerto 3000, sirve también el frontend build

# Frontend
cd frontend && npm install
npm run build        # OBLIGATORIO tras cambios de UI (el backend sirve dist/)

# APK Android (tras npm run build)
cd frontend && npx cap sync android && cd android && \
  ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk (se copia al Escritorio del usuario)

# App de escritorio Windows (ENTREGA ACTUAL: Electron, app real con icono, sin navegador)
POS_VERSION=<version-del-ultimo-release> ./scripts/build-desktop.sh   # → ~/Desktop/Instalar-POS-Chanatos.exe
# (subir a GitHub: gh release upload vX Instalar-POS-Chanatos.exe --repo MMozquitoo/POS--CHANATOS --clobber)

# Publicar una actualización remota (el PC la instala con el botón OPCIONES→BUSCAR ACTUALIZACIONES)
./scripts/publicar-actualizacion.sh   # compila + sube Release "latest" a GitHub

# Servidor de producción en la Mac del dueño (launchd) — ACTUALMENTE DESACTIVADO.
# La producción se movió al PC Windows del local (2026-07-15). Para reactivar en la Mac:
launchctl enable    gui/$(id -u)/com.chanatos.pos-servidor
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.chanatos.pos-servidor.plist  # encender
launchctl bootout   gui/$(id -u)/com.chanatos.pos-servidor                               # apagar
launchctl disable   gui/$(id -u)/com.chanatos.pos-servidor                               # que NO revuelva al reiniciar
# logs: /tmp/pos-chanatos-servidor.log
```

## Verificación visual (Playwright)

Hay un harness en el scratchpad de sesiones anteriores; recrearlo es barato:
navegador chromium de Playwright + script que hace login por API (POST /api/auth/pin),
mete el token en localStorage y captura pantallas (390px teléfono / 1920px desktop).
**Regla: cambio de UI = captura antes de entregar.** El ErrorBoundary muestra el
detalle técnico del error en pantalla (sirve para diagnóstico en sitio).

## Roles y acceso (PIN de 4 dígitos, auto-ingreso)

- **MESERO** (1234) — Mesas, pedidos, ventanilla/domicilios multi-orden, enviar a preparación, cancelar pedidos NUEVO/EN_PREP, ver cualquier orden
- **COCINA** (5678) — Pedidos plato por plato, devolver a preparación, archivar
- **CAJA** (9012) — Todo: cobrar (dividido/parcial/propina/descuento), unir cuentas, anular, caja, reportes, auditoría

## Reglas de negocio clave

- **Una mesa (1-8) = una orden activa = una cuenta.** Ventanilla (mesa 9) y Domicilios (10) permiten múltiples órdenes.
- Agregar items a una orden LISTO la **regresa a EN_PREP** (solo lo nuevo se resalta en cocina).
- **PAGADA y CANCELADO son terminales** para modificaciones; cancelar exige motivo y cero pagos válidos.
- Todo lo monetario de reportes/arqueo cuenta **al pagar**, no al pedir.
- Propina separada de la venta (payments.tip_amount); descuento por orden (orders.discount_amount + motivo, auditado).
- **Timestamps SIEMPRE explícitos en hora Bogotá** (`toBogotaSQLiteTimestamp`) — el DEFAULT CURRENT_TIMESTAMP de SQLite es UTC y ya causó un bug de +5h. Nunca confiar en el default.

## Concurrencia (importante)

SQLite usa **una sola conexión compartida**: dos transacciones simultáneas se entrelazan y corrompen. `server.js` serializa todas las escrituras (POST/PATCH/PUT/DELETE) en una cola. Las transacciones usan `BEGIN IMMEDIATE`. No quitar la cola ni abrir segundas conexiones.

## Actualización remota (Windows) — montado 2026-07-15

Flujo sin reinstalar a mano: se corrige en la Mac, se publica a GitHub, el PC del local baja el cambio.

- **Publicar (Mac):** `./scripts/publicar-actualizacion.sh` compila el frontend, empaqueta
  `backend/` (SIN `node_modules` ni `data/`) + `frontend/dist` + `VERSION`, y crea un GitHub Release
  `--latest` en `MMozquitoo/POS--CHANATOS` con dos assets: `POS-Chanatos-Update.zip` y `version.txt`.
- **Actualizar (Windows):** el icono de escritorio "Actualizar POS Chanatos" (`Actualizar.bat`) consulta
  `releases/latest/download/version.txt`, y si difiere de `%LOCALAPPDATA%\POSChanatos\VERSION` baja el zip,
  mata `node.exe`, hace `Expand-Archive -Force` sobre el destino (**NO** toca `data/` ni `node_modules/`
  porque no van en el zip → conserva ventas y el binario sqlite de Windows) y reinicia `servidor.vbs`.
- **Versión:** cadena tipo `2026.07.15.1545`. El zip completo y el Release se generan con el MISMO
  `POS_VERSION` para que un PC recién instalado no crea que está desatrasado.
- **URL estable sin auth** (repo público): `https://github.com/MMozquitoo/POS--CHANATOS/releases/latest/download/<asset>`.
- **Límites:** (1) el APK nativo empaqueta el frontend → un cambio de UI solo llega remoto a quienes usan
  la **PWA/web** (el APK hay que reinstalarlo). (2) Agregar una **dependencia npm nueva** requiere un zip
  completo, no el botón (el updater no reinstala `node_modules`).

## Convenciones

- Archivos y UI en español; sin emojis en la interfaz (el dueño los detesta); enums nunca visibles (usar `statusLabels.js`)
- UX móvil primero: el personal no debe pensar (targets ≥46px, todo visible sin deslizar, auto-avances, botón principal a ancho completo) — ver memoria "ux-movil-filosofia"
- Cambios de UI ⇒ `npm run build` + regenerar APK + actualizar zip de Windows si aplica; el usuario recibe los artefactos en su Escritorio. Para el PC del local ya instalado, publicar remoto con `publicar-actualizacion.sh` (ver "Actualización remota")
- Branding: ámbar #F5BB4C (los rellenos de barras/datos usan #B8860B, validado para contraste); moneda COP (`formatPriceCOP`); zona America/Bogota
- Commits en español con Co-Authored-By de Claude; push a `main` de https://github.com/MMozquitoo/POS--CHANATOS

## Respaldo y reinstalación (importante)

La base de datos vive DENTRO de la carpeta de instalación (`resources\backend\data\`), y el
desinstalador de electron-builder hace `RMDir /r $INSTDIR` (plantilla `uninstaller.nsh`, rama
`isUpdated`). **Reinstalar el .exe encima borra las ventas.** Por eso, antes de reinstalar:

1. En el POS: OPCIONES → **DESCARGAR DATOS (EXCEL)** (o COPIA DE SEGURIDAD COMPLETA para el `.db`
   exacto). Guardar el archivo fuera del PC (USB o correo).
2. Instalar la versión nueva.
3. OPCIONES → **RESTAURAR DATOS DESDE ARCHIVO** y subir el `.xlsx`.

El round-trip está verificado como exacto (mismos datos y timestamps; solo cambia el orden de las
columnas cuando la BD vieja tenía columnas agregadas con ALTER TABLE). El import es transaccional:
si el archivo viene mal, los datos quedan como estaban. Pendiente: mover la carpeta de datos fuera
de `$INSTDIR` para que reinstalar deje de ser destructivo.

## Pendientes conocidos (decisión del dueño)

- Impresora térmica de cocina (no hay impresora aún)
- Facturación electrónica DIAN (no están registrados aún)
- Usuarios por empleado (PIN individual), ficha de clientes para domicilios, resumen remoto del dueño
- Datáfono: el dueño evalúa Bold/Wompi (persona natural con RUT); el método TARJETA ya existe en el POS
