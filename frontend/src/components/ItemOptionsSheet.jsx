import { useState, useEffect } from 'react';
import Modal from './Modal';
import SalsasChips, { productoLlevaSalsas } from './SalsasChips';
import SaboresChips, { resolveSaborPrice } from './SaboresChips';
import AdicionalesChips, { adicionalesExtra, productoLlevaAdicionales } from './AdicionalesChips';
import { formatPriceCOP } from '../utils/currency.js';
import '../pages/Mesero/Mesero.css';

/**
 * Panel (sheet en celular, modal en PC) con TODAS las opciones de UN item:
 * cantidad, sabor, salsas, adicionales, observación y nota especial para
 * cocina. Se abre al tocar un producto (ProductPicker, modo "add") y al tocar
 * un item ya agregado (EditItemNoteModal, modo "edit").
 *
 * Antes el formulario aparecía debajo de la grilla de productos y había que
 * deslizar para encontrarlo; el dueño pidió que cada elemento abra su propio
 * panel para marcar salsas y adicionales (2026-10).
 *
 * Precio unitario = precio base del producto (según sabor, flavor_prices)
 *                 + adicionales marcados en las notas ("+ Queso").
 * Para un item personalizado (sin product) el precio es el que traía.
 *
 * onSubmit({ qty, notes, specialNote, price }) — puede ser async.
 */
export default function ItemOptionsSheet({
  open,
  mode = 'add',
  product,
  category,
  item,
  adicionales = [],
  allowQty = true,
  allowAdicionales = true,
  onClose,
  onSubmit,
}) {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(item?.qty || 1);
    setNotes(item?.notes || '');
    setSpecialNote(item?.specialNote ?? item?.special_note ?? '');
    setSaving(false);
  }, [open, item, product]);

  if (!open || (!product && !item)) return null;

  const name = item?.name || product?.displayName || product?.name || '';
  const productLike = product || { name };
  const resolvedCategory = category ?? item?.category ?? product?.category;
  const mostrarSalsas = productoLlevaSalsas(productLike, resolvedCategory);
  const mostrarAdicionales = allowAdicionales && !!product && adicionales.length > 0 && productoLlevaAdicionales(productLike, resolvedCategory);

  // Precio unitario: se recalcula (sabor + adicionales) solo cuando el item es
  // nuevo o local (allowAdicionales). Un item YA enviado conserva el precio
  // con el que se guardó — acá no se puede cambiar, y el producto del menú
  // pudo haber cambiado de precio después.
  const recalcular = !!product && (mode === 'add' || allowAdicionales);
  const basePrice = recalcular
    ? resolveSaborPrice(product.flavor_prices, product.price, notes)
    : (item?.price ?? product?.price ?? 0);
  const unitPrice = basePrice + (recalcular && mostrarAdicionales ? adicionalesExtra(notes, adicionales) : 0);
  const total = unitPrice * (qty || 1);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        qty: qty || 1,
        notes: notes.trim(),
        specialNote: specialNote.trim(),
        price: unitPrice,
      });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const primaryLabel = mode === 'add'
    ? `Agregar${qty > 1 ? ` (${qty})` : ''} · ${formatPriceCOP(total)}`
    : 'Guardar';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      actions={<>
        <button className="btn btn--secondary" onClick={onClose} disabled={saving} style={{ flex: '0 0 auto' }}>
          Cancelar
        </button>
        <button className="btn btn--primary" onClick={handleSubmit} disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Guardando...' : primaryLabel}
        </button>
      </>}
    >
      <div className="item-sheet">
        {(product || item?.price) && (
          <div className="tnum" style={{ marginTop: '-0.5rem', marginBottom: '0.9rem', color: 'var(--gray-500)', fontSize: 'var(--text-15)', fontWeight: 600 }}>
            {formatPriceCOP(unitPrice)}{recalcular && unitPrice !== product.price ? ` (base ${formatPriceCOP(product.price)})` : ''}
          </div>
        )}

        {allowQty && (
          <div className="form-group">
            <label>Cantidad</label>
            <div className="qty-controls">
              <button type="button" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
              <input type="number" value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} min="1" />
              <button type="button" onClick={() => setQty(qty + 1)}>+</button>
            </div>
          </div>
        )}

        {product?.flavors && (
          <div className="form-group">
            <SaboresChips
              flavors={product.flavors}
              flavorsActive={product.flavors_active}
              flavorPrices={product.flavor_prices}
              basePrice={product.price}
              value={notes}
              onChange={setNotes}
            />
          </div>
        )}

        {mostrarSalsas && (
          <div className="form-group">
            <label>Salsas</label>
            <SalsasChips value={notes} onChange={setNotes} />
          </div>
        )}

        {mostrarAdicionales && (
          <div className="form-group">
            <label>Adicionales</label>
            <AdicionalesChips adicionales={adicionales} value={notes} onChange={setNotes} />
          </div>
        )}

        <div className="form-group">
          <label>Observación</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej: Sin cebolla"
            style={{ width: '100%', padding: '0.6rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Nota especial para cocina</label>
          <textarea
            value={specialNote}
            onChange={(e) => setSpecialNote(e.target.value)}
            placeholder="Ej: Alergia al maní, sin gluten..."
            rows={2}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: '0.6rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
          />
        </div>
      </div>
    </Modal>
  );
}
