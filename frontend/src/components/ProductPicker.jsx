import { useState, useEffect } from 'react';
import Modal from './Modal';
import SalsasChips, { productoLlevaSalsas } from './SalsasChips';
import SaboresChips, { resolveSaborPrice } from './SaboresChips';
import { formatPriceCOP, parseMontoCOP } from '../utils/currency.js';
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
    if (!customName.trim() || !customPrice || parseMontoCOP(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }
    onAdd({
      name: customName.trim(),
      qty: customQty,
      price: parseMontoCOP(customPrice),
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Agregar producto</h3>
        <button
          onClick={() => setShowCustomProduct(true)}
          className="custom-product-btn"
          style={{ padding: '0.45rem 0.9rem', background: 'var(--gray-50)', color: 'var(--gray-900)', border: 'none', borderRadius: '999px', fontWeight: 600, fontSize: 'var(--text-15)', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 40 }}
        >
          + Otro
        </button>
      </div>

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
            {productoLlevaSalsas(selectedProduct, selectedCategory) && <SalsasChips value={notes} onChange={setNotes} />}
            <SaboresChips
              flavors={selectedProduct.flavors}
              flavorsActive={selectedProduct.flavors_active}
              flavorPrices={selectedProduct.flavor_prices}
              basePrice={selectedProduct.price}
              value={notes}
              onChange={setNotes}
            />
          </div>
          <button onClick={addItem} className="btn btn--primary btn--lg">
            Agregar{qty > 1 ? ` (${qty})` : ''}
          </button>
        </div>
      )}

      {showCustomProduct && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content" style={{ background: 'white', padding: '1.5rem', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 'var(--text-20)', fontWeight: 700, letterSpacing: 'var(--tracking-title)', margin: '0 0 1rem' }}>Otro producto</h3>
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
                onClick={() => {
                  setShowCustomProduct(false);
                  setCustomName('');
                  setCustomPrice('');
                  setCustomQty(1);
                  setCustomNotes('');
                }}
                className="btn btn--secondary"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button onClick={addCustomItem} className="btn btn--primary" style={{ flex: 1 }}>
                Agregar
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
