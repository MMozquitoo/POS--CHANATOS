---
name: visual-verify-pos-chanatos
description: Captura pantallas de POS Chanatos con Playwright contra una base de datos de prueba separada (login automático por PIN, anchos de referencia del rediseño 2026-10). Usar SIEMPRE antes de reportar terminado un cambio de UI/frontend — "cambio de UI = captura antes de entregar" (regla del proyecto).
---

# Verificación visual con Playwright (POS Chanatos)

Regla del proyecto (CLAUDE.md): **cambio de UI ⇒ captura antes de entregar**.
No hay suite de tests de UI — esta es la forma de verificar que algo se ve y
funciona como se espera, en vez de solo confiar en el diff.

## Paso 0 — base de datos de prueba SEPARADA (obligatorio)

Nunca generar ventas/órdenes de prueba en `backend/data/pos_chanatos.db` (la
base real). Copiarla a un scratchpad antes de arrancar el servidor:

```bash
sqlite3 "/Users/cristian/Developer/Pos Chanatos/backend/data/pos_chanatos.db" \
  "VACUUM INTO '<scratch>/pos_test.db'"
```

(`<scratch>` = el directorio de scratchpad de la sesión actual, no `/tmp`.)

## Paso 1 — build + arranque contra la base de prueba

```bash
cd "/Users/cristian/Developer/Pos Chanatos/frontend" && npm run build
cd "/Users/cristian/Developer/Pos Chanatos/backend" && \
  DB_PATH="<scratch>/pos_test.db" node server.js
```

Esto sirve todo en `http://localhost:3000` (API + frontend/dist). Los
respaldos automáticos de esa corrida quedan junto a `pos_test.db`, no tocan
los respaldos reales.

## Paso 2 — script de Playwright: login por API + capturas

No hay botón "ENTRAR" en el login real (auto-ingreso al escribir el PIN), así
que lo más simple y confiable es loguear por API y sembrar `localStorage`
antes de navegar — evita simular tecleo:

```js
// scratch/capturar.mjs
import { chromium } from 'playwright'; // o el playwright ya instalado del repo

const BASE = 'http://localhost:3000';
const PINES = { MESERO: '1234', COCINA: '5678', CAJA: '9012' };
const ANCHOS = [320, 390, 768, 1024, 1440]; // referencia del rediseño 2026-10

async function loginToken(pin) {
  const res = await fetch(`${BASE}/api/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const { token } = await res.json();
  return token;
}

const browser = await chromium.launch();
const token = await loginToken(PINES.CAJA);

for (const width of ANCHOS) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  // Sembrar el token ANTES de que AuthContext corra en el primer render
  await page.addInitScript((t) => localStorage.setItem('token', t), token);
  await page.goto(`${BASE}/`); // o la ruta directa que se quiera probar
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `<scratch>/caja-${width}.png`, fullPage: true });
  await page.close();
}
await browser.close();
```

- La key de `localStorage` es literalmente `"token"` (string crudo, no JSON) —
  la pone `AuthContext.jsx` tras `POST /auth/pin`.
- Para apuntar a una ruta específica (ej. Cocina, DetalleMesa de una mesa),
  navegar directo a esa ruta tras sembrar el token — el catch-all de cada rol
  redirige solo si la ruta no aplica a ese rol.
- Repetir con los 3 PINes si el cambio toca pantallas de más de un rol.

## Paso 3 — revisar

Mirar las capturas antes de decir que el cambio está listo. Anchos clave:
320/390 (celular, BottomNav visible ≤768), 768 (límite), 1024 (barra lateral
de Caja contraída a iconos, 769–1099), 1440 (barra lateral completa). Si algo
se ve roto, el `ErrorBoundary` del frontend muestra el detalle técnico en la
propia captura.

## Al terminar

Cerrar el servidor de prueba (`Ctrl+C` / matar el proceso). El scratchpad se
limpia solo; nunca dejar un `pos_test.db` suelto en el repo ni commitearlo.
