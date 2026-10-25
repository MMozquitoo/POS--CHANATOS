import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import SalsasChips from './SalsasChips';
import ItemOptionsSheet from './ItemOptionsSheet';
import { getAdicionales } from './AdicionalesChips';
import { formatPriceCOP, parseMontoCOP } from '../utils/currency.js';
import { useAlert } from '../hooks/useModal';
import '../pages/Mesero/Mesero.css';
import { toast } from './ui/Toast';

// "PERROS_CALIENTES" → "Perros calientes": en mayúsculas sostenidas las
// palabras largas no cabían en 3 columnas y se partían ("HAMBURGUES / AS")
const nombreCategoria = (category) => {
  const t = category.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Encuentra un producto y su categoría dentro de productsByCategory por id —
// lo usa EditItemNoteModal para saber si un item ya agregado tiene sabores/
// salsas disponibles, sin duplicar la búsqueda en cada pantalla.
export function findProductById(productsByCategory, productId) {
  if (!productId) return { product: null, category: null };
  for (const [category, products] of Object.entries(productsByCategory || {})) {
    const product = products.find((p) => p.id === productId);
    if (product) return { product, category };
  }
  return { product: null, category: null };
}

// Selector de producto compartido: categoría → grid de productos → tocar un
// producto abre un PANEL (ItemOptionsSheet: sheet en celular, modal en PC) con
// cantidad, sabor, salsas, adicionales y notas → "Agregar". Antes vivía solo
// dentro de PedidoMesa.jsx (Mesero); DetalleMesa.jsx (Caja) agregaba el
// producto de una vez y se editaba después, un flujo distinto para la misma
// tarea. Se unifica acá para que el mesero y la caja armen pedidos igual.
// El formulario era inline debajo de la grilla y había que deslizar para
// encontrarlo (dueño, 2026-10): ahora cada elemento abre su propio panel.
//
// ENTRAR A LA CATEGORÍA (dueño, 2026-10): con una orden ya abierta arriba, la
// grilla de categorías empezaba a mitad de pantalla y al tocar "Perros" los
// productos quedaban debajo del borde — había que deslizar. Ahora tocar una
// categoría RECOGE la grilla en una pastilla "‹ Categorías", muestra solo esos
// productos y lleva la pantalla hasta ellos. Se queda en la categoría después
// de agregar (para meter el segundo perro sin volver a buscarlo).
// draftItems (opcional): el BORRADOR de la pantalla (productos elegidos que
// todavía no se guardaron en la orden). Con él, el selector muestra al
// instante cuántos productos lleva y por cuánto, separado de lo ya guardado.
export default function ProductPicker({ productsByCategory, onAdd, draftItems }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const rootRef = useRef(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const adicionales = getAdicionales(productsByCategory);
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');
  const [customSpecialNote, setCustomSpecialNote] = useState('');

  // ADICIONALES va de última: sus productos se usan sobre todo desde el panel
  // de cada item ("+ Queso"), no como primera pestaña (alfabéticamente quedaba
  // primera y escondía las hamburguesas al abrir la pantalla).
  const categories = Object.keys(productsByCategory || {}).sort((a, b) => {
    const aAd = /^ADICIONAL/i.test(a) ? 1 : 0;
    const bAd = /^ADICIONAL/i.test(b) ? 1 : 0;
    return aAd - bAd;
  });

  // Si el menú cambia y la categoría abierta ya no existe, volver a la grilla
  useEffect(() => {
    if (selectedCategory && !categories.includes(selectedCategory)) {
      setSelectedCategory(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsByCategory]);

  // Después del render: subir el selector SOLO si su tope quedó fuera de la
  // vista (tapado por el header o muy abajo). Si ya se ve, no se mueve nada —
  // un desplazamiento forzado en cada toque desubica más de lo que ayuda.
  // scroll-margin-top deja libre el header de la página.
  const traerALaVista = () => {
    requestAnimationFrame(() => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (top < 60 || top > window.innerHeight * 0.45) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  const openCategory = (category) => {
    setSelectedCategory(category);
    setSelectedProduct(null);
    traerALaVista();
  };

  const volverACategorias = () => {
    setSelectedCategory(null);
    setSelectedProduct(null);
    traerALaVista();
  };

  // El panel ya resolvió precio (sabor + adicionales), cantidad y notas
  // "Cada una distinta": split trae una línea por combinación (2 iguales + 1 sin queso)
  const addItem = ({ qty, notes, specialNote, price, split }) => {
    if (!selectedProduct) return;
    (split || [{ qty, notes, specialNote, price }]).forEach((linea) => {
      onAdd({
        name: selectedProduct.displayName || selectedProduct.name,
        qty: linea.qty,
        price: linea.price,
        notes: linea.notes,
        specialNote: linea.specialNote || undefined,
        product_id: selectedProduct.id,
      });
    });
    setSelectedProduct(null);
    toast(split && split.length > 1 ? `Añadido al pedido · ${split.length} líneas` : 'Añadido al pedido');
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
      specialNote: customSpecialNote.trim() || undefined,
      isCustom: true,
    });
    toast('Añadido al pedido');
    setShowCustomProduct(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
    setCustomSpecialNote('');
  };

  return (
    <div className="product-selector" ref={rootRef} style={{ scrollMarginTop: 76 }}>
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

      {Array.isArray(draftItems) && draftItems.length > 0 && (() => {
        const count = draftItems.reduce((n, it) => n + (Number(it.qty) || 0), 0);
        const total = draftItems.reduce((n, it) => n + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
        return (
          <div className="pp-draft" role="status" aria-live="polite">
            {/* key: el contador "salta" en mostaza cada vez que cambia */}
            <span className="pp-draft__count tnum" key={count}>{count}</span>
            <span className="pp-draft__text">
              <strong>{count === 1 ? 'producto' : 'productos'} en el borrador</strong>
              <span>Sin enviar todavía</span>
            </span>
            <span className="pp-draft__total tnum">{formatPriceCOP(total)}</span>
          </div>
        );
      })()}

      {!selectedCategory ? (
        <div className="category-tabs pp-cat-grid pp-fade-in">
          {categories.map(category => (
            <button
              key={category}
              className="category-tab"
              onClick={() => openCategory(category)}
            >
              {nombreCategoria(category)}
            </button>
          ))}
        </div>
      ) : (
        <div className="pp-drill-header">
          <button
            type="button"
            className="pp-back-btn"
            onClick={volverACategorias}
          >
            ‹ Categorías
          </button>
          <span className="pp-drill-title">{nombreCategoria(selectedCategory)}</span>
        </div>
      )}

      {selectedCategory && productsByCategory[selectedCategory] && (
        <div className="products-grid" key={selectedCategory}>
          {productsByCategory[selectedCategory].map((product, i) => (
            <button
              key={product.id}
              className={`product-btn pp-pop-in ${selectedProduct?.id === product.id ? 'selected' : ''}`}
              style={{ '--pp-i': i }}
              onClick={() => setSelectedProduct(product)}
            >
              <div className="product-name-btn">{product.displayName || product.name}</div>
              <div className="product-price-btn">{formatPriceCOP(product.price)}</div>
            </button>
          ))}
        </div>
      )}

      <ItemOptionsSheet
        open={!!selectedProduct}
        mode="add"
        product={selectedProduct}
        category={selectedCategory}
        adicionales={adicionales}
        onClose={() => setSelectedProduct(null)}
        onSubmit={addItem}
      />

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
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Nota especial para cocina</label>
              <textarea
                value={customSpecialNote}
                onChange={(e) => setCustomSpecialNote(e.target.value)}
                placeholder="Ej: Alergia al maní, sin gluten, cliente con prisa..."
                rows={2}
                style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setShowCustomProduct(false);
                  setCustomName('');
                  setCustomPrice('');
                  setCustomQty(1);
                  setCustomNotes('');
                  setCustomSpecialNote('');
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
