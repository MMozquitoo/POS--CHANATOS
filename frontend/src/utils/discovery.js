// Descubrimiento automático del servidor POS en la red local.
// 1) mDNS/Bonjour (instantáneo): el backend se anuncia como _pos-chanatos._tcp
// 2) Escaneo de subredes como respaldo, verificando la firma del backend
//    ("pos-chanatos") para no conectarse a cualquier cosa que responda.

import { Capacitor, CapacitorHttp } from '@capacitor/core';

const PORT = 3000;
const PROBE_TIMEOUT_MS = 600;
const CONCURRENCY = 60;
const MDNS_TIMEOUT_MS = 6000;

async function discoverViaMdns(onProgress) {
  if (!Capacitor.isNativePlatform()) return null;
  let ZeroConf;
  try {
    ({ ZeroConf } = await import('capacitor-zeroconf'));
  } catch {
    return null;
  }

  if (onProgress) onProgress('mdns');

  return new Promise(resolve => {
    let settled = false;
    const finish = async (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { await ZeroConf.unwatch({ type: '_pos-chanatos._tcp.', domain: 'local.' }); } catch { /* noop */ }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), MDNS_TIMEOUT_MS);

    ZeroConf.watch({ type: '_pos-chanatos._tcp.', domain: 'local.' }, async result => {
      if (settled) return;
      const service = result?.service;
      const action = result?.action;
      if ((action === 'resolved' || action === 'added') && service) {
        const ips = service.ipv4Addresses?.length ? service.ipv4Addresses : [service.hostname];
        const port = service.port || PORT;
        for (const ip of ips) {
          if (!ip) continue;
          const url = `http://${ip}:${port}`;
          if (await probe(url)) {
            finish(url);
            return;
          }
        }
      }
    }).catch(() => finish(null));
  });
}

function candidateSubnets() {
  const subnets = [];

  // 1) La subred del último servidor conocido, primero (lo normal es que siga ahí)
  const saved = localStorage.getItem('pos_api_url');
  if (saved) {
    const match = saved.match(/^https?:\/\/(\d+\.\d+\.\d+)\.\d+/);
    if (match) subnets.push(match[1]);
  }

  // 2) Si corre en navegador (no APK), la subred de la página actual
  const hostMatch = window.location.hostname.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (hostMatch) subnets.push(hostMatch[1]);

  // 3) Subredes domésticas/comerciales comunes
  const common = [
    '192.168.1', '192.168.0', '192.168.40', '192.168.10', '192.168.20',
    '192.168.100', '192.168.2', '192.168.43', '10.0.0', '172.20.10',
  ];
  for (const s of common) {
    if (!subnets.includes(s)) subnets.push(s);
  }
  return subnets;
}

async function probe(url, signal) {
  // En la app nativa: petición HTTP nativa (evita CORS/mixed-content/PNA del WebView)
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.get({
        url: `${url}/api/discover`,
        connectTimeout: PROBE_TIMEOUT_MS,
        readTimeout: PROBE_TIMEOUT_MS,
      });
      if (res.status !== 200) return false;
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      return data && data.app === 'pos-chanatos';
    } catch {
      return false;
    }
  }

  // En navegador: fetch con timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(`${url}/api/discover`, { signal: controller.signal });
    if (!res.ok) return false;
    const data = await res.json();
    return data && data.app === 'pos-chanatos';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Verifica si una URL responde como el POS Chanatos.
 * Con reintentos: al abrir la app el Wi-Fi del teléfono puede tardar 1-2s
 * en despertar y un único intento fallido disparaba el escaneo completo
 * (parecía que "se olvidaba" del servidor).
 */
export async function verifyServer(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    if (await probe(url)) return true;
    if (i < retries - 1) {
      await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  return false;
}

/**
 * Encuentra el servidor en la red local y devuelve su URL base, o null.
 * Intenta mDNS primero (rápido); si no, escanea subredes candidatas.
 * onProgress(etapa) recibe 'mdns' o el prefijo de subred en curso.
 */
export async function discoverServer(onProgress) {
  // 0) El último servidor conocido, con paciencia (el caso más común es que siga ahí)
  const saved = localStorage.getItem('pos_api_url');
  if (saved) {
    if (onProgress) onProgress('mdns');
    if (await verifyServer(saved, 2)) return saved;
  }

  const viaMdns = await discoverViaMdns(onProgress);
  if (viaMdns) return viaMdns;

  const abort = new AbortController();

  for (const subnet of candidateSubnets()) {
    if (onProgress) onProgress(subnet);

    const ips = [];
    for (let i = 1; i <= 254; i++) ips.push(`http://${subnet}.${i}:${PORT}`);

    for (let start = 0; start < ips.length; start += CONCURRENCY) {
      const batch = ips.slice(start, start + CONCURRENCY);
      const results = await Promise.all(
        batch.map(url => probe(url, abort.signal).then(ok => (ok ? url : null)))
      );
      const found = results.find(Boolean);
      if (found) {
        abort.abort();
        return found;
      }
    }
  }
  return null;
}
