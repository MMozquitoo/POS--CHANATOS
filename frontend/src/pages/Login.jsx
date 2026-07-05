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

  const handleNumberClick = (num) => {
    if (pin.length < 6 && !blocked) {
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

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN debe tener al menos 4 dígitos');
      return;
    }

    const result = await login(pin);
    
    if (!result.success) {
      setError(result.error);
      
      // Verificar si hay bloqueo
      if (result.error.includes('Demasiados intentos')) {
        const retry = result.retryAfter || 30;
        setBlocked(true);
        setRetryAfter(retry);
      }
    } else {
      // FIX 1: Redirección post-login según rol
      // El user se actualiza en AuthContext, pero necesitamos esperar un momento
      // o leerlo del resultado. Como login() retorna { success: true }, 
      // usamos useEffect para detectar cuando user cambia
    }
  };

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
        <h1>POS CHANATOS</h1>
        <p className="login-subtitle">Ingresa tu PIN</p>
        
        <div className="pin-display">
          <div className="pin-dots">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <span 
                key={i} 
                className={`pin-dot ${i < pin.length ? 'filled' : ''}`}
              />
            ))}
          </div>
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
          <div className="keypad-row">
            <button onClick={() => handleNumberClick('1')} disabled={blocked}>1</button>
            <button onClick={() => handleNumberClick('2')} disabled={blocked}>2</button>
            <button onClick={() => handleNumberClick('3')} disabled={blocked}>3</button>
          </div>
          <div className="keypad-row">
            <button onClick={() => handleNumberClick('4')} disabled={blocked}>4</button>
            <button onClick={() => handleNumberClick('5')} disabled={blocked}>5</button>
            <button onClick={() => handleNumberClick('6')} disabled={blocked}>6</button>
          </div>
          <div className="keypad-row">
            <button onClick={() => handleNumberClick('7')} disabled={blocked}>7</button>
            <button onClick={() => handleNumberClick('8')} disabled={blocked}>8</button>
            <button onClick={() => handleNumberClick('9')} disabled={blocked}>9</button>
          </div>
          <div className="keypad-row">
            <button onClick={handleClear} className="clear-btn" disabled={blocked}>C</button>
            <button onClick={() => handleNumberClick('0')} disabled={blocked}>0</button>
            <button onClick={handleDelete} className="delete-btn" disabled={blocked}>⌫</button>
          </div>
        </div>

        <button
          className="enter-btn"
          onClick={handleSubmit}
          disabled={pin.length < 4 || blocked}
        >
          ENTRAR
        </button>

        <button
          type="button"
          className="server-config-toggle"
          onClick={() => navigate('/config-servidor')}
        >
          ⚙ Configurar servidor
        </button>
      </div>
    </div>
  );
}

