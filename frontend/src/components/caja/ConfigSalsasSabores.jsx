import { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from '../Modal';
import { useAlert } from '../../hooks/useModal';

// Panel de Menú (Precios) para configurar, sin tocar código:
// 1) la lista global de salsas que aparece al armar cualquier pedido, y
// 2) los sabores de varios productos a la vez (ej. todas las gaseosas
//    personales Postobón comparten "Colombiana, Manzana, Pepsi").
export default function ConfigSalsasSabores({ open, onClose, onApplied }) {
  const { alertState, showAlert, closeAlert } = useAlert();

  const [salsas, setSalsas] = useState([]);
  const [newSalsa, setNewSalsa] = useState('');
  const [savingSalsas, setSavingSalsas] = useState(false);

  const [products, setProducts] = useState([]);
  const [flavorsList, setFlavorsList] = useState([]);
  const [newFlavor, setNewFlavor] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [applyingFlavors, setApplyingFlavors] = useState(false);

  // Catálogo COMPLETO (sin el filtro de búsqueda/categoría que tenga activo
  // Menu.jsx en ese momento), para no esconder productos por error.
  useEffect(() => {
    if (!open) return;
    axios.get('/settings/salsas')
      .then(res => setSalsas(Array.isArray(res.data?.salsas) ? res.data.salsas : []))
      .catch(() => setSalsas([]));
    axios.get('/products/admin')
      .then(res => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProducts([]));
    setFlavorsList([]);
    setNewFlavor('');
    setSelectedProductIds(new Set());
  }, [open]);

  const addSalsa = () => {
    const v = newSalsa.trim();
    if (!v) return;
    if (salsas.some(s => s.toLowerCase() === v.toLowerCase())) {
      setNewSalsa('');
      return;
    }
    setSalsas([...salsas, v]);
    setNewSalsa('');
  };

  const removeSalsa = (s) => setSalsas(salsas.filter(x => x !== s));

  const addFlavor = () => {
    const v = newFlavor.trim();
    if (!v) return;
    if (flavorsList.some(f => f.toLowerCase() === v.toLowerCase())) {
      setNewFlavor('');
      return;
    }
    setFlavorsList([...flavorsList, v]);
    setNewFlavor('');
  };

  const removeFlavor = (f) => setFlavorsList(flavorsList.filter(x => x !== f));

  // Al marcar un solo producto que ya tiene sabores, precargarlos como punto de
  // partida (más fácil quitar uno que retipear todo desde cero).
  const loadFlavorsFrom = (product) => {
    if (!product?.flavors) return;
    const parsed = product.flavors.split(',').map(s => s.trim()).filter(Boolean);
    setFlavorsList(parsed);
  };

  const saveSalsas = async () => {
    if (salsas.length === 0) {
      await showAlert('Debe quedar al menos una salsa');
      return;
    }
    setSavingSalsas(true);
    try {
      await axios.put('/settings/salsas', { salsas });
      await showAlert('Salsas guardadas. Ya están disponibles al armar pedidos.');
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Error al guardar las salsas');
    } finally {
      setSavingSalsas(false);
    }
  };

  const toggleProduct = (product) => {
    const id = product.id;
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      const wasEmpty = next.size === 0;
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Primer producto que se marca: precargar sus sabores actuales, si tiene.
        if (wasEmpty && flavorsList.length === 0) loadFlavorsFrom(product);
      }
      return next;
    });
  };

  const applyFlavors = async () => {
    if (selectedProductIds.size === 0) {
      await showAlert('Selecciona al menos un producto');
      return;
    }
    setApplyingFlavors(true);
    try {
      await axios.patch('/products/flavors/bulk', {
        productIds: Array.from(selectedProductIds),
        flavors: flavorsList.join(', '),
      });
      await showAlert('Sabores aplicados a los productos seleccionados.');
      const refreshed = await axios.get('/products/admin');
      setProducts(Array.isArray(refreshed.data) ? refreshed.data : []);
      onApplied?.();
      setSelectedProductIds(new Set());
    } catch (err) {
      await showAlert(err.response?.data?.error || 'Error al aplicar los sabores');
    } finally {
      setApplyingFlavors(false);
    }
  };

  // El caso típico (gaseosas personales) vive en BEBIDAS, pero cualquier
  // categoría puede tener sabores (ej. postres), así que se muestran todos.
  const allProducts = (products || []).slice().sort((a, b) => {
    if (a.category !== b.category) return String(a.category).localeCompare(String(b.category));
    return String(a.name).localeCompare(String(b.name));
  });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Configurar salsas y sabores"
        actions={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.4rem 0' }}>Salsas</h4>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.6rem 0' }}>
            Aparecen al armar cualquier pedido (menos bebidas/cervezas/jugos).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
            {salsas.map((s) => (
              <span
                key={s}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.3rem 0.6rem', background: '#FFFDF7',
                  border: '1.5px solid #e5d9bd', borderRadius: '999px', fontSize: '0.85rem',
                }}
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeSalsa(s)}
                  style={{ border: 'none', background: 'none', color: '#dc3545', cursor: 'pointer', fontWeight: 'bold', padding: 0, lineHeight: 1 }}
                  aria-label={`Quitar ${s}`}
                >
                  ×
                </button>
              </span>
            ))}
            {salsas.length === 0 && <span style={{ color: '#999', fontSize: '0.85rem' }}>Sin salsas configuradas todavía.</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={newSalsa}
              onChange={(e) => setNewSalsa(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSalsa(); } }}
              placeholder="Nueva salsa (ej: Piña agridulce)"
              style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px' }}
            />
            <button type="button" className="btn-secondary" onClick={addSalsa}>+ Agregar</button>
          </div>
          <button
            type="button"
            className="btn-chanatos"
            onClick={saveSalsas}
            disabled={savingSalsas}
            style={{ marginTop: '0.75rem', width: '100%', padding: '0.7rem' }}
          >
            {savingSalsas ? 'Guardando...' : 'Guardar salsas'}
          </button>
        </div>

        <hr style={{ margin: '1.25rem 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div>
          <h4 style={{ margin: '0 0 0.4rem 0' }}>Sabores (aplicar a varios productos)</h4>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.6rem 0' }}>
            Arma la lista de sabores y marca las gaseosas personales para que todas la
            compartan, sin editarlas una por una. Si marcas un producto que ya tiene
            sabores, se precargan aquí para que solo quites o agregues los que quieras.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
            {flavorsList.map((f) => (
              <span
                key={f}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.3rem 0.6rem', background: '#FFFDF7',
                  border: '1.5px solid #e5d9bd', borderRadius: '999px', fontSize: '0.85rem',
                }}
              >
                {f}
                <button
                  type="button"
                  onClick={() => removeFlavor(f)}
                  style={{ border: 'none', background: 'none', color: '#dc3545', cursor: 'pointer', fontWeight: 'bold', padding: 0, lineHeight: 1 }}
                  aria-label={`Quitar ${f}`}
                >
                  ×
                </button>
              </span>
            ))}
            {flavorsList.length === 0 && <span style={{ color: '#999', fontSize: '0.85rem' }}>Sin sabores en la lista todavía.</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              value={newFlavor}
              onChange={(e) => setNewFlavor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFlavor(); } }}
              placeholder="Nuevo sabor (ej: Manzana)"
              style={{ flex: 1, padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px' }}
            />
            <button type="button" className="btn-secondary" onClick={addFlavor}>+ Agregar</button>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '0.5rem' }}>
            {allProducts.length === 0 ? (
              <p style={{ color: '#999', fontSize: '0.85rem', margin: 0 }}>No hay productos.</p>
            ) : allProducts.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={selectedProductIds.has(p.id)} onChange={() => toggleProduct(p)} />
                <span style={{ flex: 1 }}>
                  {p.name}{p.variant ? ` - ${p.variant}` : ''}
                  <span className="pos-mobile-no-break" style={{ color: '#999', fontSize: '0.8rem' }}> ({p.category})</span>
                </span>
                {p.flavors && <span style={{ color: '#999', fontSize: '0.8rem' }}>hoy: {p.flavors}</span>}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn-chanatos"
            onClick={applyFlavors}
            disabled={applyingFlavors}
            style={{ marginTop: '0.75rem', width: '100%', padding: '0.7rem' }}
          >
            {applyingFlavors ? 'Aplicando...' : `Aplicar a ${selectedProductIds.size || ''} seleccionado(s)`}
          </button>
        </div>
      </Modal>

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
    </>
  );
}
