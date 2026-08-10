import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import Modal from '../../components/Modal';
import { useAlert } from '../../hooks/useModal';
import { formatPriceCOP, parseMontoCOP } from '../../utils/currency.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, expenseCategoryLabel } from '../../utils/expenseCategories.js';

function bogotaDate() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
}

// Un solo lugar para anotar CUALQUIER compra o gasto — el que compra no
// necesita saber si lo que compró es un "insumo controlado" (tiene receta:
// carne, pan, papa...) o un "gasto general" (verduras, servicios...): elige
// QUÉ compró de una lista y el sistema decide solo a dónde va cada cosa.
// Ingredientes.jsx sigue existiendo aparte, pero solo para el trabajo de
// configuración (crear/editar/desactivar insumos) — no para el día a día.
//
// embedded=true: se usa dentro de Compras.jsx (pestaña "Registrar"), sin su
// propio CajaHeader/container.
export default function RegistrarCompra({ embedded = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();

  const [step, setStep] = useState('buscar'); // 'buscar' | 'insumo' | 'gasto'
  const [ingredients, setIngredients] = useState([]);
  const [loadingIngredients, setLoadingIngredients] = useState(true);
  const [search, setSearch] = useState('');
  const [gastoType, setGastoType] = useState('EGRESO'); // EGRESO | INGRESO

  // Paso "insumo" (mismo flujo que tenía Ingredientes.jsx)
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [compraQty, setCompraQty] = useState('');
  const [compraCost, setCompraCost] = useState('');
  const [compraSaving, setCompraSaving] = useState(false);

  // Paso "gasto" (mismo flujo que tenía Gastos generales)
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [gastoDescription, setGastoDescription] = useState('');
  const [gastoAmount, setGastoAmount] = useState('');
  const [gastoDate, setGastoDate] = useState(bogotaDate());
  const [gastoSaving, setGastoSaving] = useState(false);

  useEffect(() => {
    axios.get('/ingredients')
      .then(res => setIngredients(Array.isArray(res.data) ? res.data : []))
      .catch(() => setIngredients([]))
      .finally(() => setLoadingIngredients(false));
  }, []);

  const filteredIngredients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter(i => i.name.toLowerCase().includes(q));
  }, [ingredients, search]);

  const categoryOptions = gastoType === 'INGRESO' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const resetToSearch = () => {
    setStep('buscar');
    setSearch('');
    setSelectedIngredient(null);
    setCompraQty('');
    setCompraCost('');
    setSelectedCategory(null);
    setGastoDescription('');
    setGastoAmount('');
    setGastoDate(bogotaDate());
    setGastoType('EGRESO');
  };

  const openInsumo = (ingredient) => {
    setSelectedIngredient(ingredient);
    setCompraQty('');
    setCompraCost('');
    setStep('insumo');
  };

  const openGasto = (category) => {
    setSelectedCategory(category);
    setGastoDescription('');
    setGastoAmount('');
    setStep('gasto');
  };

  // ---- Paso insumo ----
  const compraQtyNum = parseFloat(compraQty);
  const compraCostNum = parseMontoCOP(compraCost);
  const conversionFactor = selectedIngredient ? (selectedIngredient.conversion_factor || 1) : 1;
  const previewBaseQty = !isNaN(compraQtyNum) && compraQtyNum > 0 ? compraQtyNum * conversionFactor : 0;
  const previewCostPerUnit = previewBaseQty > 0 && !isNaN(compraCostNum) && compraCostNum >= 0
    ? Math.round(compraCostNum / previewBaseQty)
    : null;

  const handleSaveInsumo = async () => {
    if (isNaN(compraQtyNum) || compraQtyNum <= 0) {
      await showAlert('Ingresa una cantidad comprada válida (> 0)');
      return;
    }
    if (isNaN(compraCostNum) || compraCostNum < 0) {
      await showAlert('Ingresa un costo total válido (>= 0)');
      return;
    }
    setCompraSaving(true);
    try {
      await axios.post('/inventory-movements', {
        ingredient_id: selectedIngredient.id,
        type: 'IN',
        purchase_qty: compraQtyNum,
        purchase_total_cost: Math.round(compraCostNum),
        reason: 'Compra de insumo',
      });
      await showAlert('Compra registrada correctamente');
      resetToSearch();
    } catch (error) {
      console.error('Error registrando compra:', error);
      await showAlert(error.response?.data?.error || 'Error al registrar la compra');
    } finally {
      setCompraSaving(false);
    }
  };

  // ---- Paso gasto general ----
  const handleSaveGasto = async () => {
    const amount = parseMontoCOP(gastoAmount);
    if (!gastoDescription.trim()) {
      await showAlert('Escribe una descripción');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      await showAlert('Ingresa un monto válido (> 0)');
      return;
    }
    setGastoSaving(true);
    try {
      await axios.post('/cash/manual-transactions', {
        transaction_date: gastoDate,
        type: gastoType,
        description: gastoDescription.trim(),
        amount,
        category: selectedCategory,
      });
      await showAlert('Movimiento registrado correctamente');
      resetToSearch();
    } catch (error) {
      console.error('Error guardando movimiento:', error);
      await showAlert(error.response?.data?.error || 'Error al guardar');
    } finally {
      setGastoSaving(false);
    }
  };

  const content = (
    <>
        <div className="caja-content" style={{ padding: '1.5rem' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto' }}>

            {step === 'buscar' && (
              <>
                <div style={{ color: 'var(--gray-500)', fontSize: 'var(--text-13)', marginBottom: '1rem' }}>
                  Elegí qué compraste o qué gasto anotás — no hace falta saber si es un insumo con receta o un gasto suelto, el sistema lo resuelve solo.
                </div>

                <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>¿Qué compraste?</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ej: Salchicha, Carne, Papa..."
                  autoFocus
                  style={{ width: '100%', padding: '0.75rem', fontSize: '16px', border: '2px solid var(--gray-200)', borderRadius: 'var(--radius-md)', boxSizing: 'border-box', marginBottom: '1rem' }}
                />

                {loadingIngredients ? (
                  <div style={{ padding: '1rem', color: 'var(--gray-500)' }}>Cargando insumos…</div>
                ) : filteredIngredients.length > 0 ? (
                  <div className="list-group" style={{ marginBottom: '1.5rem' }}>
                    {filteredIngredients.map(ing => (
                      <button
                        key={ing.id}
                        type="button"
                        className="list-row list-row--tap"
                        onClick={() => openInsumo(ing)}
                      >
                        <span className="list-row__main">
                          {ing.name}
                          <span className="list-row__detail" style={{ display: 'block' }}>
                            {formatPriceCOP(ing.cost_per_unit || 0)} / {ing.unit}
                          </span>
                        </span>
                        <span className="list-row__chevron" aria-hidden="true">›</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '0.75rem', color: 'var(--gray-500)', fontSize: 'var(--text-15)', marginBottom: '1.5rem' }}>
                    Ningún insumo con receta coincide con "{search}".
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--separator)', paddingTop: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.5rem' }}>
                    ¿No es un insumo con receta? Elegí una categoría de gasto general
                  </label>
                  <div className="segmented" style={{ marginBottom: '0.75rem', maxWidth: '260px' }}>
                    <button
                      type="button"
                      className={`segmented__btn${gastoType === 'EGRESO' ? ' is-active' : ''}`}
                      onClick={() => setGastoType('EGRESO')}
                    >
                      Egreso
                    </button>
                    <button
                      type="button"
                      className={`segmented__btn${gastoType === 'INGRESO' ? ' is-active' : ''}`}
                      onClick={() => setGastoType('INGRESO')}
                    >
                      Ingreso
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {categoryOptions.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => openGasto(cat)}
                      >
                        {expenseCategoryLabel(cat)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 'insumo' && selectedIngredient && (
              <>
                <button type="button" className="btn btn--secondary btn--sm" onClick={resetToSearch} style={{ marginBottom: '1rem' }}>
                  ‹ Volver
                </button>
                <h2 style={{ marginBottom: '0.25rem' }}>Registrar compra</h2>
                <div style={{ color: 'var(--gray-500)', marginBottom: '1.5rem' }}>{selectedIngredient.name}</div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Cantidad comprada</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={compraQty}
                    onChange={(e) => setCompraQty(e.target.value)}
                    placeholder="Ej: 2"
                    autoFocus
                    style={{ width: '100%', padding: '0.75rem', fontSize: '16px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Costo total pagado</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={compraCost}
                    onChange={(e) => setCompraCost(e.target.value)}
                    placeholder="Ej: 30.000"
                    className="tnum"
                    style={{ width: '100%', padding: '0.75rem', fontSize: '16px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                  />
                </div>

                {previewCostPerUnit !== null && (
                  <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: 'var(--text-15)' }}>
                    Queda en <strong>{formatPriceCOP(previewCostPerUnit)}</strong> por {selectedIngredient.unit}
                    {' '}({previewBaseQty} {selectedIngredient.unit} nuevos en stock)
                  </div>
                )}

                <button
                  onClick={handleSaveInsumo}
                  disabled={compraSaving}
                  className="btn btn--primary btn--lg"
                >
                  {compraSaving ? 'Guardando…' : 'Registrar compra'}
                </button>
              </>
            )}

            {step === 'gasto' && selectedCategory && (
              <>
                <button type="button" className="btn btn--secondary btn--sm" onClick={resetToSearch} style={{ marginBottom: '1rem' }}>
                  ‹ Volver
                </button>
                <h2 style={{ marginBottom: '0.25rem' }}>
                  {gastoType === 'INGRESO' ? 'Registrar ingreso' : 'Registrar gasto'}
                </h2>
                <div style={{ color: 'var(--gray-500)', marginBottom: '1.5rem' }}>{expenseCategoryLabel(selectedCategory)}</div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Descripción</label>
                  <input
                    type="text"
                    value={gastoDescription}
                    onChange={(e) => setGastoDescription(e.target.value)}
                    placeholder="Ej: Verduras del mercado"
                    autoFocus
                    style={{ width: '100%', padding: '0.75rem', fontSize: '16px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Monto</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={gastoAmount}
                      onChange={(e) => setGastoAmount(e.target.value)}
                      placeholder="Ej: 30.000"
                      className="tnum"
                      style={{ width: '100%', padding: '0.75rem', fontSize: '16px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>Fecha</label>
                    <input
                      type="date"
                      value={gastoDate}
                      max={bogotaDate()}
                      onChange={(e) => setGastoDate(e.target.value)}
                      style={{ width: '100%', padding: '0.75rem', fontSize: '16px', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveGasto}
                  disabled={gastoSaving}
                  className="btn btn--primary btn--lg"
                >
                  {gastoSaving ? 'Guardando…' : gastoType === 'INGRESO' ? 'Registrar ingreso' : 'Registrar gasto'}
                </button>
              </>
            )}

          </div>
        </div>
      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
    </>
  );

  if (embedded) return content;

  return (
    <div className="caja-container">
      <CajaHeader title="REGISTRAR COMPRA" backTo="/mas" />
      {content}
    </div>
  );
}
