import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { getApiBaseUrl } from '../../utils/api';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';

/**
 * PASO 14.5: Pantalla de diagnóstico rápido
 * Permite verificar conectividad, latencia y estado del sistema
 */
export default function Diagnostico() {
  const navigate = useNavigate();
  const { socket } = useAuth();
  const { isOnline, lastError } = useConnection();
  const [status, setStatus] = useState('idle'); // idle, loading, ok, error
  const [result, setResult] = useState(null);

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
      alert('Reporte copiado al portapapeles');
    } catch (error) {
      console.error('Error copiando al portapapeles:', error);
      alert('No se pudo copiar. Usa Ctrl+C manualmente.');
    }
  };

  const baseUrl = getApiBaseUrl();

  return (
    <div className="caja-container">
      <CajaHeader 
        title="DIAGNÓSTICO"
        backTo="/mas"
      />
      
      <div className="caja-content" style={{ padding: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1.5rem',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          {/* Servidor actual */}
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: 'bold',
              fontSize: '1rem',
              color: '#333'
            }}>
              SERVIDOR ACTUAL
            </label>
            <div style={{
              padding: '0.75rem',
              background: '#f8f9fa',
              border: '1px solid #ddd',
              borderRadius: '8px',
              fontSize: '0.95rem',
              color: '#333',
              wordBreak: 'break-all'
            }}>
              {baseUrl}
            </div>
          </div>

          {/* Botón probar */}
          <button
            onClick={handleTest}
            disabled={status === 'loading'}
            style={{
              padding: '0.75rem 1.5rem',
              background: status === 'loading' ? '#6c757d' : '#F5BB4C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              opacity: status === 'loading' ? 0.6 : 1
            }}
          >
            {status === 'loading' ? 'PROBANDO...' : 'PROBAR AHORA'}
          </button>

          {/* Resultado */}
          {result && (
            <div style={{
              background: status === 'ok' ? '#d4edda' : '#f8d7da',
              border: `2px solid ${status === 'ok' ? '#28a745' : '#dc3545'}`,
              borderRadius: '12px',
              padding: '1.5rem'
            }}>
              <h3 style={{ 
                margin: '0 0 1rem 0', 
                fontSize: '1.2rem',
                color: status === 'ok' ? '#155724' : '#721c24'
              }}>
                RESULTADO
              </h3>
              
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.75rem',
                fontSize: '0.95rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>HTTP Health:</strong>
                  <span style={{ 
                    color: result.httpHealth === 'OK' ? '#28a745' : '#dc3545',
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
                    color: result.socketStatus === 'Conectado' ? '#28a745' : '#dc3545'
                  }}>
                    {result.socketStatus}
                  </span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>isOnline:</strong>
                  <span style={{ 
                    color: isOnline ? '#28a745' : '#dc3545'
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
                    background: 'rgba(220, 53, 69, 0.1)',
                    borderRadius: '6px',
                    border: '1px solid #dc3545'
                  }}>
                    <strong>Error:</strong> {result.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.75rem' 
          }}>
            <button
              onClick={handleCopyReport}
              disabled={!result}
              style={{
                padding: '0.75rem 1.5rem',
                background: !result ? '#6c757d' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: !result ? 'not-allowed' : 'pointer',
                opacity: !result ? 0.6 : 1
              }}
            >
              COPIAR REPORTE
            </button>
            
            <button
              onClick={() => navigate('/config-servidor')}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              IR A SERVIDOR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
