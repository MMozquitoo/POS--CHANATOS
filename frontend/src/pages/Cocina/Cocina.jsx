import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import Modal from '../../components/Modal';
import BrandMark from '../../components/BrandMark';
import PlatformBadge from '../../components/PlatformBadge';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { playKitchenChime, unlockAudio, notifyDesktop } from '../../utils/kitchenSound';
import { getBogotaDateString } from '../../utils/timezone.js';
import KitchenTicket from '../../components/kitchen/KitchenTicket';
import EmptyState from '../../components/EmptyState';
import Icon from '../../components/ui/Icon';
import useChangedIds from '../../hooks/useChangedIds';
import '../../components/ui/ui.css';
import './Cocina.css';

const byCreatedAt = (a, b) => new Date(a.created_at) - new Date(b.created_at);

export default function Cocina() {
  const [orders, setOrders] = useState({ NUEVO: [], EN_PREP: [], LISTO: [], ARCHIVADO: [] });
  // FASE M16: en móvil se ve UNA sección a la vez (pestañas arriba) en vez de
  // las 3-4 columnas apiladas con su propio scroll interno cada una.
  const [mobileSection, setMobileSection] = useState('NUEVO');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('cocina_sonido') !== 'off');
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  // Snapshot para detectar trabajo nuevo (órdenes o items agregados) y sonar
  const snapshotRef = useRef({ ids: new Set(), pendingItems: 0, initialized: false });
  const { socket, logout } = useAuth();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  useEffect(() => {
    loadOrders();

    // Desbloquear audio en la primera interacción (política de autoplay)
    document.addEventListener('pointerdown', unlockAudio, { once: true });

    // Cronómetro de espera de los pedidos
    const timer = setInterval(() => setNow(Date.now()), 15000);

    if (socket) {
      socket.on('order:new', loadOrders);
      socket.on('order:status-changed', loadOrders);
      // Items agregados/editados en una orden ya visible (ej. cliente pide algo más)
      socket.on('order:updated', loadOrders);
      socket.on('item:updated', loadOrders);
      socket.on('item:deleted', loadOrders);
      socket.on('item:voided', loadOrders);
      socket.on('order:archived', loadOrders);
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('pointerdown', unlockAudio);
      if (socket) {
        socket.off('order:new', loadOrders);
        socket.off('order:status-changed', loadOrders);
        socket.off('order:updated', loadOrders);
        socket.off('item:updated', loadOrders);
        socket.off('item:deleted', loadOrders);
        socket.off('item:voided', loadOrders);
        socket.off('order:archived', loadOrders);
      }
    };
  }, [socket]);

  const loadOrders = async () => {
    try {
      // includeArchived=1 trae también lo ya archivado; se separa acá abajo
      // en vez de pedirlo aparte, para no duplicar la consulta.
      const res = await axios.get('/orders?kitchen=true&includeArchived=1');
      const allOrders = res.data.filter(o => o.status !== 'CANCELADO');
      const today = getBogotaDateString();

      const active = allOrders.filter(o => !o.archived_at);
      const archivedToday = allOrders
        .filter(o => o.archived_at && (o.business_day === today || o.archived_at.slice(0, 10) === today))
        .sort((a, b) => new Date(b.archived_at) - new Date(a.archived_at));

      setOrders({
        NUEVO: active.filter(o => o.status === 'NUEVO').sort(byCreatedAt),
        EN_PREP: active.filter(o => o.status === 'EN_PREP').sort(byCreatedAt),
        LISTO: active.filter(o => o.status === 'LISTO').sort(byCreatedAt),
        ARCHIVADO: archivedToday
      });

      // Detectar trabajo nuevo para la alerta sonora:
      // una orden desconocida o más items pendientes que antes
      const pending = active.filter(o => o.status === 'NUEVO' || o.status === 'EN_PREP');
      const ids = new Set(pending.map(o => o.id));
      const pendingItems = pending.reduce(
        (sum, o) => sum + (o.items?.filter(i => !i.voided_at).length || 0), 0
      );
      const prev = snapshotRef.current;
      const newOrders = pending.filter(o => !prev.ids.has(o.id));
      const hasNewWork = newOrders.length > 0 || pendingItems > prev.pendingItems;

      if (prev.initialized && hasNewWork && soundOnRef.current) {
        playKitchenChime();
        // Notificación nativa: cubre el caso de ventana minimizada/sin foco, donde el
        // chime de Web Audio de arriba no suena (los navegadores/Electron suspenden
        // el AudioContext). Si la ventana SÍ tiene foco, no duplica el aviso.
        // Respeta el mismo toggle de sonido de cocina (soundOnRef).
        const first = newOrders[0];
        const title = first ? 'Nueva orden en cocina' : 'Pedido actualizado';
        const body = first
          ? `${first.daily_no ? `Orden ${first.daily_no}` : (first.code || 'Pedido nuevo')}${first.table_label ? ` — ${first.table_label}` : ''}`
          : 'Se agregaron items a un pedido en preparación';
        notifyDesktop({ title, body });
      }
      snapshotRef.current = { ids, pendingItems, initialized: true };
    } catch (error) {
      console.error('Error cargando pedidos:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    localStorage.setItem('cocina_sonido', next ? 'on' : 'off');
    if (next) {
      unlockAudio();
      playKitchenChime();
    }
  };

  const archiveOrder = async (orderId) => {
    try {
      await axios.patch(`/orders/${orderId}/archive`);
      loadOrders();
    } catch (error) {
      console.error('Error archivando pedido:', error);
      showAlert('Error al archivar pedido');
    }
  };

  const archiveDayOrders = async () => {
    const ok = await showConfirm('¿Archivar todas las órdenes LISTO del día? Esto ocultará las órdenes archivadas de la vista.');
    if (!ok) return;

    try {
      await axios.post('/orders/archive-day');
      loadOrders();
      showAlert('Órdenes del día archivadas correctamente');
    } catch (error) {
      console.error('Error archivando órdenes del día:', error);
      showAlert('Error al archivar órdenes del día');
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      loadOrders();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      showAlert('Error al actualizar estado');
    }
  };

  // FASE F7: marcar/desmarcar un plato terminado (solo órdenes EN_PREP).
  // Por unidad (2026-10): cada toque suma o quita UNA unidad lista.
  const stepItemReady = async (item, delta) => {
    try {
      await axios.patch(`/orders/items/${item.id}/ready`, { delta });
      loadOrders();
    } catch (error) {
      console.error('Error marcando plato:', error);
      showAlert(error.response?.data?.error || 'Error al marcar el plato');
    }
  };

  // Resaltado breve de pedidos nuevos o modificados (rediseño 2026-10)
  const activeList = useMemo(() => [...orders.NUEVO, ...orders.EN_PREP, ...orders.LISTO], [orders]);
  const changedIds = useChangedIds(loading ? null : activeList);

  // Acciones de siempre por estado (INICIAR / TODO LISTO / devolver / ARCHIVAR)
  const actionsFor = (order) => {
    if (order.status === 'NUEVO') {
      return (
        <button className="btn btn--primary" onClick={() => updateStatus(order.id, 'EN_PREP')}>
          Iniciar
        </button>
      );
    }
    if (order.status === 'EN_PREP') {
      return (
        <button className="btn btn--dark" onClick={() => updateStatus(order.id, 'LISTO')}>
          Todo listo
        </button>
      );
    }
    if (order.status === 'LISTO') {
      return (
        <>
          <button
            className="btn btn--secondary k-icon-btn"
            onClick={() => updateStatus(order.id, 'EN_PREP')}
            title="Devolver a preparación"
            aria-label="Devolver a preparación"
          >
            <Icon name="chevronLeft" size={20} strokeWidth={2.4} />
          </button>
          <button className="btn btn--secondary" onClick={() => archiveOrder(order.id)}>
            Archivar
          </button>
        </>
      );
    }
    return null;
  };

  const renderTicket = (order, readOnly = false) => (
    <KitchenTicket
      key={order.id}
      order={order}
      now={now}
      archived={readOnly}
      flash={!readOnly && changedIds.has(order.id)}
      onStepItem={!readOnly && order.status === 'EN_PREP' ? stepItemReady : undefined}
      actions={readOnly ? null : actionsFor(order)}
    />
  );

  if (loading) {
    return <div className="loading">Cargando pedidos...</div>;
  }

  return (
    <div className="cocina-container">
      <header className="cocina-header">
        <div className="cocina-brand">
          <BrandMark size={34} />
          <div>
            <h1>Cocina</h1>
            <span>{orders.NUEVO.length + orders.EN_PREP.length} pendientes · {orders.LISTO.length} listos</span>
          </div>
        </div>
        <div className="header-actions">
          <label
            className="sound-toggle"
            title={soundOn ? 'Silenciar alertas' : 'Activar alertas sonoras'}
          >
            <span className="sound-toggle-label">Sonido</span>
            <span className="switch">
              <input type="checkbox" checked={soundOn} onChange={toggleSound} />
              <span className="switch__track" />
            </span>
          </label>
          {orders.LISTO.length > 0 && (
            <button onClick={archiveDayOrders} className="btn btn--secondary cocina-archive-day">
              Archivar día
            </button>
          )}
          <button onClick={logout} className="btn btn--ghost cocina-logout" aria-label="Salir">
            <Icon name="salir" size={20} /> <span className="btn-label">Salir</span>
          </button>
        </div>
      </header>

      {/* Selector de sección — solo se ve en móvil (Cocina.css); en desktop
          las 4 columnas ya se ven juntas y esto queda oculto. */}
      <div className="cocina-mobile-tabs">
        {[
          { key: 'NUEVO', label: 'Nuevos', color: '#1971c2' },
          { key: 'EN_PREP', label: 'En preparación', color: '#f59f00' },
          { key: 'LISTO', label: 'Listos', color: '#2b8a3e' },
          { key: 'ARCHIVADO', label: 'Archivados', color: '#868e96' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMobileSection(key)}
            className={`cocina-mobile-tab ${mobileSection === key ? 'active' : ''}`}
            style={mobileSection === key ? { color } : undefined}
          >
            {label} ({orders[key].length})
          </button>
        ))}
      </div>

      <div className="cocina-columns">
        <div className={`cocina-column ${mobileSection === 'NUEVO' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title nuevo">NUEVOS ({orders.NUEVO.length})</h2>
          <div className="orders-column">
            {orders.NUEVO.length === 0 ? (
              <EmptyState compact icon="check" title="Todo al día en cocina" description="Los pedidos nuevos aparecen aquí con un aviso." />
            ) : (
              orders.NUEVO.map(order => renderTicket(order))
            )}
          </div>
        </div>

        <div className={`cocina-column ${mobileSection === 'EN_PREP' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title en-prep">EN PREPARACIÓN ({orders.EN_PREP.length})</h2>
          <div className="orders-column">
            {orders.EN_PREP.length === 0 ? (
              <EmptyState compact icon="cocina" title="Nada en preparación" description="Toca Iniciar en un pedido nuevo para empezar." />
            ) : (
              orders.EN_PREP.map(order => renderTicket(order))
            )}
          </div>
        </div>

        <div className={`cocina-column ${mobileSection === 'LISTO' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title listo">LISTOS ({orders.LISTO.length})</h2>
          <div className="orders-column">
            {orders.LISTO.length === 0 ? (
              <EmptyState compact icon="fuego" title="Sin pedidos listos" description="Los platos terminados esperan aquí a que los recojan." />
            ) : (
              orders.LISTO.map(order => renderTicket(order))
            )}
          </div>
        </div>

        <div className={`cocina-column ${mobileSection === 'ARCHIVADO' ? 'cocina-section-active' : ''}`}>
          <h2 className="column-title archivado">ARCHIVADOS ({orders.ARCHIVADO.length})</h2>
          <div className="orders-column">
            {orders.ARCHIVADO.length === 0 ? (
              <p className="empty-column">Nada archivado todavía hoy</p>
            ) : (
              orders.ARCHIVADO.map(order => renderTicket(order, true))
            )}
          </div>
        </div>
      </div>

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
      <Modal open={confirmState.open} onClose={cancelConfirm} title={confirmState.title}
        actions={<>
          <button className="btn-secondary" onClick={cancelConfirm}>Cancelar</button>
          <button className="btn-chanatos" onClick={acceptConfirm}>Confirmar</button>
        </>}>
        <p>{confirmState.message}</p>
      </Modal>
    </div>
  );
}
