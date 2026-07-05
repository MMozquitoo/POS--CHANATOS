import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../utils/api';
import { verifyServer, discoverServer } from '../utils/discovery';
import './ConfigServidor.css';

function normalizeUrl(value) {
  let url = value.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  url = url.replace(/\/+$/, '');
  if (!/:\d+$/.test(url)) url = `${url}:3000`;
  return url;
}

export default function ConfigServidor() {
  const navigate = useNavigate();
  const [currentUrl] = useState(() => getApiBaseUrl());
  const [currentOk, setCurrentOk] = useState(null); // null = verificando
  const [manualUrl, setManualUrl] = useState(() => localStorage.getItem('pos_api_url') || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'searching'|'ok'|'error', text }

  useEffect(() => {
    let cancelled = false;
    verifyServer(currentUrl).then(ok => {
      if (!cancelled) setCurrentOk(ok);
    });
    return () => { cancelled = true; };
  }, [currentUrl]);

  const applyAndReload = (url) => {
    localStorage.setItem('pos_api_url', url);
    setStatus({ type: 'ok', text: `Conectado a ${url}` });
    setTimeout(() => {
      window.location.href = '/';
    }, 900);
  };

  const handleAutoSearch = async () => {
    setBusy(true);
    setStatus({ type: 'searching', text: 'Buscando servidor en la red…' });
    const found = await discoverServer(stage =>
      setStatus({
        type: 'searching',
        text: stage === 'mdns' ? 'Buscando servidor…' : `Buscando en ${stage}.x…`,
      })
    );
    if (found) {
      applyAndReload(found);
    } else {
      setBusy(false);
      setStatus({
        type: 'error',
        text: 'No se encontró el servidor. Verifica que el equipo del servidor esté encendido y en la misma red Wi-Fi.',
      });
    }
  };

  const handleManualSave = async () => {
    const url = normalizeUrl(manualUrl);
    if (!url) {
      setStatus({ type: 'error', text: 'Escribe una dirección, por ejemplo 192.168.1.10' });
      return;
    }
    setBusy(true);
    setStatus({ type: 'searching', text: `Probando ${url}…` });
    const ok = await verifyServer(url);
    if (ok) {
      applyAndReload(url);
    } else {
      setBusy(false);
      setStatus({ type: 'error', text: `No responde un servidor POS Chanatos en ${url}` });
    }
  };

  return (
    <div className="config-servidor-container">
      <div className="config-servidor-card">
        <h1>Servidor</h1>
        <p className="config-servidor-subtitle">Conexión con el sistema POS</p>

        <div className={`config-estado ${currentOk === null ? 'checking' : currentOk ? 'online' : 'offline'}`}>
          <span className="config-estado-dot" />
          <div>
            <div className="config-estado-label">
              {currentOk === null ? 'Verificando…' : currentOk ? 'Conectado' : 'Sin conexión'}
            </div>
            <div className="config-estado-url">{currentUrl}</div>
          </div>
        </div>

        <button className="config-btn-primary" onClick={handleAutoSearch} disabled={busy}>
          {busy && status?.type === 'searching' ? 'Buscando…' : 'Buscar automáticamente'}
        </button>

        <div className="config-divider"><span>o configurar manualmente</span></div>

        <div className="config-manual">
          <input
            type="text"
            inputMode="url"
            placeholder="192.168.1.10"
            value={manualUrl}
            onChange={e => setManualUrl(e.target.value)}
            disabled={busy}
          />
          <button onClick={handleManualSave} disabled={busy}>Probar y guardar</button>
        </div>

        {status && (
          <div className={`config-status ${status.type}`}>
            {status.type === 'searching' && <span className="config-spinner" />}
            {status.text}
          </div>
        )}

        <button className="config-btn-back" onClick={() => navigate('/')} disabled={busy}>
          ← Volver
        </button>
      </div>
    </div>
  );
}
