import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../contexts/ConnectionContext';
import './ConnectionBanner.css';

/**
 * Banner global de estado de conexión. Solo visible cuando isOnline === false.
 */
export default function ConnectionBanner() {
  const navigate = useNavigate();
  const { isOnline, checkNow } = useConnection();
  const [retrying, setRetrying] = useState(false);

  if (isOnline) {
    return null;
  }

  const handleRetry = async () => {
    setRetrying(true);
    await checkNow();
    setRetrying(false);
  };

  return (
    <div className="conn-banner" role="alert">
      <div className="conn-banner-info">
        <span className="conn-banner-dot" />
        <span className="conn-banner-text">Sin conexión con el servidor</span>
      </div>
      <div className="conn-banner-actions">
        <button className="conn-banner-btn" onClick={handleRetry} disabled={retrying}>
          {retrying ? <span className="conn-banner-spinner" /> : 'Reintentar'}
        </button>
        <button
          className="conn-banner-btn primary"
          onClick={() => navigate('/config-servidor')}
        >
          Configurar
        </button>
      </div>
    </div>
  );
}
