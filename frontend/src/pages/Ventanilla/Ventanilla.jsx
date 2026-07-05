import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { formatPriceCOP } from '../../utils/currency.js';
import SalsasChips, { categoriaLlevaSalsas } from '../../components/SalsasChips';
import { statusLabel } from '../../utils/statusLabels';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { useVentanillaRefresh } from '../../hooks/useOrdersRefresh.js';
import '../Mesero/Mesero.css';
import '../Caja/Caja.css';

function getBackRoute(location, role) {
  const from = location?.state?.from;
  if (from && typeof from === 'string') return from;
  return role === 'CAJA' ? '/centro-total' : '/';
}

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
  const [selectedOrderData, setSelectedOrderData] = useState(null);
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [newOrderItems, setNewOrderItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');
  const [showClosedOrders, setShowClosedOrders] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

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
      const categories = Object.keys(res.data);
      if (categories.length > 0) {
        setSelectedCategory(categories[0]);
      }
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

    setCreatingOrder(true);
    try {
      const res = await axios.post('/orders', {
        channel: 'VENTANILLA',
        service: 'VENTANILLA',
        items: newOrderItems,
      });

      setNewOrderItems([]);
      setShowNewOrderForm(false);
      await loadOrders();

      if (res.data?.order?.id) {
        await selectOrder(res.data.order.id);
      }

      showAlert('Pedido creado');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[FASE M9.1] Ventanilla createNewOrder catch:', {
          status: error.response?.status,
          responseData: error.response?.data,
          message: error.message,
        });
      }
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

  const addNewOrderItem = (product) => {
    setNewOrderItems((prev) => [
      ...prev,
      { 
        name: product.displayName || product.name, 
        qty: 1, 
        price: product.price, 
        notes: '',
        product_id: product.id,
        category: product.category || selectedCategory
      },
    ]);
  };

  const removeNewOrderItem = (index) => {
    setNewOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateNewOrderItem = (index, patch) => {
    setNewOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }
    setNewOrderItems((prev) => [
      ...prev,
      {
        name: customName.trim(),
        qty: customQty,
        price: parseFloat(customPrice),
        notes: customNotes,
        isCustom: true
      }
    ]);
    setShowCustomProduct(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
  };

  // FASE O1: activa = {NUEVO, EN_PREP, LISTO}; no activa = PAGADA, CANCELADO.
  const ACTIVE_STATUSES = ['NUEVO', 'EN_PREP', 'LISTO'];
  const openOrdersList = openOrders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const closedOrdersList = openOrders.filter((o) => ['PAGADA', 'CANCELADO'].includes(o.status));
  const selectedOrder = openOrders.find((o) => o.id === selectedOrderId);
  const canEdit = selectedOrder && ['NUEVO', 'EN_PREP'].includes(selectedOrder.status);
  // FASE F4: editar/borrar items y marcar LISTO son acciones de CAJA (el backend las restringe)
  const isCaja = user?.role === 'CAJA';

  return (
    <div className="ventanilla-container">
      <header className="ventanilla-header">
        <button onClick={() => navigate(backTo, { replace: true })} className="back-btn">← Volver</button>
        <h1>VENTANILLA</h1>
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
            className="btn-primary"
            style={{ padding: '0.75rem 1.5rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
          >
            NUEVA ORDEN
          </button>
        </div>

        {openOrdersList.length === 0 && closedOrdersList.length === 0 && selectedOrderId === null && !showNewOrderForm ? (
          <div className="empty-state">
            <p>No hay órdenes</p>
            <button 
              onClick={() => setShowNewOrderForm(true)}
              className="btn-primary"
              style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Crear Primera Orden
            </button>
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
                      {order.status === 'NUEVO' && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (await showConfirm('¿Enviar esta orden a preparación?')) {
                              updateOrderStatus(order.id, 'EN_PREP');
                            }
                          }}
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: '#F5BB4C',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 'bold'
                          }}
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
                          style={{
                            padding: '0.4rem 0.8rem',
                            background: '#28a745',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 'bold'
                          }}
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
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#F5BB4C',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 'bold'
                        }}
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
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: 'bold'
                        }}
                      >
                        Marcar Listo
                      </button>
                    )}
                    {isCaja && canEdit && openOrdersList.filter(o => o.id !== selectedOrderId).length > 0 && (
                      <button
                        onClick={() => setShowMerge(true)}
                        style={{ padding: '0.5rem 1rem', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
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
                      style={{ padding: '0.5rem 1rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
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
                            {item.is_custom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
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

          <button 
            onClick={() => {
              setShowCustomProduct(true);
              setCustomName('');
              setCustomPrice('');
              setCustomQty(1);
              setCustomNotes('');
            }}
            className="custom-product-btn"
            style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            + Otro producto
          </button>

          <div className="category-tabs">
            {Object.keys(productsByCategory).map(category => (
              <button
                key={category}
                className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {selectedCategory && productsByCategory[selectedCategory] && (
            <div className="products-grid-caja">
              {productsByCategory[selectedCategory].map((p) => (
                <button key={p.id} className="product-btn-caja" onClick={() => addNewOrderItem(p)}>
                  <div className="product-name-btn">{p.displayName || p.name}</div>
                  <div className="product-price-btn">{formatPriceCOP(p.price)}</div>
                </button>
              ))}
            </div>
          )}

          {newOrderItems.length > 0 && (
            <div className="new-order-list" style={{ marginTop: '1rem' }}>
              {newOrderItems.map((it, idx) => (
                <div key={idx} className="new-order-item">
                  <div className="new-order-item-name">
                    {it.name}
                    {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                  </div>
                  <div className="new-order-item-controls">
                    <button onClick={() => updateNewOrderItem(idx, { qty: Math.max(1, it.qty - 1) })}>-</button>
                    <input
                      type="number"
                      value={it.qty}
                      min="1"
                      onChange={(e) => updateNewOrderItem(idx, { qty: parseInt(e.target.value) || 1 })}
                    />
                    <button onClick={() => updateNewOrderItem(idx, { qty: it.qty + 1 })}>+</button>
                  </div>
                  <div style={{ flex: '1 1 100%', minWidth: 0 }}>
                    <input
                      className="new-order-notes"
                      value={it.notes || ''}
                      placeholder="Notas (opcional)"
                      onChange={(e) => updateNewOrderItem(idx, { notes: e.target.value })}
                    />
                    {categoriaLlevaSalsas(it.category) && (
                      <SalsasChips value={it.notes || ''} onChange={(v) => updateNewOrderItem(idx, { notes: v })} />
                    )}
                  </div>
                  <button className="btn-danger-outline" onClick={() => removeNewOrderItem(idx)}>Quitar</button>
                </div>
              ))}
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
                {!selectedOrderId && creatingOrder ? 'CREANDO...' : selectedOrderId ? 'AGREGAR ITEMS' : 'CREAR Y ENVIAR'}
              </button>
            </div>
          )}

          {showCustomProduct && (
            <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div className="modal-content" style={{ background: 'white', padding: '2rem', borderRadius: '12px', maxWidth: '500px', width: '90%' }}>
                <h3>Producto Personalizado (OTRO)</h3>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Nombre del Producto *</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Ej: Comida especial"
                    style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Precio Unitario (COP) *</label>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="100"
                    style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Cantidad</label>
                  <div className="qty-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={() => setCustomQty(Math.max(1, customQty - 1))} style={{ padding: '0.5rem 1rem' }}>-</button>
                    <input 
                      type="number" 
                      value={customQty} 
                      onChange={(e) => setCustomQty(parseInt(e.target.value) || 1)} 
                      min="1"
                      style={{ width: '80px', padding: '0.5rem', textAlign: 'center' }}
                    />
                    <button onClick={() => setCustomQty(customQty + 1)} style={{ padding: '0.5rem 1rem' }}>+</button>
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label>Notas</label>
                  <input
                    type="text"
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Opcional"
                    style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={addCustomItem} 
                    className="add-item-btn"
                    style={{ flex: 1, padding: '0.75rem', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Agregar
                  </button>
                  <button 
                    onClick={() => {
                      setShowCustomProduct(false);
                      setCustomName('');
                      setCustomPrice('');
                      setCustomQty(1);
                      setCustomNotes('');
                    }}
                    style={{ flex: 1, padding: '0.75rem', background: '#ccc', color: 'black', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
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
                <span>{o.status} • {formatPriceCOP(o.pendingTotal || 0)}</span>
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
