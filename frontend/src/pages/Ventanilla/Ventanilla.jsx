import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { formatPriceCOP } from '../../utils/currency.js';
import { statusLabel } from '../../utils/statusLabels';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { useVentanillaRefresh } from '../../hooks/useOrdersRefresh.js';
import ProductPicker from '../../components/ProductPicker.jsx';
import '../Mesero/Mesero.css';
import '../Caja/Caja.css';

function getBackRoute(location, role) {
  const from = location?.state?.from;
  if (from && typeof from === 'string') return from;
  return role === 'CAJA' ? '/centro-total' : '/';
}

// Flujo 2026-08 (dueño): esta pantalla es SOLO para armar el pedido nuevo —
// sin botón NUEVA ORDEN ni lista de órdenes. Las órdenes vivas se ven en
// COBRAR (Caja) o en PEDIDOS (Mesero). Con ?orderId= (ej. "Modificar orden"
// desde Cocina) se abre el detalle de esa orden para agregar items.
export default function Ventanilla() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backTo = getBackRoute(location, user?.role);
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [openOrders, setOpenOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [newOrderItems, setNewOrderItems] = useState([]);
  const [showMerge, setShowMerge] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

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
      const res = await axios.get('/orders/service/VENTANILLA?only_open=1');
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
      const allItems = res.data.items || [];
      setSelectedOrderItems(allItems.filter(item => !item.paid_at && !item.voided_at));
    } catch (error) {
      console.error('Error cargando items de orden:', error);
      showAlert('Error al cargar items de la orden');
    }
  };

  // Si llegan con ?orderId= (ej. "Modificar orden" desde Cocina), abrir esa
  // orden directo — sin obligar a re-seleccionarla de la lista (dueño, 2026-08).
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
      const res = await axios.post('/orders', {
        channel: 'VENTANILLA',
        service: 'VENTANILLA',
        items: newOrderItems,
      });

      setNewOrderItems([]);

      // CAJA: el cliente paga al pedir (pago adelantado) — directo al riel de
      // cobro de esa orden. MESERO no cobra: pantalla limpia para el siguiente
      // cliente (sus órdenes las ve en PEDIDOS).
      if (user?.role === 'CAJA' && res.data?.order?.id && res.data?.order?.table_id) {
        // from: /centro-total → al terminar el pedido, "Volver" cae en el cuadro
        // de mesas, no otra vez en el panel de armar pedido (dueño, 2026-08-04)
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

  // ProductPicker (compartido con Mesero/DetalleMesa) ya entrega el item listo
  const addNewOrderItem = (item) => {
    setNewOrderItems((prev) => [...prev, item]);
  };

  const removeNewOrderItem = (index) => {
    setNewOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const ACTIVE_STATUSES = ['NUEVO', 'EN_PREP', 'LISTO'];
  const openOrdersList = openOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const selectedOrder = openOrders.find((o) => o.id === selectedOrderId);
  const canEdit = selectedOrder && ['NUEVO', 'EN_PREP'].includes(selectedOrder.status);
  const isCaja = user?.role === 'CAJA';
  const cartTotal = newOrderItems.reduce((s, it) => s + (it.qty || 1) * (it.price || 0), 0);

  return (
    <div className="ventanilla-container caja-bottom-nav-spacer mesero-bottom-nav-spacer">
      <header className="ventanilla-header">
        <button onClick={() => navigate(backTo, { replace: true })} className="back-btn">← Volver</button>
        <h1>VENTANILLA</h1>
      </header>

      <div className="ventanilla-content">
        {selectedOrderId && selectedOrder && (
          <div className="order-detail-view">
            <div className="order-detail-header">
              <div>
                <h3>
                  {selectedOrder.daily_no ? `ORDEN ${selectedOrder.daily_no}` : selectedOrder.code || 'ORDEN'}
                </h3>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                  Total pendiente: <strong>{formatPriceCOP(selectedOrder.pendingTotal || 0)}</strong>
                  {` • ${statusLabel(selectedOrder.status)}`}
                </div>
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
                {isCaja && selectedOrder.table_id && (
                  <button
                    onClick={() => navigate(`/mesa/${selectedOrder.table_id}?orderId=${selectedOrderId}`, { state: { from: '/ventanilla' } })}
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
                    <div className="item-info-detalle">
                      <div className="item-name-detalle">
                        {item.name}
                        {!!item.is_custom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                      </div>
                      <div className="item-details-detalle">
                        {item.qty}x {formatPriceCOP(item.price)} = {formatPriceCOP(item.qty * item.price)}
                        {item.notes && <span className="item-notes-detalle"> • {item.notes}</span>}
                      </div>
                    </div>
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
            <ProductPicker productsByCategory={productsByCategory} onAdd={addNewOrderItem} />

            {newOrderItems.length > 0 && (
              <div className="new-order-list" style={{ marginTop: '1rem' }}>
                {newOrderItems.map((it, idx) => (
                  <div key={idx} className="item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>
                        {it.qty > 1 ? `${it.qty}× ` : ''}{it.name}
                        {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                      </div>
                      {it.notes && <div style={{ fontSize: '0.9rem', color: '#666' }}>{it.notes}</div>}
                    </div>
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
                      : isCaja ? 'ENVIAR Y COBRAR' : 'ENVIAR A COCINA'}
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
    </div>
  );
}
