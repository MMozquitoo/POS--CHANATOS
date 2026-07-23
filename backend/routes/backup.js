import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "../db/database.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getBogotaDateString, toBogotaSQLiteTimestamp } from "../utils/timezone.js";

const router = express.Router();

// exceljs se carga SOLO cuando se usa. El botón "Buscar actualizaciones" no
// reinstala node_modules, así que un equipo actualizado por esa vía puede no
// tenerla: con import diferido el POS igual arranca y sigue vendiendo.
async function cargarExcelJS() {
  try {
    return (await import("exceljs")).default;
  } catch {
    return null;
  }
}

const FALTA_EXCELJS =
  "Esta versión del servidor no tiene el módulo de Excel. Instala la versión nueva " +
  "del POS (Instalar-POS-Chanatos.exe). Mientras tanto usa COPIA DE SEGURIDAD COMPLETA.";

// Las sesiones son tokens de login, no datos del negocio: no se exportan ni se
// restauran (si se restauraran, el cajero que está usando el POS quedaría afuera).
const TABLAS_EXCLUIDAS = new Set(["sessions"]);

async function tablasDeDatos() {
  const db = getDb();
  const filas = await db.all(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  return filas.map((f) => f.name).filter((n) => !TABLAS_EXCLUIDAS.has(n));
}

async function columnasDe(tabla) {
  const db = getDb();
  const info = await db.all(`PRAGMA table_info("${tabla}")`);
  return info.map((c) => c.name);
}

// GET /api/backup/excel → un archivo de Excel con una hoja por tabla.
// Es la base de datos completa en formato movible y editable.
router.get("/excel", requireAuth, requireRole("CAJA"), async (req, res) => {
  try {
    const ExcelJS = await cargarExcelJS();
    if (!ExcelJS) return res.status(503).json({ error: FALTA_EXCELJS });

    const db = getDb();
    const wb = new ExcelJS.Workbook();
    wb.creator = "POS Chanatos";

    for (const tabla of await tablasDeDatos()) {
      const columnas = await columnasDe(tabla);
      const filas = await db.all(`SELECT * FROM "${tabla}"`);
      const hoja = wb.addWorksheet(tabla);
      hoja.columns = columnas.map((c) => ({ header: c, key: c, width: 18 }));
      // Los valores van tal cual salen de SQLite; así el archivo se puede volver a subir.
      filas.forEach((fila) => hoja.addRow(fila));
      hoja.getRow(1).font = { bold: true };
      hoja.views = [{ state: "frozen", ySplit: 1 }];
    }

    const buffer = await wb.xlsx.writeBuffer();
    const nombre = `POS-Chanatos-${getBogotaDateString()}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("❌ Error generando el respaldo en Excel:", error);
    res.status(500).json({ error: "No se pudo generar el archivo de respaldo" });
  }
});

// GET /api/backup/db → copia exacta de la base de datos (VACUUM INTO produce una
// copia consistente aunque el POS esté en uso). Es el respaldo más fiel posible.
router.get("/db", requireAuth, requireRole("CAJA"), async (req, res) => {
  const destino = path.join(os.tmpdir(), `pos-chanatos-respaldo-${Date.now()}.db`);
  try {
    const db = getDb();
    await db.run(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="POS-Chanatos-${getBogotaDateString()}.db"`
    );
    res.sendFile(destino, (err) => {
      fs.unlink(destino, () => {});
      if (err && !res.headersSent) res.status(500).end();
    });
  } catch (error) {
    fs.unlink(destino, () => {});
    console.error("❌ Error generando la copia de la base de datos:", error);
    res.status(500).json({ error: "No se pudo generar la copia de la base de datos" });
  }
});

// Excel devuelve fechas, texto enriquecido y fórmulas como objetos. SQLite guarda
// texto/números: normalizar antes de insertar.
function valorParaSqlite(valor) {
  if (valor === undefined || valor === null) return null;
  if (valor instanceof Date) return toBogotaSQLiteTimestamp(valor);
  if (typeof valor === "object") {
    if (valor.text !== undefined) return valor.text; // texto enriquecido / hipervínculo
    if (valor.result !== undefined) return valorParaSqlite(valor.result); // fórmula
    if (valor.richText) return valor.richText.map((t) => t.text).join("");
    return String(valor);
  }
  return valor;
}

// POST /api/backup/import → sube un Excel descargado antes y REEMPLAZA los datos.
// Pensado para reinstalaciones: instalar limpio y devolverle sus datos al POS.
router.post("/import", requireAuth, requireRole("CAJA"), async (req, res) => {
  const db = getDb();
  let transaccionAbierta = false;
  try {
    if (!req.body || !req.body.length) {
      return res.status(400).json({ error: "No llegó ningún archivo" });
    }

    const ExcelJS = await cargarExcelJS();
    if (!ExcelJS) return res.status(503).json({ error: FALTA_EXCELJS });

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.body);
    } catch {
      return res
        .status(400)
        .json({ error: "El archivo no es un Excel válido (.xlsx)" });
    }

    const tablasValidas = new Set(await tablasDeDatos());
    const hojas = wb.worksheets.filter((h) => tablasValidas.has(h.name));
    if (hojas.length === 0) {
      return res.status(400).json({
        error: "El archivo no parece un respaldo del POS (no coincide ninguna hoja)",
      });
    }

    // Preparar todo ANTES de tocar la base: si el archivo viene mal, no se pierde nada.
    const plan = [];
    for (const hoja of hojas) {
      const columnasReales = await columnasDe(hoja.name);
      const encabezados = (hoja.getRow(1).values || [])
        .slice(1)
        .map((v) => (v === null || v === undefined ? "" : String(v).trim()));
      // Solo columnas que existen hoy en la tabla: así un respaldo viejo sigue sirviendo
      // aunque después se hayan agregado columnas nuevas.
      const usables = encabezados
        .map((nombre, i) => ({ nombre, i }))
        .filter((c) => columnasReales.includes(c.nombre));
      if (usables.length === 0) continue;

      const filas = [];
      hoja.eachRow((fila, numero) => {
        if (numero === 1) return; // encabezado
        const valores = fila.values || [];
        const datos = usables.map((c) => valorParaSqlite(valores[c.i + 1]));
        if (datos.every((v) => v === null || v === "")) return; // fila vacía
        filas.push(datos);
      });
      plan.push({ tabla: hoja.name, columnas: usables.map((c) => c.nombre), filas });
    }

    // PRAGMA foreign_keys es un no-op dentro de una transacción: hay que apagarlo
    // ANTES del BEGIN y volver a encenderlo DESPUÉS del COMMIT.
    await db.run("PRAGMA foreign_keys = OFF");
    await db.run("BEGIN IMMEDIATE");
    transaccionAbierta = true;

    const resumen = {};
    for (const { tabla, columnas, filas } of plan) {
      await db.run(`DELETE FROM "${tabla}"`);
      const lista = columnas.map((c) => `"${c}"`).join(", ");
      const huecos = columnas.map(() => "?").join(", ");
      const sql = `INSERT INTO "${tabla}" (${lista}) VALUES (${huecos})`;
      for (const valores of filas) {
        await db.run(sql, valores);
      }
      resumen[tabla] = filas.length;
    }

    await db.run("COMMIT");
    transaccionAbierta = false;
    await db.run("PRAGMA foreign_keys = ON");

    console.log("💾 Datos restaurados desde Excel:", resumen);
    res.json({ restaurado: true, resumen });
  } catch (error) {
    if (transaccionAbierta) {
      try {
        await db.run("ROLLBACK");
      } catch { /* ignorar */ }
    }
    try {
      await db.run("PRAGMA foreign_keys = ON");
    } catch { /* ignorar */ }
    console.error("❌ Error restaurando el respaldo:", error);
    res.status(500).json({
      error: "No se pudo restaurar el archivo. Los datos quedaron como estaban.",
      detalle: String(error.message || error).slice(0, 200),
    });
  }
});

export default router;
