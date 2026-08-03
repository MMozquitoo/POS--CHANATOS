import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { parseFlavors, parseActiveFlavorsList, parseFlavorPrices } from '../../components/SaboresChips.jsx';
import { formatPriceCOP } from '../../utils/currency.js';
import { useAlert } from '../../hooks/useModal';
import ModalHost from '../../components/ModalHost';
import './Mesero.css';
import '../../components/SaboresChips.css';

// Pantalla del mesero para prender/apagar sabores del día (ej: hoy solo hay
// jugo de Lulo) SIN tocar productos/precios -- eso sigue siendo solo de Caja
// (Menú/Precios). Acá "apagar" un sabor solo lo oculta de flavors_active;
// la lista maestra (flavors) no se borra, así que si mañana vuelve la mora
// se prende de nuevo con un toque, sin volver a escribirla.
export default function Sabores() {
  const navigate = useNavigate();
  const { alertState, showAlert, closeAlert } = useAlert();
  const [productsByCategory, setProductsByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [addingForId, setAddingForId] = useState(null);
  const [newFlavorName, setNewFlavorName] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await axios.get('/products');
      setProductsByCategory(res.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
      showAlert('Error al cargar el menú');
    } finally {
      setLoading(false);
    }
  };

  const updateProductLocal = (category, productId, patch) => {
    setProductsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].map((p) => (p.id === productId ? { ...p, ...patch } : p)),
    }));
  };

  const toggleFlavor = async (category, product, sabor) => {
    const master = parseFlavors(product.flavors);
    const currentActive = parseActiveFlavorsList(product.flavors_active);
    const active = currentActive === null ? master : currentActive;
    const isOn = active.some((s) => s.toLowerCase() === sabor.toLowerCase());
    const nextActive = isOn
      ? active.filter((s) => s.toLowerCase() !== sabor.toLowerCase())
      : [...active, sabor];

    // Optimista: se guarda ya mismo en pantalla, se revierte si falla.
    const prevFlavorsActive = product.flavors_active;
    updateProductLocal(category, product.id, { flavors_active: JSON.stringify(nextActive) });
    setSavingId(product.id);
    try {
      await axios.patch(`/products/${product.id}/flavors-availability`, { flavors_active: nextActive });
    } catch (error) {
      console.error('Error actualizando sabor:', error);
      updateProductLocal(category, product.id, { flavors_active: prevFlavorsActive });
      showAlert(error.response?.data?.error || 'Error al actualizar el sabor');
    } finally {
      setSavingId(null);
    }
  };

  const addFlavor = async (category, product) => {
    const name = newFlavorName.trim();
    if (!name) return;
    const master = parseFlavors(product.flavors);
    if (master.some((s) => s.toLowerCase() === name.toLowerCase())) {
      showAlert('Ese sabor ya está en la lista');
      return;
    }
    const currentActive = parseActiveFlavorsList(product.flavors_active);
    const active = currentActive === null ? master : currentActive;
    const nextMaster = [...master, name];
    const nextActive = [...active, name];

    setSavingId(product.id);
    try {
      const res = await axios.patch(`/products/${product.id}/flavors-availability`, {
        flavors: nextMaster.join(', '),
        flavors_active: nextActive,
      });
      updateProductLocal(category, product.id, {
        flavors: res.data.flavors,
        flavors_active: res.data.flavors_active,
      });
      setAddingForId(null);
      setNewFlavorName('');
    } catch (error) {
      console.error('Error agregando sabor:', error);
      showAlert(error.response?.data?.error || 'Error al agregar el sabor');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="loading">Cargando menú...</div>;
  }

  const categories = Object.keys(productsByCategory);

  return (
    <div className="mesero-container mesero-bottom-nav-spacer">
      <header className="mesero-header">
        <button onClick={() => navigate(-1)} className="back-btn">‹ Volver</button>
        <h1>Sabores del menú</h1>
      </header>

      <div style={{ padding: '1rem' }}>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Marca los sabores que hay disponibles hoy. Los que apagues no desaparecen,
          solo se ocultan hasta que los vuelvas a prender.
        </p>

        {categories.map((category) => (
          <section key={category} style={{ marginBottom: '1.75rem' }}>
            <h2 style={{ fontSize: 'var(--text-13)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem', color: 'var(--gray-500)' }}>
              {category.replace(/_/g, ' ')}
            </h2>

            {productsByCategory[category].map((product) => {
              const master = parseFlavors(product.flavors);
              const currentActive = parseActiveFlavorsList(product.flavors_active);
              const active = currentActive === null ? master : currentActive;
              const isSaving = savingId === product.id;
              const isAdding = addingForId === product.id;
              const flavorPriceMap = parseFlavorPrices(product.flavor_prices);
              const hasFlavorPricing = Object.keys(flavorPriceMap).length > 0;

              return (
                <div
                  key={product.id}
                  style={{
                    background: 'white',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-sm)',
                    padding: '0.85rem',
                    marginBottom: '0.6rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                        {product.displayName || product.name}
                      </div>
                      <div className="tnum" style={{ fontSize: '0.85rem', color: 'var(--brand-deep)', fontWeight: 700, marginTop: '0.1rem' }}>
                        {formatPriceCOP(product.price)}
                      </div>
                    </div>
                    {isSaving && <div style={{ fontSize: '0.75rem', color: '#999' }}>Guardando...</div>}
                  </div>

                  <div className="sabores-chips-row" style={{ marginTop: '0.6rem' }}>
                    {master.map((sabor) => {
                      const isOn = active.some((s) => s.toLowerCase() === sabor.toLowerCase());
                      return (
                        <button
                          key={sabor}
                          type="button"
                          className={`sabor-chip ${isOn ? 'active' : ''}`}
                          onClick={() => toggleFlavor(category, product, sabor)}
                        >
                          {sabor} {isOn ? '✓' : ''}
                          {hasFlavorPricing && (
                            <span className="sabor-chip-price"> · {formatPriceCOP(flavorPriceMap[sabor] ?? product.price)}</span>
                          )}
                        </button>
                      );
                    })}

                    {isAdding ? (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input
                          autoFocus
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          name="sabor-nuevo"
                          value={newFlavorName}
                          onChange={(e) => setNewFlavorName(e.target.value)}
                          placeholder="Ej: Lulo"
                          style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '16px', minWidth: '140px' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addFlavor(category, product);
                            if (e.key === 'Escape') { setAddingForId(null); setNewFlavorName(''); }
                          }}
                        />
                        <button
                          type="button"
                          className="sabor-chip active"
                          onClick={() => addFlavor(category, product)}
                        >
                          Agregar
                        </button>
                        <button
                          type="button"
                          className="sabor-chip"
                          onClick={() => { setAddingForId(null); setNewFlavorName(''); }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="sabor-chip"
                        onClick={() => { setAddingForId(product.id); setNewFlavorName(''); }}
                      >
                        + Agregar sabor
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} />
    </div>
  );
}
