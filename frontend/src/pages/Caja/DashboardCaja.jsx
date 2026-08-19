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
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function DashboardCaja() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const { socket, logout } = useAuth();
  const { isOnline } = useConnection();
  
  // PASO 14.4: Recuperación automática al reconectar
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: true,
    onReconnect: async () => {
      await loadSession();
    }
  });
  
  // Estados para sesión de caja
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState(false);
  const [lowStock, setLowStock] = useState([]);

  const loadLowStock = async () => {
    try {
      const res = await axios.get('/inventory/low-stock');
      setLowStock(res.data || []);
    } catch (error) {
      console.error('Error cargando stock bajo:', error);
    }
  };

  useEffect(() => {
    loadSession();
    loadSummary();
    loadLowStock();

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
      console.error('Error cargando sesión:', error);
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
      showAlert('Caja abierta correctamente');
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
      
      showAlert(errorMessage);
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
  const totalSales = summary?.theoreticalSales || 0;
  const pendingSales = summary?.theoreticalSalesPending || 0;
  const totalCash = summary?.byMethod?.find(m => m.method === 'EFECTIVO')?.total || 0;
  const totalCard = summary?.byMethod?.find(m => m.method === 'TARJETA')?.total || 0;
  const totalTransfer = summary?.byMethod?.find(m => m.method === 'TRANSFERENCIA')?.total || 0;
  const expectedCash = initialCash + totalCash;
  const diffCash = session?.closing_cash !== null && session?.closing_cash !== undefined 
    ? session.closing_cash - expectedCash 
    : null;

  return (
    <div className="caja-container" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CajaHeader
        title="CAJA"
        subtitle="Dashboard"
        rightButton={{ label: "OPCIONES", to: "/mas" }}
      />

      {/* FASE F10: alerta de stock bajo (estado con icono y texto, no solo color) */}
      {lowStock.length > 0 && (
        <div style={{
          padding: '0.6rem 1rem',
          background: '#FFF3D6',
          borderBottom: '1.5px solid #E0B84E',
          color: '#7a5d00',
          fontSize: '0.85rem',
          lineHeight: 1.5
        }}>
          <strong>Stock bajo ({lowStock.length}):</strong>{' '}
          {lowStock.slice(0, 5).map(i => `${i.ingredient_name} (${i.stock_qty} ${i.unit})`).join(' · ')}
          {lowStock.length > 5 && ` · y ${lowStock.length - 5} más`}
        </div>
      )}


      {/* PASO 14.4: Mensaje cuando se está refrescando tras reconectar */}
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

      <div className="caja-bottom-nav-spacer" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#f8f9fa' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        {/* Bloque informativo: Sesión de Caja Abierta (SOLO INFO, sin botones) */}
        {session ? (
          <div style={{ marginBottom: '1.5rem' }}>
            {/* Encabezado de la sesión */}
            <div style={{
              background: 'white',
              borderRadius: 'var(--radius-xl)',
              padding: '1.1rem 1.25rem',
              marginBottom: '0.75rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Apertura
                </div>
                <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--gray-900)', marginTop: 2 }}>
                  {formatBogotaDateTime(session.opened_at)}
                </div>
                <div className="tnum" style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', marginTop: 2 }}>
                  Monto inicial: {formatPriceCOP(initialCash)}
                </div>
              </div>
              <span style={{
                background: 'var(--green-tint)',
                color: 'var(--green-text)',
                padding: '0.35rem 0.9rem',
                borderRadius: '999px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                whiteSpace: 'nowrap'
              }}>
                Caja abierta
              </span>
            </div>

            {/* Stat tiles estilo widgets iOS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {[
                { label: 'Ventas teóricas', value: totalSales, color: 'var(--brand-deep)', hint: pendingSales > 0 ? `Incluye ${formatPriceCOP(pendingSales)} pendiente por cobrar` : null },
                { label: 'Total cobrado', value: totalCash + totalCard + totalTransfer, color: 'var(--green-text)' },
                { label: 'Efectivo', value: totalCash, color: 'var(--gray-900)' },
                { label: 'Transferencias', value: totalTransfer, color: 'var(--gray-900)' },
                ...(diffCash !== null ? [{
                  label: 'Diferencia',
                  value: diffCash,
                  color: diffCash === 0 ? 'var(--green-text)' : diffCash > 0 ? 'var(--orange-text)' : 'var(--red-text)'
                }] : []),
              ].map(({ label, value, color, hint }) => (
                <div key={label} style={{
                  background: 'white',
                  borderRadius: 'var(--radius-lg)',
                  padding: '0.9rem 1rem',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--gray-500)', fontWeight: 600, marginBottom: '0.2rem' }}>
                    {label}
                  </div>
                  <div className="tnum" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color, lineHeight: 1.15 }}>
                    {formatPriceCOP(value)}
                  </div>
                  {hint && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>
                      {hint}
                    </div>
                  )}
                </div>
              ))}
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

        {/* FASE M15: en móvil la barra inferior (BottomNav) ya lleva a cocina,
            cobrar y menú/salir — este bloque quedaba duplicando exactamente
            esos mismos destinos. Se oculta solo en móvil vía CSS
            (.dashboard-caja-launcher); en desktop, sin BottomNav, sigue
            siendo la única forma de navegar desde acá. */}
        <div className="dashboard-caja-launcher">
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
                showAlert('Debes abrir caja antes de continuar');
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

        {/* Botón SALIR (FASE 13.4) */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '1rem',
          background: '#f8f9fa',
          borderTop: '1px solid #ddd',
          marginTop: '1rem'
        }}>
          <button
            onClick={async () => {
              if (await showConfirm('¿Cerrar sesión?')) {
                logout();
              }
            }}
            className="btn-danger"
            style={{ padding: '0.75rem 2rem' }}
          >
            SALIR
          </button>
        </div>
        </div>
        </div>
      </div>

      {/* FASE 17.2: Modal para abrir caja */}
      <OpenCashModal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        onConfirm={handleOpenCash}
        loading={openingCash}
      />
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
