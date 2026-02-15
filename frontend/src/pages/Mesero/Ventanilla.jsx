import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Mesero.css';

export default function Ventanilla() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
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
  }, []);

  const loadProducts = async () => {
    try {
      const res = await axios.get('/products');
      setProductsByCategory(res.data);
      // Seleccionar primera categoría por defecto
      const categories = Object.keys(res.data);
      if (categories.length > 0) {
        setSelectedCategory(categories[0]);
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const addItem = () => {
    if (!selectedProduct) return;
    setItems((prev) => [
      ...prev,
      { 
        name: selectedProduct.displayName || selectedProduct.name, 
        qty, 
        price: selectedProduct.price, 
        notes,
        product_id: selectedProduct.id  // Fase 1: incluir product_id
      },
    ]);
    setSelectedProduct(null);
    setQty(1);
    setNotes('');
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      alert('Ingresa un nombre y precio válido');
      return;
    }
    setItems((prev) => [
      ...prev,
      { name: customName.trim(), qty: customQty, price: parseFloat(customPrice), notes: customNotes, isCustom: true },
    ]);
    setShowCustomProduct(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
  };

  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  const send = async () => {
    if (items.length === 0) return alert('Agrega al menos un producto');
    if (import.meta.env.DEV) {
      console.log('[FASE M8.7] Mesero Ventanilla send antes de POST /orders:', {
        channel: 'VENTANILLA',
        service: 'VENTANILLA',
        existingActiveOrderId: null,
        itemsCount: items.length,
      });
    }
    try {
      await axios.post('/orders', {
        channel: 'VENTANILLA',
        service: 'VENTANILLA',
        items,
      });
      alert('Pedido enviado a cocina');
      navigate('/');
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[FASE M8.7] Mesero Ventanilla send catch:', {
          status: e.response?.status,
          responseData: e.response?.data,
          message: e.message,
        });
      }
      alert(e.response?.data?.error || 'Error al enviar pedido');
    }
  };

  return (
    <div className="pedido-container">
      <header className="pedido-header">
        <button onClick={() => navigate('/')} className="back-btn">← Volver</button>
        <h2>Ventanilla</h2>
      </header>

      <div className="pedido-content">
        <div className="pedido-items">
          <h3>Pedido</h3>
          {items.length === 0 ? (
            <p className="empty-state">No hay items</p>
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
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: Sin cebolla" />
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
        <button onClick={send} className="send-btn" disabled={items.length === 0}>
          ENVIAR A COCINA
        </button>
      </div>
    </div>
  );
}


