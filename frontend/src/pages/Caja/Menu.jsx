import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Caja.css";
import { formatPriceCOP } from "../../utils/currency.js";
import CajaHeader from "../../components/CajaHeader.jsx";
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';

export default function Menu() {
  const navigate = useNavigate();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  // Estados principales
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Estados del modal - IMPORTANTE: siempre se resetean completamente
  const [showModal, setShowModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Estado del formulario - SIEMPRE se inicializa desde cero
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    variant: "",
    display_order: "0",
    is_active: true,
  });

  // Cargar datos iniciales
  useEffect(() => {
    loadData();
  }, []);

  // Filtrar productos cuando cambian los filtros
  useEffect(() => {
    loadData();
  }, [selectedCategory, searchTerm]);

  const loadData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        axios.get("/products/admin", {
          params: {
            category: selectedCategory || undefined,
            search: searchTerm || undefined,
          },
        }),
        axios.get("/products/admin/categories"),
      ]);
      
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
    } catch (error) {
      console.error("Error cargando datos:", error);
      await showAlert("Error al cargar productos");
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  // CRÍTICO: Resetear completamente el estado del modal
  const resetModalState = useCallback(() => {
    setFormData({
      name: "",
      category: "",
      price: "",
      variant: "",
      display_order: "0",
      is_active: true,
    });
    setEditingProductId(null);
    setSaving(false);
  }, []);

  // Abrir modal para crear o editar
  const handleOpenModal = useCallback((product = null) => {
    // PRIMERO: Resetear todo el estado
    resetModalState();
    
    // Luego: Si hay producto, cargar sus datos (crear copia nueva)
    if (product) {
      setEditingProductId(product.id);
      setFormData({
        name: product.name || "",
        category: product.category || "",
        price: product.price?.toString() || "",
        variant: product.variant || "",
        display_order: product.display_order?.toString() || "0",
        is_active: product.is_active === 1,
      });
    } else {
      // Si es nuevo, usar valores por defecto limpios
      setEditingProductId(null);
    }
    
    // Finalmente: Mostrar modal
    setShowModal(true);
  }, [resetModalState]);

  // Cerrar modal y resetear TODO
  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    // IMPORTANTE: Resetear después de cerrar para evitar problemas
    setTimeout(() => {
      resetModalState();
    }, 100);
  }, [resetModalState]);

  // Guardar producto (crear o editar)
  const handleSave = async (e) => {
    e.preventDefault();

    // Evitar múltiples envíos
    if (saving) {
      return;
    }

    // Validaciones
    if (!formData.name.trim()) {
      await showAlert("El nombre es requerido");
      return;
    }

    if (!formData.category.trim()) {
      await showAlert("La categoría es requerida");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) {
      await showAlert("El precio debe ser un número >= 0");
      return;
    }

    const displayOrder = parseInt(formData.display_order);
    if (isNaN(displayOrder) || displayOrder < 0) {
      await showAlert("El orden debe ser un número entero >= 0");
      return;
    }

    // CRÍTICO: Activar saving ANTES de cualquier operación
    setSaving(true);

    try {
      const payload = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        price: Math.round(price),
        variant: formData.variant.trim() || null,
        display_order: displayOrder,
        is_active: formData.is_active ? 1 : 0,
      };

      if (editingProductId) {
        // Editar producto existente
        await axios.patch(`/products/${editingProductId}`, payload);
        await showAlert("Producto actualizado correctamente");
      } else {
        // Crear nuevo producto
        await axios.post("/products", payload);
        await showAlert("Producto creado correctamente");
      }

      // Cerrar modal y recargar datos
      handleCloseModal();
      await loadData();
    } catch (error) {
      console.error("Error guardando producto:", error);
      await showAlert(error.response?.data?.error || "Error al guardar producto");
    } finally {
      // CRÍTICO: SIEMPRE resetear saving, incluso si hay error
      setSaving(false);
    }
  };

  // Toggle activar/desactivar producto
  const handleToggle = async (product) => {
    if (!(await showConfirm(`¿${product.is_active === 1 ? 'Desactivar' : 'Activar'} este producto?`))) {
      return;
    }

    try {
      await axios.patch(`/products/${product.id}/toggle`);
      await loadData();
    } catch (error) {
      console.error("Error cambiando estado:", error);
      await showAlert(error.response?.data?.error || "Error al cambiar estado");
    }
  };

  // Filtrar productos por categoría
  const getFilteredProducts = () => {
    let filtered = products;

    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          (p.variant && p.variant.toLowerCase().includes(search))
      );
    }

    return filtered;
  };

  const filteredProducts = getFilteredProducts();

  if (loading) {
    return (
      <div className="caja-container">
        <div className="loading">Cargando menú...</div>
      </div>
    );
  }

  return (
    <>
    <div className="caja-container">
      <CajaHeader title="MENÚ" backTo="/mas" />

      <div className="caja-content">
        {/* Controles */}
        <div style={{ marginBottom: "2rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            className="action-btn"
            style={{ background: "#28a745", color: "white" }}
            onClick={() => handleOpenModal(null)}
          >
            + Nuevo Producto
          </button>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: "0.5rem",
              fontSize: "1rem",
              border: "1px solid #ddd",
              borderRadius: "4px",
            }}
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "0.5rem",
              fontSize: "1rem",
              border: "1px solid #ddd",
              borderRadius: "4px",
              flex: 1,
              minWidth: "200px",
            }}
          />
        </div>

        {/* Lista de productos */}
        <div className="products-list">
          {filteredProducts.length === 0 ? (
            <div className="empty-state">No hay productos</div>
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                className={`product-card ${product.is_active === 0 ? "inactive" : ""}`}
                style={{
                  background: "white",
                  padding: "1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: product.is_active === 0 ? "2px solid #ccc" : "1px solid #ddd",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
                    {product.name}
                    {product.variant && ` - ${product.variant}`}
                  </div>
                  <div style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                    {product.category}
                  </div>
                  <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#28a745" }}>
                    {formatPriceCOP(product.price)}
                  </div>
                  {product.is_active === 0 && (
                    <div style={{ color: "#d32f2f", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      INACTIVO
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleOpenModal(product)}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "#F5BB4C",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggle(product)}
                    style={{
                      padding: "0.5rem 1rem",
                      background: product.is_active === 1 ? "#ffc107" : "#28a745",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    {product.is_active === 1 ? "Desactivar" : "Activar"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal de edición - CRÍTICO: Usar key para forzar re-render limpio */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              handleCloseModal();
            }
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "white",
              padding: "2rem",
              borderRadius: "12px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "1.5rem" }}>
              {editingProductId ? "Editar Producto" : "Nuevo Producto"}
            </h2>

            <form onSubmit={handleSave}>
              {/* Nombre */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "bold",
                  }}
                >
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ej: Hamburguesa Clásica"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "1rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "text",
                  }}
                  required
                />
              </div>

              {/* Categoría */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "bold",
                  }}
                >
                  Categoría *
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="Ej: HAMBURGUESAS"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "1rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "text",
                  }}
                  required
                />
              </div>

              {/* Precio - CRÍTICO: Permitir escritura manual siempre */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "bold",
                  }}
                >
                  Precio (COP) *
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  placeholder="0"
                  min="0"
                  step="1"
                  // CRÍTICO: NO disabled - permitir escritura manual siempre
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "1rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "text",
                  }}
                  required
                />
                {!editingProductId && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#666",
                      marginTop: "0.25rem",
                    }}
                  >
                    Ingresa el precio en pesos colombianos (ej: 10000)
                  </div>
                )}
              </div>

              {/* Variante */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "bold",
                  }}
                >
                  Variante (opcional)
                </label>
                <input
                  type="text"
                  value={formData.variant}
                  onChange={(e) =>
                    setFormData({ ...formData, variant: e.target.value })
                  }
                  placeholder="Ej: Sencillo, Combo"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "1rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "text",
                  }}
                />
              </div>

              {/* Orden de visualización */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "bold",
                  }}
                >
                  Orden de visualización
                </label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={(e) =>
                    setFormData({ ...formData, display_order: e.target.value })
                  }
                  placeholder="0"
                  min="0"
                  step="1"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "1rem",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    backgroundColor: "white",
                    cursor: "text",
                  }}
                />
              </div>

              {/* Activo/Inactivo */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                    style={{
                      width: "18px",
                      height: "18px",
                      cursor: "pointer",
                    }}
                  />
                  <span style={{ fontWeight: "bold" }}>Producto activo</span>
                </label>
              </div>

              {/* Botones */}
              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: "1rem",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: saving ? "#6c757d" : "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontSize: "1rem",
                  }}
                >
                  {saving ? "Guardando..." : editingProductId ? "Actualizar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
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
}
