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
  const [selectedOrderData, setSelectedOrderData] = useState(null);
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [newOrderItems, setNewOrderItems] = useState([]);
  const [showMerge, setShowMerge] = useState(false);
  const [customerNote, setCustomerNote] = useState('');
  const [showClosedOrders, setShowClosedOrders] = useState(false);

  // FASE 16.3: Hook de refresh para órdenes archivadas
  const { refreshAfterArchive, refresh } = useVentanillaRefresh({
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
      const allItems = res.data.items || [];
      setSelectedOrderItems(allItems.filter(item => !item.paid_at && !item.voided_at));
      setSelectedOrderData(res.data);
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
    setShowNewOrderForm(false);
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

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      
      // FASE 16.3: Si se marca LISTO, la orden puede estar lista para cobrar
      // No necesitamos refresh optimista aquí porque el backend filtra archived_at
      await refresh();
      
      if (selectedOrderId === orderId) {
        await loadOrderItems(orderId);
      }
    } catch (error) {
      console.error('Error actualizando estado:', error);
      showAlert(error.response?.data?.error || 'Error al actualizar estado');
    }
  };

  const createNewOrder = async () => {
    if (newOrderItems.length === 0) {
      showAlert('Agrega al menos un producto');
      return;
    }
    
    try {
      const itemsWithNotes = newOrderItems.map((it) => ({
        ...it,
        notes: customerNote ? `${it.notes || ''} ${it.notes ? '• ' : ''}${customerNote}`.trim() : it.notes,
      }));

      const res = await axios.post('/orders', {
        channel: 'VENTANILLA',
        service: 'DOMICILIO',
        items: itemsWithNotes,
      });
      
      setNewOrderItems([]);
      setCustomerNote('');
      setShowNewOrderForm(false);
      await loadOrders();
      
      if (res.data?.order?.id) {
        await selectOrder(res.data.order.id);
      }
      
      showAlert('Pedido creado');
    } catch (error) {
      console.error('Error creando pedido:', error);
      showAlert(error.response?.data?.error || 'Error al crear pedido');
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

  // ProductPicker (compartido con Mesero/DetalleMesa) ya entrega el item
  // listo -- nombre, cantidad, precio resuelto por sabor, notas -- así que
  // acá solo se agrega al carrito.
  const addNewOrderItem = (item) => {
    setNewOrderItems((prev) => [...prev, item]);
  };

  const removeNewOrderItem = (index) => {
    setNewOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Separar órdenes en Abiertas y Cerradas
  // FASE O1: activa = {NUEVO, EN_PREP, LISTO}; no activa = PAGADA, CANCELADO.
  const ACTIVE_STATUSES = ['NUEVO', 'EN_PREP', 'LISTO'];
  const openOrdersList = openOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const closedOrdersList = openOrders.filter((o) => ['PAGADA', 'CANCELADO'].includes(o.status));
  const selectedOrder = openOrders.find((o) => o.id === selectedOrderId);
  const canEdit = selectedOrder && ['NUEVO', 'EN_PREP'].includes(selectedOrder.status);
  // FASE F4: editar/borrar items y marcar LISTO son acciones de CAJA (el backend las restringe)
  const isCaja = user?.role === 'CAJA';

  return (
    <div className="ventanilla-container caja-bottom-nav-spacer mesero-bottom-nav-spacer">
      <header className="ventanilla-header">
        <button onClick={() => navigate(backTo, { replace: true })} className="back-btn">← Volver</button>
        <h1>DOMICILIOS</h1>
      </header>

      <div className="ventanilla-content">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Órdenes Abiertas ({openOrdersList.length})</h2>
          <button
            onClick={() => {
              setSelectedOrderId(null);
              setSelectedOrderItems([]);
              setShowNewOrderForm(true);
            }}
            className="btn-chanatos"
          >
            NUEVA ORDEN
          </button>
        </div>

        {openOrdersList.length === 0 && closedOrdersList.length === 0 && selectedOrderId === null && !showNewOrderForm ? (
          <div className="empty-state">
            <p>No hay órdenes. Usa NUEVA ORDEN para crear la primera.</p>
          </div>
        ) : selectedOrderId === null && !showNewOrderForm ? (
          <>
            {openOrdersList.length > 0 && (
              <div className="orders-list">
                {openOrdersList.map(order => (
                  <div 
                    key={order.id} 
                    className="order-card"
                    style={{
                      border: '2px solid #ddd',
                      borderRadius: '12px',
                      padding: '1rem',
                      marginBottom: '1rem',
                      cursor: 'pointer',
                      background: 'white',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => selectOrder(order.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {order.daily_no ? `ORDEN ${order.daily_no}` : order.code}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                          {new Date(order.created_at).toLocaleString('es-CO')}
                        </div>
                        {order.firstItemNote && (
                          <div style={{ color: '#B8860B', fontSize: '0.85rem', marginTop: '0.15rem' }}>
                            {order.firstItemNote}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#F5BB4C' }}>
                          {formatPriceCOP(order.pendingTotal || 0)}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          {order.pendingItems} item(s) pendiente(s)
                        </div>
                      </div>
                    </div>
                    {/* Detalle de items (mismo arreglo que Ventanilla: la tarjeta
                        no decía qué llevaba la orden sin abrirla) */}
                    {(order.items || []).filter(i => !i.voided_at).length > 0 && (
                      <div style={{ margin: '0.35rem 0 0.15rem', color: '#3a3a3c', fontSize: '0.9rem', lineHeight: 1.55, borderTop: '1px solid #eee', paddingTop: '0.45rem' }}>
                        {(order.items || []).filter(i => !i.voided_at).map(i => (
                          <div key={i.id}>
                            <strong>{i.qty}×</strong> {i.name}
                            {i.notes ? <span style={{ color: '#B25000' }}> — {i.notes}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="badge" style={{ 
                        background: order.status === 'NUEVO' ? '#ffc107' : 
                                   order.status === 'EN_PREP' ? '#F5BB4C' : '#28a745',
                        color: 'white', 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontSize: '0.85rem',
                        fontWeight: 'bold'
                      }}>
                        {statusLabel(order.status)}
                      </span>
                      {user?.role === 'CAJA' && <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/mesa/${order.table_id}?orderId=${order.id}`);
                        }}
                        style={{ background: '#F5BB4C', color: '#1C1C1E', border: 'none', padding: '0.45rem 1rem', borderRadius: '999px', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', minHeight: 40 }}
                      >
                        COBRAR
                      </button>}
                      {order.status === 'NUEVO' && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (await showConfirm('¿Enviar esta orden a preparación?')) {
                              updateOrderStatus(order.id, 'EN_PREP');
                            }
                          }}
                          className="btn-chanatos"
                        >
                          Enviar a Preparación
                        </button>
                      )}
                      {order.status === 'EN_PREP' && isCaja && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (await showConfirm('¿Marcar esta orden como LISTO?')) {
                              updateOrderStatus(order.id, 'LISTO');
                            }
                          }}
                          className="btn-success"
                        >
                          Marcar Listo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {closedOrdersList.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Órdenes Cerradas ({closedOrdersList.length})</h3>
                  <button
                    onClick={() => setShowClosedOrders(!showClosedOrders)}
                    style={{ padding: '0.5rem 1rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    {showClosedOrders ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {showClosedOrders && (
                  <div className="orders-list">
                    {closedOrdersList.map(order => (
                      <div 
                        key={order.id} 
                        className="order-card"
                        style={{
                          border: '2px solid #ddd',
                          borderRadius: '12px',
                          padding: '1rem',
                          marginBottom: '1rem',
                          cursor: 'pointer',
                          background: 'white',
                          opacity: 0.7,
                          transition: 'all 0.2s'
                        }}
                        onClick={() => selectOrder(order.id)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                              {order.daily_no ? `ORDEN ${order.daily_no}` : order.code}
                            </div>
                            <div style={{ color: '#666', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                              {new Date(order.created_at).toLocaleString('es-CO')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#F5BB4C' }}>
                              {formatPriceCOP(order.pendingTotal || 0)}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#666' }}>
                              {order.pendingItems} item(s) pendiente(s)
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="badge" style={{ 
                            background: order.status === 'LISTO' ? '#28a745' : 
                                       order.status === 'PAGADA' ? '#6c757d' : '#dc3545',
                            color: 'white', 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.85rem',
                            fontWeight: 'bold'
                          }}>
                            {statusLabel(order.status)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="order-detail-view">
            {selectedOrder && (
              <>
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
                    {selectedOrder.status === 'NUEVO' && (
                      <button
                        onClick={async () => {
                          if (await showConfirm('¿Enviar esta orden a preparación?')) {
                            updateOrderStatus(selectedOrderId, 'EN_PREP');
                          }
                        }}
                        className="btn-chanatos"
                      >
                        Enviar a Preparación
                      </button>
                    )}
                    {selectedOrder.status === 'EN_PREP' && isCaja && (
                      <button
                        onClick={async () => {
                          if (await showConfirm('¿Marcar esta orden como LISTO?')) {
                            updateOrderStatus(selectedOrderId, 'LISTO');
                          }
                        }}
                        className="btn-success"
                      >
                        Marcar Listo
                      </button>
                    )}
                    {isCaja && canEdit && openOrdersList.filter(o => o.id !== selectedOrderId).length > 0 && (
                      <button
                        onClick={() => setShowMerge(true)}
                        style={{ padding: '0.5rem 1rem', minHeight: '44px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
                      >
                        Unir orden
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedOrderId(null);
                        setSelectedOrderItems([]);
                        setShowNewOrderForm(false);
                      }}
                      className="btn-secondary"
                    >
                      ← Volver
                    </button>
                  </div>
                </div>

                {!canEdit && selectedOrder && (
                  <div style={{ 
                    padding: '1rem', 
                    background: '#fff3cd', 
                    border: '1px solid #ffc107', 
                    borderRadius: '8px', 
                    marginBottom: '1rem',
                    color: '#856404'
                  }}>
                    <strong>Orden cerrada, no editable.</strong> Solo se pueden editar órdenes en estado NUEVO o EN_PREP.
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
              </>
            )}
          </div>
        )}
      </div>

      {/* Formulario para nueva orden o agregar items a orden existente */}
      {(showNewOrderForm || (selectedOrderId && canEdit)) && (
        <div className="new-order-form" style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8f9fa', borderRadius: '12px' }}>
          <h3>
            {selectedOrderId 
              ? `Agregar Items a ${selectedOrder?.daily_no ? `ORDEN ${selectedOrder.daily_no}` : selectedOrder?.code || 'ORDEN'}`
              : 'Crear Nueva Orden'}
          </h3>

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

          <ProductPicker productsByCategory={productsByCategory} onAdd={addNewOrderItem} />

          {newOrderItems.length > 0 && (
            <div className="new-order-list" style={{ marginTop: '1rem' }}>
              {newOrderItems.map((it, idx) => (
                <div key={idx} className="item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>
                      {it.name}
                      {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>
                      Cantidad: {it.qty} {it.notes && `• ${it.notes}`}
                    </div>
                  </div>
                  <button onClick={() => removeNewOrderItem(idx)} className="remove-btn">×</button>
                </div>
              ))}
              <button
                className="pay-all-btn"
                onClick={async () => {
                  if (selectedOrderId) {
                    await addItemsToOrder(selectedOrderId, newOrderItems);
                  } else {
                    await createNewOrder();
                  }
                  setNewOrderItems([]);
                  setCustomerNote('');
                }}
              >
                {selectedOrderId ? 'AGREGAR ITEMS' : 'CREAR Y ENVIAR'}
              </button>
            </div>
          )}
        </div>
      )}

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
