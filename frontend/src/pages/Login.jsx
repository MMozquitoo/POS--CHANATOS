import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getApiBaseUrl } from '../utils/api';
import { verifyServer, discoverServer } from '../utils/discovery';
import './Login.css';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryMsg, setDiscoveryMsg] = useState('');
  const discoveryStarted = useRef(false);

  // Descubrimiento automático: si el servidor configurado no responde,
  // escanear la red local buscando el backend (clave para la app instalada).
  useEffect(() => {
    if (discoveryStarted.current) return;
    discoveryStarted.current = true;

    (async () => {
      const current = getApiBaseUrl();
      if (await verifyServer(current)) return; // servidor actual responde, nada que hacer

      setDiscovering(true);
      setDiscoveryMsg('Buscando servidor en la red…');
      const found = await discoverServer(stage =>
        setDiscoveryMsg(stage === 'mdns' ? 'Buscando servidor…' : `Buscando servidor en ${stage}.x…`)
      );

      if (found) {
        localStorage.setItem('pos_api_url', found);
        window.location.reload();
      } else {
        setDiscovering(false);
        setDiscoveryMsg('No se encontró el servidor. Verifica el Wi-Fi o configúralo manualmente.');
      }
    })();
  }, []);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (blocked && retryAfter > 0) {
      const timer = setInterval(() => {
        setRetryAfter(prev => {
          if (prev <= 1) {
            setBlocked(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [blocked, retryAfter]);

  const PIN_LENGTH = 4;

  const handleNumberClick = (num) => {
    if (pin.length < PIN_LENGTH && !blocked) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const submittingRef = useRef(false);

  const handleSubmit = async () => {
    if (pin.length < PIN_LENGTH || submittingRef.current) {
      return;
    }
    submittingRef.current = true;

    try {
      const result = await login(pin);

      if (!result.success) {
        setError(result.error);
        setPin('');

        // Verificar si hay bloqueo
        if (result.error.includes('Demasiados intentos')) {
          const retry = result.retryAfter || 30;
          setBlocked(true);
          setRetryAfter(retry);
        }
      }
      // Redirección post-login: el useEffect de abajo detecta cuando user cambia
    } finally {
      submittingRef.current = false;
    }
  };

  // Entrar automáticamente al completar el cuarto dígito
  useEffect(() => {
    if (pin.length === PIN_LENGTH && !blocked) {
      handleSubmit();
    }
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  // FASE 18.3: Redirección post-login según rol (home por rol).
  // replace: true evita que "Atrás" vuelva al estado post-login y reduzca race/cache "menú viejo".
  useEffect(() => {
    if (user) {
      const roleHome = (role) => {
        if (role === 'CAJA') return '/centro';
        if (role === 'MESERO') return '/'; // Home mesero es / (Mesas)
        if (role === 'COCINA') return '/cocina';
        return '/'; // default
      };
      const home = roleHome(user.role);
      navigate(home, { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="login-container">
      <div className="login-box">
        <img src="/icon-192.png" alt="" className="login-logo" />
        <h1>POS Chanatos</h1>
        <p className="login-subtitle">Ingresa tu PIN</p>

        <div className={`pin-dots ${error ? 'shake' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <span
              key={i}
              className={`pin-dot ${i < pin.length ? 'filled' : ''}`}
            />
          ))}
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {blocked && (
          <div className="blocked-message">
            Bloqueado por {retryAfter} segundos
          </div>
        )}

        {discoveryMsg && (
          <div className={`discovery-message ${discovering ? 'searching' : 'failed'}`}>
            {discovering && <span className="discovery-spinner" />}
            {discoveryMsg}
          </div>
        )}

        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              className="key-digit"
              onClick={() => handleNumberClick(num)}
              disabled={blocked}
            >
              {num}
            </button>
          ))}
          <button onClick={handleClear} className="key-action" disabled={blocked}>C</button>
          <button className="key-digit" onClick={() => handleNumberClick('0')} disabled={blocked}>0</button>
          <button onClick={handleDelete} className="key-action" disabled={blocked} aria-label="Borrar">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H9L2.5 12 9 4z" />
              <path d="M12.5 9.5l5 5M17.5 9.5l-5 5" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="server-config-toggle"
          onClick={() => navigate('/config-servidor')}
        >
          Configurar servidor
        </button>
      </div>
    </div>
  );
}

