import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from '../../utils/api';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

/**
 * FASE 14.2: Configuración de servidor
 * Permite cambiar la URL del backend y probar la conexión
 *
 * embedded=true: se usa dentro de Conexion.jsx (pestaña "Configurar"), sin su
 * propio CajaHeader/container. Sigue existiendo standalone en /config-servidor
 * porque esa ruta también es PÚBLICA (login no encuentra el servidor).
 */
export default function ConfigServidor({ embedded = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const [serverUrl, setServerUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, ok, error
  const [statusMessage, setStatusMessage] = useState('');
  const [saved, setSaved] = useState(false);

  // Cargar URL guardada al montar
  useEffect(() => {
    const savedUrl = localStorage.getItem('pos_server_url');
    if (savedUrl) {
      setServerUrl(savedUrl);
    } else {
      setServerUrl(getApiBaseUrl());
    }
  }, []);

  // Validar y normalizar URL
  const normalizeUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    
    let normalized = url.trim();
    
    // Validar que empiece con http:// o https://
    if (!normalized.match(/^https?:\/\//i)) {
      return null; // URL inválida
    }
    
    // Quitar slash final si existe
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    
    return normalized;
  };

  // Guardar URL
  const handleSave = () => {
    const normalized = normalizeUrl(serverUrl);
    
    if (!normalized) {
      showAlert('URL inválida. Debe empezar con http:// o https://');
      return;
    }
    
    localStorage.setItem('pos_server_url', normalized);
    setSaved(true);
    setStatusMessage('URL guardada. Se recomienda recargar la página.');
    
    // Ocultar mensaje después de 3 segundos
    setTimeout(() => {
      setSaved(false);
    }, 3000);
  };

  // Probar conexión
  const handleTestConnection = async () => {
    const normalized = normalizeUrl(serverUrl);
    
    if (!normalized) {
      setStatus('error');
      setStatusMessage('URL inválida. Debe empezar con http:// o https://');
      return;
    }
    
    setStatus('loading');
    setStatusMessage('Probando conexión...');
    
    try {
      // Crear instancia temporal de axios para probar
      const testAxios = axios.create({
        baseURL: normalized,
        timeout: 5000
      });
      
      const response = await testAxios.get('/api/health');
      
      if (response.data && (response.data.status === 'ok' || response.data.ok === true)) {
        setStatus('ok');
        setStatusMessage('Conectado correctamente');
      } else {
        setStatus('error');
        setStatusMessage('Respuesta inesperada del servidor');
      }
    } catch (error) {
      setStatus('error');
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error')) {
        setStatusMessage('No se pudo conectar. Revisa IP/red/puerto.');
      } else if (error.response) {
        setStatusMessage(`Error ${error.response.status}: ${error.response.statusText}`);
      } else {
        setStatusMessage(`Error: ${error.message || 'No se pudo conectar'}`);
      }
    }
  };

  // Recargar página
  const handleReload = async () => {
    if (await showConfirm('¿Recargar la página para aplicar los cambios?')) {
      window.location.reload();
    }
  };

  // Resetear a default
  const handleReset = async () => {
    if (await showConfirm('¿Restaurar URL por defecto?')) {
      const defaultUrl = getApiBaseUrl();
      setServerUrl(defaultUrl);
      localStorage.removeItem('pos_server_url');
      setStatus('idle');
      setStatusMessage('');
    }
  };

  // Abrir POS en el navegador
  const handleOpenPos = () => {
    window.location.href = window.location.origin;
  };

  // Copiar URL del POS al portapapeles
  const handleCopyPosUrl = async () => {
    try {
      const text = window.location.origin;

      // 1) API moderna (solo funciona en contextos seguros y navegadores compatibles)
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatusMessage('URL del POS copiada al portapapeles');
        setStatus('ok');
        setTimeout(() => {
          setStatus('idle');
          setStatusMessage('');
        }, 2000);
        return;
      }

      // 2) Fallback clásico (funciona en la mayoría de WebViews / HTTP)
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);

      const ok = document.execCommand("copy");
      document.body.removeChild(ta);

      if (ok) {
        setStatusMessage('URL del POS copiada al portapapeles');
        setStatus('ok');
        setTimeout(() => {
          setStatus('idle');
          setStatusMessage('');
        }, 2000);
      } else {
        setStatusMessage('No se pudo copiar automáticamente. Mantén presionado y copia manual.');
        setStatus('error');
        setTimeout(() => {
          setStatus('idle');
          setStatusMessage('');
        }, 3000);
      }
    } catch (err) {
      console.error("Error copiando URL:", err);
      setStatusMessage('No se pudo copiar automáticamente. Mantén presionado y copia manual.');
      setStatus('error');
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('');
      }, 3000);
    }
  };

  const content = (
    <>
      <div className="caja-content" style={{ padding: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.5rem',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          {/* URL del POS (para abrir en navegador) */}
          <div className="card" style={{ background: 'var(--gray-50)', boxShadow: 'none', marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 700,
              fontSize: 'var(--text-13)',
              color: 'var(--gray-900)'
            }}>
              URL DEL POS (para abrir en el navegador):
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              <code style={{
                flex: 1,
                padding: '0.5rem',
                background: '#fff',
                border: '1px solid var(--separator)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-15)',
                fontFamily: 'monospace',
                color: 'var(--brand-deep)'
              }}>
                {window.location.origin}
              </code>
              <button onClick={handleCopyPosUrl} className="btn btn--secondary btn--sm">
                COPIAR
              </button>
            </div>
            <button onClick={handleOpenPos} className="btn-chanatos-outline">
              ABRIR POS
            </button>
          </div>

          {/* Campo URL del Backend */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 700,
              fontSize: 'var(--text-17)',
              color: 'var(--gray-900)'
            }}>
              URL DEL BACKEND (API)
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setStatus('idle');
                setStatusMessage('');
                setSaved(false);
              }}
              placeholder="http://192.168.1.56:3000"
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: 'var(--text-17)',
                border: '2px solid var(--gray-200)',
                borderRadius: 'var(--radius-md)',
                boxSizing: 'border-box'
              }}
            />
            <div style={{
              fontSize: 'var(--text-13)',
              color: 'var(--gray-500)',
              marginTop: '0.25rem',
              fontStyle: 'italic'
            }}>
              Esta URL NO es para abrirla en el navegador. Es solo para conectar el POS.
            </div>
            <div style={{
              fontSize: 'var(--text-13)',
              color: 'var(--gray-500)',
              marginTop: '0.25rem'
            }}>
              Ejemplo: http://192.168.1.56:3000
            </div>
          </div>

          {/* Estado de conexión */}
          {status !== 'idle' && (
            <div style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: status === 'ok' ? 'var(--green-tint)' : status === 'error' ? 'var(--red-tint)' : 'var(--blue-tint)',
              color: status === 'ok' ? 'var(--green-text)' : status === 'error' ? 'var(--red-text)' : 'var(--blue-text)'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {status === 'loading' && 'Probando...'}
                {status === 'ok' && 'Conectado'}
                {status === 'error' && 'Error de conexión'}
              </div>
              {statusMessage && (
                <div style={{ fontSize: 'var(--text-15)' }}>
                  {statusMessage}
                </div>
              )}
            </div>
          )}

          {/* Mensaje de guardado */}
          {saved && (
            <div style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--green-tint)',
              color: 'var(--green-text)'
            }}>
              Guardado. Se recomienda recargar la página.
            </div>
          )}

          {/* Botones: GUARDAR es la acción principal (ancho completo); el resto son
              acciones secundarias/técnicas, de ancho ajustado a su contenido. */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}>
            <button onClick={handleSave} className="btn btn--primary btn--lg">
              GUARDAR
            </button>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleTestConnection}
                disabled={status === 'loading'}
                className="btn btn--secondary"
                style={{ flex: '1 1 auto' }}
              >
                {status === 'loading' ? 'PROBANDO...' : 'PROBAR CONEXIÓN'}
              </button>

              {saved && (
                <button
                  onClick={handleReload}
                  className="btn btn--secondary"
                  style={{ flex: '1 1 auto' }}
                >
                  RECARGAR PÁGINA
                </button>
              )}

              <button
                onClick={handleReset}
                className="btn btn--destructive-ghost"
                style={{ flex: '1 1 auto' }}
              >
                RESTAURAR POR DEFECTO
              </button>
            </div>
          </div>
        </div>
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </>
  );

  if (embedded) return content;

  return (
    <div className="caja-container">
      <CajaHeader title="SERVIDOR" backTo="/mas" />
      {content}
    </div>
  );
}
