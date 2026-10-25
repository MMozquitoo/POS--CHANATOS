import { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/api';

// Identidad del negocio (nombre comercial, logo, pie del recibo, datos) —
// vive en el SERVIDOR (GET/PUT /api/settings/business) y se comparte entre
// dispositivos: cuando alguien la cambia, el socket avisa
// ("settings:business-updated") y BusinessSync (App.jsx) la reemplaza acá.
//
// Un solo caché a nivel de módulo: BrandMark aparece en muchas pantallas y no
// debe disparar una petición por cada logo dibujado.
export const BUSINESS_DEFAULTS = {
  business_name: 'Chanatos',
  receipt_footer: 'Gracias por venir a Chanatos',
  business_nit: '',
  business_address: '',
  business_phone: '',
  business_logo: '',
};

// Logo oficial empaquetado (la "C" con fondo amarillo, mismo archivo del favicon)
export const DEFAULT_LOGO = '/icon-192.png';

let cache = null;
let inflight = null;
const subscribers = new Set();

function apiUrl() {
  const base = getApiBaseUrl();
  return base.endsWith('/api') ? base : `${base}/api`;
}

export function setBusiness(next) {
  cache = { ...BUSINESS_DEFAULTS, ...next };
  subscribers.forEach((fn) => fn(cache));
}

export function loadBusiness({ force = false } = {}) {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight) return inflight;
  // URL explícita: la pantalla de acceso pide la identidad antes de que
  // AuthProvider configure axios.defaults.baseURL
  inflight = axios
    .get(`${apiUrl()}/settings/business`, { timeout: 8000 })
    .then((res) => {
      setBusiness(res.data || {});
      return cache;
    })
    .catch(() => cache || BUSINESS_DEFAULTS)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function logoSrc(business) {
  return business?.business_logo || DEFAULT_LOGO;
}

export default function useBusiness() {
  const [business, setLocal] = useState(cache || BUSINESS_DEFAULTS);
  useEffect(() => {
    subscribers.add(setLocal);
    if (!cache) loadBusiness();
    else setLocal(cache);
    return () => {
      subscribers.delete(setLocal);
    };
  }, []);
  return business;
}
