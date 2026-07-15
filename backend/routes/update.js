import express from "express";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth, requireRole } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Assets del "latest" release (repo público → sin autenticación)
const BASE = "https://github.com/MMozquitoo/POS--CHANATOS/releases/latest/download";

// Carpeta raíz de la app instalada (en Windows: %LOCALAPPDATA%\POSChanatos = RESOURCES_PATH).
// En desarrollo (sin RESOURCES_PATH) apunta a la raíz del repo.
function appDir() {
  return process.env.RESOURCES_PATH || path.join(__dirname, "..", "..");
}

function currentVersion() {
  try {
    return fs.readFileSync(path.join(appDir(), "VERSION"), "utf8").trim();
  } catch {
    return "desarrollo";
  }
}

async function fetchText(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.text()).trim();
}

async function downloadFile(url, dest) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

// Descomprime el zip SOBRE la carpeta de la app. NO toca data/ ni node_modules/
// porque el zip de actualización no los contiene (se conservan ventas y binario).
function extractOver(zip, dest) {
  return new Promise((resolve, reject) => {
    if (process.platform === "win32") {
      execFile(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force`],
        (err) => (err ? reject(err) : resolve())
      );
    } else {
      // desarrollo/macOS
      execFile("unzip", ["-oq", zip, "-d", dest], (err) => (err ? reject(err) : resolve()));
    }
  });
}

// GET /api/update/check → ¿hay versión nueva?
router.get("/check", requireAuth, requireRole("CAJA"), async (req, res) => {
  const current = currentVersion();
  let latest;
  try {
    latest = await fetchText(`${BASE}/version.txt`);
  } catch (e) {
    return res.status(503).json({ error: "No se pudo consultar (¿sin internet?)", current });
  }
  res.json({ current, latest, updateAvailable: !!latest && latest !== current });
});

// POST /api/update/apply → descarga, aplica y reinicia el servidor
router.post("/apply", requireAuth, requireRole("CAJA"), async (req, res) => {
  const current = currentVersion();
  let latest;
  try {
    latest = await fetchText(`${BASE}/version.txt`);
  } catch (e) {
    return res.status(503).json({ error: "No se pudo consultar (¿sin internet?)", current });
  }
  if (!latest || latest === current) {
    return res.json({ updated: false, message: "Ya tienes la última versión", version: current });
  }

  const tmpZip = path.join(os.tmpdir(), "pos-chanatos-update.zip");
  try {
    await downloadFile(`${BASE}/POS-Chanatos-Update.zip`, tmpZip);
    await extractOver(tmpZip, appDir());
    fs.unlink(tmpZip, () => {});
  } catch (e) {
    console.error("❌ Error aplicando actualización:", e);
    return res.status(500).json({ error: "Falló la actualización", detail: String(e).slice(0, 200) });
  }

  res.json({ updated: true, version: latest, message: "Actualizado. Reiniciando..." });
  // El watchdog (iniciar-servidor.bat en bucle) relanza el servidor con el código nuevo.
  setTimeout(() => process.exit(0), 1200);
});

export default router;
