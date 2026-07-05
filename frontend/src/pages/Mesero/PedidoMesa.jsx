import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import Modal from '../../components/Modal';
import { useAlert } from '../../hooks/useModal';
import './Mesero.css';

const STATUS_LABELS = {
  NUEVO: 'Nuevo',
  EN_PREP: 'En preparación',
  LISTO: 'Listo',
  PAGADA: 'Pagada',
  CANCELADO: 'Cancelado',
};

// FASE 16.4.3.B: Navegación determinística - usar location.state.from primero, luego fallback por rol
function getBackRoute(location, user) {
  // 1) Si venimos con "from" en el state, volvemos allí (más confiable)
  const from = location?.state?.from;
  if (from) {
    return from;
  }

  // 2) Fallback seguro basado en rol (evita /mesas en blanco)
  if (user?.role === 'MESERO') {
    return '/'; // Panel de mesero está en /
  }
  if (user?.role === 'CAJA') {
    return '/centro-total'; // Panel de caja
  }

  // 3) Último fallback
  return '/';
}

export default function PedidoMesa() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backTo = getBackRoute(location, user);
  const { alertState, showAlert, closeAlert } = useAlert();
  const [table, setTable] = useState(null);
  const [order, setOrder] = useState(null);
  // items = SOLO los productos nuevos aún no enviados; los ya enviados viven en order.items
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');

  useEffect(() => {
    loadProducts();
    loadTable();
    loadActiveOrder();
  }, [tableId]);

  const loadProducts = async () => {
    try {
      const res = await axios.get('/products');
      setProductsByCategory(res.data);
      // Crear lista plana de productos para compatibilidad
      const flatProducts = [];
      Object.values(res.data).forEach(categoryProducts => {
        flatProducts.push(...categoryProducts);
      });
      setProducts(flatProducts);
      // Seleccionar primera categoría por defecto
      const categories = Object.keys(res.data);
      if (categories.length > 0) {
        setSelectedCategory(categories[0]);
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const loadTable = async () => {
    try {
      const res = await axios.get(`/tables`);
      const tableData = res.data.find(t => t.id === parseInt(tableId));
      // FASE F4: ventanilla (9) y domicilios (10) tienen su propio flujo multi-orden
      if (tableData?.number === 9) {
        navigate('/ventanilla', { replace: true });
        return;
      }
      if (tableData?.number === 10) {
        navigate('/domicilios', { replace: true });
        return;
      }
      setTable(tableData);
    } catch (error) {
      console.error('Error cargando mesa:', error);
    }
  };

  const loadActiveOrder = async () => {
    try {
      // Para mesas 1-8, usar endpoint de orden activa
      const res = await axios.get(`/orders/table/${tableId}?active=1`);
      if (res.data) {
        // Cargar items de la orden activa (solo lectura; NO se mezclan con los nuevos)
        const orderRes = await axios.get(`/orders/${res.data.id}`);
        setOrder(orderRes.data);
      } else {
        setOrder(null);
      }
    } catch (error) {
      console.error('Error cargando pedido activo:', error);
      setOrder(null);
    }
  };

  const addItem = () => {
    if (!selectedProduct) return;

    const newItem = {
      name: selectedProduct.displayName || selectedProduct.name,
      qty: qty,
      price: selectedProduct.price, // Incluir precio
      notes: notes,
      product_id: selectedProduct.id  // Fase 1: incluir product_id
    };

    setItems([...items, newItem]);
    setSelectedProduct(null);
    setQty(1);
    setNotes('');
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }

    const newItem = {
      name: customName.trim(),
      qty: customQty,
      price: parseFloat(customPrice),
      notes: customNotes,
      isCustom: true // Marcar como producto personalizado
    };

    setItems([...items, newItem]);
    setShowCustomProduct(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const sendToKitchen = async () => {
    if (items.length === 0) {
      showAlert('Agrega al menos un producto');
      return;
    }

    const tableNumber = table?.number ?? null;

    try {
      // GUARDRAIL: one active order per table — si ya hay orden, agregar SOLO los items nuevos
      if (order && order.id) {
        const wasListo = order.status === 'LISTO';
        await axios.post(`/orders/${order.id}/items`, { items });
        showAlert(
          wasListo
            ? 'Items agregados. La orden volvió a cocina para preparar lo nuevo.'
            : 'Items agregados a la orden'
        );
      } else {
        if (import.meta.env.DEV) {
          console.log('[FASE M8.7] PedidoMesa sendToKitchen antes de POST /orders:', {
            tableId: parseInt(tableId),
            tableNumber,
            channel: 'MESA',
            service: 'MESA',
            existingActiveOrderId: null,
            itemsCount: items.length,
          });
        }
        const response = await axios.post('/orders', {
          tableId: parseInt(tableId),
          channel: 'MESA',
          service: 'MESA',
          items: items,
        });
        if (import.meta.env.DEV) {
          console.log('[FASE M8.7] Pedido creado:', response.data);
        }
        showAlert('Pedido enviado a cocina');
      }

      await loadActiveOrder();
      setItems([]);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[FASE M8.7] PedidoMesa sendToKitchen catch:', {
          status: error.response?.status,
          responseData: error.response?.data,
          message: error.message,
        });
      }
      console.error('Error enviando pedido:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error al enviar pedido';
      showAlert(`Error: ${errorMessage}`);
    }
  };

  // Función para enviar orden a preparación (cambiar estado a EN_PREP)
  const sendToPreparation = async () => {
    if (!order || !order.id) {
      showAlert('No hay orden activa');
      return;
    }

    try {
      await axios.patch(`/orders/${order.id}/status`, { status: 'EN_PREP' });
      showAlert('Orden enviada a preparación');
      await loadActiveOrder();
    } catch (error) {
      console.error('Error enviando a preparación:', error);
      showAlert(error.response?.data?.error || 'Error al enviar a preparación');
    }
  };

  return (
    <div className="pedido-container">
      <header className="pedido-header">
        <button onClick={() => navigate(backTo, { replace: true })} className="back-btn">← Volver</button>
        <h2>{table?.label || `Mesa ${tableId}`}</h2>
      </header>

      <div className="pedido-content">
        {/* Información de orden activa si existe */}
        {order && order.id && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #ddd'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>
                  {order.daily_no ? `ORDEN ${order.daily_no}` : order.code || `ORDEN ${order.id}`}
                </strong>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.25rem' }}>
                  Estado: <span style={{
                    color: order.status === 'NUEVO' ? '#ffc107' :
                           order.status === 'EN_PREP' ? '#F5BB4C' : '#28a745',
                    fontWeight: 'bold'
                  }}>{STATUS_LABELS[order.status] || order.status}</span>
                </div>
              </div>
              {order.status === 'NUEVO' && (
                <button
                  onClick={sendToPreparation}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#F5BB4C',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold'
                  }}
                >
                  Enviar a Preparación
                </button>
              )}
            </div>

            {/* Items ya enviados (solo lectura) */}
            {order.items && order.items.length > 0 && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px dashed #ddd', paddingTop: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#999', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                  YA EN LA ORDEN
                </div>
                {order.items.filter(it => !it.voided_at).map(it => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#555', padding: '0.15rem 0' }}>
                    <span>{it.qty}× {it.name}{it.notes ? ` • ${it.notes}` : ''}</span>
                  </div>
                ))}
              </div>
            )}

            {order.status === 'LISTO' && (
              <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#FFF8E7', borderRadius: '6px', fontSize: '0.85rem', color: '#B8860B' }}>
                Esta orden ya está lista. Si agregas algo más, volverá a cocina solo con lo nuevo.
              </div>
            )}
          </div>
        )}

        <div className="pedido-items">
          <h3>{order && order.id ? 'Nuevos items por enviar' : 'Pedido'}</h3>
          {items.length === 0 ? (
            <p className="empty-state">{order && order.id ? 'Agrega productos para sumarlos a la orden' : 'No hay items en el pedido'}</p>
          ) : (
            <div className="items-list">
              {items.map((item, index) => (
                <div key={index} className="item-card">
                  <div className="item-info">
                    <div className="item-name">{item.name}</div>
                    <div className="item-details">
                      Cantidad: {item.qty} {item.notes && `• ${item.notes}`}
                    </div>
                  </div>
                  <button onClick={() => removeItem(index)} className="remove-btn">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="product-selector">
          <h3>Agregar Producto</h3>
          
          {/* Botón OTRO */}
          <button 
            onClick={() => setShowCustomProduct(true)} 
            className="custom-product-btn"
            style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            + OTRO (Producto Personalizado)
          </button>

          {/* Selector de categorías */}
          <div className="category-tabs">
            {Object.keys(productsByCategory).map(category => (
              <button
                key={category}
                className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCategory(category);
                  setSelectedProduct(null);
                }}
              >
                {category.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Productos de la categoría seleccionada */}
          {selectedCategory && productsByCategory[selectedCategory] && (
            <div className="products-grid">
              {productsByCategory[selectedCategory].map(product => (
                <button
                  key={product.id}
                  className={`product-btn ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                  onClick={() => setSelectedProduct(product)}
                >
                  <div className="product-name-btn">{product.displayName || product.name}</div>
                  <div className="product-price-btn">${product.price}k</div>
                </button>
              ))}
            </div>
          )}

          {selectedProduct && (
            <div className="product-form">
              <div className="form-group">
                <label>Cantidad</label>
                <div className="qty-controls">
                  <button onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
                  <input type="number" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} min="1" />
                  <button onClick={() => setQty(qty + 1)}>+</button>
                </div>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: Sin cebolla"
                />
              </div>
              <button onClick={addItem} className="add-item-btn">Agregar</button>
            </div>
          )}

          {/* Modal para producto personalizado */}
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
      </div>

      <div className="pedido-footer">
        <button
          onClick={sendToKitchen}
          className="send-btn"
          disabled={items.length === 0}
        >
          {order && order.id ? 'AGREGAR ITEMS' : 'CREAR Y ENVIAR'}
        </button>
      </div>

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
    </div>
  );
}

