# POS Chanatos — Sistema Portable

Sistema POS (Punto de Venta) para restaurantes. Versión portable lista para copiar y usar en cualquier computadora.

## 📦 ¿Qué es esto?

Este es un sistema completo de punto de venta que incluye:
- **Backend**: Servidor que maneja pedidos, pagos, mesas y todo el negocio
- **Frontend**: Interfaz web para meseros, cocina y caja

## 📁 ¿Qué hay en cada carpeta?

```
POS-CHANATOS/
├── frontend/     → Interfaz web (lo que ves en el navegador)
├── backend/      → Servidor (lo que hace funcionar todo)
├── shared/       → Documentación y recursos compartidos
└── .env.example  → Plantilla de configuración
```

## 🚀 Cómo empezar (paso a paso)

### 1. Instalar dependencias del Backend

Abre una terminal y ejecuta:

```bash
cd backend
npm install
```

Esto instalará todas las herramientas que necesita el servidor para funcionar.

### 2. Instalar dependencias del Frontend

Abre **otra terminal** (o la misma después) y ejecuta:

```bash
cd frontend
npm install
```

Esto instalará todas las herramientas que necesita la interfaz web.

### 3. Configurar variables de entorno (opcional)

Si necesitas cambiar el puerto o la configuración:

1. Copia el archivo `.env.example` como `.env` en la raíz del proyecto
2. Edita los valores si es necesario (por defecto funciona sin cambios)

### 4. Iniciar el Backend

En la terminal, desde la carpeta `backend`:

```bash
npm run dev
```

Deberías ver un mensaje como: "Servidor corriendo en puerto 3000"

**⚠️ IMPORTANTE**: Deja esta terminal abierta y corriendo.

### 5. Iniciar el Frontend

Abre **otra terminal nueva**, desde la carpeta `frontend`:

```bash
npm run dev
```

Deberías ver un mensaje con una URL, algo como: `http://localhost:5173`

### 6. Abrir en el navegador

Abre tu navegador (Chrome, Firefox, etc.) y ve a:

```
http://localhost:5173
```

¡Listo! Ya deberías ver la pantalla de login.

## 👤 Usuarios por defecto

- **Mesero**: PIN `1234`
- **Cocina**: PIN `5678`
- **Caja**: PIN `9012`

## 🔧 Solución de problemas

### "No se puede conectar al servidor"

1. Verifica que el backend esté corriendo (deberías ver mensajes en la terminal)
2. Verifica que esté en el puerto 3000
3. Revisa que no haya otro programa usando ese puerto

### "npm: command not found"

Necesitas instalar Node.js. Descárgalo de: https://nodejs.org/

### El frontend no carga

1. Verifica que el backend esté corriendo primero
2. Revisa que el frontend esté en el puerto 5173
3. Intenta recargar la página (F5 o Cmd+R)

## 📋 Requisitos

- **Node.js** versión 16 o superior
- **npm** (viene con Node.js)
- Navegador web moderno (Chrome, Firefox, Edge, Safari)

## 💾 Base de datos

La base de datos se crea automáticamente la primera vez que inicias el backend. Se guarda en:

```
backend/data/pos_chanatos.db
```

**⚠️ IMPORTANTE**: Si borras esta carpeta, perderás todos los datos.

## 🔄 Actualizar el sistema

Si recibes una nueva versión:

1. **NO borres** la carpeta `backend/data` (tiene tus datos)
2. Copia los nuevos archivos
3. Ejecuta `npm install` en `backend` y `frontend` de nuevo
4. Reinicia ambos servidores

## 📞 Soporte

Si algo no funciona:
1. Revisa los mensajes en las terminales (backend y frontend)
2. Verifica que ambos estén corriendo
3. Intenta reiniciar ambos servidores

---

**Versión**: Base Portable v1  
**Fecha**: Enero 2026
