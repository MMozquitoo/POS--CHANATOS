# Plan de rediseño visual "estilo Apple" — POS Chanatos

**Fecha:** 2026-08-02 · **Alcance:** solo capa visual (CSS + estructura JSX de presentación). Cero cambios de lógica, rutas, API o base de datos.

## Objetivo

Que el POS se vea y se sienta como una app de Apple — claridad, jerarquía tipográfica, profundidad sutil, una acción obvia por pantalla — en celular (meseros/cocina) y en computador (caja/dueño), **sin reescribir la app**. El lenguaje Apple es compatible al 100% con la filosofía ya establecida ("el personal no debe pensar", targets ≥46px, sin enums visibles).

## Traducción del lenguaje Apple a este stack (web/React)

| Concepto Apple | Cómo se implementa aquí |
|---|---|
| SF Pro (tipografía) | **Inter** (fuente libre, métrica casi idéntica a SF) empaquetada localmente en `frontend/public/fonts/` — NO por CDN (el POS corre sin internet). Fallback `-apple-system, system-ui`. |
| Large Title (título grande que colapsa) | Encabezado 28–34px/700 en cada pantalla, subtítulo 15px gris. En scroll no hace falta colapsar (complejidad sin beneficio); basta título grande fijo arriba. |
| Tab bar translúcida | `BottomNav` con `backdrop-filter: blur(20px)` + fondo `rgba(255,255,255,0.85)` + borde superior hairline. **Probar en el WebView Android real** — si el blur pega en rendimiento, fallback a fondo sólido al 97%. |
| Grouped lists (estilo Ajustes de iOS) | Menús (MenuDrawer, MasCaja, Reportes) como listas agrupadas: bloques blancos radius 12, separadores hairline inset, chevron a la derecha. |
| Segmented control | Tabs (CentroTotal, CocinaCaja, filtros de Reportes) como segmented iOS: pastilla gris `#F2F2F7` con segmento activo blanco elevado. |
| Sheets (hojas modales) | En móvil los modales suben desde abajo con esquinas superiores redondeadas y "grabber" (barrita gris); en desktop quedan centrados como ahora. Solo CSS + una clase en `Modal.jsx`. **NO tocar el efecto de foco** (bug conocido "solo deja una letra"). |
| Profundidad sutil | Sombras difusas de 2 capas (`0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.08)`), nada de bordes duros. Cards radius 14–16. |
| Feedback al tocar | `:active { transform: scale(0.97) }` + transición 150ms en todo botón/card tocable. |
| Semántica de color iOS | Verde `#34C759`, rojo `#FF3B30`, naranja `#FF9500`, azul `#0A84FF` para estados — **validar contraste AA** sobre blanco antes de fijarlos (el verde iOS sobre blanco falla AA en texto chico; usar versión oscurecida para texto, la viva solo para rellenos/pills). El ámbar Chanatos `#F5BB4C` sigue siendo EL acento de marca (botón principal, activo del nav). |

## Fase 0 — Fundación (la que evita que esto se vuelva otro parche)

**Archivos:** `chanatos-theme.css` (reescritura), nuevo `primitives.css`, `index.css`.

1. **Tokens v2** en `chanatos-theme.css`: escala tipográfica iOS (11/13/15/17/20/22/28/34), escala de grises iOS (`#F2F2F7`, `#E5E5EA`, `#C7C7CC`, `#8E8E93`, `#3A3A3C`, `#1C1C1E`), radios (10/14/16/22), sombras 2 capas, easings (`cubic-bezier(0.32, 0.72, 0, 1)` — el de las sheets de iOS). Mantener los nombres de variables viejos como alias durante la transición para no romper los 20 CSS existentes de golpe.
2. **Primitivas** (`primitives.css`): `.btn` (primario ámbar/secundario gris claro/destructivo rojo/ghost), `.card`, `.list-group` + `.list-row`, `.segmented`, `.pill` (estados de orden), `.sheet`. Todas con estados active/disabled y target 46px.
3. **Fuente Inter** local (woff2 latin, ~100KB total): pesos 400/600/700/800.
4. **Modal.jsx**: clase `sheet-mobile` (CSS-only, media query <768px). Sin tocar deps de efectos.
5. Actualizar el harness Playwright: captura 390px y 1920px de las 12 pantallas clave, guardadas como "ANTES" para comparar cada fase.

**Estimación: 1 sesión.** Riesgo: bajo (aditivo; los alias evitan romper CSS viejo).

## Fase 1 — Login + navegación global (la primera impresión)

- **Login (móvil y desktop):** teclado PIN estilo código de iPhone — botones circulares grandes (72px) con dígito, puntos de progreso arriba (4 círculos que se llenan), logo C centrado, fondo degradado sutil ámbar→crema. Sacude (shake animation) con PIN incorrecto. Ya tiene auto-ingreso, encaja perfecto.
- **BottomNav Caja y Mesero:** blur translúcido, iconos SF-style (trazos 1.5px — usar SVGs inline propios, sin librería nueva), etiqueta 10px, "+" central como botón flotante ámbar circular 56px que sobresale (patrón tab bar con acción central). Activo = ámbar, inactivo = `#8E8E93`.
- **CajaHeader:** título grande, altura menor, sin cajas alrededor. Respetar `position:relative` (trampa iOS Safari documentada).
- **MenuDrawer / OrdenesDrawer:** convertir a sheets con grabber; grid de mesas del drawer con celdas redondeadas y estados por color semántico.
- **Desktop:** header alineado a un contenedor max-width 1280 centrado, misma jerarquía.

**Estimación: 1–1.5 sesiones.** Verificación: capturas + probar blur en Android real.

## Fase 2 — Mesero (el usuario más frecuente, celular casi siempre)

- **Mesas:** grid 2 columnas de cards grandes radius 16; cada mesa con número enorme (28px/800), pill de estado con color semántico, total en gris; Ventanilla/Domicilios como cards distinguidas (icono + contador de órdenes). Estado libre = card blanca calma; ocupada = tinte suave del color de estado (nada de bordes gruesos).
- **PedidoMesa:** separación "Ya en la orden" / "Nuevos" como dos grouped lists con encabezados de sección estilo iOS (13px/600 gris mayúsculas). Botón enviar = barra inferior fija ámbar a ancho completo con total integrado ("ENVIAR · $34.000").
- **ProductPicker (compartido — impacta Mesero, Caja, Ventanilla, Domicilios a la vez):** categorías como chips scroll horizontal con pastilla activa ámbar; productos en grouped list con precio alineado a la derecha; stepper de cantidad estilo iOS (– 1 +) en cápsula gris; `SaboresChips`/`SalsasChips` como pills seleccionables (activa = ámbar relleno).
- **EstadoPedidos + Sabores.jsx:** grouped lists; sabores con toggle switch estilo iOS (CSS puro) en vez de checkbox.
- **Desktop mesero** (raro pero existe): grid 4 columnas, mismo sistema.

**Estimación: 1.5–2 sesiones.** Riesgo medio: ProductPicker toca 5 pantallas — capturar las 5.

## Fase 3 — Cocina (pantalla de trabajo, se mira de lejos)

- Comandas como cards con **contraste alto**: número de mesa 34px/800, items 17px/600, notas/sabores en naranja `#FF9500`. Item tocado (listo) = check verde + texto tachado gris con transición.
- Cronómetro-semáforo como pill grande (verde/naranja/rojo `#FF3B30`) — mantener umbrales 10/20 min.
- Progreso N/M como barra fina de progreso arriba de la card (estilo descarga iOS).
- Nuevo-tras-agregar resaltado con fondo ámbar suave pulsante 2 ciclos, luego fijo.
- Toggle de sonido como switch iOS en el header.
- **Desktop/tablet cocina:** grid de 3–4 columnas tipo tablero; móvil: 1 columna. CocinaCaja hereda esto (comparte patrones, verificar tabs → segmented).

**Estimación: 1 sesión.**

## Fase 4 — Caja: cobro (donde se toca dinero — máxima claridad)

- **DetalleMesa:** riel de cobro como card elevada con el TOTAL en 34px/800 arriba (lo primero que ve el ojo), desglose (subtotal/descuento/propina) en grouped list debajo, botón COBRAR ámbar a ancho completo. Mantener sticky ≥901px / apilado <900px que ya funciona.
- **CobrarPedidos + PagoDividido:** métodos de pago como grid de cards seleccionables (icono + nombre, seleccionada = borde ámbar 2px + tinte); montos con teclado numérico grande estilo Calculadora; botón "Resto" como acción secundaria clara; validación con el rojo semántico.
- **CalculadoraVuelto:** display estilo Calculadora iOS (número gigante alineado derecha).
- **Listo para cobrar (CentroTotal tab / lista):** cards con total prominente y botón COBRAR por card.
- **Recibo/ComprobanteAnulacion: NO tocar estilos de impresión** — solo la vista en pantalla si hace falta (los modales z-index 3000 ya garantizan orden).

**Estimación: 1.5 sesiones.** Riesgo: es la pantalla más delicada del negocio — capturas antes/después obligatorias + prueba de cobro real completa (dividido + propina + descuento) en dev.

## Fase 5 — Caja: gestión y reportes (la vista del dueño)

- **DashboardCaja (Resumen):** stat tiles estilo widgets iOS — cards con cifra 28px/800, etiqueta 13px gris, variación en verde/rojo. Grid 2×2 móvil, 4 columnas desktop.
- **Reportes:** filtros de rango como segmented (Hoy/Semana/Mes/Personalizado); gráficas de barras con el dorado `#B8860B` ya validado; tablas → grouped lists en móvil, tabla limpia con hairlines en desktop; top productos con barras de progreso inline.
- **CierreCaja/AperturaCaja/SesionCaja:** formulario de arqueo como grouped list con campos grandes; diferencia (sobrante/faltante) como cifra protagonista verde/roja.
- **Menú/Precios, Historial, Auditoría, Diagnóstico, ConfigServidor/ConfigImpresora:** pase de consistencia con primitivas (grouped lists, mismos headers). Son pantallas de baja frecuencia: consistencia > rediseño profundo.

**Estimación: 1.5–2 sesiones.**

## Fase 6 — Barrido anti-regresión + limpieza (lo que pediste que no vuelva a pasar)

1. **Inventario de visibilidad por breakpoint:** grep de todo `display:none` / media query en los 20 CSS; consolidar TODA regla de "ocultar porque BottomNav ya lo cubre" en `mobile-polish.css` a 768px (regla ya documentada; verificar que no quedó nada en `posMobile.css` ni en CSS de página).
2. **Purga de CSS muerto:** `Caja.css` (3,028 líneas) contiene estilos de patrones ya eliminados (selector de mesas viejo, versiones previas de picker). Borrar todo selector sin uso (verificar con grep de clases contra JSX).
3. **Matriz de capturas final:** 12 pantallas × 390px × 768px (la ventana trampa "PC no maximizado") × 1920px, con sesión de cada rol.
4. Actualizar CLAUDE.md: sistema de tokens v2, primitivas, y la regla "todo estilo nuevo usa primitivas de `primitives.css`".

**Estimación: 1 sesión.**

## Orden de entrega y totales

| Fase | Contenido | Sesiones |
|---|---|---|
| 0 | Tokens v2 + primitivas + Inter + harness capturas | 1 |
| 1 | Login + BottomNav/drawers/headers | 1–1.5 |
| 2 | Mesero + ProductPicker compartido | 1.5–2 |
| 3 | Cocina + CocinaCaja | 1 |
| 4 | Cobro (DetalleMesa, CobrarPedidos, split, vuelto) | 1.5 |
| 5 | Resumen, Reportes, cierre de caja, pantallas de gestión | 1.5–2 |
| 6 | Anti-regresión + purga CSS + capturas finales | 1 |
| **Total** | | **~8.5–10 sesiones** |

**Cada fase termina con:** `npm run build` + capturas Playwright antes/después + publicación remota (`publicar-actualizacion.sh`) para que el PC del local y las PWA lo reciban. **El APK se regenera UNA sola vez al final** (el APK empaqueta el frontend; no tiene sentido reinstalar en cada fase — mientras tanto los celulares con PWA ven el avance).

## Qué NO se toca (contrato)

- Lógica de negocio, rutas, API, sockets, base de datos, cola de escrituras.
- Efecto de foco de `Modal.jsx` (deps `[open]` + `onCloseRef`).
- `position:relative` de headers (trampa iOS Safari sticky).
- Inputs a 16px mínimo (zoom automático de Safari).
- Estilos de impresión de recibos.
- Sin emojis en la UI; enums siempre por `statusLabels.js`.
- Breakpoints: 768px móvil/desktop (el de BottomNav), 480px solo posMobile, 901px riel de cobro.
