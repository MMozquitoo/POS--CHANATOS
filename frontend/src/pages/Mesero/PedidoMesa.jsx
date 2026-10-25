import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import Modal from '../../components/Modal';
import ProductPicker, { findProductById } from '../../components/ProductPicker';
import EditItemNoteModal from '../../components/EditItemNoteModal';
import { getAdicionales } from '../../components/AdicionalesChips.jsx';
import OrderNoteModal from '../../components/OrderNoteModal';
import { useAlert } from '../../hooks/useModal';
import { formatPriceCOP } from '../../utils/currency.js';
import './Mesero.css';
import { toast } from '../../components/ui/Toast';
import useSalirConBorrador from '../../hooks/useSalirConBorrador';

const STATUS_LABELS = {
  NUEVO: 'Nuevo',
  EN_PREP: 'En preparación',
  LISTO: 'Listo',
  PAGADA: 'Pagada',
  CANCELADO: 'Cancelado',
};

// FASE 16.4.3.B: Navegación determinística - usar location.state.from primero, luego fallback por rol
function getBackRoute(location, user) {
  // 1) Si venimos con "from" en el state, volvemos allí (más confiable)
  const from = location?.state?.from;
  if (from) {
    return from;
  }

  // 2) Fallback seguro basado en rol (evita /mesas en blanco)
  if (user?.role === 'MESERO') {
    return '/'; // Panel de mesero está en /
  }
  if (user?.role === 'CAJA') {
    return '/mesas'; // Panel de caja (rediseño 2026-10: plano de Mesas)
  }

  // 3) Último fallback
  return '/';
}

export default function PedidoMesa() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backTo = getBackRoute(location, user);
  const { alertState, showAlert, closeAlert } = useAlert();
  const [table, setTable] = useState(null);
  const [order, setOrder] = useState(null);
  // items = SOLO los productos nuevos aún no enviados; los ya enviados viven en order.items
  const [items, setItems] = useState([]);
  const { confirmarSalida, salirModal } = useSalirConBorrador(items.length);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [showCancelOrder, setShowCancelOrder] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  // Nota de la orden: si aún no existe la orden, se guarda local y viaja en el
  // POST de creación; si ya existe, se guarda de una vez contra el backend.
  const [orderNoteDraft, setOrderNoteDraft] = useState('');
  const [showOrderNoteModal, setShowOrderNoteModal] = useState(false);
  // Editar salsas/nota especial de un item YA agregado (pendiente o ya enviado)
  const [editingLocalIndex, setEditingLocalIndex] = useState(null);
  const [editingSentItem, setEditingSentItem] = useState(null);

  useEffect(() => {
    loadProducts();
    loadTable();
    loadActiveOrder();
  }, [tableId]);

  const loadProducts = async () => {
    try {
      const res = await axios.get('/products');
      setProductsByCategory(res.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  };

  const loadTable = async () => {
    try {
      const res = await axios.get(`/tables`);
      const tableData = res.data.find(t => t.id === parseInt(tableId));
      // FASE F4: ventanilla (9) y domicilios (10) tienen su propio flujo multi-orden
      if (tableData?.number === 9) {
        navigate('/ventanilla', { replace: true });
        return;
      }
      if (tableData?.number === 10) {
        navigate('/domicilios', { replace: true });
        return;
      }
      setTable(tableData);
    } catch (error) {
      console.error('Error cargando mesa:', error);
    }
  };

  const loadActiveOrder = async () => {
    try {
      // Para mesas 1-8, usar endpoint de orden activa
      const res = await axios.get(`/orders/table/${tableId}?active=1`);
      if (res.data) {
        // Cargar items de la orden activa (solo lectura; NO se mezclan con los nuevos)
        const orderRes = await axios.get(`/orders/${res.data.id}`);
        setOrder(orderRes.data);
      } else {
        setOrder(null);
      }
    } catch (error) {
      console.error('Error cargando pedido activo:', error);
      setOrder(null);
    }
  };

  const addPickedItem = (item) => {
    setItems((prev) => [...prev, item]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const saveOrderNote = async (text) => {
    if (order && order.id) {
      await axios.patch(`/orders/${order.id}/special-note`, { specialNote: text });
      await loadActiveOrder();
    } else {
      setOrderNoteDraft(text);
    }
  };

  // Item aún no enviado: además de notas puede cambiar cantidad y adicionales
  // (el panel ya recalculó el precio unitario con los adicionales marcados)
  const saveLocalItemNote = async ({ notes, specialNote, price, qty }) => {
    setItems((prev) => prev.map((it, i) => (i === editingLocalIndex
      ? { ...it, notes: notes || '', specialNote, ...(price != null ? { price } : {}), ...(qty ? { qty } : {}) }
      : it)));
  };

  const saveSentItemNote = async ({ notes, specialNote }) => {
    await axios.patch(`/orders/items/${editingSentItem.id}`, { notes, specialNote });
    await loadActiveOrder();
  };

  const sendToKitchen = async () => {
    if (items.length === 0) {
      showAlert('Agrega al menos un producto');
      return;
    }

    const tableNumber = table?.number ?? null;

    try {
      // GUARDRAIL: one active order per table — si ya hay orden, agregar SOLO los items nuevos
      if (order && order.id) {
        const wasListo = order.status === 'LISTO';
        await axios.post(`/orders/${order.id}/items`, { items });
        toast(wasListo ? 'Pedido actualizado · vuelve a cocina' : 'Pedido actualizado');
      } else {
        if (import.meta.env.DEV) {
          console.log('[FASE M8.7] PedidoMesa sendToKitchen antes de POST /orders:', {
            tableId: parseInt(tableId),
            tableNumber,
            channel: 'MESA',
            service: 'MESA',
            existingActiveOrderId: null,
            itemsCount: items.length,
          });
        }
        const response = await axios.post('/orders', {
          tableId: parseInt(tableId),
          channel: 'MESA',
          service: 'MESA',
          items: items,
          specialNote: orderNoteDraft.trim() || undefined,
        });
        if (import.meta.env.DEV) {
          console.log('[FASE M8.7] Pedido creado:', response.data);
        }
        toast('Pedido enviado');
        setOrderNoteDraft('');
      }

      await loadActiveOrder();
      setItems([]);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[FASE M8.7] PedidoMesa sendToKitchen catch:', {
          status: error.response?.status,
          responseData: error.response?.data,
          message: error.message,
        });
      }
      console.error('Error enviando pedido:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Error al enviar pedido';
      showAlert(`Error: ${errorMessage}`);
    }
  };

  // FASE F6: el mesero puede cancelar pedidos aún no preparados (cliente se arrepiente)
  const cancelOrder = async () => {
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      showAlert('Escribe el motivo de la cancelación (mínimo 3 caracteres)');
      return;
    }
    try {
      await axios.patch(`/orders/${order.id}/cancel`, { reason });
      setShowCancelOrder(false);
      setCancelReason('');
      showAlert('Pedido cancelado. La mesa quedó libre.');
      await loadActiveOrder();
      setItems([]);
    } catch (error) {
      console.error('Error cancelando pedido:', error);
      showAlert(error.response?.data?.error || 'Error al cancelar el pedido');
    }
  };

  // Función para enviar orden a preparación (cambiar estado a EN_PREP)
  const sendToPreparation = async () => {
    if (!order || !order.id) {
      showAlert('No hay orden activa');
      return;
    }

    try {
      await axios.patch(`/orders/${order.id}/status`, { status: 'EN_PREP' });
      showAlert('Orden enviada a preparación');
      await loadActiveOrder();
    } catch (error) {
      console.error('Error enviando a preparación:', error);
      showAlert(error.response?.data?.error || 'Error al enviar a preparación');
    }
  };

  return (
    <div className="pedido-container">
      <header className="pedido-header">
        <button onClick={async () => { if (await confirmarSalida()) navigate(backTo, { replace: true }); }} className="back-btn">‹ Volver</button>
        <h2>{table?.label || `Mesa ${tableId}`}</h2>
      </header>

      <div className="pedido-content">
        {/* Nota de la orden: independiente de agregar productos — visible
            aunque todavía no exista la orden (viaja en la creación). */}
        <button
          type="button"
          onClick={() => setShowOrderNoteModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
            marginBottom: '1rem', padding: '0.7rem 0.9rem', borderRadius: 'var(--radius-md)',
            border: 'none', textAlign: 'left', cursor: 'pointer',
            background: (order?.special_note || orderNoteDraft) ? 'var(--red-tint)' : 'var(--gray-50)',
            color: (order?.special_note || orderNoteDraft) ? 'var(--red-text)' : 'var(--gray-700)',
            fontWeight: 600, fontSize: 'var(--text-15)',
          }}
        >
          {(order?.special_note || orderNoteDraft)
            ? `Nota de toda la orden: ${order?.special_note || orderNoteDraft}`
            : '+ Nota de toda la orden (para cocina)'}
        </button>

        {/* Información de orden activa si existe */}
        {order && order.id && (
          <div style={{
            padding: '1rem',
            marginBottom: '1rem',
            background: '#fff',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div>
                <strong style={{ fontSize: 'var(--text-17)', letterSpacing: 'var(--tracking-title)' }}>
                  {order.daily_no ? `Orden ${order.daily_no}` : order.code || `Orden ${order.id}`}
                </strong>
                <div style={{ marginTop: '0.35rem' }}>
                  <span className={`order-status ${
                    order.status === 'NUEVO' ? 'status-nuevo' :
                    order.status === 'EN_PREP' ? 'status-en-prep' : 'status-listo'
                  }`}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
              </div>
              {order.status === 'NUEVO' && (
                <button
                  onClick={sendToPreparation}
                  className="btn-chanatos"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Enviar a Preparación
                </button>
              )}
            </div>

            {/* Items ya enviados (solo lectura) */}
            {order.items && order.items.length > 0 && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--separator)', paddingTop: '0.75rem' }}>
                <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                  Ya en la orden
                </div>
                {order.items.filter(it => !it.voided_at).map(it => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setEditingSentItem(it)}
                    disabled={!['NUEVO', 'EN_PREP'].includes(order.status)}
                    style={{
                      display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', padding: '0.3rem 0', cursor: ['NUEVO', 'EN_PREP'].includes(order.status) ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{ fontSize: '0.9375rem', color: 'var(--gray-600)' }}>
                      {it.qty}× {it.name}{it.notes ? ` • ${it.notes}` : ''}
                      {['NUEVO', 'EN_PREP'].includes(order.status) && <span style={{ color: 'var(--blue)', marginLeft: '0.4rem' }}>editar</span>}
                    </span>
                    {it.special_note && (
                      <span style={{ fontSize: 'var(--text-13)', fontWeight: 700, color: 'var(--red-text)' }}>Nota: {it.special_note}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {order.status === 'LISTO' && (
              <div style={{ marginTop: '0.75rem', padding: '0.55rem 0.8rem', background: 'var(--brand-tint)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-13)', color: 'var(--brand-deep)', fontWeight: 500 }}>
                Esta orden ya está lista. Si agregas algo más, volverá a cocina solo con lo nuevo.
              </div>
            )}

            {['NUEVO', 'EN_PREP'].includes(order.status) && (
              <button
                type="button"
                onClick={() => setShowCancelOrder(true)}
                style={{ marginTop: '0.75rem', background: 'var(--gray-50)', border: 'none', color: 'var(--red-text)', padding: '0.5rem 0.9rem', borderRadius: '999px', fontSize: 'var(--text-15)', fontWeight: 600, cursor: 'pointer', minHeight: 40 }}
              >
                Cancelar pedido
              </button>
            )}
          </div>
        )}

        {/* Solo aparece cuando hay items nuevos: con la sección vacía era una
            card más que empujaba el selector de productos fuera de pantalla
            (reporte del dueño: "scroll pronunciado para armar el pedido") */}
        {items.length > 0 && (
          <div className="pedido-items new-order-list">
            <h3>{order && order.id ? 'Nuevos items por enviar' : 'Pedido'} <span className="draft-tag">Borrador · sin enviar</span></h3>
            <div className="items-list">
              {items.map((item, index) => (
                <div key={index} className="item-card">
                  <button
                    type="button"
                    onClick={() => setEditingLocalIndex(index)}
                    className="item-info"
                    style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 }}
                  >
                    <div className="item-name">{item.name}</div>
                    <div className="item-details">
                      Cantidad: {item.qty} {item.notes && `• ${item.notes}`}
                      <span style={{ color: 'var(--blue)', marginLeft: '0.4rem' }}>editar</span>
                    </div>
                    {item.specialNote && (
                      <div style={{ fontSize: 'var(--text-13)', fontWeight: 700, color: 'var(--red-text)' }}>
                        Nota: {item.specialNote}
                      </div>
                    )}
                  </button>
                  <button onClick={() => removeItem(index)} className="remove-btn">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <ProductPicker productsByCategory={productsByCategory} onAdd={addPickedItem} draftItems={items} />
      </div>

      <div className="pedido-footer">
        <button
          onClick={sendToKitchen}
          className="send-btn"
          disabled={items.length === 0}
        >
          {(() => {
            const label = order && order.id ? 'AGREGAR ITEMS' : 'ENVIAR A COCINA';
            const total = items.reduce((sum, it) => sum + it.qty * it.price, 0);
            return total > 0 ? `${label} · ${formatPriceCOP(total)}` : label;
          })()}
        </button>
      </div>

      <Modal open={alertState.open} onClose={closeAlert} title={alertState.title}
        actions={<button className="btn-chanatos" onClick={closeAlert}>OK</button>}>
        <p>{alertState.message}</p>
      </Modal>

      <Modal open={showCancelOrder} onClose={() => setShowCancelOrder(false)} title="Cancelar pedido"
        actions={<>
          <button className="btn-secondary" onClick={() => setShowCancelOrder(false)}>Volver</button>
          <button className="btn-chanatos" onClick={cancelOrder}>Cancelar pedido</button>
        </>}>
        <p>El pedido se cancelará y la mesa quedará libre. Escribe el motivo:</p>
        <input
          type="text"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Ej: El cliente se fue"
          autoFocus
          style={{ width: '100%', padding: '0.6rem', border: '1.5px solid #e5e5e5', borderRadius: '8px', fontSize: '0.95rem' }}
        />
      </Modal>

      <OrderNoteModal
        open={showOrderNoteModal}
        value={order?.special_note || orderNoteDraft}
        onClose={() => setShowOrderNoteModal(false)}
        onSave={saveOrderNote}
      />

      <EditItemNoteModal
        open={editingLocalIndex !== null}
        item={editingLocalIndex !== null ? items[editingLocalIndex] : null}
        product={editingLocalIndex !== null ? findProductById(productsByCategory, items[editingLocalIndex]?.product_id).product : null}
        onClose={() => setEditingLocalIndex(null)}
        onSave={saveLocalItemNote}
        adicionales={getAdicionales(productsByCategory)}
        allowAdicionales
        allowQty
      />

      <EditItemNoteModal
        open={!!editingSentItem}
        item={editingSentItem}
        product={editingSentItem ? findProductById(productsByCategory, editingSentItem.product_id).product : null}
        onClose={() => setEditingSentItem(null)}
        onSave={saveSentItemNote}
      />
      {salirModal}
    </div>
  );
}

