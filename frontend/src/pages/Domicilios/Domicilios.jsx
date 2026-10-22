import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { formatPriceCOP } from '../../utils/currency.js';
import { statusLabel } from '../../utils/statusLabels';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { useVentanillaRefresh } from '../../hooks/useOrdersRefresh.js';
import ProductPicker, { findProductById } from '../../components/ProductPicker.jsx';
import EditItemNoteModal from '../../components/EditItemNoteModal.jsx';
import { getAdicionales } from '../../components/AdicionalesChips.jsx';
import OrderNoteModal from '../../components/OrderNoteModal.jsx';
import PlatformBadge from '../../components/PlatformBadge.jsx';
import '../Mesero/Mesero.css';
import '../Caja/Caja.css';

function getBackRoute(location, role) {
  const from = location?.state?.from;
  if (from && typeof from === 'string') return from;
  return role === 'CAJA' ? '/centro-total' : '/';
}

// Flujo 2026-08 (dueño): igual que Ventanilla — SOLO armar el pedido nuevo,
// más el campo de datos del cliente (nombre/dirección/tel). Las órdenes vivas
// se ven en COBRAR (Caja) o PEDIDOS (Mesero); ?orderId= abre el detalle.
export default function Domicilios() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backTo = getBackRoute(location, user?.role);
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [openOrders, setOpenOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  // Detalle completo de la orden seleccionada, siempre por GET /orders/:id —
  // NO se busca en `openOrders` porque una orden con pago adelantado (todos
  // sus items con paid_at) sale de la lista only_open aunque siga NUEVO/EN_PREP,
  // y "Modificar orden" desde Cocina quedaba en un cuadro en blanco (dueño,
  // 2026-09).
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [customerNote, setCustomerNote] = useState('');
  const [productsByCategory, setProductsByCategory] = useState({});
  const [newOrderItems, setNewOrderItems] = useState([]);
  const [showMerge, setShowMerge] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  // Nota para cocina de LA ORDEN (independiente de un producto puntual y de
  // customerNote, que es dato del cliente/dirección, no un aviso para cocina)
  const [showOrderNoteModal, setShowOrderNoteModal] = useState(false);
  const [orderNoteDraft, setOrderNoteDraft] = useState('');
  // Editar salsas/nota especial de un item YA agregado (pendiente o ya en la orden)
  const [editingSentItem, setEditingSentItem] = useState(null);
  const [editingLocalIndex, setEditingLocalIndex] = useState(null);
  // RAPPI (2026-10): el pedido llega por la app de Rappi. Rappi ya le cobró al
  // cliente y le paga al local después, así que acá NADIE cobra: al quedar
  // LISTO la orden se cierra sola con un pago "Rappi" que no entra al arqueo
  // del día pero sí a Reportes.
  const [isRappi, setIsRappi] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState(false);

  // FASE 16.3: Hook de refresh para órdenes archivadas
  const { refresh } = useVentanillaRefresh({
    loadOrders,
    setOpenOrders
  });

  useEffect(() => {
    loadOrders();
    loadProducts();
  }, []);

  // Declaración de función (se eleva): useVentanillaRefresh la referencia más arriba
  async function loadOrders() {
    try {
      const res = await axios.get('/orders/service/DOMICILIO?only_open=1');
      setOpenOrders(res.data);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  }

  const loadProducts = async () => {
    try {
      const res = await axios.get('/products');
      setProductsByCategory(res.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const loadOrderItems = async (orderId) => {
    try {
      const res = await axios.get(`/orders/${orderId}`);
      const order = res.data;
      const allItems = order.items || [];
      const pendingItems = allItems.filter(item => !item.paid_at && !item.voided_at);
      setSelectedOrderItems(pendingItems);
      // GET /orders/:id no trae pendingTotal (solo /orders/service/:service lo
      // calcula) — se arma acá para que el header muestre el saldo correcto
      // sin depender de que la orden siga en la lista only_open.
      const pendingTotal = pendingItems.reduce((s, i) => s + i.qty * i.price, 0);
      setSelectedOrderDetail({ ...order, pendingTotal });
    } catch (error) {
      console.error('Error cargando items de orden:', error);
      showAlert('Error al cargar items de la orden');
    }
  };

  // ?orderId= (ej. "Modificar orden" desde Cocina) abre esa orden directo
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const oid = searchParams.get('orderId');
    if (oid) selectOrder(Number(oid));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectOrder = async (orderId) => {
    setSelectedOrderId(orderId);
    await loadOrderItems(orderId);
  };

  // FASE F6: unir otra orden a la seleccionada (un solo ticket)
  const mergeOrder = async (sourceOrderId) => {
    try {
      const res = await axios.post(`/orders/${selectedOrderId}/merge`, { sourceOrderId });
      setShowMerge(false);
      await refresh();
      await loadOrderItems(selectedOrderId);
      showAlert(`Órdenes unidas: ${res.data.itemsMoved} item(s) agregados a esta cuenta`);
    } catch (error) {
      console.error('Error uniendo órdenes:', error);
      showAlert(error.response?.data?.error || 'Error al unir órdenes');
    }
  };

  const createNewOrder = async () => {
    if (newOrderItems.length === 0) {
      showAlert('Agrega al menos un producto');
      return;
    }

    setCreatingOrder(true);
    try {
      // La nota del cliente (nombre/dirección/tel) viaja en las notas de los items
      const itemsWithNotes = newOrderItems.map((it) => ({
        ...it,
        notes: customerNote ? `${it.notes || ''} ${it.notes ? '• ' : ''}${customerNote}`.trim() : it.notes,
      }));

      const eraRappi = isRappi;
      const res = await axios.post('/orders', {
        channel: 'VENTANILLA',
        service: 'DOMICILIO',
        items: itemsWithNotes,
        specialNote: orderNoteDraft.trim() || undefined,
        deliveryPlatform: eraRappi ? 'RAPPI' : undefined,
      });

      setNewOrderItems([]);
      setCustomerNote('');
      setOrderNoteDraft('');
      setIsRappi(false);

      // Rappi: no hay nada que cobrar (Rappi ya cobró). Se queda en cocina y
      // se cierra sola al quedar lista.
      if (eraRappi) {
        await loadOrders();
        showAlert('Pedido de Rappi enviado a cocina. Se cierra solo cuando esté listo; Rappi paga después.');
        return;
      }

      // CAJA cobra al despachar (pago adelantado) — directo al riel de cobro.
      // MESERO: pantalla limpia para el siguiente pedido.
      if (user?.role === 'CAJA' && res.data?.order?.id && res.data?.order?.table_id) {
        // from: /centro-total → "Volver" cae en el cuadro de mesas, no en el
        // panel de armar pedido (dueño, 2026-08-04)
        navigate(`/mesa/${res.data.order.table_id}?orderId=${res.data.order.id}`, { state: { from: '/centro-total' } });
        return;
      }

      await loadOrders();
      showAlert('Pedido enviado a cocina');
    } catch (error) {
      console.error('Error creando pedido:', error);
      showAlert(error.response?.data?.error || 'Error al crear pedido');
    } finally {
      setCreatingOrder(false);
    }
  };

  const addItemsToOrder = async (orderId, items) => {
    try {
      await axios.post(`/orders/${orderId}/items`, { items });
      if (selectedOrderId === orderId) {
        await loadOrderItems(orderId);
      }
      await loadOrders();
      showAlert('Items agregados correctamente');
    } catch (error) {
      console.error('Error agregando items:', error);
      showAlert(error.response?.data?.error || 'Error al agregar items');
    }
  };

  const deleteOrderItem = async (itemId, orderId) => {
    if (!(await showConfirm('¿Eliminar este item de la orden?'))) return;

    try {
      await axios.delete(`/orders/items/${itemId}`);
      if (selectedOrderId === orderId) {
        await loadOrderItems(orderId);
      }
      await loadOrders();
    } catch (error) {
      console.error('Error eliminando item:', error);
      showAlert(error.response?.data?.error || 'Error al eliminar item');
    }
  };

  const addNewOrderItem = (item) => {
    setNewOrderItems((prev) => [...prev, item]);
  };

  const removeNewOrderItem = (index) => {
    setNewOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const saveOrderNote = async (text) => {
    if (selectedOrderId) {
      await axios.patch(`/orders/${selectedOrderId}/special-note`, { specialNote: text });
      await loadOrderItems(selectedOrderId);
      await loadOrders();
    } else {
      setOrderNoteDraft(text);
    }
  };

  // Marcar/desmarcar "pedido de Rappi" en una orden ya creada (se olvidó al
  // armarla). Si ya estaba LISTA, el backend la cierra de una vez.
  const toggleOrderRappi = async (order) => {
    if (!order || savingPlatform) return;
    setSavingPlatform(true);
    try {
      const res = await axios.patch(`/orders/${order.id}/delivery-platform`, {
        deliveryPlatform: order.delivery_platform === 'RAPPI' ? null : 'RAPPI',
      });
      await loadOrders();
      if (res.data?.closed) {
        setSelectedOrderId(null);
        setSelectedOrderDetail(null);
        showAlert('La orden ya estaba lista: quedó cerrada como pedido de Rappi.');
      } else {
        await loadOrderItems(order.id);
      }
    } catch (error) {
      showAlert(error.response?.data?.error || 'No se pudo cambiar la plataforma');
    } finally {
      setSavingPlatform(false);
    }
  };

  const saveSentItemNote = async ({ notes, specialNote }) => {
    await axios.patch(`/orders/items/${editingSentItem.id}`, { notes, specialNote });
    await loadOrderItems(selectedOrderId);
    await loadOrders();
  };

  // Item aún no enviado: además de notas puede cambiar cantidad y adicionales
  // (el panel ya recalculó el precio unitario con los adicionales marcados)
  const saveLocalItemNote = async ({ notes, specialNote, price, qty }) => {
    setNewOrderItems((prev) => prev.map((it, i) => (i === editingLocalIndex
      ? { ...it, notes: notes || '', specialNote, ...(price != null ? { price } : {}), ...(qty ? { qty } : {}) }
      : it)));
  };

  const ACTIVE_STATUSES = ['NUEVO', 'EN_PREP', 'LISTO'];
  const openOrdersList = openOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const selectedOrder = selectedOrderDetail && selectedOrderDetail.id === selectedOrderId ? selectedOrderDetail : null;
  const canEdit = selectedOrder && ['NUEVO', 'EN_PREP'].includes(selectedOrder.status);
  const isCaja = user?.role === 'CAJA';
  const cartTotal = newOrderItems.reduce((s, it) => s + (it.qty || 1) * (it.price || 0), 0);

  return (
    <div className="ventanilla-container caja-bottom-nav-spacer mesero-bottom-nav-spacer">
      <header className="ventanilla-header">
        <button onClick={() => navigate(backTo, { replace: true })} className="back-btn">← Volver</button>
        <h1>DOMICILIOS</h1>
      </header>

      <div className="ventanilla-content">
        {selectedOrderId && selectedOrder && (
          <div className="order-detail-view">
            <div className="order-detail-header">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedOrder.daily_no ? `ORDEN ${selectedOrder.daily_no}` : selectedOrder.code || 'ORDEN'}
                  <PlatformBadge platform={selectedOrder.delivery_platform} />
                </h3>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                  Total pendiente: <strong>{formatPriceCOP(selectedOrder.pendingTotal || 0)}</strong>
                  {` • ${statusLabel(selectedOrder.status)}`}
                </div>
                {canEdit && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.6rem', fontSize: '0.9rem', fontWeight: 600, color: '#495057', cursor: 'pointer' }}>
                    <span className="switch">
                      <input
                        type="checkbox"
                        checked={selectedOrder.delivery_platform === 'RAPPI'}
                        disabled={savingPlatform}
                        onChange={() => toggleOrderRappi(selectedOrder)}
                      />
                      <span className="switch__track" />
                    </span>
                    Pedido de Rappi
                  </label>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowOrderNoteModal(true)}
                    style={{
                      display: 'block', marginTop: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '8px',
                      border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: selectedOrder.special_note ? '#f8d7da' : '#f8f9fa',
                      color: selectedOrder.special_note ? '#dc3545' : '#495057',
                      fontWeight: 600, fontSize: '0.85rem',
                    }}
                  >
                    {selectedOrder.special_note ? `⚠ Nota para cocina: ${selectedOrder.special_note}` : '+ Nota para cocina'}
                  </button>
                )}
              </div>
              <div className="order-detail-actions">
                {isCaja && canEdit && openOrdersList.filter(o => o.id !== selectedOrderId).length > 0 && (
                  <button
                    onClick={() => setShowMerge(true)}
                    style={{ padding: '0.5rem 1rem', minHeight: '44px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
                  >
                    Unir orden
                  </button>
                )}
                {isCaja && selectedOrder.table_id && selectedOrder.delivery_platform !== 'RAPPI' && (
                  <button
                    onClick={() => navigate(`/mesa/${selectedOrder.table_id}?orderId=${selectedOrderId}`, { state: { from: '/domicilios' } })}
                    className="btn-chanatos"
                  >
                    COBRAR
                  </button>
                )}
              </div>
            </div>

            {!canEdit && (
              <div style={{
                padding: '1rem',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '8px',
                marginBottom: '1rem',
                color: '#856404'
              }}>
                <strong>Orden cerrada, no editable.</strong> Solo se pueden editar órdenes nuevas o en preparación.
              </div>
            )}

            {selectedOrderItems.length === 0 ? (
              <div className="empty-state">No hay items pendientes en esta orden</div>
            ) : (
              <div className="items-list-detalle">
                {selectedOrderItems.map(item => (
                  <div key={item.id} className="item-row-detalle">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setEditingSentItem(item)}
                      className="item-info-detalle"
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: canEdit ? 'pointer' : 'default', padding: 0, flex: 1, minWidth: 0 }}
                    >
                      <div className="item-name-detalle">
                        {item.name}
                        {!!item.is_custom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                      </div>
                      <div className="item-details-detalle">
                        {item.qty}x {formatPriceCOP(item.price)} = {formatPriceCOP(item.qty * item.price)}
                        {item.notes && <span className="item-notes-detalle"> • {item.notes}</span>}
                        {canEdit && <span style={{ color: '#1971c2', marginLeft: '0.4rem' }}>editar</span>}
                      </div>
                      {item.special_note && (
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc3545' }}>⚠ {item.special_note}</div>
                      )}
                    </button>
                    {canEdit && isCaja && (
                      <div className="item-actions-detalle">
                        <button
                          onClick={() => {
                            const newQty = Math.max(1, item.qty - 1);
                            axios.patch(`/orders/items/${item.id}`, { qty: newQty })
                              .then(() => loadOrderItems(selectedOrderId))
                              .then(() => loadOrders())
                              .catch(err => showAlert(err.response?.data?.error || 'Error al actualizar cantidad'));
                          }}
                          style={{ padding: '0.25rem 0.5rem', marginRight: '0.5rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          −
                        </button>
                        <button
                          onClick={() => {
                            const newQty = item.qty + 1;
                            axios.patch(`/orders/items/${item.id}`, { qty: newQty })
                              .then(() => loadOrderItems(selectedOrderId))
                              .then(() => loadOrders())
                              .catch(err => showAlert(err.response?.data?.error || 'Error al actualizar cantidad'));
                          }}
                          style={{ padding: '0.25rem 0.5rem', marginRight: '0.5rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          +
                        </button>
                        <button
                          onClick={() => deleteOrderItem(item.id, selectedOrderId)}
                          style={{ padding: '0.25rem 0.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Armar pedido: nuevo (por defecto) o agregar items a la orden abierta */}
        {(!selectedOrderId || canEdit) && (
          <div className="new-order-form" style={{ marginTop: selectedOrderId ? '1.25rem' : 0 }}>
            {!selectedOrderId && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Nota cliente / dirección</label>
                <input
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="Nombre + dirección + tel"
                  style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
                />
              </div>
            )}

            {!selectedOrderId && (
              <label
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                  width: '100%', marginBottom: '1rem', padding: '0.75rem 0.9rem', borderRadius: '8px',
                  background: isRappi ? '#FFE9E3' : '#f8f9fa', cursor: 'pointer', minHeight: 46,
                  border: isRappi ? '1.5px solid #FF441F' : '1.5px solid transparent',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: isRappi ? '#C2330F' : '#495057', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Pedido de Rappi
                    {isRappi && <PlatformBadge platform="RAPPI" />}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                    {isRappi ? 'Nadie cobra acá: Rappi paga después. No entra al cierre de hoy.' : 'Rappi cobra al cliente y paga después'}
                  </span>
                </span>
                <span className="switch">
                  <input type="checkbox" checked={isRappi} onChange={(e) => setIsRappi(e.target.checked)} />
                  <span className="switch__track" />
                </span>
              </label>
            )}

            {!selectedOrderId && (
              <button
                type="button"
                onClick={() => setShowOrderNoteModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                  marginBottom: '1rem', padding: '0.7rem 0.9rem', borderRadius: '8px',
                  border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: orderNoteDraft ? '#f8d7da' : '#f8f9fa',
                  color: orderNoteDraft ? '#dc3545' : '#495057',
                  fontWeight: 600, fontSize: '0.9rem',
                }}
              >
                {orderNoteDraft ? `⚠ Nota para cocina: ${orderNoteDraft}` : '+ Nota para cocina (no de un producto)'}
              </button>
            )}

            <ProductPicker productsByCategory={productsByCategory} onAdd={addNewOrderItem} />

            {newOrderItems.length > 0 && (
              <div className="new-order-list" style={{ marginTop: '1rem' }}>
                {newOrderItems.map((it, idx) => (
                  <div key={idx} className="item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setEditingLocalIndex(idx)}
                      style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 }}
                    >
                      <div style={{ fontWeight: 'bold' }}>
                        {it.qty > 1 ? `${it.qty}× ` : ''}{it.name}
                        {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                        <span style={{ color: '#1971c2', marginLeft: '0.4rem', fontWeight: 600, fontSize: '0.85rem' }}>editar</span>
                      </div>
                      {it.notes && <div style={{ fontSize: '0.9rem', color: '#666' }}>{it.notes}</div>}
                      {it.specialNote && (
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c0392b' }}>⚠ {it.specialNote}</div>
                      )}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span className="tnum" style={{ fontWeight: 700 }}>{formatPriceCOP((it.qty || 1) * (it.price || 0))}</span>
                      <button onClick={() => removeNewOrderItem(idx)} className="remove-btn">×</button>
                    </div>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.25rem', fontSize: '1.1rem', fontWeight: 800 }}>
                  <span>Total</span>
                  <span className="tnum">{formatPriceCOP(cartTotal)}</span>
                </div>

                <button
                  className="pay-all-btn"
                  disabled={!selectedOrderId && creatingOrder}
                  onClick={async () => {
                    if (selectedOrderId) {
                      await addItemsToOrder(selectedOrderId, newOrderItems);
                      setNewOrderItems([]);
                    } else {
                      await createNewOrder();
                    }
                  }}
                >
                  {!selectedOrderId && creatingOrder
                    ? 'ENVIANDO...'
                    : selectedOrderId
                      ? 'AGREGAR ITEMS'
                      : (isCaja && !isRappi) ? 'ENVIAR Y COBRAR' : 'ENVIAR A COCINA'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FASE F6: selector para unir otra orden a la seleccionada */}
      {showMerge && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Unir orden a esta cuenta</h3>
            <p style={{ color: '#666', fontSize: '0.9rem' }}>
              Los items de la orden que elijas pasarán a la cuenta actual y la orden elegida se cerrará. Solo órdenes sin pagos.
            </p>
            {openOrdersList.filter(o => o.id !== selectedOrderId).map(o => (
              <button
                key={o.id}
                onClick={async () => {
                  if (await showConfirm(`¿Unir la ORDEN ${o.daily_no || o.code || o.id} a esta cuenta?`)) {
                    mergeOrder(o.id);
                  }
                }}
                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0.75rem 1rem', marginBottom: '0.5rem', background: '#FFF8E7', border: '1.5px solid #F5BB4C', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}
              >
                <strong>{o.daily_no ? `ORDEN ${o.daily_no}` : o.code}</strong>
                <span>{statusLabel(o.status)} • {formatPriceCOP(o.pendingTotal || 0)}</span>
              </button>
            ))}
            <button
              onClick={() => setShowMerge(false)}
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem', background: '#ccc', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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

      <OrderNoteModal
        open={showOrderNoteModal}
        value={selectedOrder?.special_note || orderNoteDraft}
        onClose={() => setShowOrderNoteModal(false)}
        onSave={saveOrderNote}
      />

      <EditItemNoteModal
        open={!!editingSentItem}
        item={editingSentItem}
        product={editingSentItem ? findProductById(productsByCategory, editingSentItem.product_id).product : null}
        onClose={() => setEditingSentItem(null)}
        onSave={saveSentItemNote}
      />

      <EditItemNoteModal
        open={editingLocalIndex !== null}
        item={editingLocalIndex !== null ? newOrderItems[editingLocalIndex] : null}
        product={editingLocalIndex !== null ? findProductById(productsByCategory, newOrderItems[editingLocalIndex]?.product_id).product : null}
        onClose={() => setEditingLocalIndex(null)}
        onSave={saveLocalItemNote}
        adicionales={getAdicionales(productsByCategory)}
        allowAdicionales
        allowQty
      />
    </div>
  );
}
