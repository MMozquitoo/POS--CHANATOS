import { useState, useEffect } from 'react';
import Modal from './Modal';
import SalsasChips, { productoLlevaSalsas, parseListaProducto } from './SalsasChips';
import SaboresChips, { resolveSaborPrice } from './SaboresChips';
import AdicionalesChips, { adicionalesExtra, productoLlevaAdicionales } from './AdicionalesChips';
import QuitarChips, { esQuitar } from './QuitarChips';
import { formatPriceCOP } from '../utils/currency.js';
import '../pages/Mesero/Mesero.css';

/**
 * Panel (sheet en celular, modal en PC) con TODAS las opciones de UN item:
 * cantidad, sabor, salsas, quitar ("Sin queso"), adicionales y la nota de
 * este producto para cocina. Se abre al tocar un producto (ProductPicker,
 * modo "add") y al tocar un item ya agregado (EditItemNoteModal, modo "edit").
 *
 * Antes el formulario aparecía debajo de la grilla de productos y había que
 * deslizar para encontrarlo; el dueño pidió que cada elemento abra su propio
 * panel para marcar salsas y adicionales (2026-10).
 *
 * CADA UNA DISTINTA (2026-10): "2 hamburguesas, una sin queso" ya no obliga a
 * agregar dos veces. Con cantidad ≥ 2 (modo add) se elige "Cada una distinta",
 * se toca la unidad (1, 2…) y sus opciones son solo de ella. Al agregar, las
 * unidades iguales se juntan y sale una línea por combinación (onSubmit
 * recibe `split`). Cocina las ve separadas y las marca por unidad.
 *
 * NOTAS (2026-10): antes había "Observación" (que en realidad editaba a mano
 * el mismo texto donde viven salsas/adicionales/sabor — se podía romper) y
 * "Nota especial para cocina". Ahora hay UNA nota de este producto
 * (special_note, la que cocina ve resaltada) y los cambios típicos son
 * botones ("Sin queso"). La nota de TODA la orden es otro botón, en el pedido.
 *
 * Precio unitario = precio base del producto (según sabor, flavor_prices)
 *                 + adicionales marcados en las notas ("+ Queso").
 * Para un item personalizado (sin product) el precio es el que traía.
 *
 * onSubmit({ qty, notes, specialNote, price, split? }) — puede ser async.
 * split = [{ qty, notes, specialNote, price }] cuando las unidades difieren.
 */
const VACIA = { notes: '', specialNote: '' };

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
  const [shared, setShared] = useState(VACIA);
  const [distintas, setDistintas] = useState(false);
  const [units, setUnits] = useState([]);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(item?.qty || 1);
    setShared({ notes: item?.notes || '', specialNote: item?.specialNote ?? item?.special_note ?? '' });
    setDistintas(false);
    setUnits([]);
    setActive(0);
    setSaving(false);
  }, [open, item, product]);

  if (!open || (!product && !item)) return null;

  const name = item?.name || product?.displayName || product?.name || '';
  const productLike = product || { name };
  const resolvedCategory = category ?? item?.category ?? product?.category;
  // Salsas / quitar POR PRODUCTO (Menú → Editar): null = lista general, [] = no
  // lleva, [..] = la suya. Una lista propia manda aunque la categoría no lleve.
  const salsasProducto = parseListaProducto(product?.salsas);
  const quitarProducto = parseListaProducto(product?.quitar);
  const llevaPorCategoria = productoLlevaSalsas(productLike, resolvedCategory);
  const mostrarSalsas = salsasProducto ? salsasProducto.length > 0 : llevaPorCategoria;
  const mostrarQuitar = quitarProducto ? quitarProducto.length > 0 : llevaPorCategoria;
  const mostrarAdicionales = allowAdicionales && !!product && adicionales.length > 0 && productoLlevaAdicionales(productLike, resolvedCategory);
  const puedeDistintas = mode === 'add' && allowQty;
  const modoDistintas = puedeDistintas && distintas && qty > 1;

  // Lo que se está editando: la unidad elegida o la configuración común
  const cur = modoDistintas ? (units[active] || VACIA) : shared;
  const setCur = (patch) => {
    if (modoDistintas) {
      setUnits((prev) => prev.map((u, i) => (i === active ? { ...u, ...patch } : u)));
    } else {
      setShared((prev) => ({ ...prev, ...patch }));
    }
  };
  const setNotes = (notes) => setCur({ notes });

  // Precio unitario: se recalcula (sabor + adicionales) solo cuando el item es
  // nuevo o local (allowAdicionales). Un item YA enviado conserva el precio
  // con el que se guardó — acá no se puede cambiar, y el producto del menú
  // pudo haber cambiado de precio después.
  const recalcular = !!product && (mode === 'add' || allowAdicionales);
  const priceFor = (notes) => {
    const base = recalcular
      ? resolveSaborPrice(product.flavor_prices, product.price, notes)
      : (item?.price ?? product?.price ?? 0);
    return base + (recalcular && mostrarAdicionales ? adicionalesExtra(notes, adicionales) : 0);
  };
  const unitPrice = priceFor(cur.notes);
  const total = modoDistintas
    ? units.reduce((s, u) => s + priceFor(u.notes), 0)
    : unitPrice * (qty || 1);

  const changeQty = (n) => {
    const next = Math.max(1, n || 1);
    setQty(next);
    if (distintas) {
      setUnits((prev) => {
        if (next <= prev.length) return prev.slice(0, next);
        const last = prev[prev.length - 1] || shared;
        return [...prev, ...Array.from({ length: next - prev.length }, () => ({ ...last }))];
      });
      setActive((a) => Math.min(a, next - 1));
    }
  };

  const elegirDistintas = (on) => {
    if (on === distintas) return;
    if (on) {
      // Todas arrancan con lo ya marcado; se cambia solo la que es distinta
      setUnits(Array.from({ length: qty }, () => ({ ...shared })));
      setActive(Math.min(1, qty - 1));
    } else {
      setShared(units[0] || shared);
    }
    setDistintas(on);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (modoDistintas) {
        // Unidades iguales → una sola línea con su cantidad
        const grupos = [];
        units.forEach((u) => {
          const n = u.notes.trim();
          const sn = u.specialNote.trim();
          const g = grupos.find((x) => x.notes === n && x.specialNote === sn);
          if (g) g.qty += 1;
          else grupos.push({ qty: 1, notes: n, specialNote: sn, price: priceFor(n) });
        });
        await onSubmit({ ...grupos[0], split: grupos });
      } else {
        await onSubmit({
          qty: qty || 1,
          notes: shared.notes.trim(),
          specialNote: shared.specialNote.trim(),
          price: unitPrice,
        });
      }
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const lineas = modoDistintas
    ? new Set(units.map((u) => `${u.notes.trim()}|${u.specialNote.trim()}`)).size
    : 1;
  const primaryLabel = mode === 'add'
    ? `Agregar${qty > 1 ? ` (${qty})` : ''} · ${formatPriceCOP(total)}`
    : 'Guardar';

  // Resumen corto de una unidad para su botón ("Sin queso · + Tocineta")
  const resumen = (u) => {
    const partes = (u.notes || '').split(',').map((s) => s.trim()).filter((p) => esQuitar(p) || p.startsWith('+'));
    if (u.specialNote?.trim()) partes.push(u.specialNote.trim());
    return partes.length ? partes.join(' · ') : 'Igual';
  };

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
            {modoDistintas ? ` · unidad ${active + 1}` : ''}
          </div>
        )}

        {allowQty && (
          <div className="form-group">
            <label>Cantidad</label>
            <div className="qty-controls">
              <button type="button" onClick={() => changeQty(qty - 1)} aria-label="Una menos">-</button>
              <input type="number" value={qty} onChange={(e) => changeQty(parseInt(e.target.value))} min="1" aria-label="Cantidad" />
              <button type="button" onClick={() => changeQty(qty + 1)} aria-label="Una más">+</button>
            </div>
          </div>
        )}

        {puedeDistintas && qty > 1 && (
          <div className="form-group">
            <div className="segmented item-sheet__modo" role="radiogroup" aria-label="¿Todas iguales?">
              <button type="button" role="radio" aria-checked={!distintas} className={`segmented__btn ${!distintas ? 'is-active' : ''}`} onClick={() => elegirDistintas(false)}>
                Todas iguales
              </button>
              <button type="button" role="radio" aria-checked={distintas} className={`segmented__btn ${distintas ? 'is-active' : ''}`} onClick={() => elegirDistintas(true)}>
                Cada una distinta
              </button>
            </div>
            {modoDistintas && (
              <>
                <div className="item-units" role="tablist" aria-label="Unidad">
                  {units.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={i === active}
                      className={`item-unit ${i === active ? 'is-active' : ''} ${resumen(u) !== 'Igual' ? 'is-changed' : ''}`}
                      onClick={() => setActive(i)}
                    >
                      <span className="item-unit__n tnum">{i + 1}</span>
                      <span className="item-unit__sum">{resumen(u)}</span>
                    </button>
                  ))}
                </div>
                <p className="item-sheet__hint">
                  Lo que marques abajo es solo para la unidad {active + 1}.
                  {lineas > 1 ? ` Se agregan ${lineas} líneas.` : ''}
                </p>
              </>
            )}
          </div>
        )}

        {product?.flavors && (
          <div className="form-group">
            <SaboresChips
              flavors={product.flavors}
              flavorsActive={product.flavors_active}
              flavorPrices={product.flavor_prices}
              basePrice={product.price}
              value={cur.notes}
              onChange={setNotes}
            />
          </div>
        )}

        {mostrarSalsas && (
          <div className="form-group">
            <label>Salsas</label>
            <SalsasChips value={cur.notes} onChange={setNotes} lista={salsasProducto} />
          </div>
        )}

        {mostrarQuitar && <QuitarChips value={cur.notes} onChange={setNotes} lista={quitarProducto} />}

        {mostrarAdicionales && (
          <div className="form-group">
            <label>Adicionales</label>
            <AdicionalesChips adicionales={adicionales} value={cur.notes} onChange={setNotes} />
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Nota de este producto para cocina</label>
          <textarea
            value={cur.specialNote}
            onChange={(e) => setCur({ specialNote: e.target.value })}
            placeholder="Ej: alergia al maní, bien asada…"
            rows={2}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: '0.6rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-md)', fontSize: '1rem' }}
          />
          <p className="item-sheet__hint">¿Es para todo el pedido (para llevar, con prisa)? Usa «Nota de toda la orden» en el pedido.</p>
        </div>
      </div>
    </Modal>
  );
}
