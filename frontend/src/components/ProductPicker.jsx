import { useState, useEffect } from 'react';
import Modal from './Modal';
import SalsasChips, { categoriaLlevaSalsas } from './SalsasChips';
import SaboresChips, { resolveSaborPrice } from './SaboresChips';
import { formatPriceCOP } from '../utils/currency.js';
import { useAlert } from '../hooks/useModal';
import '../pages/Mesero/Mesero.css';

// Selector de producto compartido: categoría → grid de productos → formulario
// de confirmación (cantidad, notas, salsas/sabores) → "Agregar". Antes vivía
// solo dentro de PedidoMesa.jsx (Mesero); DetalleMesa.jsx (Caja) agregaba el
// producto de una vez y se editaba después, un flujo distinto para la misma
// tarea. Se unifica acá para que el mesero y la caja armen pedidos igual.
export default function ProductPicker({ productsByCategory, onAdd }) {
  const { alertState, showAlert, closeAlert } = useAlert();
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
    const categories = Object.keys(productsByCategory || {});
    if (categories.length > 0 && !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsByCategory]);

  const addItem = () => {
    if (!selectedProduct) return;
    onAdd({
      name: selectedProduct.displayName || selectedProduct.name,
      qty,
      price: resolveSaborPrice(selectedProduct.flavor_prices, selectedProduct.price, notes),
      notes,
      product_id: selectedProduct.id,
    });
    setSelectedProduct(null);
    setQty(1);
    setNotes('');
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }
    onAdd({
      name: customName.trim(),
      qty: customQty,
      price: parseFloat(customPrice),
      notes: customNotes,
      isCustom: true,
    });
    setShowCustomProduct(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
  };

  return (
    <div className="product-selector">
      <h3>Agregar Producto</h3>

      <button
        onClick={() => setShowCustomProduct(true)}
        className="custom-product-btn"
        style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
      >
        + Otro producto
      </button>

      <div className="category-tabs">
        {Object.keys(productsByCategory || {}).map(category => (
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

      {selectedCategory && productsByCategory[selectedCategory] && (
        <div className="products-grid">
          {productsByCategory[selectedCategory].map(product => (
            <button
              key={product.id}
              className={`product-btn ${selectedProduct?.id === product.id ? 'selected' : ''}`}
              onClick={() => setSelectedProduct(product)}
            >
              <div className="product-name-btn">{product.displayName || product.name}</div>
              <div className="product-price-btn">{formatPriceCOP(product.price)}</div>
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
              placeholder="Ej: Sin azúcar"
            />
            {categoriaLlevaSalsas(selectedCategory) && <SalsasChips value={notes} onChange={setNotes} />}
            <SaboresChips
              flavors={selectedProduct.flavors}
              flavorsActive={selectedProduct.flavors_active}
              flavorPrices={selectedProduct.flavor_prices}
              basePrice={selectedProduct.price}
              value={notes}
              onChange={setNotes}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addItem} className="btn-success">Agregar</button>
          </div>
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
              <SalsasChips value={customNotes} onChange={setCustomNotes} />
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

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
    </div>
  );
}
