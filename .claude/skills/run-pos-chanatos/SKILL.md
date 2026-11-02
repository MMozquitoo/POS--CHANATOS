---
name: run-pos-chanatos
description: Levanta POS Chanatos (backend Express + frontend Vite) en local para probar un cambio a mano o con Playwright — build del frontend, servidor en el puerto 3000, y la regla de NO tocar la base de datos real. Usar cuando haya que arrancar, correr o probar la app, o antes de capturar pantallas con el skill visual-verify-pos-chanatos.
---

# Levantar POS Chanatos en local

Monorepo con backend (Express, puerto 3000) y frontend (Vite). En desarrollo el
backend sirve `frontend/dist` directamente (`NODE_ENV !== "production"`), así
que **cualquier cambio de UI necesita `npm run build` del frontend antes de
verse** — recargar sin build muestra la versión vieja.

## Arranque normal (primera vez o tras `npm install` nuevo)

```bash
cd backend && npm install && npm run init-db
cd ../frontend && npm install
```

## Ciclo de prueba tras un cambio

```bash
# 1. Si tocaste frontend (casi siempre), compílalo — el backend sirve dist/
cd "/Users/cristian/Developer/Pos Chanatos/frontend" && npm run build

# 2. Arranca el backend (sirve API + frontend/dist en :3000)
cd "/Users/cristian/Developer/Pos Chanatos/backend" && npm run dev
```

Abrir `http://localhost:3000`. Login por PIN de 4 dígitos (auto-ingreso, sin
botón ENTRAR): MESERO `1234`, COCINA `5678`, CAJA `9012`.

## Reglas importantes

- **Nunca correr contra `backend/data/pos_chanatos.db`** (la base real del
  restaurante) para pruebas que generan datos — ver el skill
  `visual-verify-pos-chanatos` para la base de pruebas separada.
- Alternativa rápida solo para iterar UI sin reconstruir cada vez:
  `cd frontend && npm run dev` (Vite en su propio puerto, HMR) contra un
  backend ya corriendo en :3000 — pero **antes de entregar el cambio** hay que
  volver a compilar con `npm run build`, porque lo que corre en producción es
  el build servido por el backend, no el dev server de Vite.
- El `ErrorBoundary` del frontend muestra el detalle técnico del error en
  pantalla — útil para diagnosticar sin abrir la consola.
- Puerto configurable con `PORT=<n>` si 3000 está ocupado.
