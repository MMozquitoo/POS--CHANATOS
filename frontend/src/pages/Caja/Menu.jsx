import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Caja.css";
import { formatPriceCOP, parseMontoCOP } from "../../utils/currency.js";
import CajaHeader from "../../components/CajaHeader.jsx";
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import ConfigSalsasSabores from '../../components/caja/ConfigSalsasSabores.jsx';
import { parseFlavors, parseFlavorPrices } from '../../components/SaboresChips.jsx';

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
  const [showConfigSalsasSabores, setShowConfigSalsasSabores] = useState(false);

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
    flavors: "",
    flavorPrices: {},
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
      flavors: "",
      flavorPrices: {},
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
        flavors: product.flavors || "",
        flavorPrices: parseFlavorPrices(product.flavor_prices),
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

    const price = parseMontoCOP(formData.price);
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
      // Solo quedan los sabores que siguen en la lista de `flavors` y con un precio
      // válido escrito; el resto (vacío o de un sabor ya quitado) no se manda.
      const currentFlavors = parseFlavors(formData.flavors);
      const flavorPrices = {};
      currentFlavors.forEach((flavor) => {
        const raw = formData.flavorPrices[flavor];
        if (raw !== undefined && raw !== "" && !isNaN(parseMontoCOP(raw))) {
          flavorPrices[flavor] = Math.round(parseMontoCOP(raw));
        }
      });

      const payload = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        price: Math.round(price),
        variant: formData.variant.trim() || null,
        display_order: displayOrder,
        is_active: formData.is_active ? 1 : 0,
        flavors: formData.flavors.trim() || null,
        flavor_prices: Object.keys(flavorPrices).length > 0 ? flavorPrices : null,
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
        <div className="menu-controls">
          <button
            className="menu-toolbar-btn"
            style={{ background: "#28a745", color: "white" }}
            onClick={() => handleOpenModal(null)}
          >
            + Nuevo Producto
          </button>

          <button
            className="menu-toolbar-btn"
            style={{ background: "#F5BB4C", color: "white" }}
            onClick={() => setShowConfigSalsasSabores(true)}
          >
            Configurar salsas y sabores
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
            className="menu-search-input"
            style={{
              padding: "0.5rem",
              fontSize: "1rem",
              border: "1px solid #ddd",
              borderRadius: "4px",
            }}
          />
        </div>

        {/* Lista de productos: grid de 2+ columnas en desktop, 1 columna en mobile */}
        <div className="menu-products-grid">
          {filteredProducts.length === 0 ? (
            <div className="empty-state">No hay productos</div>
          ) : (
            filteredProducts.map((product) => (
              <div
                key={product.id}
                className={`menu-product-card ${product.is_active === 0 ? "inactive" : ""}`}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "1rem", fontWeight: "bold", marginBottom: "0.2rem" }}>
                    {product.name}
                    {product.variant && ` - ${product.variant}`}
                  </div>
                  <div style={{ color: "#666", fontSize: "0.85rem", marginBottom: "0.2rem" }}>
                    {product.category}
                  </div>
                  <div style={{ fontSize: "1.05rem", fontWeight: "bold", color: "#28a745" }}>
                    {formatPriceCOP(product.price)}
                  </div>
                  {product.flavors && (
                    <div style={{ color: "#B8860B", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                      Sabores: {product.flavors}
                      {Object.keys(parseFlavorPrices(product.flavor_prices)).length > 0 && (
                        <span> (precio distinto por sabor)</span>
                      )}
                    </div>
                  )}
                  {product.is_active === 0 && (
                    <div style={{ color: "#d32f2f", fontSize: "0.8rem", marginTop: "0.2rem" }}>
                      INACTIVO
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                  <button
                    onClick={() => handleOpenModal(product)}
                    style={{
                      padding: "0.45rem 0.8rem",
                      background: "#F5BB4C",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleToggle(product)}
                    style={{
                      padding: "0.45rem 0.8rem",
                      background: product.is_active === 1 ? "#ffc107" : "#28a745",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "0.85rem",
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

              {/* Sabores (opcional): el mesero/caja elige uno solo al agregar el producto al pedido */}
              <div style={{ marginBottom: "1rem" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontWeight: "bold",
                  }}
                >
                  Sabores (separados por coma, opcional)
                </label>
                <input
                  type="text"
                  value={formData.flavors}
                  onChange={(e) =>
                    setFormData({ ...formData, flavors: e.target.value })
                  }
                  placeholder="Ej: Colombiana, Manzana, Pepsi"
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
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "#666",
                    marginTop: "0.25rem",
                  }}
                >
                  Si el producto tiene sabores, al agregarlo a un pedido se pedirá elegir uno
                </div>
              </div>

              {/* Precio por sabor (opcional): solo para productos donde el sabor SÍ cambia
                  el precio (ej. Michelada según la cerveza). Si se deja en blanco, ese sabor
                  usa el precio base de arriba. */}
              {parseFlavors(formData.flavors).length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "0.5rem",
                      fontWeight: "bold",
                    }}
                  >
                    Precio por sabor (opcional)
                  </label>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#666",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Deja en blanco el sabor que valga igual al precio base. Útil cuando el
                    sabor cambia el precio (ej. Michelada con Poker vs. con Club Colombia).
                  </div>
                  {parseFlavors(formData.flavors).map((flavor) => (
                    <div
                      key={flavor}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.4rem",
                      }}
                    >
                      <span style={{ flex: 1, fontSize: "0.9rem" }}>{flavor}</span>
                      <input
                        type="number"
                        min="0"
                        value={formData.flavorPrices[flavor] ?? ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            flavorPrices: { ...formData.flavorPrices, [flavor]: e.target.value },
                          })
                        }
                        placeholder={`Igual al base (${formData.price || 0})`}
                        style={{
                          width: "160px",
                          padding: "0.5rem",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}

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
    <ConfigSalsasSabores
      open={showConfigSalsasSabores}
      onClose={() => setShowConfigSalsasSabores(false)}
      onApplied={loadData}
    />
    </>
  );
}
