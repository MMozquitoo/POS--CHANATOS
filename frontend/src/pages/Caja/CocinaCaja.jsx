import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { statusLabel } from '../../utils/statusLabels.js';
import Modal from '../../components/Modal';
import BrandMark from '../../components/BrandMark';
import PlatformBadge from '../../components/PlatformBadge';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { notifyDesktop, playKitchenChime, unlockAudio } from '../../utils/kitchenSound';
import KitchenTicket, { KitchenItems } from '../../components/kitchen/KitchenTicket';
import { useOrderWorkspace } from '../../components/orders/OrderWorkspaceHost';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/EmptyState';
import useChangedIds from '../../hooks/useChangedIds';
import { useNow } from '../../hooks/useLiveOrders';
import '../../components/ui/ui.css';
import '../Cocina/Cocina.css';

const byCreatedAt = (a, b) => String(a.created_at).localeCompare(String(b.created_at));

/* OrderCard fuera de CocinaCaja (no se re-crea en cada render). Rediseño
   2026-10: usa el ticket compartido con la vista del rol Cocina y conserva las
   acciones de Caja (enviar a preparación, marcar listo, cobrar). */
function OrderCard({ order, now, flash, selectedOrderId, onSelect, isUpdating, onConfirmStatus, onCobrar }) {
  let actions = null;
  if (order.status === 'NUEVO') {
    actions = (
      <button
        onClick={() => onConfirmStatus(order.id, 'EN_PREP', '¿Enviar esta orden a preparación?')}
        disabled={isUpdating}
        className="btn btn--primary"
      >
        {isUpdating ? 'Enviando…' : 'Enviar a preparación'}
      </button>
    );
  } else if (order.status === 'EN_PREP') {
    actions = (
      <button
        onClick={() => onConfirmStatus(order.id, 'LISTO', '¿Marcar esta orden como lista?')}
        disabled={isUpdating}
        className="btn btn--dark"
      >
        {isUpdating ? 'Marcando…' : 'Marcar lista'}
      </button>
    );
  } else if (order.status === 'LISTO' && onCobrar) {
    // Cobro directo desde el tablero de cocina: sin recorrer la app
    // buscando el pedido (dueño, 2026-08-02)
    actions = (
      <button onClick={() => onCobrar(order)} className="btn btn--primary">
        Cobrar
      </button>
    );
  }
  return (
    <KitchenTicket
      order={order}
      now={now}
      flash={flash}
      selected={selectedOrderId === order.id}
      onClick={() => onSelect(order)}
      actions={actions}
    />
  );
}

export default function CocinaCaja({ hideHeader = false }) {
  const navigate = useNavigate();
  const ws = useOrderWorkspace();
  const { socket } = useAuth();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [orders, setOrders] = useState({ NUEVO: [], EN_PREP: [], LISTO: [] });
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(new Set());
  // FASE M15: en móvil las 3 columnas apiladas con su propio scroll interno
  // (scroll sobre scroll) confundían más de lo que ayudaban. En vez de eso,
  // se elige UNA sección a la vez (como pestañas); en desktop, con espacio de
  // sobra, siguen viéndose las 3 lado a lado y este estado no se usa.
  const [mobileSection, setMobileSection] = useState('NUEVO');

  // Desbloquear el chime de Web Audio al primer toque — solo cuando esta vista
  // corre "sola" (ruta /cocina); embebida en Centro Total, CentroTotal.jsx ya
  // lo desbloquea a nivel de toda la pantalla.
  useEffect(() => {
    if (hideHeader) return;
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => document.removeEventListener('pointerdown', unlockAudio);
  }, [hideHeader]);

  useEffect(() => {
    loadOrders();

    if (socket) {
      const onNew = (data) => {
        loadOrders();
        // Sonido + notificación nativa: solo cuando esta vista corre "sola" (ruta
        // /cocina, hideHeader=false). Embebida, el aviso lo da la pantalla
        // que la contiene, para no duplicarlo aquí.
        if (!hideHeader) {
          playKitchenChime();
          const order = data?.order;
          const label = order?.daily_no ? `Orden ${order.daily_no}` : (order?.code || 'Pedido nuevo');
          const items = order?.items?.length;
          notifyDesktop({
            title: 'Nueva orden en cocina',
            body: items ? `${label} — ${items} item${items === 1 ? '' : 's'}` : label,
          });
        }
      };
      const onChange = () => loadOrders();
      socket.on('order:new', onNew);
      socket.on('order:status-changed', onChange);
      socket.on('order:archived', onChange);
      socket.on('order:updated', onChange);
      socket.on('item:updated', onChange);
      socket.on('item:voided', onChange);

      // Quitar SOLO estos manejadores (sin función, socket.off borraba también
      // los de otras pantallas montadas — barra, Resumen, etc.)
      return () => {
        socket.off('order:new', onNew);
        socket.off('order:status-changed', onChange);
        socket.off('order:archived', onChange);
        socket.off('order:updated', onChange);
        socket.off('item:updated', onChange);
        socket.off('item:voided', onChange);
      };
    }
  }, [socket, hideHeader]);

  const loadOrders = async () => {
    try {
      // Sin "Cargando..." en cada actualización: el tablero se queda visible
      // y solo cambian los tickets (antes la pantalla entera parpadeaba con
      // cada evento de cocina). loading solo cubre la primera carga.
      const res = await axios.get('/orders?kitchen=true');
      const allOrders = res.data.filter(o => o.status !== 'CANCELADO');

      // Más antiguas primero y orden estable: un pedido no cambia de lugar
      // mientras se trabaja en él
      setOrders({
        NUEVO: allOrders.filter(o => o.status === 'NUEVO').sort(byCreatedAt),
        EN_PREP: allOrders.filter(o => o.status === 'EN_PREP').sort(byCreatedAt),
        LISTO: allOrders.filter(o => o.status === 'LISTO').sort(byCreatedAt)
      });
    } catch (error) {
      console.error('Error cargando pedidos:', error);
      await showAlert(error.response?.data?.error || 'Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    if (updatingStatus.has(orderId)) {
      return;
    }

    if (newStatus === 'EN_PREP' || newStatus === 'LISTO') {
      const allOrders = [...orders.NUEVO, ...orders.EN_PREP, ...orders.LISTO];
      const order = allOrders.find(o => o.id === orderId);
      if (order) {
        const items = order.items || [];
        // Solo voided_at: una orden PREPAGADA tiene todos los items con paid_at
        // y aun asi debe poder marcarse LISTA (igual que el backend)
        const itemsVivos = items.filter(item => !item.voided_at);
        if (itemsVivos.length === 0) {
          await showAlert('No se puede cambiar estado: la orden no tiene items.');
          return;
        }
      }
    }

    setUpdatingStatus(prev => new Set(prev).add(orderId));

    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      await loadOrders();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      await showAlert(error.response?.data?.error || 'Error al actualizar estado');
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleConfirmStatus = async (orderId, newStatus, message) => {
    if (await showConfirm(message)) {
      updateStatus(orderId, newStatus);
    }
  };

  // FASE F7: marcar/desmarcar un plato terminado desde el detalle (solo EN_PREP)
  // Por unidad (2026-10): cada toque suma o quita UNA unidad lista
  const stepItemReady = async (item, delta) => {
    try {
      const res = await axios.patch(`/orders/items/${item.id}/ready`, { delta });
      // Refrescar el modal con la orden actualizada (incluye auto-avance a LISTO)
      setSelectedOrder(res.data.order);
      loadOrders();
    } catch (error) {
      console.error('Error marcando plato:', error);
      await showAlert(error.response?.data?.error || 'Error al marcar el plato');
    }
  };

  const now = useNow(30000);
  const allActive = useMemo(() => [...orders.NUEVO, ...orders.EN_PREP, ...orders.LISTO], [orders]);
  const changedIds = useChangedIds(loading ? null : allActive);

  if (loading) {
    return (
      <div className="workspace">
        <div className="workspace__main">
          {!hideHeader && <PageHeader title="Cocina" subtitle="Cargando pedidos…" />}
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="cocina-caja-shell cocina-caja-v3">
      {!hideHeader && (
        <div className="cocina-caja-head">
          <PageHeader
            title="Cocina"
            subtitle={`${orders.NUEVO.length + orders.EN_PREP.length} en cocina · ${orders.LISTO.length} listos para cobrar`}
          />
        </div>
      )}

      {/* Selector de sección — solo se ve en móvil (mobile-polish.css), en
          desktop las 3 columnas ya se ven juntas y esto queda oculto. */}
      <div className="cocina-caja-mobile-tabs">
        {[
          { key: 'NUEVO', label: 'Nuevos', color: '#1971c2' },
          { key: 'EN_PREP', label: 'En preparación', color: '#f59f00' },
          { key: 'LISTO', label: 'Listos', color: '#2b8a3e' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileSection(key)}
            className={`cocina-caja-mobile-tab ${mobileSection === key ? 'active' : ''}`}
            style={mobileSection === key ? { background: color, borderColor: color } : undefined}
          >
            {label} ({orders[key].length})
          </button>
        ))}
      </div>

      <div className="cocina-caja-board cocina-columns">
        <div className={`cocina-column ${mobileSection === 'NUEVO' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title nuevo">Nuevos ({orders.NUEVO.length})</h2>
          <div className="orders-column">
            {orders.NUEVO.length === 0 ? (
              <EmptyState compact icon="check" title="Todo al día en cocina" description="Los pedidos nuevos aparecen aquí." />
            ) : (
              orders.NUEVO.map(order => (
                <OrderCard key={order.id} order={order} now={now} flash={changedIds.has(order.id)} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} onCobrar={(o) => ws.abrirOrden(o)} />
              ))
            )}
          </div>
        </div>
        <div className={`cocina-column ${mobileSection === 'EN_PREP' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title en-prep">En preparación ({orders.EN_PREP.length})</h2>
          <div className="orders-column">
            {orders.EN_PREP.length === 0 ? (
              <EmptyState compact icon="cocina" title="Nada en preparación" description="Envía un pedido nuevo para empezar." />
            ) : (
              orders.EN_PREP.map(order => (
                <OrderCard key={order.id} order={order} now={now} flash={changedIds.has(order.id)} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} onCobrar={(o) => ws.abrirOrden(o)} />
              ))
            )}
          </div>
        </div>
        <div className={`cocina-column ${mobileSection === 'LISTO' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title listo">Listos para cobrar ({orders.LISTO.length})</h2>
          <div className="orders-column">
            {orders.LISTO.length === 0 ? (
              <EmptyState compact icon="fuego" title="Sin pedidos listos" description="Cuando cocina termine, aparecen aquí para cobrar." />
            ) : (
              orders.LISTO.map(order => (
                <OrderCard key={order.id} order={order} now={now} flash={changedIds.has(order.id)} selectedOrderId={selectedOrder?.id} onSelect={setSelectedOrder} isUpdating={updatingStatus.has(order.id)} onConfirmStatus={handleConfirmStatus} onCobrar={(o) => ws.abrirOrden(o)} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de detalle de orden */}
      {selectedOrder && (
        <div 
          onClick={() => setSelectedOrder(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>
                {selectedOrder.daily_no ? `ORDEN ${selectedOrder.daily_no}` : selectedOrder.code}
              </h2>
              <button
                onClick={() => setSelectedOrder(null)}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '1rem', color: '#666', fontSize: '0.9rem' }}>
              <div>Fecha: {new Date(selectedOrder.created_at).toLocaleString('es-CO')}</div>
              {selectedOrder.table_label && (
                <div>Mesa: {selectedOrder.table_label}</div>
              )}
              <div>Estado: <strong>{statusLabel(selectedOrder.status)}</strong></div>
            </div>

            {/* El cliente cambió algo con la orden ya andando: acceso directo a
                la pantalla donde se modifica (agregar items, anular, etc.) */}
            {['NUEVO', 'EN_PREP', 'LISTO'].includes(selectedOrder.status) && !selectedOrder.archived_at && (
              <button
                type="button"
                className="btn btn--secondary"
                style={{ width: '100%', marginBottom: '0.5rem' }}
                onClick={() => {
                  const o = selectedOrder;
                  setSelectedOrder(null);
                  // Se modifica en la hoja de trabajo, sin salir de Cocina
                  ws.abrirOrden(o);
                }}
              >
                Modificar orden (agregar o anular items)
              </button>
            )}

            <div style={{ marginTop: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>Productos</h3>
              {selectedOrder.status === 'EN_PREP' && (
                <p style={{ color: 'var(--brand-deep)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
                  Toca un plato para marcarlo como terminado; si son varios, cada toque marca uno.
                  Al completar todos, la orden pasa a lista sola.
                </p>
              )}
              <KitchenItems
                items={(selectedOrder.items || []).filter((item) => !item.voided_at)}
                onStep={selectedOrder.status === 'EN_PREP' ? stepItemReady : undefined}
                dimReady={selectedOrder.status !== 'NUEVO'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
      actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
      <p>{alertState.message}</p>
    </Modal>
    <Modal open={confirmState.open} onClose={cancelConfirm} title={confirmState.title}
      actions={<>
        <button className="btn-secondary" onClick={cancelConfirm}>Cancelar</button>
        <button className="btn-chanatos" onClick={acceptConfirm}>Aceptar</button>
      </>}>
      <p>{confirmState.message}</p>
    </Modal>
    </>
  );
}
