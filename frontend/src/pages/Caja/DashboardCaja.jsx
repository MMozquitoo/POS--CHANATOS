import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaDateTime } from '../../utils/timezone.js';
import CajaHeader from '../../components/CajaHeader.jsx';
import OpenCashModal from '../../components/caja/OpenCashModal.jsx';
import EmptyState from '../../components/EmptyState.jsx';

export default function DashboardCaja() {
  const navigate = useNavigate();
  const { socket, logout } = useAuth();
  const { isOnline } = useConnection();
  
  // PASO 14.4: Recuperaciรณn automรกtica al reconectar
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: true,
    onReconnect: async () => {
      await loadSession();
    }
  });
  
  // Estados para sesiรณn de caja
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState(false);

  useEffect(() => {
    loadSession();
    loadSummary();

    if (socket) {
      socket.on('payment:created', () => {
        loadSummary();
      });

      socket.on('cash:session-opened', () => {
        loadSession();
        loadSummary();
      });

      socket.on('cash:session-closed', () => {
        loadSession();
        setSummary(null);
      });

      return () => {
        socket.off('payment:created');
        socket.off('cash:session-opened');
        socket.off('cash:session-closed');
      };
    }
  }, [socket]);

  const loadSession = async () => {
    try {
      const res = await axios.get('/cash/session/active');
      if (res.data.active && res.data.session) {
        setSession(res.data.session);
        await loadSummary(res.data.session.id);
      } else {
        setSession(null);
        setSummary(null);
      }
    } catch (error) {
      console.error('Error cargando sesiรณn:', error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (sessionId) => {
    if (!sessionId && session) {
      sessionId = session.id;
    }
    if (!sessionId) return;

    try {
      const res = await axios.get(`/cash/session/${sessionId}/summary`);
      setSummary(res.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    }
  };

  // FASE 17.3: Función para abrir caja desde modal
  // FASE 17.7: Hardening de errores con mensajes específicos
  const handleOpenCash = async (initialCash) => {
    setOpeningCash(true);
    try {
      await axios.post('/cash/open', { initialCash });
      // FASE 17.8: Guardar monto en localStorage para próxima vez
      localStorage.setItem('last_initial_cash', initialCash.toString());
      await loadSession();
      setShowOpenModal(false);
      alert('Caja abierta correctamente');
      // Opcional: redirigir a centro-total
      // navigate('/centro-total');
    } catch (error) {
      console.error('Error abriendo caja:', error);
      
      // FASE 17.7: Mensajes específicos según tipo de error
      let errorMessage = 'Error al abrir caja';
      
      if (!error.response) {
        // Sin respuesta = offline o timeout
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          errorMessage = 'Timeout: El servidor no responde. Intenta de nuevo.';
        } else {
          errorMessage = 'Sin conexión. Verifica tu red e intenta de nuevo.';
        }
      } else if (error.response.status === 400) {
        if (error.response.data?.error?.includes('Ya existe')) {
          errorMessage = 'Ya hay una sesión de caja abierta. Recargando...';
          await loadSession();
        } else if (error.response.data?.error?.includes('monto') || error.response.data?.error?.includes('inicial')) {
          errorMessage = 'Monto inválido. Ingresa un número >= 0.';
        } else {
          errorMessage = error.response.data?.error || 'Datos inválidos.';
        }
      } else if (error.response.status === 500) {
        errorMessage = 'Error del servidor. Intenta de nuevo o contacta soporte.';
      } else {
        errorMessage = error.response.data?.error || 'Error al abrir caja';
      }
      
      alert(errorMessage);
      // FASE 17.7: Mantener modal abierto si falla (para que no pierda el valor)
      // No cerramos el modal aquí, solo mostramos el error
    } finally {
      setOpeningCash(false);
    }
  };

  if (loading) {
    return (
      <div className="caja-container" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Cargando información...</div>
      </div>
    );
  }

  // Calcular valores para el bloque informativo
  const initialCash = session?.initial_cash || 0;
  const totalSales = summary?.totalSales || 0;
  const totalCash = summary?.byMethod?.find(m => m.method === 'EFECTIVO')?.total || 0;
  const totalCard = summary?.byMethod?.find(m => m.method === 'TARJETA')?.total || 0;
  const totalTransfer = summary?.byMethod?.find(m => m.method === 'TRANSFERENCIA')?.total || 0;
  const expectedCash = initialCash + totalCash;
  const diffCash = session?.closing_cash !== null && session?.closing_cash !== undefined 
    ? session.closing_cash - expectedCash 
    : null;

  return (
    <div className="caja-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CajaHeader 
        title="CAJA"
        subtitle="Dashboard"
        rightButton={{ label: "OPCIONES", to: "/mas" }}
      />
      
      {/* PASO 14.4: Mensaje cuando se estรก refrescando tras reconectar */}
      {isOnline && isRefreshingOnReconnect && (
        <div style={{
          padding: '0.5rem 1rem',
          background: '#d4edda',
          border: '1px solid #28a745',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#155724',
          fontWeight: 'bold'
        }}>
          Actualizando datos...
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#f8f9fa' }}>
        {/* Bloque informativo: Sesiรณn de Caja Abierta (SOLO INFO, sin botones) */}
        {session ? (
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '2rem',
            border: '2px solid #28a745',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: '#28a745' }}>
                Sesión de Caja Abierta
              </h2>
              {/* FASE 17.9: Badge "Caja abierta" */}
              <span style={{
                background: '#28a745',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                ✅ Caja abierta
              </span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>Apertura</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333' }}>
                  {formatBogotaDateTime(session.opened_at)}
                </div>
              </div>
              
              <div>
                {/* FASE 17.9: Mostrar monto inicial y hora de apertura */}
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>Monto inicial</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333' }}>
                  {formatPriceCOP(initialCash)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  Abierta a las: {new Date(session.opened_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #eee', paddingTop: '1rem', marginTop: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>Ventas Teรณricas</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#F5BB4C' }}>
                    {formatPriceCOP(totalSales)}
                  </div>
                </div>
                
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>Total Cobrado</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#28a745' }}>
                    {formatPriceCOP(totalCash + totalCard + totalTransfer)}
                  </div>
                </div>
                
                {diffCash !== null && (
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>Diferencia</div>
                    <div style={{ 
                      fontSize: '1.2rem', 
                      fontWeight: 'bold', 
                      color: diffCash === 0 ? '#28a745' : diffCash > 0 ? '#ffc107' : '#dc3545'
                    }}>
                      {formatPriceCOP(diffCash)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '2rem' }}>
            <EmptyState
              title="No hay una caja abierta"
              description="Para comenzar a cobrar, primero debes abrir la caja."
              actionLabel="ABRIR CAJA"
              onAction={() => setShowOpenModal(true)}
            />
          </div>
        )}

        {/* 3 Botones principales */}
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <button
            onClick={() => navigate('/centro-total')}
            className="caja-main-action btn-chanatos"
          >
            CENTRO DE CONTROL
          </button>

          <button
            onClick={() => {
              if (!session) {
                alert('Debes abrir caja antes de continuar');
                return;
              }
              navigate('/cobrar');
            }}
            disabled={!session}
            className="caja-main-action btn-success"
          >
            COBRAR PEDIDOS
          </button>

          <button
            onClick={() => navigate('/cierre')}
            disabled={!session}
            className="caja-main-action btn-danger"
          >
            CIERRE DE CAJA
          </button>
        </div>

        {/* Botรณn SALIR (FASE 13.4) */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '1rem',
          background: '#f8f9fa',
          borderTop: '1px solid #ddd',
          marginTop: '1rem'
        }}>
          <button
            onClick={() => {
              if (window.confirm('ยฟCerrar sesiรณn?')) {
                logout();
              }
            }}
            className="btn-danger"
            style={{ width: '100%', maxWidth: '300px', padding: '0.75rem 2rem' }}
          >
            SALIR
          </button>
        </div>
      </div>

      {/* FASE 17.2: Modal para abrir caja */}
      <OpenCashModal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onConfirm={handleOpenCash}
        loading={openingCash}
      />
    </div>
  );
}
