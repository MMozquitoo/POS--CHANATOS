import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { getApiBaseUrl } from '../../utils/api';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

/**
 * PASO 14.5: Pantalla de diagnóstico rápido
 * Permite verificar conectividad, latencia y estado del sistema
 *
 * embedded=true: se usa dentro de Conexion.jsx (pestaña "Estado"), sin su
 * propio CajaHeader/container.
 */
export default function Diagnostico({ embedded = false, onGoToServer }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const { socket } = useAuth();
  const { isOnline, lastError } = useConnection();
  const [status, setStatus] = useState('idle'); // idle, loading, ok, error
  const [result, setResult] = useState(null);
  // Cuando esta pantalla se abre desde el mismo PC del servidor (Electron
  // carga http://localhost:3000), "SERVIDOR ACTUAL" muestra "localhost" — útil
  // ahí mismo, pero inservible como link para el celular. Pedimos la IP LAN
  // real al backend para mostrar el link que sí funciona desde otro equipo
  // (reporte del dueño 2026-08-19: "no aparece un link para abrirlo en el celular").
  const [lanUrl, setLanUrl] = useState(null);

  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(
    (() => { try { return new URL(getApiBaseUrl()).hostname; } catch { return ''; } })()
  );

  useEffect(() => {
    if (!isLocalHost) return;
    axios.get(`${getApiBaseUrl()}/api/discover`)
      .then((res) => {
        if (res.data?.ip) {
          setLanUrl(`http://${res.data.ip}:${res.data.port || 3000}`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyLanUrl = async () => {
    if (!lanUrl) return;
    try {
      await navigator.clipboard.writeText(lanUrl);
      showAlert('Link copiado. Pégalo en el navegador del celular (misma red Wi-Fi).');
    } catch (error) {
      showAlert(`No se pudo copiar. Anótalo a mano: ${lanUrl}`);
    }
  };

  // Probar conectividad
  const handleTest = async () => {
    setStatus('loading');
    setResult(null);
    
    const baseUrl = getApiBaseUrl();
    const healthUrl = `${baseUrl}/api/health`;
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await axios.get(healthUrl, {
        signal: controller.signal,
        timeout: 3000
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      
      if (response.data && (response.data.status === 'ok' || response.data.ok === true)) {
        setStatus('ok');
        setResult({
          httpHealth: 'OK',
          statusCode: response.status,
          latency,
          socketStatus: socket?.connected ? 'Conectado' : 'Desconectado',
          testedAt: new Date().toLocaleString('es-CO'),
          error: null
        });
      } else {
        throw new Error('Respuesta inesperada del servidor');
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
        ? 'Timeout: El servidor no responde (3s)'
        : error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')
        ? 'No se pudo conectar al servidor'
        : error.response
        ? `Error ${error.response.status}: ${error.response.statusText}`
        : error.message || 'Error de conexión';
      
      setStatus('error');
      setResult({
        httpHealth: 'FAIL',
        statusCode: error.response?.status || 'N/A',
        latency: latency < 3000 ? latency : null,
        socketStatus: socket?.connected ? 'Conectado' : 'Desconectado',
        testedAt: new Date().toLocaleString('es-CO'),
        error: errorMessage
      });
    }
  };

  // Copiar reporte al clipboard
  const handleCopyReport = async () => {
    const baseUrl = getApiBaseUrl();
    const report = `POS CHANATOS - DIAGNÓSTICO
Fecha: ${new Date().toLocaleString('es-CO')}
Servidor: ${baseUrl}
Health: ${result?.httpHealth || 'No probado'} ${result?.statusCode ? `(${result.statusCode})` : ''} ${result?.latency ? `- ${result.latency}ms` : ''}
Socket: ${result?.socketStatus || (socket?.connected ? 'conectado' : 'desconectado')}
isOnline (ConnectionContext): ${isOnline ? 'true' : 'false'}
Último error: ${result?.error || lastError || 'ninguno'}`;

    try {
      await navigator.clipboard.writeText(report);
      showAlert('Reporte copiado al portapapeles');
    } catch (error) {
      console.error('Error copiando al portapapeles:', error);
      showAlert('No se pudo copiar. Usa Ctrl+C manualmente.');
    }
  };

  const baseUrl = getApiBaseUrl();

  const content = (
    <>
      <div className="caja-content" style={{ padding: '1.5rem' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '1.5rem',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {/* Servidor actual */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 700,
              fontSize: 'var(--text-15)',
              color: 'var(--gray-900)'
            }}>
              SERVIDOR ACTUAL
            </label>
            <div style={{
              padding: '0.75rem',
              background: 'var(--gray-50)',
              border: '1px solid var(--separator)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-15)',
              color: 'var(--gray-900)',
              wordBreak: 'break-all'
            }}>
              {baseUrl}
            </div>
          </div>

          {/* Link para el celular: solo aparece cuando esta pantalla se ve desde
              el propio PC del servidor (ahí "SERVIDOR ACTUAL" dice localhost) */}
          {isLocalHost && lanUrl && (
            <div>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: 700,
                fontSize: 'var(--text-15)',
                color: 'var(--gray-900)'
              }}>
                LINK PARA EL CELULAR
              </label>
              <div style={{
                padding: '0.75rem',
                background: 'var(--brand-tint, #FFF3D6)',
                border: '1px solid var(--brand)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-15)',
                color: 'var(--gray-900)',
                wordBreak: 'break-all',
                marginBottom: '0.5rem'
              }}>
                {lanUrl}
              </div>
              <button onClick={handleCopyLanUrl} className="btn btn--secondary">
                COPIAR LINK
              </button>
              <div style={{ marginTop: '0.5rem', fontSize: 'var(--text-13)', color: 'var(--gray-500)' }}>
                Escríbelo en el navegador del celular, conectado a la misma red Wi-Fi.
              </div>
            </div>
          )}

          {/* Botón probar */}
          <button
            onClick={handleTest}
            disabled={status === 'loading'}
            className="btn btn--primary btn--lg"
          >
            {status === 'loading' ? 'PROBANDO...' : 'PROBAR AHORA'}
          </button>

          {/* Resultado */}
          {result && (
            <div className="card" style={{
              background: status === 'ok' ? 'var(--green-tint)' : 'var(--red-tint)',
            }}>
              <h3 style={{
                margin: '0 0 1rem 0',
                fontSize: 'var(--text-20)',
                color: status === 'ok' ? 'var(--green-text)' : 'var(--red-text)'
              }}>
                RESULTADO
              </h3>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                fontSize: 'var(--text-15)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>HTTP Health:</strong>
                  <span style={{
                    color: result.httpHealth === 'OK' ? 'var(--green-text)' : 'var(--red-text)',
                    fontWeight: 'bold'
                  }}>
                    {result.httpHealth} {result.statusCode && `(${result.statusCode})`}
                  </span>
                </div>

                {result.latency !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>Latencia:</strong>
                    <span>{result.latency}ms</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Socket:</strong>
                  <span style={{
                    color: result.socketStatus === 'Conectado' ? 'var(--green-text)' : 'var(--red-text)'
                  }}>
                    {result.socketStatus}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>isOnline:</strong>
                  <span style={{
                    color: isOnline ? 'var(--green-text)' : 'var(--red-text)'
                  }}>
                    {isOnline ? 'true' : 'false'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Hora última prueba:</strong>
                  <span>{result.testedAt}</span>
                </div>

                {result.error && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: 'rgba(255, 59, 48, 0.08)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--red)'
                  }}>
                    <strong>Error:</strong> {result.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botones de acción: secundarios, ancho ajustado a su contenido (no flex-grow) */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={handleCopyReport}
              disabled={!result}
              className="btn btn--secondary"
            >
              COPIAR REPORTE
            </button>

            <button
              onClick={() => (onGoToServer ? onGoToServer() : navigate('/config-servidor'))}
              className="btn btn--secondary"
            >
              IR A SERVIDOR
            </button>
          </div>
        </div>
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </>
  );

  if (embedded) return content;

  return (
    <div className="caja-container">
      <CajaHeader title="DIAGNÓSTICO" backTo="/mas" />
      {content}
    </div>
  );
}
