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
                         #   NOTA DE COCINA (2026-09) — dos niveles, no confundir:
                         #   1) orders.special_note: aviso de TODA la orden, independiente de un
                         #      producto ("cliente con prisa", "para llevar"). Viaja en POST /orders
                         #      (specialNote) o se edita después con PATCH /:id/special-note (MESERO+
                         #      CAJA, bloqueado en PAGADA/CANCELADO). Se muestra junto a la orden en
                         #      Cocina/CocinaCaja, separado de las notas por plato.
                         #   2) order_items.special_note: la de siempre, por producto (ProductPicker).
                         #   EDITAR UN ITEM YA AGREGADO (2026-09): PATCH /items/:id ahora acepta
                         #   MESERO además de CAJA, pero solo para notes/specialNote/qty — name/price/
                         #   productId siguen siendo exclusivos de CAJA (403 si el mesero los manda).
                         #   Antes un item quedaba fijo tras agregarlo (sin forma de corregir una salsa
                         #   olvidada sin anular y reagregar). UI: components/EditItemNoteModal.jsx
                         #   (salsas/sabor + nota especial, reutiliza SalsasChips/SaboresChips) y
                         #   components/OrderNoteModal.jsx (nota de la orden), usados en PedidoMesa,
                         #   DetalleMesa, Ventanilla y Domicilios — los 4 lugares donde se arma/edita
                         #   un pedido (ver Convenciones: no arreglar solo una pantalla).
                         #   RAPPI (2026-10): orders.delivery_platform ('RAPPI' | null). Viaja en
                         #   POST /orders (deliveryPlatform) o PATCH /:id/delivery-platform (MESERO+
                         #   CAJA, bloqueado en PAGADA/CANCELADO). Rappi YA le cobró al cliente y le
                         #   paga al local después (semanal): acá nadie cobra. closeOrderIfPrepaid,
                         #   al llegar la orden a LISTO, inserta solo un pago method='RAPPI' por el
                         #   saldo y cierra (PAGADA+archivada+inventario). Si se marca Rappi una
                         #   orden que ya estaba LISTA, cierra ahí mismo. Esa plata NO entra al
                         #   arqueo del día (ver cash.js) pero SÍ a Reportes.
    payments.js          # /payments (orden completa; acepta payments:[{method,amount}] dividido y
                         #   tipAmount); /payments/items (por items; incompatible con descuento → 409);
                         #   PAGO ADELANTADO (2026-08): VENTANILLA/DOMICILIO puede cobrarse en
                         #   NUEVO/EN_PREP (cliente paga al pedir); la orden NO se cierra ahí —
                         #   sigue en cocina y closeOrderIfPrepaid (orders.js) la cierra sola al
                         #   llegar a LISTO (PAGADA+archivada+inventario). MESA sigue exigiendo LISTO.
                         #   valida montos contra el saldo REAL; pago parcial NO libera la mesa;
                         #   inventario se descuenta solo al quedar PAGADA; anular pago: bloqueado si
                         #   su caja ya cerró, repone inventario y devuelve items a pendiente.
                         #   AUDITORÍA COBROS (2026-10): order_items.payment_id vincula cada item con
                         #   el pago que lo cubrió (items → ese pago; cierre por monto/prepago → NULL =
                         #   "cubiertos por monto", los paga el conjunto). Anular un pago libera sus
                         #   items y, si lo que queda pagado ya no alcanza, también los cubiertos por
                         #   monto (antes, anular la transferencia de un efectivo+transferencia dejaba
                         #   los items pagados con saldo y la mesa sin poder cobrarse). INVENTARIO: un
                         #   item descuenta al quedar pagado (por items al pagarse; por monto/prepago
                         #   solo los que seguían sin pagar al cerrar) y repone exactamente los items
                         #   que una anulación devuelve a pendientes.
                         #   Mezcla de flujos: items primero y el resto por monto SÍ; abono por monto
                         #   primero y luego items NO (409 con el saldo) — cobraba cada item completo
                         #   sin descontar el abono (sobrecobro reproducido). Al dividir una fila por
                         #   cantidad se copia también special_note.
                         #   CONTRATO (2026-10-25): method='CONTRATO' = fiado o pedido grande (ej.
                         #   200 sándwiches) que pagan DESPUÉS. Cierra la orden normal (PAGADA+
                         #   inventario+mesa libre) con debtor_name, sin exigir caja — pero NO ES
                         #   VENTA ("hoy comió gratis", dueño): excluido de TODO (arqueo, Reportes,
                         #   PnL). La venta aparece EL DÍA QUE PAGAN: PATCH /payments/contratos/:id
                         #   {settled:true, method} EXIGE caja abierta y crea un pago REAL efectivo/
                         #   transferencia de esa caja con settles_payment_id → el CONTRATO (esa fila
                         #   sí cuenta en arqueo/Resumen/Reportes del día del pago; en "más vendidos"
                         #   de la sesión se filtra settles_payment_id IS NULL para no traer los
                         #   platos cocinados otro día). Deshacer anula ese pago (bloqueado si su
                         #   caja ya cerró). GET /payments/contratos trae pendientes+pagados con los
                         #   items del pedido. UI: chip "Contrato" en el riel (pide nombre) +
                         #   Administración → Contratos (pages/Caja/Contratos.jsx, /contratos,
                         #   tarjetas estilo Órdenes). El CHECK de payments.method se
                         #   reconstruyó otra vez (RAPPI+CONTRATO, mismo patrón). TRAMPA RESUELTA:
                         #   normalizePaymentItemsPayload tiene TRES copias (DetalleMesa.jsx,
                         #   utils/payments.js, CentroTotal.jsx) y su methodMap convertía métodos
                         #   desconocidos a EFECTIVO en silencio — RAPPI/CONTRATO ya están en las 3.
    cash.js              # Caja: POST /cash/open {initialCash} y /cash/session/close {closing_cash,
                         #   declared_transfer, declared_card opcional}. (OJO: /cash/session/open NO
                         #   existe). Arqueo excluye pagos anulados e incluye propinas en efectivo en
                         #   el esperado; los gastos/ingresos manuales (/cash/manual-transactions)
                         #   también entran al esperado, filtrados por created_at DENTRO de la sesión
                         #   (si la plata salió antes de abrir, ya se reflejó al contar la base).
                         #   ARQUEO ELECTRÓNICO (2026-08): además del efectivo contado, el cajero
                         #   declara total de transferencia (siempre) y de tarjeta (opcional — oculto
                         #   en la UI hasta que el local tenga datáfono, ver "Pendientes conocidos");
                         #   cada uno se compara contra lo que el sistema registró (declared_X -
                         #   total_X = diff_X, guardado en cash_sessions y en el snapshot del cierre).
                         #   RAPPI (2026-10): method='RAPPI' se excluye de total_sales, del efectivo
                         #   esperado, del "total" y de las ventas teóricas de /session/:id/summary
                         #   (van aparte en `rappi` {count,total} y en cash_sessions.total_rappi /
                         #   snapshot.totals.total_rappi). Para cuadrar el depósito SEMANAL de Rappi:
                         #   Reportes → sección "Rappi" y hoja "Rappi" del Excel (summary.rappi
                         #   {total,count,byDay}, directo de payments sin caja — un pedido Rappi
                         #   cerrado con la caja cerrada queda con cash_session_id NULL a propósito:
                         #   esa plata no es de ninguna caja). El CHECK de payments.method se reconstruyó
                         #   en database.js para admitir 'RAPPI' (SQLite no edita CHECKs: tabla nueva,
                         #   copia conservando ids, rename, índices recreados).
                         #   manual-transactions: category opcional (ver expenseCategories.js) +
                         #   GET /manual-transactions?from&to&type&category (rango, para Contaduría)
                         #   además del viejo GET /manual-transactions/:date (un solo día).
    reports.js           # /reports/summary?from&to: ventas/propinas/descuentos/canceladas, ticket
                         #   (totals.sales INCLUYE Rappi — es venta del período aunque la plata
                         #   llegue después; totals.rappi dice cuánto de eso es Rappi),
                         #   promedio, top productos, por método/día/hora, pedidos por hora de llegada,
                         #   tiempo de preparación (orders.ready_at). Todo lo monetario cuenta AL PAGAR.
                         #   /reports/pnl?from&to (Contaduría, 2026-08): ventas − compras de insumos
                         #   controlados (inventory_movements type=IN con purchase_total_cost, CASH-
                         #   BASIS: el día que se pagaron, no el día que se vendió lo que llevaban) −
                         #   gastos generales por categoría (manual_transactions EGRESO) + ingresos
                         #   generales (INGRESO) = utilidad neta.
    ingredients.js       # CRUD insumos CONTROLADOS (carne/pulpas, pan, papa...; ver recipes.js/
                         #   inventoryMovements.js). unit = unidad BASE en la que las recetas
                         #   descuentan (ej. gramo); conversion_factor = cuántas unidades base entran
                         #   en 1 unidad de COMPRA (ej. comprás en kg, recetas en gramos → 1000).
                         #   cost_per_unit se recalcula solo con cada compra, no se edita a mano.
    recipes.js           # GET/PUT /recipes/product/:id: ingredientes + qty_used (unidad base) de UN
                         #   producto. Un ingrediente puede estar en varias recetas con qty_used
                         #   distinto (ej. Papa: 2 en "Papas Locas", 1 en "Porción"). Sin receta = el
                         #   producto no descuenta stock (así quedan las verduras y todo lo que va por
                         #   Gastos generales en vez de por acá).
    inventory.js         # /inventory (con stock/min_stock por ingrediente), /inventory/low-stock
                         #   (stock <= min_stock). POST /inventory crea el registro de stock de un
                         #   ingrediente (arranca en 0) — sin esto, /inventory-movements "compra"
                         #   rechaza el movimiento ("no existe inventario").
    products.js         # CRUD productos (CAJA). flavors: CSV de sabores (ej. gaseosas,
                         #   Michelada); flavor_prices: JSON {sabor:precio} (CAJA edita, ej.
                         #   Michelada Poker≠Corona); flavors_active: JSON array = subconjunto de
                         #   flavors disponible HOY (null = todos activos, compatibilidad). PATCH
                         #   /:id/flavors-availability (CAJA + MESERO) solo toca flavors/
                         #   flavors_active, nunca precio — el mesero prende/apaga sabores del día
                         #   y puede agregar uno nuevo (crece flavors) pero NUNCA les pone precio.
    backup.js            # Respaldo movible: GET /backup/excel (un .xlsx con una hoja por tabla,
                         #   sin `sessions`), GET /backup/db (VACUUM INTO → copia exacta) y
                         #   POST /backup/import (sube el .xlsx y REEMPLAZA las tablas; FKs off
                         #   ANTES del BEGIN — el PRAGMA es no-op dentro de una transacción).
                         #   exceljs se carga con import DIFERIDO: el botón de actualizar no
                         #   reinstala node_modules, así el POS arranca igual sin la dependencia.
    inventoryMovements.js # deduct/restoreInventoryFromOrderItems (descuento automático al vender,
                         #   por receta); stock negativo permitido pero auditado (STOCK_NEGATIVE);
                         #   errores auditados (INVENTORY_ERROR). POST /inventory-movements "modo
                         #   compra" (type=IN + purchase_qty + purchase_total_cost): calcula
                         #   cost_per_unit = purchase_total_cost / (purchase_qty × conversion_factor)
                         #   y lo guarda en ingredients — ES el flujo "compré 2kg de carne por
                         #   30.000". UI: botón "Registrar compra" en Ingredientes.jsx.
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
                         #   También PAYMENT_METHOD_LABELS (RAPPI → "Rappi") y DELIVERY_PLATFORM_LABELS.
      expenseCategories.js # Categorías FIJAS de Gastos generales (VERDURAS, SERVICIOS, ARRIENDO,
                         #   NOMINA, ASEO, MANTENIMIENTO, TRANSPORTE, OTROS + APORTE_CAPITAL para
                         #   ingresos). Mismo espíritu que statusLabels.js: un solo lugar traduce
                         #   categoría → texto legible, usado por GastosGenerales.jsx, CierreCaja.jsx
                         #   (gasto rápido del cierre) y Reportes.jsx (sección Contaduría).
      kitchenSound.js    # Chime Web Audio (sin archivos); unlockAudio en primer toque
    components/
      Modal.jsx          # OJO: efecto de foco con deps [open] y onCloseRef — NO agregar onClose a las
                         #   deps (robaba el foco al input en cada tecla: bug "solo deja una letra")
      ModalHost.jsx      # Render de alert/confirm/prompt de marca (useAlert/useConfirm/usePrompt)
      SalsasChips.jsx    # Chips de salsas → escriben en notes del item. categoriaLlevaSalsas()
                         #   las oculta en BEBIDAS/CERVEZAS/JUGOS_NATURALES. Lista central aquí.
      SaboresChips.jsx   # Chips de sabor (single-select, va en notes como "Sabor: X"). Filtra
                         #   por flavors_active vía parseActiveFlavors() — el mesero apaga un sabor
                         #   en Sabores.jsx y automáticamente desaparece acá, un solo lugar alimenta
                         #   ProductPicker/Ventanilla/Domicilios/DetalleMesa/PedidoMesa.
      ItemOptionsSheet.jsx # PANEL POR ITEM (2026-10): sheet en celular / modal en PC con cantidad,
                         #   sabor, salsas, ADICIONALES, observación y nota especial. Lo abre
                         #   ProductPicker al tocar un producto (mode="add") y EditItemNoteModal al
                         #   tocar un item ya agregado (mode="edit"). Antes el formulario quedaba
                         #   inline debajo de la grilla y había que deslizar para encontrarlo.
                         #   Precio unitario = base (según sabor) + adicionales; un item YA enviado
                         #   conserva el precio guardado (no se recalcula).
      AdicionalesChips.jsx # Adicionales = productos de la categoría ADICIONALES del menú (CAJA los
                         #   crea/precia en Menú/Precios — no hay pantalla aparte). Se escriben en
                         #   notes como "+ Queso extra" (cocina los ve pegados al plato) y su precio
                         #   SUMA al precio unitario del item. Trade-off: no descuentan inventario
                         #   por receta (van dentro del plato). ProductPicker manda la pestaña
                         #   ADICIONALES de última. getAdicionales(productsByCategory) es la fuente.
      PlatformBadge.jsx  # Etiqueta "RAPPI" junto al número de orden (Cocina, CocinaCaja,
                         #   DetalleMesa, Domicilios).
      ProductPicker.jsx  # Selector compartido categoría→producto→PANEL (ItemOptionsSheet)→"Agregar".
                         #   Usado por Mesero, Caja (DetalleMesa) y Ventanilla/Domicilios — antes
                         #   cada pantalla tenía su propia versión (algunas con el patrón viejo de
                         #   "agregar al toque y editar después"), causaba desbordes/scroll
                         #   inconsistentes entre pantallas al arreglar solo una. Exporta también
                         #   findProductById() (busca un producto por id en productsByCategory, para
                         #   saber si un item ya agregado tiene sabores/salsas disponibles).
      EditItemNoteModal.jsx # Editar un item YA agregado (pendiente o ya en la orden) — wrapper de
                         #   ItemOptionsSheet en modo edit. Item LOCAL (aún no enviado): además
                         #   cantidad y adicionales (allowQty/allowAdicionales, recalcula precio).
                         #   Item YA ENVIADO: solo salsas/sabor/nota (el PATCH del mesero no toca
                         #   precio). Usado en PedidoMesa, DetalleMesa, Ventanilla, Domicilios.
      OrderNoteModal.jsx # Nota de LA ORDEN completa (orders.special_note), independiente de
                         #   seleccionar un producto. Mismos 4 lugares que EditItemNoteModal.
      OrdenesDrawer.jsx  # Modal con grid de mesas 1-8 + Ventanilla/Domicilios; compartido entre
                         #   Caja y Mesero (antes vivía en components/caja/, se movió a components/
                         #   raíz). OJO: goToTable() siempre navega a /mesa/:id — para Mesero eso
                         #   redirige solo (PedidoMesa detecta mesa especial y manda a /ventanilla o
                         #   /domicilios); para Caja, DetalleMesa.jsx ya maneja el caso especial
                         #   inline (no hay redirect a página separada).
      CajaHeader.jsx     # En compacto (<480px) oculta RoleBadge y subtítulo. position:'relative'
                         #   explícito (NO sticky) — bug de iOS Safari: sticky dentro de un
                         #   contenedor 100dvh+overflow:hidden (patrón usado por CentroTotal/
                         #   DashboardCaja/CocinaCaja) hace que el header desaparezca al mostrar/
                         #   ocultar la barra de direcciones. Si una pantalla nueva arma su propio
                         #   header con className="caja-header" en vez de este componente, hay que
                         #   poner position:'relative' a mano (CocinaCaja.jsx se olvidó una vez).
      caja/BottomNav.jsx # Barra inferior fija (≤768px): RESUMEN/MESAS/"+"/ÓRDENES/MENÚ (rediseño
                         #   2026-10; "COBRAR" pasó a Órdenes → filtro "Listas para cobrar"). "+"
                         #   abre OrdenesDrawer, MENÚ abre caja/MenuDrawer.jsx. Secciones salen de
                         #   shell/cajaNav.js (la misma fuente que la barra lateral).
      caja/MenuDrawer.jsx # Cocina + Reportes (lo que no cabe en la barra) + "Nueva orden" + la
                         #   misma lista ADMIN_NAV de la barra lateral + Salir.
      mesero/BottomNav.jsx # PEDIDOS/"+"/MENÚ, acento azul #1971c2. "+" abre OrdenesDrawer
                         #   (compartido con Caja), MENÚ abre mesero/MenuDrawer.jsx.
      mesero/MenuDrawer.jsx # Sabores del menú (→ Sabores.jsx) + Salir.
      caja/PagoDividido.jsx # Split multi-método con botón "Resto" y validación exacta
    pages/
      Login.jsx          # PIN 4 dígitos con auto-ingreso (sin botón ENTRAR); autodescubrimiento al abrir
      ConfigServidor.jsx # Búsqueda automática + manual con prueba (pública, /config-servidor)
      Mesero/            # Mesas (tarjetas 9/10 → /ventanilla y /domicilios), PedidoMesa (separa
                         #   "Ya en la orden" de "Nuevos items" — NUNCA reenviar items existentes,
                         #   usa ProductPicker), MeseroRoutes monta BottomNav/OrdenesDrawer/
                         #   MenuDrawer + catch-all → "/" (evita pantalla en blanco al cambiar rol),
                         #   Sabores.jsx (prender/apagar sabores del día, ver products.js arriba)
      Ventanilla/ Domicilios/  # Multi-orden (fila de clientes), unir cuentas (caja), importan Caja.css,
                         #   Domicilios tiene el switch "Pedido de Rappi" al armar el pedido (y en el
                         #   detalle de una orden abierta, por si se olvidó). Con Rappi, CAJA NO va al
                         #   riel de cobro al crear (no hay nada que cobrar) y el botón COBRAR se oculta.
                         #   usan ProductPicker para agregar items. OJO: loadOrders es function
                         #   declaration (hoisting) — useVentanillaRefresh la referencia antes de su
                         #   línea (TDZ crasheaba la página)
      Cocina/            # Plato por plato (tocar item = listo, N/M, auto-LISTO), sonido con toggle,
                         #   cronómetro con semáforo (10/20 min), orden por antigüedad
      Caja/              # DetalleMesa (sin selector de mesas propio — se sacó a OrdenesDrawer;
                         #   layout 2 columnas, riel de cobro sticky desktop ≥901px / apilado
                         #   <900px; propina y descuento en el panel de cobro; con descuento COBRAR
                         #   usa orden completa; usa ProductPicker para agregar items, tanto en
                         #   orden existente como al crear orden nueva en mesa especial 9/10),
                         #   CobrarPedidos (split/propina/descuento/recibo), CocinaCaja (vista
                         #   cocina de caja, también plato por plato, tabs en móvil), Mesas.jsx
                         #   (/mesas, plano + panel) y Ordenes.jsx (/ordenes, tarjetas + panel)
                         #   — reemplazan a CentroTotal ("Centro de Control") y MesasAbiertas,
                         #   cuyas rutas redirigen (/centro-total, /cobrar); DashboardCaja
                         #   ("Resumen del turno"), Reportes, MasCaja (/mas = portada de
                         #   Administración), IdentidadNegocio (/identidad). CajaRoutes envuelve
                         #   todo en shell/CajaShell + BottomNav/OrdenesDrawer/MenuDrawer +
                         #   catch-all → /centro. Ver "Rediseño 2026-10" abajo.
                         #
                         #   CONTADURÍA (2026-08) — dos niveles de gasto, no confundir:
                         #   1) Insumos CONTROLADOS (carne/pulpas, pan, papa...): Ingredientes.jsx
                         #      (`/ingredientes`, CRUD + botón "Registrar compra" → modo compra de
                         #      inventoryMovements.js) y botón "Receta" en cada tarjeta de Menu.jsx
                         #      (GET/PUT /recipes/product/:id). Con receta, el stock se descuenta
                         #      solo al vender.
                         #   2) Gastos GENERALES (verduras, servicios, arriendo, nómina...): sin
                         #      receta ni inventario, solo categoría. GastosGenerales.jsx
                         #      (`/gastos-generales`) es el ÚNICO lugar para REGISTRARLOS — funciona
                         #      con la caja abierta o cerrada. El gasto rápido dentro de CierreCaja.jsx
                         #      ("+ REGISTRAR GASTO DE CAJA") sigue existiendo aparte porque ajusta el
                         #      arqueo del efectivo en vivo mientras se cierra; ambos escriben en
                         #      manual_transactions con category.
                         #   Reportes.jsx tiene una sección "Contaduría" (GET /reports/pnl) que junta
                         #   ventas − compras controladas − gastos generales + ingresos generales.
                         #
                         #   MENÚ SIMPLIFICADO (2026-08) — OPCIONES (MasCaja.jsx) tenía 15+ botones;
                         #   se juntaron pantallas relacionadas en 3 pantallas nuevas con pestañas
                         #   (mismo patrón: prop `embedded` en el componente original, que se salta su
                         #   propio CajaHeader/container cuando se usa adentro de una pestaña):
                         #     - HistorialGeneral.jsx (ruta `/historial`, pestañas PAGOS/CIERRES) usa
                         #       `<Historial embedded />` y `<HistorialCierres embedded />`.
                         #     - Conexion.jsx (`/conexion`, pestañas ESTADO/CONFIGURAR) usa
                         #       `<Diagnostico embedded onGoToServer={...} />` y `<ConfigServidor
                         #       embedded />`. OJO: `/config-servidor` sigue existiendo standalone
                         #       (embedded=false por defecto) porque es ruta PÚBLICA (Login.jsx,
                         #       ConnectionBanner.jsx la usan sin sesión) — no se puede eliminar.
                         #     - Aplicacion.jsx (`/aplicacion`): BUSCAR ACTUALIZACIONES + DESCARGAR
                         #       DATOS (EXCEL) + RESTAURAR DATOS + COPIA DE SEGURIDAD, sacados enteros
                         #       de MasCaja.jsx (antes vivían ahí inline).
                         #   HistorialSesiones.jsx (`/historial-caja`, "HISTORIAL DE CAJA" en el menú)
                         #   pasó a ser SOLO LECTURA (ya no se puede agregar/borrar transacción manual
                         #   ahí) — quedaba un tercer camino para lo mismo que Gastos generales, que
                         #   es justo el patrón de "doble navegación confusa" (ver Convenciones).
                         #   TRAMPA: no reusar las clases `.centro-total-tabs`/`.centro-total-tab`
                         #   para pestañas nuevas que no sean las de CentroTotal — mobile-polish.css
                         #   las oculta con `display:none !important` en <768px porque ahí son
                         #   redundantes con BottomNav; en una pantalla nueva NO lo son y las pestañas
                         #   quedan invisibles en el celular (bug real de esta sesión, se corrigió
                         #   sacando el className y dejando solo estilos inline).
    styles/
      chanatos-theme.css # Design tokens v2 "estilo Apple" (rediseño 2026-08): grises iOS (--gray-*),
                         #   semánticos con variante -text legible (--green/-red/-orange/-blue),
                         #   marca (--brand, --brand-deep para texto ámbar AA), escala --text-11..34,
                         #   radios/sombras 2 capas/--ease-ios; carga la fuente Inter Variable local
                         #   (public/fonts/, el POS corre sin internet). Los alias --chanatos-* v1 se
                         #   RETIRARON en fase 6 — no reintroducirlos. Modales z-index 3000: SIEMPRE
                         #   encima de recibos. Plan completo: docs/plan-rediseno-visual-2026-08.md
      primitives.css     # Primitivas del sistema: .btn (variantes), .card, .list-group/.list-row
                         #   (+ .list-group--inset para dentro de modales), .segmented, .pill,
                         #   .switch (iOS), .tnum (números tabulares: SIEMPRE en precios), sheet
                         #   móvil de .chanatos-modal (<768px, CSS puro — Modal.jsx intocado).
                         #   TODO estilo nuevo parte de acá; no inventar botones/cards ad-hoc.
      mobile-polish.css  # Capa global móvil (@media max-width:768px, MISMO breakpoint que BottomNav):
                         #   targets 46px, safe-areas (notch), grillas de categorías TODAS visibles
                         #   (no carrusel), colores explícitos en botones (iOS los pinta azul),
                         #   headers sticky, input/textarea/select a 16px (si queda más chico, Safari
                         #   hace zoom automático al tocar el campo — bug real, no se ve en Chrome/
                         #   Android). Acá también se ocultan los restos del nav viejo que ya cubre
                         #   BottomNav (.centro-total-tabs, .dashboard-caja-launcher,
                         #   .caja-header-opciones-btn, .mesero-header-logout-btn) — TRAMPA: estaban
                         #   en posMobile.css con
                         #   @media max-width:480px y quedaban las DOS navegaciones a la vez entre
                         #   480-768px (ventana de PC no maximizada). Cualquier regla que oculte algo
                         #   porque "ya lo cubre BottomNav" tiene que ir en ESTE archivo a 768px, no
                         #   en posMobile.css. Los ajustes móviles nuevos van AQUÍ.
      posMobile.css      # Kit mínimo @media max-width:480px SOLAMENTE (anti word-break, espaciados
                         #   chicos). No usar para nada relacionado con BottomNav (ver arriba).
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

## PARA CLAUDE EN EL PC DEL LOCAL — aplicar la actualización 2026-10-25

Si estás corriendo en el PC Windows del restaurante (o guiando a alguien ahí), esta
actualización ya está publicada en GitHub y aprobada por el dueño. Aplícala así, EN ORDEN,
y al terminar borra esta sección y haz commit de ese borrado.

1. **Respaldo primero (obligatorio esta vez):** en el POS → Administración → Aplicación →
   DESCARGAR DATOS (EXCEL). Guardar el archivo fuera del PC (USB o correo). Es la red de
   seguridad del paso 3.
2. **Actualización remota:** Administración → Aplicación → BUSCAR ACTUALIZACIONES (o el icono
   "Actualizar POS Chanatos" del escritorio). Baja el release "latest" y reinicia el servidor;
   las migraciones de la base corren solas al arrancar.
3. **Instalador nuevo (Instalar-POS-Chanatos.exe, el dueño lo tiene):** instalarlo encima.
   Este instalador saca la base de datos de la carpeta de instalación hacia
   `%APPDATA%\POS Chanatos\datos\pos_chanatos.db` (customInit de installer.nsh la rescata
   ANTES de que el desinstalador viejo borre la carpeta, y main.js la migra si hiciera falta).
   **Verificar después de instalar:** que ese archivo exista y que el POS muestre las ventas
   de siempre (Historial). Si no están: restaurar el Excel del paso 1 (Aplicación → RESTAURAR
   DATOS).
4. **Órdenes fantasma:** con las reglas nuevas, pedidos viejos archivados sin cobrar pueden
   reaparecer en Órdenes como "Hace N días". Cancelarlos una vez (motivo: "orden vieja sin
   cobrar") o cobrarlos si fueron reales. La mesa queda libre.
5. **Celulares:** instalar el APK nuevo en cada uno (el dueño lo tiene:
   POS-Chanatos-rediseno-2026-10-25.apk). La actualización remota NO llega a las APK. Las PWA
   del navegador se actualizan solas al recargar.
6. **Prueba rápida:** crear un pedido en una mesa → verlo en Cocina → marcarlo listo →
   cobrarlo → recibo. Revisar que "Cierre de caja" aparece abajo en la barra lateral.

Qué trae (resumen para el equipo): navegación nueva de Caja (Resumen/Mesas/Órdenes/Cocina/
Reportes + Administración), cobro y edición en una hoja sin cambiar de pantalla, cocina marca
por unidad ("3/5"), salsas y "Quitar" por producto, cliente en Ventanilla/Domicilios, sonido
de orden lista en Caja, cierre contando billetes, sección Rappi en Reportes, recibo corregido
(cuenta completa) con WhatsApp, y las ventas del PC protegidas contra reinstalaciones.

## Sincronización con Rappi (lado del POS listo, 2026-10-25)

`backend/services/rappiPoller.js` (misma arquitectura que webOrdersPoller: el POS solo hace
conexiones SALIENTES contra un relevo en la nube). Crea el pedido como Domicilio+RAPPI con el
cliente y los PRECIOS DE RAPPI tal cual (el cliente ya pagó allá), enlaza product_id por nombre
(inactivo o desconocido → item personalizado), idempotente vía web_order_id `rappi-<id>`, y
reporta al relevo ready/cancelled (un Rappi se cierra solo al quedar listo → PAGADA cuenta como
ready). NO-OP sin `RAPPI_ORDERS_ENDPOINT` / `RAPPI_ORDERS_SECRET` / `RAPPI_POLLER_PIN`
(+ `RAPPI_POLL_INTERVAL_MS`, 15s). El contrato HTTP del relevo está en el encabezado del
archivo. FALTA (bloqueado por Rappi): que el dueño consiga credenciales en dev-portal.rappi.com
/ partners.rappi.com; con eso se construye el relevo (webhooks de Rappi → cola, estilo del
servicio de pedidos web en Railway) y se certifica con ellos.

## Rediseño 2026-10 (contenedor de Caja, identidad, movimiento)

Referencias en `docs/referencias-diseno/` (01 Resumen, 02 estructura, 03 movimiento del
recibo, 04 plano de mesas, 05 órdenes). Las referencias dan la estructura; la identidad
es Chanatos (mostaza, carbón, fondos cálidos, la forma orgánica de PagoExitoso).

- **Contenedor:** `components/shell/CajaShell.jsx` + `shell.css` — barra lateral fija
  (>768px; 769–1099 contraída a iconos) con Resumen/Mesas/Órdenes/Cocina/Reportes y
  "Administración" agrupada. `shell/cajaNav.js` (MAIN_NAV, ADMIN_NAV, sectionFor) es la
  ÚNICA lista de secciones: la usan la barra lateral, caja/BottomNav, caja/MenuDrawer y
  MasCaja. Pantalla nueva = agregarla ahí. Los encabezados viejos (CajaHeader,
  .detalle-mesa-header, .ventanilla-header) toman forma de tarjeta por CSS en shell.css.
- **Piezas compartidas (`components/ui/`)**: PageHeader (símbolo de marca solo en
  celular), SidePanel (≥1280 columna fija 360px; 769–1279 flotante con velo; ≤768 hoja
  desde abajo; SidePanelIdle reserva el lugar en escritorio ancho), StatusPill/PlaceTag,
  Toast (`toast('Pedido enviado')` — SOLO después de que el servidor confirmó; errores
  siguen con showAlert bloqueante), EmptyState (forma mostaza + mensaje específico),
  Icon. `components/orders/` (OrderCard, OrderDetail, OrderActions, accionesOrden.js) y
  `components/kitchen/KitchenTicket.jsx` (lo usan Cocina.jsx Y CocinaCaja.jsx).
  OJO: macOS no distingue mayúsculas — `OrderActions.jsx` y un `orderActions.js` chocan.
- **Iconos:** `ui/Icon.jsx` = trazos de Lucide + animaciones de Lucide Animated (MIT,
  github.com/pqoqubbw/icons) portadas a CSS (`icon-motion.css`), sin la dependencia
  `motion`. Animan con la prop `play` (al tocar/seleccionar/confirmar), nunca con hover.
  NavIcons.jsx delega en Icon. Nada de emojis. Afinadas a pedido del dueño (2026-10): la
  bici de Domicilios sale por la derecha y vuelve a entrar (el SVG la recorta: `.icon-domicilio
  { overflow: hidden }`), la olla de Cocina se mece de lado a lado con la tapa detrás.
- **Tarjetas que se elevan** (referencia "Admin Dashboard V7", `whileHover y:-5` de
  framer-motion hecho en CSS, ui.css): .kpi, .order-card, .mesa-tile, .admin-card suben 4 px
  con mouse (`@media (hover:hover) and (pointer:fine)`), se hunden al tocar en pantallas
  táctiles; la seleccionada conserva su aro. Los tickets de cocina NO se mueven.
- **Stock bajo fuera del Resumen** (2026-10-25): el inventario va a vivir en otra plataforma
  (`/Users/cristian/Developer/chanatos-plataforma-dev`); no invertir en Ingredientes/Recetas del
  POS sin preguntar. Se quitó también de Reportes; sigue en Menú → Ingredientes.
- **Datos en vivo:** `hooks/useLiveOrders.js` (órdenes activas + mesas, recarga agrupada
  por socket, nunca vacía la pantalla, `changedIds` para el resaltado de ~800 ms),
  `useChangedIds.js`, `useNow`. Los handlers de socket SIEMPRE con función nombrada en
  `socket.off(ev, fn)` — `socket.off(ev)` borra los de otras pantallas (bug real).
- **Backend agregado:** GET /orders trae `itemsTotal`, `paidAmount`, `saldo` por orden
  (mismo cálculo que GET /:id); GET /cash/session/:id/activity (ventas por hora, más
  vendidos y actividad reciente de la sesión, sin Rappi — mismo criterio que "Total
  cobrado"); GET /settings/business (público) y PUT (CAJA) = Identidad del negocio
  (business_name, business_logo data URL ≤250 KB, receipt_footer, business_nit/address/
  phone — vacíos por defecto: el recibo NO muestra datos inventados), emite
  `settings:business-updated`. `hooks/useBusiness.js` la cachea; BrandMark, Login,
  CajaShell y Recibo la leen. Respaldos automáticos: `dirname(DB_PATH)/backups`.
- **Tokens:** grises cálidos en las mismas variables `--gray-*` (50 fondo #F5F5F2, 100
  borde #E8E8E3, 600 texto secundario #626262, 900 texto #191919) + `--bg/--surface/
  --text/--text-2/--border`, `--radius-card` 22, `--radius-control` 14, `--s-8..32` y
  duraciones `--dur-press/select/panel/enter/flash/receipt` (prefers-reduced-motion las
  lleva a 1ms). Colores de estado iguales en todo el POS: nuevo azul, en preparación
  naranja, listo verde, libre neutro; Ventanilla mostaza, Domicilios lila.
- **Borrador de productos:** ProductPicker recibe `draftItems` y muestra cantidad e
  importe sin enviar; "Añadido al pedido" al sumar al borrador, "Pedido actualizado" /
  "Pedido enviado" tras el servidor. Las 4 pantallas vacían el borrador SOLO si el
  guardado respondió bien (antes Caja/Ventanilla/Domicilios lo perdían al fallar).
- **Cocina por unidad:** `order_items.ready_qty` = unidades listas de la fila ("5×
  Hamburguesa" → 3/5); `ready_at` sigue significando "fila completa" (ready_qty >= qty).
  PATCH /orders/items/:id/ready acepta `{delta: 1|-1}` (lo que manda cocina: dos pantallas
  a la vez suman bien) y `{ready: true|false}` (fila entera, clientes viejos).
  `syncItemReady` / `advanceIfAllReady` (orders.js): cambiar la cantidad, eliminar o anular
  lo único que faltaba pasa la orden a LISTO sola (antes quedaba "todo marcado" en EN_PREP).
  Cobrar parte de una fila (/payments/items con qty) reparte las unidades listas entre las
  dos filas. UI: `KitchenItems` (exportado de KitchenTicket, también en el detalle de
  CocinaCaja): tocar = una más, línea completa = quita una, "−" para corregir.
- **Hoja de trabajo (`components/orders/OrderWorkspace.jsx`):** Cobrar / Agregar
  productos / Revisar desde Órdenes y Mesas abren DetalleMesa con `embedded` dentro de
  una hoja, sin cambiar de página (Órdenes guarda `?abierta=<id>`). Mismo cobro, sin
  segunda versión de la lógica; al cerrar el recibo de una orden pagada la hoja se cierra
  sola. OJO: la hoja no puede quedar con `transform` (atrapa los fixed de recibo/modales).
  Tarjetas y panel de Órdenes encabezan con el LUGAR (Mesa 4 / Ventanilla), el número
  de comanda va chico (en el local se ubica la orden por el lugar). En preparación, el
  panel ofrece "Marcar lista" (PATCH status LISTO, pide un segundo toque — `confirmLabel`
  en accionesOrden.js; `onCard:false` la deja fuera de la tarjeta) y cada producto muestra
  "3 de 5 listas en cocina".
- **Panel de producto (ItemOptionsSheet):** con cantidad ≥ 2 (modo add) "Todas iguales /
  Cada una distinta": cada unidad tiene sus opciones y al agregar se juntan las iguales
  (`onSubmit({... split})`, ProductPicker agrega una línea por combinación). Se quitó
  "Observación" (editaba a mano el mismo texto de salsas/adicionales/sabor); queda UNA nota
  del producto (special_note) + `QuitarChips` ("Sin queso"…, tokens en notes como las
  salsas; cocina los resalta). La lista de "Quitar" se edita en Menú → "Salsas, quitar y
  sabores" (GET/PUT /settings/quitar, clave `quitar`; vacía = la sección no aparece;
  "tomate" se guarda como "Sin tomate"). La nota de TODA la orden es el botón
  "+ Nota de toda la orden (para cocina)" de las 4 pantallas.
- **Salsas / "Quitar" POR PRODUCTO:** products.salsas y products.quitar (NULL = lista
  general, "" = no lleva, "A,B" = propias). Menú → Editar producto (`caja/OpcionesProductoField`)
  y "Salsas, quitar y sabores" → aplicar a varios / categoría entera (`caja/AplicarOpcionesVarios`,
  PATCH /products/options/bulk). ItemOptionsSheet pasa `lista` a SalsasChips/QuitarChips; una
  lista propia manda aunque la categoría no lleve salsas.
- **Hoja de trabajo compartida:** `orders/OrderWorkspaceHost` (envuelve CajaRoutes) →
  `useOrderWorkspace().abrirOrden(order)` / `.abrirMesa(table)`. Lo usan Mesas (también
  "Iniciar orden"), CocinaCaja (Cobrar / Modificar) y el "+" (OrdenesDrawer, solo Caja; el
  mesero sigue yendo a su pantalla). Órdenes conserva su hoja propia (`?abierta=` en la URL).
  `abrirEstacion('VENTANILLA'|'DOMICILIOS')`: Ventanilla.jsx / Domicilios.jsx con `embedded`
  (sin encabezado; al crear, Caja pasa la hoja al cobro de esa orden con onOpenOrder). Las
  rutas /ventanilla y /domicilios siguen para el mesero y links viejos.
- **Borrador protegido:** `hooks/useSalirConBorrador` — "Volver" (4 pantallas) y la X de la hoja
  preguntan "Hay productos sin enviar" (Seguir armando / Salir sin enviar). "‹ Categorías"
  (ProductPicker) es sticky bajo el encabezado (`--pp-sticky-top`). OJO: un `overflow-x:
  hidden` en un contenedor rompe los sticky de adentro — usar `clip`.
- **Cobro reordenado (2026-10-25):** DetalleMesa bajó de ~3.360 a ~2.820 líneas sin cambiar
  comportamiento. `pages/Caja/cobro/recibo.js` = ÚNICO armador del recibo final
  (tableLabelOf, quedoPagada, armarRecibo) — los 4 flujos (cobrar todo, abono en efectivo,
  dividir por producto, dividir por monto) pasan por `mostrarReciboFinal` en DetalleMesa; antes
  cada uno armaba el suyo y por eso el recibo de una cuenta dividida salía solo por el último
  pago. `pages/Caja/cobro/RielCobro.jsx` = columna derecha (total, métodos, propina, COBRAR,
  Dividir cuenta) extraída tal cual, SOLO presentación: el estado y payActiveOrder siguen en
  DetalleMesa. Verificado contra capturas antes/después y la batería e2e completa.
- **Cierre contando billetes** (`caja/ContadorEfectivo`, 2026-10-25): el efectivo contado
  del cierre arranca en "Contar billetes" (denominaciones COP, suma sola); "Escribir total"
  sigue disponible y conserva lo contado.
- **Sonido en Caja** (`hooks/useSonidoCaja` + listener en CajaShell): chime al quedar LISTA
  una orden (order:status-changed), en cualquier pantalla de Caja; notificación de Windows si
  la app de escritorio está minimizada. Toggle en la barra lateral y en caja/MenuDrawer
  (localStorage `caja_sonido`). El push nativo sigue desactivado (crasheaba el APK).
- **Nombre del cliente** (orders.customer_name, 2026-10-25): opcional al crear en Ventanilla/
  Domicilios (POST /orders customerName; el poller web manda pedido.customer.name). Se ve en
  OrderCard/OrderDetail/KitchenTicket/hoja y se busca en Órdenes. Las mesas no lo usan.
- **WhatsApp en el recibo** ("Enviar por WhatsApp", Recibo.jsx): comparte el recibo como
  TEXTO vía wa.me — sin dependencias, funciona en APK/PWA/PC. Los controles de impresión
  siguen ocultos (SHOW_PRINT_CONTROLS); la barra `recibo-acciones` (WhatsApp + Imprimir) es
  la única visible y no sale al imprimir.
- **Caja del día** (`shell/CajaDelDiaButton`, `CIERRE_NAV` en cajaNav.js): "Cierre de caja"
  salió de Administración — botón carbón fijo abajo en la barra lateral (mostaza y "Abrir caja"
  si está cerrada, usa useCajaAbierta), primero en caja/MenuDrawer y botón oscuro con nombre en
  el Resumen. Se usa todos los días (dueño, 2026-10-25).
- **Compras, inventario y contabilidad OCULTOS en el POS** (2026-10-25; van a vivir en
  chanatos-plataforma-dev): "Compras y gastos" fuera de Administración (/compras → /mas;
  Compras.jsx, RegistrarCompra, Ingredientes y GastosGenerales se conservan), botón "Receta" fuera
  de Menú, "Consumo de insumos" y "Contaduría" fuera de Reportes (pantalla y Excel). Las rutas del
  servidor (/reports/pnl, recipes, inventory-movements, manual-transactions) siguen. El "Registrar
  gasto de caja" del Cierre de caja SÍ queda: lo necesita el conteo del efectivo. Las secciones
  CONTADURÍA (2026-08) de este archivo describen lo que hay detrás, ya no lo que se ve.
- **Barra lateral fija:** body/#root usan `overflow-x: clip` (no hidden): hidden convertía
  #root en contenedor con scroll y el `position: sticky` de la barra se iba con la página.
- **Teclado abierto:** `hooks/useKeyboardOpen.js` pone `body.kb-open` mientras se escribe
  y mobile-polish.css esconde las barras inferiores (en Android tapaban el campo).

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

# Publicar una actualización remota (el PC la instala con el botón OPCIONES→APLICACIÓN→BUSCAR ACTUALIZACIONES)
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
mete el token en localStorage y captura pantallas. Anchos de referencia del rediseño
2026-10: 320, 390, 768 (aún celular: BottomNav ≤768), 1024 (barra lateral contraída)
y 1440. **Pruebas con datos: base SEPARADA** — copiar la BD con
`sqlite3 backend/data/pos_chanatos.db "VACUUM INTO '<scratch>/pos_test.db'"` y arrancar
`DB_PATH=<scratch>/pos_test.db node server.js` (los respaldos automáticos quedan junto a
esa base). Nunca crear ventas de prueba en la base habitual de la Mac.
**Regla: cambio de UI = captura antes de entregar.** El ErrorBoundary muestra el
detalle técnico del error en pantalla (sirve para diagnóstico en sitio).

## Roles y acceso (PIN de 4 dígitos, auto-ingreso)

- **MESERO** (1234) — Mesas, pedidos, ventanilla/domicilios multi-orden, enviar a preparación, cancelar pedidos NUEVO/EN_PREP, ver cualquier orden, prender/apagar sabores del día (Sabores.jsx — nunca precio ni productos)
- **COCINA** (5678) — Pedidos plato por plato, devolver a preparación, archivar
- **CAJA** (9012) — Todo: cobrar (dividido/parcial/propina/descuento), unir cuentas, anular, caja, reportes, auditoría

## Reglas de negocio clave

- **Una mesa (1-8) = una orden activa = una cuenta.** Ventanilla (mesa 9) y Domicilios (10) permiten múltiples órdenes.
- Agregar items a una orden LISTO la **regresa a EN_PREP** (solo lo nuevo se resalta en cocina).
- **PAGADA y CANCELADO son terminales** para modificaciones; cancelar exige motivo y cero pagos válidos.
- Todo lo monetario de reportes/arqueo cuenta **al pagar**, no al pedir.
- Propina separada de la venta (payments.tip_amount); descuento por orden (orders.discount_amount + motivo, auditado).
- **Rappi (2026-10):** un pedido marcado Rappi lo paga Rappi después, no el cliente en el local.
  Se cierra solo al quedar LISTO con un pago `RAPPI`; NO entra en el total ni en el arqueo del
  cierre de caja ni en el "Total cobrado" del Resumen (se muestra aparte como "Rappi, paga
  después"), pero SÍ cuenta como venta en Reportes/Contaduría. En DetalleMesa el único método
  ofrecido para una orden Rappi es "Rappi".
- **Contrato (2026-10-25):** fiado o pedido grande que pagan después. "Hoy comió gratis": el día
  del contrato NO es venta ni plata (excluido de Reportes y arqueo). La venta y la plata aparecen
  EL DÍA QUE PAGAN: marcar "Ya pagó" en Administración → Contratos exige caja abierta, pregunta
  efectivo/transferencia y registra un pago real de esa caja (entra al arqueo y a Reportes de ese
  día). Deshacer anula ese pago, salvo que su caja ya haya cerrado.
- **Caja abierta / cerrada (2026-10):** los pedidos se toman SIEMPRE, con o sin caja (mesero,
  caja, cocina). Sin caja abierta NO se cobra (payments.js 400), no se anulan pagos viejos sin
  sesión, y la página de pedidos web no deja pedir (webOrdersPoller.js le reporta `isOpen`).
  Se puede abrir con $ 0. Mesas/Órdenes muestran `ui/CajaCerradaAviso` (hook
  `useCajaAbierta`, sockets cash:session-opened/closed). CUENTAS ABIERTAS: abrir caja archiva
  SOLO las PAGADA; las cuentas sin cobrar pasan a la caja nueva (antes se archivaba todo y un
  pedido tomado con la caja cerrada desaparecía de cocina y de Caja dejando la mesa bloqueada
  — pasó en la base de la Mac el 2026-08-06 y el 2026-10-21). `archived_at` = solo "limpio de
  la pantalla de COCINA": GET /orders (no cocina), /tables, /orders/table/:id?active=1 y la
  bandeja de cobro muestran toda orden con paid_at NULL y estado activo aunque esté archivada;
  agregar productos o volver a NUEVO/EN_PREP la desarchiva (si no, cocina no veía lo nuevo);
  el cierre de caja cuenta también las LISTO archivadas sin cobrar.
- **Timestamps SIEMPRE explícitos en hora Bogotá** (`toBogotaSQLiteTimestamp`) — el DEFAULT CURRENT_TIMESTAMP de SQLite es UTC y ya causó un bug de +5h. Nunca confiar en el default.
- **Contaduría (2026-08):** dos niveles de gasto que NO se mezclan (ver Estructura → Caja/ para el detalle de pantallas). Insumos controlados (carne, pan, papa...) llevan receta + descuento de stock automático al vender. Todo lo demás (verduras, servicios, arriendo, nómina) es un monto suelto por categoría en Gastos generales, sin inventario. El arqueo de tarjeta (`declared_card`) existe en el backend pero está oculto en la UI hasta que el local tenga datáfono.

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
- Navegación móvil (Caja/Mesero, <768px): barra inferior fija + "+" central (OrdenesDrawer) + ☰ MENÚ
  (drawer propio por rol) — ver `components/caja/` y `components/mesero/`. Si se agrega una pantalla
  nueva alcanzable por dos caminos (ej. barra inferior Y un botón viejo que hacía lo mismo), hay que
  ocultar el viejo en mobile-polish.css a 768px — NO dejarlo "por si acaso", genera doble navegación
  confusa (bug real ya reportado dos veces esta sesión: "menú duplicado").
- Cambios de UI ⇒ `npm run build` + regenerar APK + actualizar zip de Windows si aplica; el usuario recibe los artefactos en su Escritorio. Para el PC del local ya instalado, publicar remoto con `publicar-actualizacion.sh` (ver "Actualización remota")
- Branding: ámbar #F5BB4C (los rellenos de barras/datos usan #B8860B, validado para contraste); moneda COP (`formatPriceCOP`); zona America/Bogota
- Commits en español con Co-Authored-By de Claude; push a `main` de https://github.com/MMozquitoo/POS--CHANATOS

## Respaldo y reinstalación (importante)

DATOS FUERA DE LA INSTALACIÓN (2026-10-25): la base vive en `%APPDATA%\POS Chanatos\datos\`
(main.js pasa DB_PATH al backend; los respaldos automáticos quedan al lado). Reinstalar el .exe
YA NO borra las ventas: installer.nsh (customInit) rescata la base vieja de
`resources\backend\data\` ANTES de que el desinstalador anterior borre $INSTDIR, y main.js
(prepararDatos) migra si hiciera falta. OJO: esto rige desde el .exe con este cambio — la
PRIMERA actualización desde una versión vieja aún debe hacerse con respaldo (el rescate del
instalador lo cubre, pero es la única red). Procedimiento con respaldo, recomendado igual:

1. En el POS: OPCIONES → APLICACIÓN → **DESCARGAR DATOS (EXCEL)** (o COPIA DE SEGURIDAD COMPLETA
   para el `.db` exacto). Guardar el archivo fuera del PC (USB o correo).
2. Instalar la versión nueva.
3. OPCIONES → APLICACIÓN → **RESTAURAR DATOS DESDE ARCHIVO** y subir el `.xlsx`.

El round-trip está verificado como exacto (mismos datos y timestamps; solo cambia el orden de las
columnas cuando la BD vieja tenía columnas agregadas con ALTER TABLE). El import es transaccional:
si el archivo viene mal, los datos quedan como estaban.

## Pendientes conocidos (decisión del dueño)

- Impresora térmica de cocina (no hay impresora aún). Mientras tanto están OCULTOS (2026-10-25)
  "Impresora" de Administración (/impresora redirige a /mas) y el botón "Imprimir en térmica"
  del recibo (`IMPRESORA_TERMICA_LISTA` en Recibo.jsx): la app de escritorio actual NO expone
  posElectron.getPrinters/printReceipt (preload.js solo tiene notify y zoom), así que fallaban.
  Activarla = agregar esas funciones en desktop/preload.js + main.js (reinstalar el .exe con
  respaldo previo; el botón de actualizar no cambia la app de escritorio).
- Facturación electrónica DIAN (no están registrados aún)
- Usuarios por empleado (PIN individual), ficha de clientes para domicilios, resumen remoto del dueño
- Datáfono: el dueño evalúa Bold/Wompi (persona natural con RUT); el método TARJETA ya existe en el POS,
  y el arqueo de tarjeta en el cierre de caja también (backend listo, oculto en la UI — ver "Reglas de negocio clave")
