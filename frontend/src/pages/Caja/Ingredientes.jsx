import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./Caja.css";
import { formatPriceCOP } from "../../utils/currency.js";
import CajaHeader from "../../components/CajaHeader.jsx";
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';

// Insumos controlados (carne/pulpas, pan, papa, etc.): a diferencia de los
// gastos generales, acá cada compra queda ligada a una receta por producto
// (recipes.qty_used) y descuenta stock solo al vender — ver
// backend/routes/inventoryMovements.js (modo "compra": purchase_qty +
// purchase_total_cost + conversion_factor → calcula cost_per_unit solo).
//
// embedded=true: se usa dentro de Compras.jsx (pestaña "Insumos"), sin su
// propio CajaHeader/container.
export default function Ingredientes({ embedded = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  const [ingredients, setIngredients] = useState([]);
  const [inventoryByIngredient, setInventoryByIngredient] = useState({});
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    unit: "",
    conversion_factor: "1",
    min_stock: "0",
    is_active: true,
  });

  const loadData = useCallback(async () => {
    try {
      const [ingredientsRes, inventoryRes] = await Promise.all([
        axios.get("/ingredients", { params: { includeInactive: "true" } }),
        axios.get("/inventory"),
      ]);
      setIngredients(Array.isArray(ingredientsRes.data) ? ingredientsRes.data : []);
      const map = {};
      (Array.isArray(inventoryRes.data) ? inventoryRes.data : []).forEach((inv) => {
        map[inv.ingredient_id] = inv;
      });
      setInventoryByIngredient(map);
    } catch (error) {
      console.error("Error cargando ingredientes:", error);
      await showAlert("Error al cargar ingredientes");
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetModalState = () => {
    setFormData({ name: "", unit: "", conversion_factor: "1", min_stock: "0", is_active: true });
    setEditingId(null);
    setSaving(false);
  };

  const handleOpenModal = (ingredient = null) => {
    resetModalState();
    if (ingredient) {
      setEditingId(ingredient.id);
      const inv = inventoryByIngredient[ingredient.id];
      setFormData({
        name: ingredient.name || "",
        unit: ingredient.unit || "",
        conversion_factor: (ingredient.conversion_factor ?? 1).toString(),
        min_stock: (inv?.min_stock ?? 0).toString(),
        is_active: ingredient.is_active === 1,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setTimeout(resetModalState, 100);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!formData.name.trim()) {
      await showAlert("El nombre es requerido");
      return;
    }
    if (!formData.unit.trim()) {
      await showAlert("La unidad es requerida (ej: kg, gramo, unidad, bulto)");
      return;
    }
    const conversionFactor = parseFloat(formData.conversion_factor);
    if (isNaN(conversionFactor) || conversionFactor <= 0) {
      await showAlert("El factor de conversión debe ser un número > 0");
      return;
    }
    const minStock = parseFloat(formData.min_stock);
    if (isNaN(minStock) || minStock < 0) {
      await showAlert("El stock mínimo debe ser un número >= 0");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await axios.patch(`/ingredients/${editingId}`, {
          name: formData.name.trim(),
          unit: formData.unit.trim(),
          conversion_factor: conversionFactor,
          is_active: formData.is_active,
        });
        // min_stock vive en /inventory, no en /ingredients
        const inv = inventoryByIngredient[editingId];
        if (inv) {
          await axios.patch(`/inventory/ingredient/${editingId}`, { min_stock: minStock });
        } else {
          await axios.post("/inventory", { ingredient_id: editingId, stock_qty: 0, min_stock: minStock });
        }
        await showAlert("Ingrediente actualizado correctamente");
      } else {
        const created = await axios.post("/ingredients", {
          name: formData.name.trim(),
          unit: formData.unit.trim(),
          cost_per_unit: 0, // se calcula solo con la primera compra
          conversion_factor: conversionFactor,
        });
        // Sin esto, "Registrar compra" falla con "no existe inventario"
        await axios.post("/inventory", {
          ingredient_id: created.data.id,
          stock_qty: 0,
          min_stock: minStock,
        });
        await showAlert("Ingrediente creado correctamente");
      }
      handleCloseModal();
      await loadData();
    } catch (error) {
      console.error("Error guardando ingrediente:", error);
      await showAlert(error.response?.data?.error || "Error al guardar ingrediente");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (ingredient) => {
    if (!(await showConfirm(`¿${ingredient.is_active === 1 ? 'Desactivar' : 'Activar'} este ingrediente?`))) {
      return;
    }
    try {
      await axios.patch(`/ingredients/${ingredient.id}/toggle`);
      await loadData();
    } catch (error) {
      console.error("Error cambiando estado:", error);
      await showAlert(error.response?.data?.error || "Error al cambiar estado");
    }
  };

  const handleDelete = async (ingredient) => {
    if (!(await showConfirm(`¿Eliminar "${ingredient.name}"? Esto no se puede deshacer.`))) {
      return;
    }
    try {
      await axios.delete(`/ingredients/${ingredient.id}`);
      await loadData();
    } catch (error) {
      console.error("Error eliminando ingrediente:", error);
      await showAlert(error.response?.data?.error || "Error al eliminar ingrediente");
    }
  };

  if (loading) {
    const loadingContent = <div className="loading">Cargando ingredientes...</div>;
    if (embedded) return loadingContent;
    return <div className="caja-container">{loadingContent}</div>;
  }

  const content = (
    <>
      <div className="caja-content">
        <div className="menu-controls">
          <button
            className="menu-toolbar-btn"
            style={{ background: "#28a745", color: "white" }}
            onClick={() => handleOpenModal(null)}
          >
            + Nuevo Ingrediente
          </button>
        </div>

        <div style={{ color: '#666', fontSize: '0.85rem', margin: '0.5rem 0 1rem' }}>
          Acá se configuran los insumos que se controlan por receta (carne/pulpas, pan, papa...):
          crear, editar unidad/factor de conversión, activar/desactivar. Para anotar una compra del
          día a día (de un insumo o de un gasto suelto) usá "Registrar compra" en el menú — es más
          rápido y no hay que pensar dónde va cada cosa.
        </div>

        <div className="menu-products-grid">
          {ingredients.length === 0 ? (
            <div className="empty-state">No hay ingredientes todavía</div>
          ) : (
            ingredients.map((ingredient) => {
              const inv = inventoryByIngredient[ingredient.id];
              return (
                <div
                  key={ingredient.id}
                  className={`menu-product-card ${ingredient.is_active === 0 ? "inactive" : ""}`}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-17)", fontWeight: 700, marginBottom: "0.2rem" }}>
                      {ingredient.name}
                    </div>
                    <div style={{ color: "var(--gray-500)", fontSize: "var(--text-13)", marginBottom: "0.2rem" }}>
                      {formatPriceCOP(ingredient.cost_per_unit || 0)} / {ingredient.unit}
                    </div>
                    <div style={{ fontSize: "var(--text-13)", color: inv?.is_low_stock ? 'var(--red-text)' : 'var(--gray-900)' }}>
                      Stock: {inv ? `${inv.stock_qty} ${ingredient.unit}` : 'sin inventario'}
                      {inv?.is_low_stock ? ' (¡bajo!)' : ''}
                    </div>
                    {ingredient.is_active === 0 && (
                      <div style={{ color: "var(--red-text)", fontSize: "var(--text-13)", marginTop: "0.2rem", fontWeight: 700 }}>
                        INACTIVO
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => handleOpenModal(ingredient)}
                      className="btn btn--secondary btn--sm"
                      style={{ flex: 1 }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggle(ingredient)}
                      className="btn btn--sm"
                      style={{
                        flex: 1,
                        background: ingredient.is_active === 1 ? "var(--red-tint)" : "var(--green-tint)",
                        color: ingredient.is_active === 1 ? "var(--red-text)" : "var(--green-text)",
                      }}
                    >
                      {ingredient.is_active === 1 ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => handleDelete(ingredient)}
                      className="btn btn--destructive-ghost btn--sm"
                      style={{ flex: 1 }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal crear/editar ingrediente */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !saving) handleCloseModal(); }}
        >
          <div
            className="modal-content"
            style={{ background: "white", padding: "2rem", borderRadius: "12px", maxWidth: "500px", width: "90%", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "1.5rem" }}>
              {editingId ? "Editar Ingrediente" : "Nuevo Ingrediente"}
            </h2>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Carne de res, Pan, Papa"
                  style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", border: "1px solid #ddd", borderRadius: "4px", boxSizing: "border-box" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Unidad *</label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="Ej: kg, gramo, unidad, bulto"
                  style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", border: "1px solid #ddd", borderRadius: "4px", boxSizing: "border-box" }}
                  required
                />
                <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>
                  La unidad en la que llevás el stock y en la que las recetas van a descontar (ej: si la
                  receta de la hamburguesa gasta "150" de carne, esta unidad tiene que ser la que use ese 150).
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Factor de conversión</label>
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={formData.conversion_factor}
                  onChange={(e) => setFormData({ ...formData, conversion_factor: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", border: "1px solid #ddd", borderRadius: "4px", boxSizing: "border-box" }}
                />
                <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>
                  Dejalo en <strong>1</strong> si comprás en la misma unidad de arriba (ej: unidad "kg",
                  comprás en kg). Cambialo solo si la receta usa una unidad más chica que como comprás
                  (ej: unidad "gramo" pero comprás por kg → factor 1000; unidad "papa" pero comprás por
                  bulto y un bulto rinde 100 papas → factor 100).
                </div>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Stock mínimo (alerta)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", border: "1px solid #ddd", borderRadius: "4px", boxSizing: "border-box" }}
                />
              </div>

              {editingId && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: saving ? "not-allowed" : "pointer" }}>
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: "bold" }}>Ingrediente activo</span>
                  </label>
                </div>
              )}

              <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  style={{ padding: "0.75rem 1.5rem", background: "#6c757d", color: "white", border: "none", borderRadius: "4px", cursor: saving ? "not-allowed" : "pointer", fontSize: "1rem", opacity: saving ? 0.6 : 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ padding: "0.75rem 1.5rem", background: saving ? "#6c757d" : "#28a745", color: "white", border: "none", borderRadius: "4px", cursor: saving ? "not-allowed" : "pointer", fontSize: "1rem" }}
                >
                  {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>
      <Modal open={confirmState.open} onClose={cancelConfirm} title={confirmState.title}
        actions={<>
          <button className="btn-secondary" onClick={cancelConfirm}>Cancelar</button>
          <button className="btn-chanatos" onClick={acceptConfirm}>Aceptar</button>
        </>}>
        <p>{confirmState.message}</p>
      </Modal>
    </>
  );

  if (embedded) return content;

  return (
    <div className="caja-container">
      <CajaHeader title="INGREDIENTES" backTo="/mas" />
      {content}
    </div>
  );
}
