import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import './UpdateBanner.css';

// Versión con la que se compiló ESTE frontend (la fija publicar-actualizacion.sh /
// build-desktop.sh vía VITE_APP_VERSION al hacer el build). En desarrollo local
// (npm run dev / build sin esa variable) queda vacía y el chequeo se desactiva
// entero — nunca debe molestar mientras se está programando.
const BUILT_VERSION = import.meta.env.VITE_APP_VERSION || '';

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // cada 3 minutos mientras la app está abierta

/**
 * Aviso global de "hay una versión nueva". No depende de que el navegador note
 * solo el cambio del service worker (puede tardar si la pestaña queda mucho
 * tiempo en segundo plano, sobre todo en celulares) — pregunta directo al
 * servidor qué versión está sirviendo ahora mismo y compara.
 */
export default function UpdateBanner() {
  const [newVersion, setNewVersion] = useState(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!BUILT_VERSION) return; // desarrollo local: sin chequeo

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const { data } = await axios.get('/update/version');
        // "desarrollo" = servidor sin archivo VERSION (Mac de desarrollo): no
        // se puede comparar nada — sin esto el aviso salía en bucle infinito
        if (data?.version && data.version !== 'desarrollo' && data.version !== BUILT_VERSION) {
          setNewVersion(data.version);
        }
      } catch {
        // sin conexión o servidor viejo sin esta ruta: no hacer nada, ya lo
        // cubre el aviso de "Sin conexión con el servidor" si aplica
      } finally {
        checkingRef.current = false;
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);

    // La pestaña volvió a primer plano (ej. el celular se desbloqueó): es el
    // momento más probable de estar viendo una versión vieja, chequear ya.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!newVersion) return null;

  return (
    <div className="update-banner" role="alert">
      <div className="update-banner-info">
        <span className="update-banner-dot" />
        <span className="update-banner-text">Hay una versión nueva del POS</span>
      </div>
      <button className="update-banner-btn" onClick={() => window.location.reload()}>
        Actualizar ahora
      </button>
    </div>
  );
}
