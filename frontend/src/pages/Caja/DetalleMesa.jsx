import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP, parseMontoCOP } from '../../utils/currency.js';
import CalculadoraVuelto from '../../components/CalculadoraVuelto.jsx';
import Recibo from '../../components/Recibo.jsx';
import ComprobanteAnulacion from '../../components/ComprobanteAnulacion.jsx';
import ProductPicker, { findProductById } from '../../components/ProductPicker.jsx';
import EditItemNoteModal from '../../components/EditItemNoteModal.jsx';
import { getAdicionales } from '../../components/AdicionalesChips.jsx';
import OrderNoteModal from '../../components/OrderNoteModal.jsx';
import PlatformBadge from '../../components/PlatformBadge.jsx';
import AnimatedNumber from '../../components/AnimatedNumber.jsx';
import DividirCuenta from '../../components/caja/DividirCuenta.jsx';
import { useConnection } from '../../contexts/ConnectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import { useDetalleMesaRefresh } from '../../hooks/useOrdersRefresh.js';
import ModalHost from '../../components/ModalHost';
import Modal from '../../components/Modal';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';
import { statusLabel } from '../../utils/statusLabels.js';
import { toast } from '../../components/ui/Toast';
import useSalirConBorrador from '../../hooks/useSalirConBorrador';
import RielCobro from './cobro/RielCobro.jsx';
import { armarRecibo, quedoPagada as quedoPagadaFn } from './cobro/recibo.js';

// Pill de estado (estilo iOS: tinte suave + texto oscuro, nunca el enum crudo)
const STATUS_PILL_STYLE = {
  NUEVO: { background: 'var(--blue-tint)', color: 'var(--blue-text)' },
  EN_PREP: { background: 'var(--orange-tint)', color: 'var(--orange-text)' },
  LISTO: { background: 'var(--green-tint)', color: 'var(--green-text)' },
  PAGADA: { background: 'var(--gray-50)', color: 'var(--gray-600)' },
  CANCELADO: { background: 'var(--red-tint)', color: 'var(--red-text)' },
};

function StatusPill({ status }) {
  if (!status) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        borderRadius: '999px',
        fontSize: '0.8125rem',
        fontWeight: 600,
        ...(STATUS_PILL_STYLE[status] || STATUS_PILL_STYLE.PAGADA),
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

// FASE M9.1: helper para Ventanilla (9) / Domicilios (10) — múltiples órdenes permitidas
const isSpecialTable = (tableNumber) => {
  const n = tableNumber != null ? Number(tableNumber) : NaN;
  return n === 9 || n === 10;
};

// FASE 16.4.3.B: Navegación determinística - usar location.state.from primero, luego fallback por rol
function getBackRoute(location, user) {
  // 1) Si venimos con "from" en el state, volvemos allí (más confiable)
  const from = location?.state?.from;
  if (from) {
    return from;
  }

  // 2) Fallback seguro basado en rol
  if (user?.role === 'CAJA') {
    return '/mesas'; // Panel de caja (rediseño 2026-10: plano de Mesas)
  }
  if (user?.role === 'MESERO') {
    return '/'; // Panel de mesero
  }

  // 3) Último fallback
  return '/mesas';
}

// PASO 16.2.2-A: Helper para normalizar payload de POST /payments/items
function normalizePaymentItemsPayload({
  items, // array de objetos o números
  method, // string (puede venir como CASH/CARD/TRANSFER)
  tableId, // number o string
  orderId, // number o string (opcional)
  amount // number (opcional, solo para logs)
}) {
  // 1) Normalizar itemIds como array de números
  let itemIds = [];
  if (Array.isArray(items)) {
    itemIds = items
      .map(item => {
        if (typeof item === 'number') return item;
        if (typeof item === 'object' && item !== null) {
          return item.id || item.order_item_id || item.itemId || item.item_id;
        }
        return null;
      })
      .filter(id => id != null)
      .map(id => Number(id))
      .filter(id => !isNaN(id) && id > 0);
  }

  if (itemIds.length === 0) {
    throw new Error('No hay items válidos para cobrar. Verifica que los items tengan id.');
  }

  // 2) Normalizar method
  let normalizedMethod = method?.toUpperCase() || 'EFECTIVO';
  const methodMap = {
    'CASH': 'EFECTIVO',
    'CARD': 'TARJETA',
    'TRANSFER': 'TRANSFERENCIA',
    'EFECTIVO': 'EFECTIVO',
    'TARJETA': 'TARJETA',
    'TRANSFERENCIA': 'TRANSFERENCIA',
    // OJO: un método que falte acá se cobra como EFECTIVO en silencio (bug
    // real 2026-10-25: el primer "Contrato" entró al arqueo como efectivo).
    // Hay TRES copias de este helper: acá, utils/payments.js y CentroTotal.
    'RAPPI': 'RAPPI',
    'CONTRATO': 'CONTRATO'
  };
  normalizedMethod = methodMap[normalizedMethod] || 'EFECTIVO';

  // 3) Construir payload
  const payload = {
    itemIds,
    method: normalizedMethod
  };

  // Agregar orderId si existe, sino tableId
  if (orderId != null) {
    const orderIdNum = typeof orderId === 'number' ? orderId : parseInt(orderId);
    if (!isNaN(orderIdNum) && orderIdNum > 0) {
      payload.orderId = orderIdNum;
    }
  }
  
  if (tableId != null && !payload.orderId) {
    const tableIdNum = typeof tableId === 'number' ? tableId : parseInt(tableId);
    if (!isNaN(tableIdNum) && tableIdNum > 0) {
      payload.tableId = tableIdNum;
    }
  }

  // Agregar amount si viene (opcional, solo para logs)
  if (amount != null && !isNaN(Number(amount))) {
    payload.amount = Number(amount);
  }

  // PASO 16.2.2-A: Log en desarrollo
  if (import.meta.env.DEV || process.env.NODE_ENV === 'development') {
    console.log('[payments/items payload]', payload);
  }

  return payload;
}

// embedded (2026-10): Órdenes y Mesas abren esta misma pantalla dentro de una
// hoja (components/orders/OrderWorkspace.jsx) para cobrar o modificar sin
// cambiar de página. Mesa y orden llegan por props en vez de la URL, "Volver"
// llama a onClose y, al cerrar el recibo de una orden ya pagada, la hoja se
// cierra sola. La lógica de cobro es la misma: no hay una segunda versión.
export default function DetalleMesa({ embedded = false, tableId: tableIdProp, orderId: orderIdProp, startAdding = false, onClose, registerCloseGuard } = {}) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const { tableId: tableIdParam } = useParams();
  const tableId = embedded ? String(tableIdProp) : tableIdParam;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = embedded ? (orderIdProp != null ? String(orderIdProp) : null) : searchParams.get('orderId');

  // Flujo 2026-08: sin ?orderId, Ventanilla/Domicilios ya no muestran el panel
  // viejo (NUEVA ORDEN + lista) — van directo a armar el pedido. Con ?orderId
  // (COBRAR desde Cocina, etc.) el riel de cobro de acá sigue funcionando.
  useEffect(() => {
    if (embedded || orderIdFromUrl) return;
    const n = Number(tableId);
    if (n === 9) navigate('/ventanilla', { replace: true });
    else if (n === 10) navigate('/domicilios', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, orderIdFromUrl]);

  const { isOnline } = useConnection();
  const { user } = useAuth();
  const backTo = getBackRoute(location, user);
  // Si se entró desde una tarjeta de "Listo para cobrar" (fromTab viaja junto
  // con el "from"), Volver debe reabrir esa misma pestaña en vez de caer
  // siempre en MESAS por defecto.
  const backState = location.state?.fromTab ? { tab: location.state.fromTab } : undefined;

  const [tableData, setTableData] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [loading, setLoading] = useState(true);
  const [disableReason, setDisableReason] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  // FASE F12: "Dividir por producto" — cobrar un subconjunto de items (o una
  // cantidad parcial de una fila con qty>1) por un método, y repetir para el resto.
  const [showItemSplit, setShowItemSplit] = useState(false);
  // Panel único de dividir cuenta (2026-08-04): sin preguntar el modo
  const [showDividir, setShowDividir] = useState(false);
  const itemSplitTipAppliedRef = useRef(false);
  const [tipAmount, setTipAmount] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  
  // Validar tableId al inicio
  const isValidTableId = tableId && !isNaN(parseInt(tableId)) && parseInt(tableId) > 0;

  // Crear pedido desde caja (simple)
  const [newOrderItems, setNewOrderItems] = useState([]);
  const { confirmarSalida, salirModal } = useSalirConBorrador(newOrderItems.length);
  const goBack = async () => {
    if (!(await confirmarSalida())) return;
    if (embedded) onClose?.();
    else navigate(backTo, { replace: true, state: backState });
  };
  // Dentro de la hoja de Órdenes/Mesas: la X de la hoja pregunta lo mismo
  useEffect(() => {
    registerCloseGuard?.(confirmarSalida);
  }, [registerCloseGuard, confirmarSalida]);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');
  const [editingItem, setEditingItem] = useState(null);

  // Estados para orden activa
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeOrderItems, setActiveOrderItems] = useState([]);
  // Modo cobro: "Agregar items" plegado hasta que se pida (dueño, 2026-08-03)
  const [showAddItems, setShowAddItems] = useState(embedded && startAdding);
  
  // Estados para sidebar de mesas
  const [allTables, setAllTables] = useState([]);
  
  // Estados para recibo
  const [showRecibo, setShowRecibo] = useState(false);
  const [reciboData, setReciboData] = useState(null);
  const [changeAmount, setChangeAmount] = useState(0);
  const [receivedAmount, setReceivedAmount] = useState(0);
  /** Fase 16 fix recibo: deferir clear + refresh/navigate hasta que el usuario cierre el recibo (evita parpadeo) */
  const pendingRefreshRef = useRef(null);

  // Estados para sesión de caja (FASE 9.1)
  const [cashSessionActive, setCashSessionActive] = useState(null); // null = cargando, false = no activa, true = activa
  const [initialCash, setInitialCash] = useState('');
  const [openingCash, setOpeningCash] = useState(false);
  
  // Estado para evitar doble click en cobro (FASE 10)
  const [loadingPay, setLoadingPay] = useState(false);
  
  // FASE M8.9: Ventanilla/Domicilios — múltiples órdenes, selector, NUEVA ORDEN
  const [openOrdersList, setOpenOrdersList] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [creatingNewOrder, setCreatingNewOrder] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Estados para cancelación/anulación (FASE 12.6)
  const [showCancelOrderModal, setShowCancelOrderModal] = useState(false);
  const [cancelOrderReason, setCancelOrderReason] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [showVoidItemModal, setShowVoidItemModal] = useState(false);
  // CAMBIAR DE MESA (2026-08-19): mover una orden a otra mesa física —
  // corregir mesa equivocada o pasar de Ventanilla/Domicilio a una mesa.
  const [showMoveTableModal, setShowMoveTableModal] = useState(false);
  const [freeTables, setFreeTables] = useState([]);
  const [loadingFreeTables, setLoadingFreeTables] = useState(false);
  const [movingTable, setMovingTable] = useState(false);
  // CAMBIO DE VARIANTE (2026-08): "pidió Sencilla, la quiere en Combo" —
  // item a cambiar por otra variante del mismo producto, sin anular+reagregar
  const [swapItem, setSwapItem] = useState(null);
  // Editar salsas/nota especial de un item YA agregado (en la orden o pendiente de enviar)
  const [editingSentItem, setEditingSentItem] = useState(null);
  const [editingLocalIndex, setEditingLocalIndex] = useState(null);
  // Nota de LA ORDEN (independiente de un producto puntual)
  const [showOrderNoteModal, setShowOrderNoteModal] = useState(false);
  const [orderNoteDraft, setOrderNoteDraft] = useState('');

  // Variantes hermanas: mismo product.name, distinto id (Sencillo/Combo/Doble)
  const getVariantSiblings = (item) => {
    if (!item?.product_id) return [];
    const all = Object.values(productsByCategory || {}).flat();
    const current = all.find(p => p.id === item.product_id);
    if (!current) return [];
    return all.filter(p => p.name === current.name && p.id !== current.id);
  };

  const swapItemVariant = async (item, prod) => {
    try {
      await axios.patch(`/orders/items/${item.id}`, {
        productId: prod.id,
        name: prod.displayName || prod.name,
        price: prod.price,
      });
      setSwapItem(null);
      await loadActiveOrder();
    } catch (e) {
      setSwapItem(null);
      showAlert(e.response?.data?.error || 'Error cambiando el producto');
    }
  };

  const saveSentItemNote = async ({ notes, specialNote }) => {
    await axios.patch(`/orders/items/${editingSentItem.id}`, { notes, specialNote });
    await loadActiveOrder();
    await loadTableData();
  };

  // Item aún no enviado: además de notas puede cambiar cantidad y adicionales
  // (el panel ya recalculó el precio unitario con los adicionales marcados)
  const saveLocalItemNote = async ({ notes, specialNote, price, qty }) => {
    setNewOrderItems((prev) => prev.map((it, i) => (i === editingLocalIndex
      ? { ...it, notes: notes || '', specialNote, ...(price != null ? { price } : {}), ...(qty ? { qty } : {}) }
      : it)));
  };

  const saveOrderNote = async (text) => {
    if (activeOrder && activeOrder.id) {
      await axios.patch(`/orders/${activeOrder.id}/special-note`, { specialNote: text });
      await loadActiveOrder();
    } else {
      setOrderNoteDraft(text);
    }
  };

  const [voidItemReason, setVoidItemReason] = useState('');
  const [voidingItem, setVoidingItem] = useState(false);
  const [selectedItemToVoid, setSelectedItemToVoid] = useState(null);
  const [showComprobante, setShowComprobante] = useState(false);
  const [comprobanteData, setComprobanteData] = useState(null);

  // Fix TDZ: Declarar todas las funciones loadX ANTES de los hooks que las usan
  // Convertir a function declarations para hoisting
  async function checkCashSession() {
    try {
      const res = await axios.get('/cash/session/active');
      setCashSessionActive(res.data.active);
    } catch (error) {
      console.error('Error verificando sesión de caja:', error);
      setCashSessionActive(false); // En caso de error, asumir que no hay sesión
    }
  }

  async function loadAllTables() {
    try {
      const res = await axios.get('/cash/tables');
      setAllTables(res.data || []);
    } catch (error) {
      console.error('Error cargando mesas:', error);
    }
  }

  async function openMoveTableModal() {
    setShowMoveTableModal(true);
    setLoadingFreeTables(true);
    try {
      const res = await axios.get('/tables');
      const free = (res.data || []).filter(
        (t) => t.number >= 1 && t.number <= 8 && t.status === 'libre' && t.id !== activeOrder?.table_id
      );
      setFreeTables(free);
    } catch (error) {
      console.error('Error cargando mesas libres:', error);
      showAlert('Error al cargar las mesas disponibles');
    } finally {
      setLoadingFreeTables(false);
    }
  }

  async function handleMoveTable(newTableId) {
    if (!activeOrder) return;
    setMovingTable(true);
    try {
      await axios.patch(`/orders/${activeOrder.id}/table`, { newTableId });
      setShowMoveTableModal(false);
      navigate(`/mesa/${newTableId}?orderId=${activeOrder.id}`);
    } catch (error) {
      console.error('Error moviendo orden de mesa:', error);
      showAlert(error.response?.data?.error || 'Error al cambiar de mesa');
    } finally {
      setMovingTable(false);
    }
  }

  async function loadProducts() {
    try {
      const resByCategory = await axios.get('/products');
      setProductsByCategory(resByCategory.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  }

  async function loadTableData() {
    try {
      const res = await axios.get(`/cash/table/${tableId}`);
      const data = res.data;
      setTableData(data);
      return data;
    } catch (error) {
      console.error('Error cargando detalle de mesa:', error);
      showAlert('Error al cargar la mesa');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveOrder() {
    try {
      const res = await axios.get(`/orders/table/${tableId}?active=1`);
      if (res.data) {
        const orderRes = await axios.get(`/orders/${res.data.id}`);
        setActiveOrder(orderRes.data);
        setActiveOrderItems(
          orderRes.data.items?.filter((item) => !item.paid_at && !item.voided_at) || []
        );
      } else {
        setActiveOrder(null);
        setActiveOrderItems([]);
      }
    } catch (error) {
      console.error('Error cargando orden activa:', error);
      setActiveOrder(null);
      setActiveOrderItems([]);
    }
  }

  async function loadOrderDetail(orderId) {
    if (!orderId) {
      setActiveOrder(null);
      setActiveOrderItems([]);
      return;
    }
    try {
      const res = await axios.get(`/orders/${orderId}`);
      setActiveOrder(res.data);
      setActiveOrderItems(
        res.data.items?.filter((item) => !item.paid_at && !item.voided_at) || []
      );
    } catch (error) {
      console.error('Error cargando detalle de orden:', error);
      setActiveOrder(null);
      setActiveOrderItems([]);
    }
  }

  // preferredOrderId por defecto = el ?orderId= de la URL (modo cobro): TODOS
  // los refresh (incluido el de después de pagar) deben seguir mostrando ESA
  // orden — sin esto, la vista saltaba a la orden abierta de OTRO cliente con
  // COBRAR activo (bug reproducido por agente de prueba, 2026-08-03).
  async function loadOpenOrdersByService(table, preferredOrderId = orderIdFromUrl) {
    const n = table?.number != null ? Number(table.number) : NaN;
    const service = n === 9 ? 'VENTANILLA' : n === 10 ? 'DOMICILIO' : null;
    if (!service) return;
    try {
      const res = await axios.get(`/orders/service/${service}?only_open=1`);
      const list = Array.isArray(res.data) ? res.data : [];
      setOpenOrdersList(list);
      const ids = list.map((o) => o.id);
      const preferred = preferredOrderId != null ? Number(preferredOrderId) : null;

      // La orden pedida ya no está en only_open (quedó prepagada: sus items
      // tienen paid_at, o quedó PAGADA/archivada): cargarla igual por id para
      // mostrar su estado "Pagado" en vez de caer en la primera orden ajena.
      if (preferred != null && !ids.includes(preferred)) {
        setSelectedOrderId(preferred);
        await loadOrderDetail(preferred);
        return;
      }

      const usePreferred = preferred != null && ids.includes(preferred);
      const keep = !usePreferred && selectedOrderId && ids.includes(selectedOrderId);
      const nextId = usePreferred ? preferred : keep ? selectedOrderId : list[0]?.id ?? null;
      setSelectedOrderId(nextId);
      await loadOrderDetail(nextId);
    } catch (error) {
      console.error('Error cargando órdenes por servicio:', error);
      setOpenOrdersList([]);
      setSelectedOrderId(null);
      setActiveOrder(null);
      setActiveOrderItems([]);
    }
  }

  // PASO 14.4: Recuperación automática al reconectar (después de declarar funciones)
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: true,
    onReconnect: async () => {
      const data = await loadTableData();
      if (data?.table && isSpecialTable(data.table?.number)) {
        await loadOpenOrdersByService(data.table, orderIdFromUrl);
      } else {
        await loadActiveOrder();
      }
    }
  });
  
  // FASE 16.3: Hook de refresh para órdenes archivadas (después de declarar funciones)
  const { refreshAfterPayment, refreshMesa } = useDetalleMesaRefresh({
    loadTableData,
    loadActiveOrder,
    loadOpenOrdersByService,
    navigate,
    isSpecialTable,
    tableData
  });

  // RAPPI: el pedido ya lo cobró Rappi al cliente. El único método posible es
  // "Rappi" (no entra al arqueo del día) — se preselecciona para que caja no
  // tenga que pensarlo; al salir de una orden Rappi se vuelve a Efectivo.
  const esRappi = activeOrder?.delivery_platform === 'RAPPI';
  useEffect(() => {
    if (esRappi && paymentMethod !== 'RAPPI') setPaymentMethod('RAPPI');
    if (!esRappi && paymentMethod === 'RAPPI') setPaymentMethod('EFECTIVO');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRappi]);

  useEffect(() => {
    setOpenOrdersList([]);
    setSelectedOrderId(null);
    setCreatingNewOrder(false);
    loadTableData();
    loadProducts();
    loadAllTables();
    checkCashSession();
  }, [tableId]);

  // FASE M8.9: Cargar órdenes según tipo de mesa (normales vs Ventanilla/Domicilios)
  useEffect(() => {
    if (!tableData?.table) return;
    if (isSpecialTable(tableData?.table?.number)) {
      loadOpenOrdersByService(tableData.table, orderIdFromUrl);
    } else {
      loadActiveOrder();
    }
  }, [tableData?.table?.id, orderIdFromUrl]);

  // "Recibido" (Calculadora de vuelto) es un monto que ahora limita el cobro
  // (pago parcial, ver payActiveOrder) — no puede quedar pegado de una orden
  // anterior al cambiar de orden/mesa, o dispararía un cobro parcial no
  // intencional sobre la orden nueva.
  useEffect(() => {
    setReceivedAmount(0);
  }, [activeOrder?.id]);

  // Abrir sesión de caja
  async function openCashSession() {
    const cash = parseMontoCOP(initialCash) || 0;
    if (cash < 0) {
      showAlert('El efectivo inicial no puede ser negativo');
      return;
    }

    setOpeningCash(true);
    try {
      await axios.post('/cash/open', { initialCash: cash });
      setInitialCash('');
      await checkCashSession(); // Recargar estado
      showAlert('Caja abierta correctamente');
    } catch (error) {
      console.error('Error abriendo caja:', error);
      showAlert(error.response?.data?.error || 'Error al abrir caja');
    } finally {
      setOpeningCash(false);
    }
  };

  // Escuchar eventos de WebSocket para actualizar en tiempo real
  useEffect(() => {
    // Si hay socket disponible, escuchar eventos
    const handleItemUpdate = () => {
      loadTableData();
    };

    // Nota: El socket debería venir del contexto Auth, pero por ahora usamos polling
    // En el futuro se puede mejorar con WebSocket
  }, []);

  // Funciones adicionales (no usadas en hooks iniciales, pueden quedarse aquí)

  // Agregar items a la orden activa
  const addItemsToActiveOrder = async (items) => {
    if (!activeOrder || !activeOrder.id) {
      showAlert('No hay orden activa');
      return;
    }
    
    // FASE 12.4 (ajustado F1): solo PAGADA/CANCELADO bloquean; LISTO acepta items y vuelve a EN_PREP
    if (['PAGADA', 'CANCELADO'].includes(activeOrder.status)) {
      showAlert(`Orden bloqueada. No se pueden agregar items a una orden ${statusLabel(activeOrder.status).toLowerCase()}.`);
      await loadActiveOrder();
      return;
    }

    try {
      const wasListo = activeOrder.status === 'LISTO';
      await axios.post(`/orders/${activeOrder.id}/items`, { items });
      await loadActiveOrder();
      await loadTableData();
      // Confirmación breve SOLO tras la respuesta del servidor (rediseño 2026-10)
      toast(wasListo ? 'Pedido actualizado · vuelve a cocina' : 'Pedido actualizado');
      return true;
    } catch (error) {
      console.error('Error agregando items a orden:', error);
      // FASE 12.4: Manejo de error 409 (orden bloqueada)
      if (error.response?.status === 409) {
        showAlert(error.response?.data?.error || 'Orden bloqueada. No se puede modificar.');
        await loadActiveOrder();
      } else {
        showAlert(error.response?.data?.error || 'Error al agregar items');
      }
      // false: el borrador se conserva para reintentar
      return false;
    }
  };

  // Eliminar item de la orden activa
  const deleteOrderItem = async (itemId) => {
    if (!(await showConfirm('¿Eliminar este item de la orden?'))) return;
    
    try {
      await axios.delete(`/orders/items/${itemId}`);
      await loadActiveOrder();
      await loadTableData();
    } catch (error) {
      console.error('Error eliminando item:', error);
      showAlert(error.response?.data?.error || 'Error al eliminar item');
    }
  };

  // RECIBO FINAL ÚNICO (2026-10-25): los cuatro flujos de cobro muestran el
  // recibo por acá (cobro/recibo.js arma los datos; el refresco de la pantalla
  // queda programado para cuando el cajero cierre el recibo — sin parpadeo).
  const mostrarReciboFinal = (orderData, paymentLike, { pendingItemIds = null, vuelto = 0 } = {}) => {
    setReciboData(armarRecibo({ orderData, tableData, payment: paymentLike, pendingItemIds }));
    setChangeAmount(vuelto);
    setShowRecibo(true);
    const orderId = orderData.id;
    const orderStatus = orderData.status;
    pendingRefreshRef.current = async () => {
      setActiveOrder(null);
      setActiveOrderItems([]);
      setCreatingNewOrder(false);
      setSelectedOrderId(null);
      setNewOrderItems([]);
      await refreshAfterPayment(orderId, orderStatus);
    };
  };

  // FASE F12: cobra UN grupo de items/cantidades (payloadItems: [{id, qty}]) con
  // UN método de pago, vía /payments/items (que soporta partir una fila si qty
  // pedida < qty de la fila). Se puede llamar varias veces seguidas para ir
  // cobrando la cuenta en distintos grupos hasta completarla.
  const handleItemSplitGroup = async (payloadItems, method) => {
    if (!activeOrder || !activeOrder.id) {
      throw new Error('No hay orden activa para cobrar');
    }
    // La propina (si el cajero la puso) se aplica solo en el primer grupo cobrado.
    const tip = itemSplitTipAppliedRef.current ? 0 : Math.max(0, parseMontoCOP(tipAmount) || 0);

    await axios.post('/payments/items', {
      orderId: activeOrder.id,
      itemIds: payloadItems,
      method,
      tipAmount: tip,
    });
    itemSplitTipAppliedRef.current = true;
    // La propina ya quedó cobrada: borrarla para que COBRAR o reabrir el panel no la repitan
    if (tip > 0) setTipAmount('');

    const orderRes = await axios.get(`/orders/${activeOrder.id}`);

    // Prepago (ventanilla/domicilio en cocina): la orden queda cubierta pero
    // sigue EN_PREP — saldo 0 también cuenta como "quedó pagada" para el modal.
    if (quedoPagadaFn(orderRes.data)) {
      // Quedó completamente pagada: cerrar el modal y mostrar el recibo final
      setShowItemSplit(false);
      setShowDividir(false);
      setTipAmount('');
      mostrarReciboFinal(orderRes.data, {
        method: 'Dividido por producto',
        amount: (orderRes.data.items || []).reduce((s, i) => s + (i.qty * i.price), 0),
        created_at: new Date().toISOString(),
      });
      return { fullyPaid: true };
    }

    // Pago parcial: refrescar en el mismo lugar y seguir mostrando el modal
    // con lo que queda pendiente.
    await loadActiveOrder();
    await loadTableData();
    return { fullyPaid: false };
  };

  // Panel ÚNICO "Dividir cuenta" (dueño, 2026-08-04): una parte puede ser
  // productos marcados (va por /payments/items, reutiliza handleItemSplitGroup)
  // o un monto libre (pago parcial de la orden por /payments).
  const handleDividirParte = async ({ method, amount, itemIds }) => {
    if (!activeOrder || !activeOrder.id) {
      showAlert('No hay orden activa para cobrar');
      return { fullyPaid: false };
    }
    try {
      if (itemIds && itemIds.length > 0) {
        const grupo = itemIds.map((id) => {
          const it = pendingActiveOrderItems.find((i) => i.id === id);
          return { id, qty: it?.qty || 1 };
        });
        return await handleItemSplitGroup(grupo, method);
      }

      // Monto libre: pago parcial de la orden (la propina solo en la primera parte)
      const tip = itemSplitTipAppliedRef.current ? 0 : Math.max(0, parseMontoCOP(tipAmount) || 0);
      await axios.post('/payments', { orderId: activeOrder.id, method, amount, tipAmount: tip });
      itemSplitTipAppliedRef.current = true;
      if (tip > 0) setTipAmount('');

      const orderRes = await axios.get(`/orders/${activeOrder.id}`);

      if (quedoPagadaFn(orderRes.data)) {
        setShowDividir(false);
        setTipAmount('');
        mostrarReciboFinal(orderRes.data, {
          method: 'Cuenta dividida',
          amount: (orderRes.data.items || []).reduce((s, i) => s + (i.qty * i.price), 0),
          created_at: new Date().toISOString(),
        });
        return { fullyPaid: true };
      }

      await loadActiveOrder();
      await loadTableData();
      return { fullyPaid: false };
    } catch (error) {
      console.error('Error cobrando parte de la cuenta:', error);
      showAlert(error.response?.data?.error || 'Error al cobrar esta parte');
      await loadActiveOrder();
      return { fullyPaid: false };
    }
  };

  // FASE F10: aplicar/quitar descuento desde la vista de mesa
  const applyDiscount = async (amount, reason) => {
    try {
      await axios.patch(`/orders/${activeOrder.id}/discount`, { amount, reason });
      setShowDiscount(false);
      setDiscountValue('');
      setDiscountReason('');
      await loadActiveOrder();
    } catch (error) {
      console.error('Error aplicando descuento:', error);
      showAlert(error.response?.data?.error || 'Error al aplicar el descuento');
    }
  };

  const payActiveOrder = async () => {
    // Evitar doble click (FASE 10)
    if (loadingPay) {
      return;
    }

    // FASE 9.1: Verificar sesión de caja antes de cobrar. CONTRATO no necesita
    // caja: no entra plata (la deuda se salda después en Administración → Contratos)
    if (cashSessionActive === false && paymentMethod !== 'CONTRATO') {
      showAlert('Abre la caja antes de cobrar (puede ser con $ 0)');
      return;
    }

    if (!activeOrder || !activeOrder.id) {
      showAlert('No hay orden activa para cobrar');
      return;
    }
    
    setLoadingPay(true);
    try {
      // FASE 10: Recargar items reales del pedido activo antes de cobrar
      await loadActiveOrder();
      
      // Construir pendingItemIds usando SOLO items que no estén pagados ni anulados
      const safeItems = activeOrderItems || [];
      const pendingItems = safeItems.filter(item => {
        if (!item || !item.id) return false;
        // Filtrar items pagados (paid_at existe) o anulados (voided_at existe)
        return !item.paid_at && !item.voided_at;
      });

      if (pendingItems.length === 0) {
        showAlert('No hay items pendientes para cobrar. Actualiza la mesa.');
        setLoadingPay(false);
        return;
      }

      const pendingItemIds = pendingItems.map(item => item.id);
      const total = pendingItems.reduce((sum, item) => {
        if (!item || !item.qty || !item.price) return sum;
        return sum + (item.qty * item.price);
      }, 0);

      // Validar total > 0 (FASE 9.5)
      if (total <= 0) {
        showAlert('Total inválido. Revisa precios o items.');
        setLoadingPay(false);
        return;
      }

      // Saldo REAL desde el servidor (total − descuento − pagos previos). Si
      // ya hubo un abono por monto (Dividir cuenta → monto libre, o pago
      // parcial en efectivo) y se cerró el panel, la suma de items pendientes
      // NO es lo que falta: cobrarla por items volvía a cobrar lo ya abonado
      // (bug "cobra dos veces"). En ese caso se cobra el saldo por monto.
      const discountNow = activeOrder?.discount_amount || 0;
      const freshOrderRes = await axios.get(`/orders/${activeOrder.id}`);
      const saldoReal = freshOrderRes.data?.saldo;
      const hayAbono = saldoReal != null && saldoReal < total - discountNow - 1;
      const porMonto = discountNow > 0 || hayAbono;
      const totalACobrar = porMonto
        ? Math.max(0, saldoReal ?? (total - discountNow))
        : total;
      if (totalACobrar <= 0) {
        showAlert('Esta orden ya está cubierta. Actualiza la mesa.');
        setLoadingPay(false);
        return;
      }

      // Pago parcial en efectivo: si "Recibido" (Calculadora de vuelto) es menor
      // al total, no se puede cobrar la orden completa — se registra solo lo
      // recibido como pago parcial (mismo mecanismo que "Dividir cuenta" monto
      // libre, ver handleDividirParte) y la orden sigue abierta con el saldo.
      // Propina en efectivo: sale del mismo billete que entrega el cliente, así
      // que lo recibido tiene que cubrir cuenta + propina (antes el vuelto la
      // ignoraba: cuenta 20.000 + propina 2.000, recibe 50.000 → decía 30.000).
      const tipNow = Math.max(0, parseMontoCOP(tipAmount) || 0);
      if (paymentMethod === 'EFECTIVO' && tipNow > 0 && receivedAmount >= totalACobrar && receivedAmount < totalACobrar + tipNow) {
        showAlert(
          `Recibiste ${formatPriceCOP(receivedAmount)}: alcanza para la cuenta (${formatPriceCOP(totalACobrar)}) ` +
          `pero no para la propina de ${formatPriceCOP(tipNow)}. Ajusta la propina o el monto recibido.`
        );
        setLoadingPay(false);
        return;
      }

      if (paymentMethod === 'EFECTIVO' && receivedAmount > 0 && receivedAmount < totalACobrar) {
        const pendiente = totalACobrar - receivedAmount;
        if (!(await showConfirm(
          `Recibiste ${formatPriceCOP(receivedAmount)} de ${formatPriceCOP(totalACobrar)}. ` +
          `¿Registrar como PAGO PARCIAL? Quedará pendiente ${formatPriceCOP(pendiente)}.`
        ))) {
          setLoadingPay(false);
          return;
        }

        try {
          // Sin propina en el abono: lo recibido no alcanza ni para la cuenta,
          // y registrarla acá hacía que el arqueo esperara efectivo que nunca
          // entró. La propina queda escrita para el cobro del resto.
          await axios.post('/payments', {
            orderId: activeOrder.id,
            method: paymentMethod,
            amount: receivedAmount,
            tipAmount: 0,
          });
          setReceivedAmount(0);

          const orderRes = await axios.get(`/orders/${activeOrder.id}`);

          if (quedoPagadaFn(orderRes.data)) {
            mostrarReciboFinal(orderRes.data, {
              method: paymentMethod,
              amount: receivedAmount,
              created_at: new Date().toISOString(),
            });
          } else {
            showAlert(`Pago parcial registrado: ${formatPriceCOP(receivedAmount)}. Saldo pendiente: ${formatPriceCOP(pendiente)}.`);
            await loadActiveOrder();
            await loadTableData();
          }
        } catch (error) {
          console.error('Error cobrando pago parcial:', error);
          showAlert(error.response?.data?.error || 'No se pudo registrar el pago parcial.');
          await loadActiveOrder();
        }

        setLoadingPay(false);
        return;
      }

      // CONTRATO (2026-10-25): fiado o pedido grande que pagan después. Se pide el
      // nombre; la orden se cierra normal y la deuda queda en Administración →
      // Contratos hasta marcarla pagada.
      let debtorName = null;
      if (paymentMethod === 'CONTRATO') {
        debtorName = (await showPrompt('¿A nombre de quién queda el contrato?', 'Contrato (paga después)', 'Nombre del cliente o negocio'))?.trim();
        if (!debtorName) {
          setLoadingPay(false);
          return;
        }
        if (!(await showConfirm(`¿Dejar ORDEN ${activeOrder.daily_no || activeOrder.code || activeOrder.id} por ${formatPriceCOP(totalACobrar)} como contrato a nombre de ${debtorName}? Queda pendiente en Administración → Contratos.`))) {
          setLoadingPay(false);
          return;
        }
      } else if (!(await showConfirm(`¿Cobrar ORDEN ${activeOrder.daily_no || activeOrder.code || activeOrder.id} por ${formatPriceCOP(totalACobrar)}?`))) {
        setLoadingPay(false);
        return;
      }

      // PASO 16.2.2-A: Normalizar payload
      let payload;
      try {
        payload = normalizePaymentItemsPayload({
          items: pendingItems, // pasar objetos completos para extraer IDs
          method: paymentMethod,
          tableId: tableId,
          orderId: activeOrder?.id, // preferir orderId si existe
          amount: total
        });
      } catch (normalizeError) {
        showAlert(normalizeError.message || 'Error al preparar el pago. Verifica los items seleccionados.');
        setLoadingPay(false);
        return;
      }

      // PASO 16.2.2: Instrumentación para diagnóstico del 400
      if (import.meta.env?.DEV) {
        console.log("[DEBUG payments/items] payload =", JSON.stringify(payload, null, 2));
        console.log("[DEBUG payments/items] pendingItems =", JSON.stringify(pendingItems, null, 2));
        console.log("[DEBUG payments/items] activeOrder?.id =", activeOrder?.id);
        console.log("[DEBUG payments/items] tableId =", tableId);
        console.log("[DEBUG payments/items] paymentMethod =", paymentMethod);
      }

      // FASE F10: propina opcional; con descuento o abono previo el cobro va por monto (el saldo)
      const tip = Math.max(0, parseMontoCOP(tipAmount) || 0);
      const paymentRes = porMonto
        ? await axios.post('/payments', { orderId: activeOrder.id, method: paymentMethod, amount: totalACobrar, tipAmount: tip, debtorName })
        : await axios.post('/payments/items', { ...payload, tipAmount: tip, debtorName });
      setTipAmount('');

      // Recibo final por el armador único (cobro/recibo.js): cuenta completa
      // si quedó pagada, o solo lo cubierto si fue un abono. El refresco de la
      // pantalla corre al cerrar el recibo (sin parpadeo).
      try {
        const orderRes = await axios.get(`/orders/${activeOrder.id}`);
        const payment = paymentRes.data.payments?.[0] || paymentRes.data.payment || {
          method: paymentMethod,
          amount: totalACobrar,
          created_at: new Date().toISOString()
        };

        // Vuelto si es efectivo (lo recibido viene de la Calculadora de vuelto)
        let vuelto = 0;
        if (paymentMethod === 'EFECTIVO' && receivedAmount > 0) {
          vuelto = Math.max(0, receivedAmount - totalACobrar - tip);
        }

        mostrarReciboFinal(
          orderRes.data,
          { ...payment, method: paymentMethod, amount: totalACobrar },
          { pendingItemIds, vuelto }
        );
        setReceivedAmount(0);
        setLoadingPay(false);
      } catch (error) {
        // El pago SÍ entró; solo falló armar el recibo: avisar y refrescar ya
        console.error('Error obteniendo datos para recibo:', error);
        showAlert('Pago procesado correctamente');
        setActiveOrder(null);
        setActiveOrderItems([]);
        setCreatingNewOrder(false);
        setSelectedOrderId(null);
        setNewOrderItems([]);
        setLoadingPay(false);
        await refreshMesa();
      }
      } catch (error) {
        console.error('Error procesando pago:', error);
        
        if (error.response?.status === 409) {
          showAlert(error.response?.data?.error || 'La orden no está en estado LISTO. No se puede cobrar.');
        } else if (error.response?.status === 400 &&
            (error.response?.data?.error?.includes('no son válidos') ||
             error.response?.data?.error?.includes('ya están pagados'))) {
          showAlert('Los items cambiaron (ya fueron pagados/anulados). Se actualizará la orden.');
        } else {
          showAlert(error.response?.data?.error || 'No se pudo procesar el pago. Intenta nuevamente.');
        }
        const data = await loadTableData();
        if (data?.table && isSpecialTable(data.table?.number)) {
          await loadOpenOrdersByService(data.table);
        } else {
          await loadActiveOrder();
        }
        setLoadingPay(false);
      }
  };

  // Actualizar estado de la orden activa
  const updateActiveOrderStatus = async (newStatus) => {
    if (!activeOrder || !activeOrder.id) {
      showAlert('No hay orden activa');
      return;
    }

    // Validar que la orden tenga items antes de cambiar a EN_PREP o LISTO.
    // OJO: contra activeOrder.items (todos) y solo voided_at — una orden
    // PREPAGADA tiene todos los items con paid_at y aun así debe poder
    // marcarse LISTA (ahí se cierra sola); igual que el backend.
    if (newStatus === 'EN_PREP' || newStatus === 'LISTO') {
      const items = activeOrder.items || activeOrderItems || [];
      const itemsVivos = items.filter(item => !item.voided_at);
      if (itemsVivos.length === 0) {
        showAlert('No se puede cambiar estado: la orden no tiene items.');
        return;
      }
    }

    try {
      await axios.patch(`/orders/${activeOrder.id}/status`, { status: newStatus });
      await loadActiveOrder();
      await loadTableData();
    } catch (error) {
      console.error('Error actualizando estado de orden:', error);
      showAlert(error.response?.data?.error || 'Error al actualizar estado');
    }
  };

  const createOrderFromCaja = async () => {
    if (newOrderItems.length === 0) {
      showAlert('Agrega al menos un producto');
      return;
    }

    const tableNumber = tableData?.table?.number != null ? Number(tableData.table.number) : null;
    const isSpecial = isSpecialTable(tableNumber);

    setCreatingOrder(true);
    // FASE 16.3: GUARDRAIL: one active order per table — solo mesas 1–8. Ventanilla (9) / Domicilios (10) permiten múltiples.
    // IMPORTANTE: Este bloqueo SOLO aplica para mesas normales (1-8), NO para Ventanilla/Domicilios
    if (!isSpecial && activeOrder) {
      setCreatingOrder(false);
      if (import.meta.env.DEV) {
        console.warn('[FASE M9.1] createOrderFromCaja bloqueado: ya existe orden activa (mesa normal).', {
          tableId,
          tableNumber,
          existingActiveOrderId: activeOrder?.id,
        });
      }
      showAlert('Ya existe una orden activa en esta mesa. Agrega items a la orden existente.');
      return;
    }
    // Si es mesa especial (Ventanilla/Domicilios), permitir múltiples órdenes activas sin bloqueo

    if (!(await showConfirm('¿Crear pedido y enviarlo a cocina?'))) {
      setCreatingOrder(false);
      return;
    }

    let service = 'MESA';
    if (tableNumber === 9) service = 'VENTANILLA';
    else if (tableNumber === 10) service = 'DOMICILIO';

    if (import.meta.env.DEV) {
      console.log('[FASE M9.1] createOrderFromCaja antes de POST /orders:', {
        tableId: parseInt(tableId),
        tableNumber,
        service,
        itemsCount: newOrderItems.length,
      });
    }

    try {
      const res = await axios.post('/orders', {
        tableId: parseInt(tableId),
        // Mesa especial 9/10 = VENTANILLA (con channel MESA el backend bloqueaba
        // el pago adelantado y el cobro del flujo lineal se perdía)
        channel: service === 'MESA' ? 'MESA' : 'VENTANILLA',
        service,
        items: newOrderItems,
        specialNote: orderNoteDraft.trim() || undefined,
      });

      setNewOrderItems([]);
      setOrderNoteDraft('');
      setCreatingNewOrder(false);
      toast('Pedido creado');
      if (isSpecial && tableData?.table) {
        await loadOpenOrdersByService(tableData.table);
        const newId = res.data?.order?.id ?? res.data?.id;
        if (newId) {
          setSelectedOrderId(newId);
          await loadOrderDetail(newId);
        }
      } else {
        await loadActiveOrder();
      }
      await loadTableData();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[FASE M9.1] createOrderFromCaja catch:', {
          status: error.response?.status,
          responseData: error.response?.data,
          message: error.message,
        });
      }
      console.error('Error creando pedido desde caja:', error);
      const status = error.response?.status;
      const msg = error.response?.data?.error;
      // FASE 16.3: El mensaje "Ya hay una orden activa" solo aplica para mesas normales (1-8)
      // Para Ventanilla/Domicilios, el backend ya permite múltiples órdenes (FASE M9.0)
      if ((status === 400 || status === 409) && !isSpecial) {
        showAlert('Ya hay una orden activa. Debes cerrarla o cobrarla.');
      } else {
        showAlert(msg || 'Error al crear pedido');
      }
    } finally {
      setCreatingOrder(false);
    }
  };

  const toggleItem = (itemId) => {
    const newSelected = new Set(selectedItems);
    const item = tableData.items.find(i => i.id === itemId);
    
    // Solo permitir seleccionar items no pagados
    if (item && !item.paid_at && !item.voided_at) {
      if (newSelected.has(itemId)) {
        newSelected.delete(itemId);
      } else {
        newSelected.add(itemId);
      }
      setSelectedItems(newSelected);
    }
  };

  const selectAllPending = () => {
    const pendingItems = tableData.items.filter(item => !item.paid_at && !item.voided_at);
    setSelectedItems(new Set(pendingItems.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const calculateSelectedTotal = () => {
    return Array.from(selectedItems).reduce((total, itemId) => {
      const item = tableData.items.find(i => i.id === itemId);
      return total + (item ? item.qty * item.price : 0);
    }, 0);
  };

  const processPayment = async (allItems = false) => {
    // Evitar doble click (FASE 10)
    if (loadingPay) {
      return;
    }

    setLoadingPay(true);
    try {
      // FASE 10: Recargar datos de la mesa antes de cobrar para obtener items actualizados
      await loadTableData();
      
      // Construir pendingItemIds usando SOLO items que no estén pagados ni anulados
      const currentItems = tableData?.items || [];
      let itemsToPay;
      
      if (allItems) {
        // Filtrar items pendientes reales
        const pendingItems = currentItems.filter(item => {
          if (!item || !item.id) return false;
          return !item.paid_at && !item.voided_at;
        });
        itemsToPay = pendingItems.map(item => item.id);
      } else {
        // Validar que los items seleccionados siguen siendo válidos
        const selectedItemsArray = Array.from(selectedItems);
        const validSelectedItems = currentItems.filter(item => {
          if (!item || !item.id) return false;
          return selectedItemsArray.includes(item.id) && !item.paid_at && !item.voided_at;
        });
        itemsToPay = validSelectedItems.map(item => item.id);
      }

      if (itemsToPay.length === 0) {
        showAlert('No hay items pendientes para cobrar. Actualiza la mesa.');
        setLoadingPay(false);
        return;
      }

      // Calcular total desde items válidos
      const validItems = currentItems.filter(item => itemsToPay.includes(item.id));
      const total = validItems.reduce((sum, item) => {
        if (!item || !item.qty || !item.price) return sum;
        return sum + (item.qty * item.price);
      }, 0);

      // Validar total > 0 (FASE 9.5)
      if (total <= 0) {
        showAlert('Total inválido. Revisa precios o items.');
        setLoadingPay(false);
        return;
      }

      if (!(await showConfirm(`¿Cobrar ${itemsToPay.length} item(s) por ${formatPriceCOP(total)}?`))) {
        setLoadingPay(false);
        return;
      }

      // PASO 16.2.2-A: Normalizar payload
      let payload;
      try {
        const validItemsForPayload = currentItems.filter(item => itemsToPay.includes(item.id));
        payload = normalizePaymentItemsPayload({
          items: validItemsForPayload, // pasar objetos completos para extraer IDs
          method: paymentMethod,
          tableId: tableId,
          amount: total
        });
      } catch (normalizeError) {
        showAlert(normalizeError.message || 'Error al preparar el pago. Verifica los items seleccionados.');
        setLoadingPay(false);
        return;
      }

      // PASO 16.2.2: Instrumentación para diagnóstico del 400
      if (import.meta.env?.DEV) {
        console.log("[DEBUG payments/items] payload =", JSON.stringify(payload, null, 2));
        console.log("[DEBUG payments/items] validItemsForPayload =", JSON.stringify(validItemsForPayload, null, 2));
        console.log("[DEBUG payments/items] itemsToPay =", itemsToPay);
        console.log("[DEBUG payments/items] tableId =", tableId);
        console.log("[DEBUG payments/items] paymentMethod =", paymentMethod);
      }

      await axios.post('/payments/items', payload);

      showAlert('Pago procesado correctamente');
      await loadTableData();
      setSelectedItems(new Set());
      setLoadingPay(false);
    } catch (error) {
      console.error('Error procesando pago:', error);
      
      // FASE 10: Manejo mejorado del error 400
      if (error.response?.status === 400 && 
          (error.response?.data?.error?.includes('no son válidos') || 
           error.response?.data?.error?.includes('ya están pagados'))) {
        showAlert('Los items cambiaron (ya fueron pagados/anulados). Se actualizará la orden.');
        // Forzar recarga
        await loadTableData();
        setSelectedItems(new Set());
      } else {
        showAlert(error.response?.data?.error || 'No se pudo procesar el pago. Intenta nuevamente.');
      }
      setLoadingPay(false);
    }
  };

  const voidItem = async (itemId) => {
    if (!(await showConfirm('¿Anular este item? Esta acción no se puede deshacer.'))) {
      return;
    }

    try {
      await axios.patch(`/cash/items/${itemId}/void`);
      showAlert('Item anulado correctamente');
      loadTableData();
    } catch (error) {
      console.error('Error anulando item:', error);
      showAlert(error.response?.data?.error || 'Error al anular item');
    }
  };

  const disableOrder = async (orderId) => {
    if (!(await showConfirm('¿Deshabilitar esta comanda? Se ocultará para mesero/cocina.'))) return;
    try {
      await axios.patch(`/orders/${orderId}/disable`, { reason: disableReason || null });
      setDisableReason('');
      await loadTableData();
      await loadActiveOrder();
    } catch (error) {
      console.error('Error deshabilitando comanda:', error);
      showAlert(error.response?.data?.error || 'Error al deshabilitar comanda');
    }
  };

  const enableOrder = async (orderId) => {
    if (!(await showConfirm('¿Habilitar esta comanda? Volverá a aparecer.'))) return;
    try {
      await axios.patch(`/orders/${orderId}/enable`);
      await loadTableData();
      await loadActiveOrder();
    } catch (error) {
      console.error('Error habilitando comanda:', error);
      showAlert(error.response?.data?.error || 'Error al habilitar comanda');
    }
  };

  const cancelOrder = async (orderId) => {
    const reason = await showPrompt('Motivo de cancelación (mínimo 3 caracteres):');
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) {
        showAlert('El motivo debe tener al menos 3 caracteres');
      }
      return;
    }

    if (!(await showConfirm(`¿Cancelar este pedido?\n\nMotivo: ${reason}`))) return;
    try {
      await axios.patch(`/orders/${orderId}/cancel`, { reason: reason.trim() });
      showAlert('Pedido cancelado correctamente');
      
      // FASE 16.3: Refresh inteligente - navegar si quedó archivada (CANCELADO)
      await refreshAfterPayment(orderId, 'CANCELADO');
    } catch (error) {
      console.error('Error cancelando pedido:', error);
      showAlert(error.response?.data?.error || 'Error al cancelar pedido');
    }
  };

  const deleteOrder = async (orderId) => {
    if (!(await showConfirm('¿BORRAR este pedido? (Acción irreversible, solo permitido si no tiene pagos)'))) return;
    try {
      await axios.delete(`/orders/${orderId}`);
      await loadTableData();
      await loadActiveOrder();
    } catch (error) {
      console.error('Error borrando pedido:', error);
      showAlert(error.response?.data?.error || 'Error al borrar pedido');
    }
  };

  // FASE M14: ProductPicker (compartido con Mesero) ya entrega el item listo
  // -- nombre, cantidad, precio resuelto por sabor, notas -- así que acá solo
  // se agrega al carrito, sin volver a armar el objeto.
  const addNewOrderItem = (item) => {
    setNewOrderItems((prev) => [...prev, item]);
  };

  const removeNewOrderItem = (index) => {
    setNewOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateNewOrderItem = (index, patch) => {
    setNewOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customPrice || parseMontoCOP(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }

    if (editingItem !== null) {
      // Editar item existente en la lista de nuevo pedido
      updateNewOrderItem(editingItem, {
        name: customName.trim(),
        price: parseMontoCOP(customPrice),
        qty: customQty,
        notes: customNotes,
        isCustom: true
      });
    } else {
      // Agregar nuevo item
      setNewOrderItems((prev) => [
        ...prev,
        {
          name: customName.trim(),
          qty: customQty,
          price: parseMontoCOP(customPrice),
          notes: customNotes,
          isCustom: true
        }
      ]);
    }

    setShowCustomProduct(false);
    setEditingItem(null);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
  };

  const editExistingItem = (itemId, currentName, currentPrice, currentQty, currentNotes) => {
    setEditingItem(null);
    setCustomName(currentName);
    setCustomPrice(currentPrice.toString());
    setCustomQty(currentQty);
    setCustomNotes(currentNotes || '');
    setShowCustomProduct(true);
    
    // Guardar el itemId para editar en la base de datos
    window.editingItemId = itemId;
  };

  const saveEditedItem = async () => {
    if (!customName.trim() || !customPrice || parseMontoCOP(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }

    const itemId = window.editingItemId;
    if (itemId) {
      try {
        await axios.patch(`/orders/items/${itemId}`, {
          name: customName.trim(),
          price: parseMontoCOP(customPrice),
          qty: customQty,
          notes: customNotes
        });
        showAlert('Item actualizado correctamente');
        await loadTableData();
        setShowCustomProduct(false);
        setEditingItem(null);
        setCustomName('');
        setCustomPrice('');
        setCustomQty(1);
        setCustomNotes('');
        window.editingItemId = null;
      } catch (error) {
        console.error('Error actualizando item:', error);
        // FASE 12.4: Manejo de error 409 (orden bloqueada)
        if (error.response?.status === 409) {
          showAlert(error.response?.data?.error || 'Orden bloqueada. No se puede modificar.');
          await loadActiveOrder();
        } else {
          showAlert(error.response?.data?.error || 'Error al actualizar el item');
        }
      }
    } else {
      // Si no hay itemId, es un item nuevo
      addCustomItem();
    }
  };

  // Validar tableId
  if (!isValidTableId) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        padding: '2rem',
        background: '#f8f9fa'
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '500px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#dc3545', marginBottom: '1rem' }}>Mesa no válida</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            El ID de mesa proporcionado no es válido.
          </p>
          <button
            onClick={goBack}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#F5BB4C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        background: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.1rem', color: '#666' }}>Cargando detalle de mesa...</div>
        </div>
      </div>
    );
  }

  if (!tableData) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        padding: '2rem',
        background: '#f8f9fa'
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '500px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#dc3545', marginBottom: '1rem' }}>Error al cargar la mesa</h2>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            No se pudo cargar la información de la mesa.
          </p>
          <button
            onClick={goBack}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#F5BB4C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Proteger contra null/undefined
  const safeItems = tableData.items || [];
  const pendingItems = safeItems.filter(item => item && !item.paid_at && !item.voided_at);
  const paidItems = safeItems.filter(item => item && item.paid_at);
  const voidedItems = safeItems.filter(item => item && item.voided_at);

  // Calcular total de la orden activa (proteger contra null/undefined)
  const safeActiveOrderItems = activeOrderItems || [];
  // FASE F10: total a cobrar con descuento de la orden
  const orderDiscount = activeOrder?.discount_amount || 0;
  const activeOrderTotal = safeActiveOrderItems.reduce((sum, item) => {
    if (!item || !item.qty || !item.price) return sum;
    return sum + (item.qty * item.price);
  }, 0);
  // FASE F12: items pendientes de la orden activa para "dividir por producto"
  const pendingActiveOrderItems = safeActiveOrderItems.filter(
    (item) => item && !item.paid_at && !item.voided_at
  );

  // Modo cobro (2026-08): llegando con ?orderId= (bandeja COBRAR, crear→cobrar,
  // Cocina) la pantalla es SOLO para cobrar esa orden — sin chips de órdenes,
  // sin NUEVA ORDEN y con "Agregar items" plegado.
  const modoCobro = !!orderIdFromUrl;
  const paidAmount = activeOrder?.paidAmount || 0;
  const saldoActual = activeOrder?.saldo ?? Math.max(0, activeOrderTotal - orderDiscount);
  // Prepago cubierto: pagada pero aún en cocina (se cierra sola al quedar LISTO)
  const pagadaAdelantado = !!activeOrder &&
    ['NUEVO', 'EN_PREP', 'LISTO'].includes(activeOrder.status) &&
    paidAmount > 0 && saldoActual <= 0;

  return (
    <div className={`detalle-mesa-container ${embedded ? 'is-embedded' : ''}`} style={{ minHeight: embedded ? 0 : '100vh', display: 'flex', flexDirection: 'column' }}>
      {!embedded && <header className="detalle-mesa-header" style={{ flexShrink: 0 }}>
        <button onClick={goBack} className="back-btn">← Volver</button>
        <h1>
          {tableData.table && tableData.table.number === 9 ? 'VENTANILLA' :
           tableData.table && tableData.table.number === 10 ? 'DOMICILIOS' :
           (tableData.table && tableData.table.label) || (tableData.table && `Mesa ${tableData.table.number}`) || 'Mesa'}
        </h1>
      </header>}

      <div className="detalle-mesa-content detalle-mesa-grid caja-bottom-nav-spacer" style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 350px',
        alignItems: 'start',
        gap: '1rem',
        padding: '1rem'
      }}>
        {/* COLUMNA CENTRO: Orden Activa */}
        <div className="order-center-panel" style={{
          background: '#f8f9fa',
          borderRadius: '12px',
          padding: '1.5rem',
          // clip (no auto/hidden): un contenedor con scroll propio impedía que
          // "‹ Categorías" se quedara pegado arriba al recorrer los productos
          overflowX: 'clip',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {/* Nota de la orden: independiente de agregar productos — visible
              aunque todavía no exista la orden (viaja en la creación). No se
              muestra en modo cobro (ahí la orden ya no se edita). */}
          {!modoCobro && (
            <button
              type="button"
              onClick={() => setShowOrderNoteModal(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                marginBottom: '1rem', padding: '0.7rem 0.9rem', borderRadius: '8px',
                border: 'none', textAlign: 'left', cursor: 'pointer', flexShrink: 0,
                background: (activeOrder?.special_note || orderNoteDraft) ? '#f8d7da' : '#f8f9fa',
                color: (activeOrder?.special_note || orderNoteDraft) ? '#dc3545' : '#495057',
                fontWeight: 600, fontSize: '0.9rem',
              }}
            >
              {(activeOrder?.special_note || orderNoteDraft)
                ? `Nota de toda la orden: ${activeOrder?.special_note || orderNoteDraft}`
                : '+ Nota de toda la orden (para cocina)'}
            </button>
          )}

          {/* FASE M8.9: ÓRDENES ABIERTAS + NUEVA ORDEN (solo Ventanilla/Domicilios).
              En modo cobro NO: la pantalla es solo para cobrar la orden elegida. */}
          {isSpecialTable(tableData?.table?.number) && !modoCobro && (
            <div style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
              {openOrdersList.length > 1 && (
                <>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', marginBottom: '0.5rem' }}>ÓRDENES ABIERTAS</div>
                  {/* Fila horizontal deslizable en vez de envolver en varias filas —
                      con muchas órdenes abiertas (Ventanilla/Domicilios en hora pico)
                      esto ocupaba media pantalla antes de llegar a nada más. */}
                  <div className="ordenes-abiertas-scroll">
                    {openOrdersList.map((ord, idx) => (
                      <button
                        type="button"
                        key={ord.id}
                        onClick={async () => {
                          setCreatingNewOrder(false);
                          setSelectedOrderId(ord.id);
                          await loadOrderDetail(ord.id);
                        }}
                        className="ordenes-abiertas-chip"
                        style={{
                          background: selectedOrderId === ord.id ? '#F5BB4C' : '#f8f9fa',
                          color: selectedOrderId === ord.id ? 'white' : '#6c757d',
                          border: '1px solid ' + (selectedOrderId === ord.id ? '#F5BB4C' : '#dee2e6'),
                          fontWeight: selectedOrderId === ord.id ? 'bold' : 500,
                        }}
                      >
                        {ord.daily_no ? `ORDEN ${ord.daily_no}` : ord.code || `ORDEN ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setCreatingNewOrder(true);
                  setNewOrderItems([]);
                }}
                style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem 1rem',
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  minHeight: '46px'
                }}
              >
                NUEVA ORDEN
              </button>
            </div>
          )}

          {/* Panel de orden activa o Crear Nueva Orden */}
          {!creatingNewOrder && activeOrder && activeOrder.id ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                {!embedded && <div>
                  <h2 className="pos-mobile-no-break" style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {activeOrder.daily_no ? `Orden ${activeOrder.daily_no}` : (activeOrder.code || `Orden ${activeOrder.id}`)}
                    <PlatformBadge platform={activeOrder.delivery_platform} />
                  </h2>
                  <div style={{ marginTop: '0.5rem' }}>
                    <StatusPill status={activeOrder.status} />
                  </div>
                </div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginLeft: embedded ? 'auto' : undefined }}>
                  {activeOrder.status === 'NUEVO' && (
                    <button
                      className="btn btn--primary detalle-mesa-hdr-btn"
                      onClick={async () => {
                        if (await showConfirm('¿Enviar esta orden a preparación?')) {
                          updateActiveOrderStatus('EN_PREP');
                        }
                      }}
                    >
                      Enviar a preparación
                    </button>
                  )}
                  {activeOrder.status === 'EN_PREP' && (
                    <button
                      className="btn btn--secondary detalle-mesa-hdr-btn"
                      onClick={async () => {
                        if (await showConfirm('¿Marcar esta orden como lista?')) {
                          updateActiveOrderStatus('LISTO');
                        }
                      }}
                    >
                      Marcar lista
                    </button>
                  )}

                  {/* CAMBIAR DE MESA (2026-08-19): corregir mesa equivocada o pasar
                      de Ventanilla/Domicilio a una mesa física */}
                  {activeOrder.status !== 'PAGADA' && activeOrder.status !== 'CANCELADO' && (
                    <button
                      className="btn btn--secondary detalle-mesa-hdr-btn"
                      onClick={openMoveTableModal}
                    >
                      Cambiar de mesa
                    </button>
                  )}

                  {/* FASE 12.6: Botón cancelar orden */}
                  {activeOrder.status !== 'PAGADA' && activeOrder.status !== 'CANCELADO' && (
                    <button
                      className="btn btn--destructive-ghost detalle-mesa-hdr-btn"
                      onClick={() => setShowCancelOrderModal(true)}
                      disabled={cancellingOrder}
                    >
                      {cancellingOrder ? 'Procesando…' : 'Cancelar orden'}
                    </button>
                  )}
                </div>
              </div>

              {/* FASE 12.4: Banner de bloqueo según estado (en modo cobro sobra) */}
              {activeOrder.status === 'LISTO' && !modoCobro && (
                <div style={{ 
                  padding: '1rem', 
                  background: '#d1ecf1',
                  border: '1px solid #0c5460',
                  borderRadius: '8px', 
                  marginBottom: '1rem',
                  color: '#0c5460'
                }}>
                  <strong>Orden lista para cobrar.</strong> Puedes cobrarla, o agregar items nuevos (volverá a cocina). Los items existentes ya no se pueden editar.
                </div>
              )}
              
              {/* FASE 20.C: Estados finales elegantes para órdenes cerradas */}
              {(activeOrder.status === 'PAGADA' || activeOrder.status === 'CANCELADO') && (
                <div style={{ 
                  padding: '1.5rem', 
                  background: '#f8f9fa',
                  borderRadius: '8px', 
                  marginBottom: '1.5rem',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  <div style={{ 
                    fontSize: '1rem', 
                    fontWeight: 500,
                    color: '#333',
                    marginBottom: '0.25rem'
                  }}>
                    {activeOrder.status === 'PAGADA' 
                      ? 'Esta orden ya fue cobrada.'
                      : 'Esta orden fue cancelada.'}
                  </div>
                </div>
              )}
              
              {/* Items de la orden activa (si quedó prepagada, los items ya
                  tienen paid_at y el detalle se ve en el panel de la derecha) */}
              {safeActiveOrderItems.length === 0 ? (
                pagadaAdelantado ? null : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#666', marginBottom: '1rem' }}>
                    No hay items pendientes en esta orden
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  {safeActiveOrderItems.map(item => {
                    if (!item || !item.id) return null;
                    return (
                    <div key={item.id} style={{
                      padding: '1rem',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', fontSize: '1rem' }}>
                          {item.name}
                          {Boolean(item.is_custom) && (
                            <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>
                          )}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.9rem' }}>
                          {item.qty}x {formatPriceCOP(item.price)} = {formatPriceCOP(item.qty * item.price)}
                          {item.notes && <span> • {item.notes}</span>}
                        </div>
                        {item.special_note && (
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc3545', marginTop: '0.2rem' }}>
                            Nota: {item.special_note}
                          </div>
                        )}
                      </div>
                      {/* Orden prepagada: los items ya no se editan (el pago cubrió el total) */}
                      {['NUEVO', 'EN_PREP'].includes(activeOrder.status) && !pagadaAdelantado && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              const newQty = Math.max(1, item.qty - 1);
                              axios.patch(`/orders/items/${item.id}`, { qty: newQty })
                                .then(() => loadActiveOrder())
                                .then(() => loadTableData())
                                .catch(err => {
                                  // FASE 12.4: Manejo de error 409 (orden bloqueada)
                                  if (err.response?.status === 409) {
                                    showAlert(err.response?.data?.error || 'Orden bloqueada. No se puede modificar.');
                                    loadActiveOrder();
                                  } else {
                                    showAlert(err.response?.data?.error || 'Error al actualizar cantidad');
                                  }
                                });
                            }}
                            style={{ 
                              padding: '0.5rem 0.75rem', 
                              background: '#6c757d', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '6px', 
                              cursor: 'pointer',
                              fontSize: '1.1rem',
                              fontWeight: 'bold'
                            }}
                          >
                            −
                          </button>
                          <span style={{ minWidth: '40px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>{item.qty}</span>
                          <button
                            onClick={() => {
                              const newQty = item.qty + 1;
                              axios.patch(`/orders/items/${item.id}`, { qty: newQty })
                                .then(() => loadActiveOrder())
                                .then(() => loadTableData())
                                .catch(err => {
                                  // FASE 12.4: Manejo de error 409 (orden bloqueada)
                                  if (err.response?.status === 409) {
                                    showAlert(err.response?.data?.error || 'Orden bloqueada. No se puede modificar.');
                                    loadActiveOrder();
                                  } else {
                                    showAlert(err.response?.data?.error || 'Error al actualizar cantidad');
                                  }
                                });
                            }}
                            style={{ 
                              padding: '0.5rem 0.75rem', 
                              background: '#F5BB4C', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '6px', 
                              cursor: 'pointer',
                              fontSize: '1.1rem',
                              fontWeight: 'bold'
                            }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => deleteOrderItem(item.id)}
                            style={{ 
                              padding: '0.5rem 0.75rem', 
                              background: '#dc3545', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '6px', 
                              cursor: 'pointer',
                              fontSize: '1.1rem',
                              fontWeight: 'bold'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      
                      {/* Editar salsas/nota especial de un item YA agregado —
                          antes quedaba fijo tras agregarlo (había que anular y
                          reagregar para corregir una salsa olvidada). */}
                      {!item.paid_at && !item.voided_at && ['NUEVO', 'EN_PREP'].includes(activeOrder.status) && (
                        <button
                          onClick={() => setEditingSentItem(item)}
                          style={{
                            padding: '0.5rem 0.85rem',
                            minHeight: 40,
                            background: 'var(--gray-50)',
                            color: 'var(--gray-900)',
                            border: 'none',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 600
                          }}
                        >
                          Nota
                        </button>
                      )}

                      {/* CAMBIO DE VARIANTE: solo si el producto tiene hermanas
                          (mismo nombre, otra variante: Sencillo/Combo) y la orden
                          aún es editable (NUEVO/EN_PREP, regla del backend) */}
                      {!item.paid_at && !item.voided_at && ['NUEVO', 'EN_PREP'].includes(activeOrder.status)
                        && getVariantSiblings(item).length > 0 && (
                        <button
                          onClick={() => setSwapItem(item)}
                          style={{
                            padding: '0.5rem 0.85rem',
                            minHeight: 40,
                            background: 'var(--gray-50)',
                            color: 'var(--gray-900)',
                            border: 'none',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '0.8125rem',
                            fontWeight: 600
                          }}
                        >
                          Cambiar
                        </button>
                      )}

                      {/* FASE 12.6: Botón anular item — solo cuando la orden YA NO es editable
                          (NUEVO/EN_PREP tienen arriba su propio +/-/✕ para ajustar sin necesitar
                          un anular con motivo; mostrar ambos a la vez era redundante y apretado). */}
                      {!item.paid_at && !item.voided_at && !['NUEVO', 'EN_PREP'].includes(activeOrder.status) && (
                        <button
                          className="btn btn--destructive-ghost btn--sm"
                          onClick={() => {
                            setSelectedItemToVoid(item);
                            setShowVoidItemModal(true);
                          }}
                          disabled={voidingItem && selectedItemToVoid?.id === item.id}
                        >
                          {(voidingItem && selectedItemToVoid?.id === item.id) ? 'Procesando…' : 'Anular'}
                        </button>
                      )}
                      
                      {/* Badge si está anulado */}
                      {item.voided_at && (
                        <div style={{ 
                          padding: '0.5rem 0.75rem', 
                          background: '#f8d7da', 
                          color: '#721c24',
                          border: '1px solid #dc3545',
                          borderRadius: '6px', 
                          fontSize: '0.85rem',
                          fontWeight: 'bold'
                        }}>
                          ANULADO
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}

              {/* Formulario para agregar items (NUEVO, EN_PREP o LISTO; LISTO vuelve a cocina).
                  En modo cobro va PLEGADO: un botón discreto lo abre — el panel completo
                  enterraba el cobro al fondo de la página (dueño, 2026-08-03). */}
              {['NUEVO', 'EN_PREP', 'LISTO'].includes(activeOrder.status) && modoCobro && !showAddItems && (
                <button
                  type="button"
                  onClick={() => setShowAddItems(true)}
                  style={{
                    padding: '0.7rem 1rem',
                    background: 'transparent',
                    border: '1.5px dashed #F5BB4C',
                    borderRadius: '10px',
                    color: '#B8860B',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    minHeight: '46px'
                  }}
                >
                  + Agregar productos
                </button>
              )}
              {['NUEVO', 'EN_PREP', 'LISTO'].includes(activeOrder.status) && (!modoCobro || showAddItems) && (
                <div className="detalle-mesa-add-items-box" style={{
                  background: 'white',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  border: '2px solid #F5BB4C',
                  marginTop: '1rem'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    Agregar Items
                  </h3>

                  <ProductPicker productsByCategory={productsByCategory} onAdd={addNewOrderItem} draftItems={newOrderItems} />

                  {newOrderItems.length > 0 && (
                    <div className="new-order-list" style={{ marginTop: '1rem' }}>
                      {newOrderItems.map((it, idx) => (
                        <div key={idx} className="item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', marginBottom: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => setEditingLocalIndex(idx)}
                            style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 }}
                          >
                            <div style={{ fontWeight: 'bold' }}>
                              {it.name}
                              {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#666' }}>
                              Cantidad: {it.qty} {it.notes && `• ${it.notes}`}
                              <span style={{ color: '#1971c2', marginLeft: '0.4rem' }}>editar</span>
                            </div>
                            {it.specialNote && (
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c0392b' }}>Nota: {it.specialNote}</div>
                            )}
                          </button>
                          <button onClick={() => removeNewOrderItem(idx)} className="remove-btn">×</button>
                        </div>
                      ))}
                      <button
                        className="pay-all-btn"
                        onClick={async () => {
                          // Solo se vacía el borrador si el servidor lo guardó
                          // (antes se perdía aunque fallara la petición)
                          if (await addItemsToActiveOrder(newOrderItems)) setNewOrderItems([]);
                        }}
                        style={{
                          width: '100%',
                          padding: '1rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          fontWeight: 'bold',
                          marginTop: '1rem'
                        }}
                      >
                        AGREGAR ITEMS
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* No hay orden activa - Mostrar formulario crear orden */
            <div>
              <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
                Crear Nueva Orden
              </h2>

              <ProductPicker productsByCategory={productsByCategory} onAdd={addNewOrderItem} draftItems={newOrderItems} />

              {newOrderItems.length > 0 && (
                <div className="new-order-list" style={{
                  background: 'white',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '2px solid #F5BB4C',
                  marginTop: '1rem'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>Items a agregar <span className="draft-tag">Borrador · sin enviar</span></h3>
                  {newOrderItems.map((it, idx) => (
                    <div key={idx} className="item-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', marginBottom: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setEditingLocalIndex(idx)}
                        style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0, flex: 1, minWidth: 0 }}
                      >
                        <div style={{ fontWeight: 'bold' }}>
                          {it.name}
                          {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>
                          {it.qty}x {formatPriceCOP(it.price)} = {formatPriceCOP(it.qty * it.price)}
                          {it.notes && ` • ${it.notes}`}
                          <span style={{ color: '#1971c2', marginLeft: '0.4rem' }}>editar</span>
                        </div>
                        {it.specialNote && (
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c0392b' }}>Nota: {it.specialNote}</div>
                        )}
                      </button>
                      <button onClick={() => removeNewOrderItem(idx)} className="remove-btn">×</button>
                    </div>
                  ))}
                  <button
                    className="pay-all-btn"
                    disabled={creatingOrder}
                    onClick={async () => {
                      await createOrderFromCaja();
                    }}
                    style={{
                      width: '100%',
                      padding: '1rem',
                      background: creatingOrder ? '#6c757d' : '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: creatingOrder ? 'not-allowed' : 'pointer',
                      fontSize: '1.1rem',
                      fontWeight: 'bold',
                      marginTop: '1rem'
                    }}
                  >
                    {creatingOrder ? 'CREANDO...' : 'CREAR Y ENVIAR'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: Resumen y Cobro — extraída a cobro/RielCobro.jsx
            (2026-10-25). Presentación pura: el estado y payActiveOrder siguen acá. */}
        <RielCobro
          cashSessionActive={cashSessionActive}
          initialCash={initialCash}
          setInitialCash={setInitialCash}
          openingCash={openingCash}
          onAbrirCaja={openCashSession}
          activeOrder={activeOrder}
          activeOrderItems={activeOrderItems}
          activeOrderTotal={activeOrderTotal}
          orderDiscount={orderDiscount}
          paidAmount={paidAmount}
          saldoActual={saldoActual}
          pagadaAdelantado={pagadaAdelantado}
          esRappi={esRappi}
          esMesaEspecial={isSpecialTable(tableData?.table?.number)}
          estadoPill={activeOrder?.id ? <StatusPill status={activeOrder.status} /> : null}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          onCalculadora={() => setShowCalculator(true)}
          tipAmount={tipAmount}
          setTipAmount={setTipAmount}
          onDescuento={() => setShowDiscount(true)}
          isOnline={isOnline}
          isRefreshingOnReconnect={isRefreshingOnReconnect}
          loadingPay={loadingPay}
          onCobrar={payActiveOrder}
          onDividir={() => { itemSplitTipAppliedRef.current = false; setShowDividir(true); }}
        />
      </div>
      {/* Modal para producto personalizado */}
      {showCustomProduct && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-content" style={{ background: 'white', padding: '2rem', borderRadius: '12px', maxWidth: '500px', width: '90%' }}>
            <h3>{window.editingItemId ? 'Editar Producto Personalizado' : 'Producto Personalizado (OTRO)'}</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Nombre del Producto *</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ej: Comida especial"
                style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Precio Unitario (COP) *</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="100"
                  style={{ flex: 1, padding: '0.5rem', fontSize: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseMontoCOP(customPrice) || 0;
                    setCustomPrice((current + 500).toString());
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold'
                  }}
                >
                  +500
                </button>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Cantidad</label>
              <div className="qty-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setCustomQty(Math.max(1, customQty - 1))} style={{ padding: '0.5rem 1rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>−</button>
                <input 
                  type="number" 
                  value={customQty} 
                  onChange={(e) => setCustomQty(parseInt(e.target.value) || 1)} 
                  min="1"
                  style={{ width: '80px', padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd', borderRadius: '6px' }}
                />
                <button onClick={() => setCustomQty(customQty + 1)} style={{ padding: '0.5rem 1rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>+</button>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Notas</label>
              <input
                type="text"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Opcional"
                style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={window.editingItemId ? saveEditedItem : addCustomItem} 
                className="add-item-btn"
                style={{ flex: 1, padding: '0.75rem', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {window.editingItemId ? 'Guardar Cambios' : 'Agregar'}
              </button>
              <button 
                onClick={() => {
                  setShowCustomProduct(false);
                  setEditingItem(null);
                  setCustomName('');
                  setCustomPrice('');
                  setCustomQty(1);
                  setCustomNotes('');
                  window.editingItemId = null;
                }}
                style={{ flex: 1, padding: '0.75rem', background: '#ccc', color: 'black', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FASE F10: modal de descuento */}
      {activeOrder && (
        <Modal open={showDiscount} onClose={() => setShowDiscount(false)} title="Descuento de la orden"
          actions={<>
            {orderDiscount > 0 && (
              <button className="btn-secondary" onClick={() => applyDiscount(0, '')}>Quitar descuento</button>
            )}
            <button className="btn-secondary" onClick={() => setShowDiscount(false)}>Volver</button>
            <button className="btn-chanatos" onClick={() => applyDiscount(Math.max(0, parseMontoCOP(discountValue) || 0), discountReason.trim())}>
              Aplicar
            </button>
          </>}>
          <p>Subtotal de la orden: <strong>{formatPriceCOP(activeOrderTotal)}</strong></p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="Monto del descuento"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              autoFocus
              style={{ flex: '1 1 140px', minWidth: 0, height: '42px', padding: '0 12px', border: '1.5px solid #e5e5e5', borderRadius: '8px' }}
            />
            {[10, 20, 50].map(pct => (
              <button key={pct} type="button"
                onClick={() => setDiscountValue(String(Math.round(activeOrderTotal * pct / 100)))}
                style={{ flex: '0 0 auto', padding: '0 12px', height: '42px', border: '1.5px solid #F5BB4C', background: '#FFF8E7', color: '#B8860B', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {pct}%
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Motivo (obligatorio, ej: cliente frecuente)"
            value={discountReason}
            onChange={(e) => setDiscountReason(e.target.value)}
            style={{ width: '100%', height: '42px', padding: '0 12px', border: '1.5px solid #e5e5e5', borderRadius: '8px' }}
          />
        </Modal>
      )}

      {/* Panel único "Dividir cuenta" (2026-08-04): marcar productos y/o monto
          libre, método y cobrar por partes hasta completar — sin elegir modo */}
      {showDividir && activeOrder && (
        <DividirCuenta
          items={pendingActiveOrderItems}
          saldo={saldoActual}
          soloMonto={orderDiscount > 0}
          onCobrarParte={handleDividirParte}
          onCancel={() => setShowDividir(false)}
        />
      )}

      {/* Calculadora de vuelto (el monto recibido alimenta el vuelto del recibo).
          Sobre el SALDO, no el total: con un abono previo el vuelto salía de
          menos (cuenta 32.000 con 10.000 abonados, recibe 50.000 → decía 18.000) */}
      {showCalculator && activeOrder && (
        <CalculadoraVuelto
          total={saldoActual}
          propina={itemSplitTipAppliedRef.current ? 0 : Math.max(0, parseMontoCOP(tipAmount) || 0)}
          onClose={() => setShowCalculator(false)}
          onConfirm={(recibido) => setReceivedAmount(recibido)}
        />
      )}

      {salirModal}

      {/* Recibo */}
      {showRecibo && reciboData && (
        <Recibo
          order={reciboData.order}
          payment={reciboData.payment}
          items={reciboData.items}
          changeAmount={changeAmount}
          celebrate
          onClose={() => {
            const quedoPagada = reciboData.order?.status === 'PAGADA' ||
              (reciboData.order?.saldo != null && Number(reciboData.order.saldo) <= 0);
            setShowRecibo(false);
            setReciboData(null);
            setChangeAmount(0);
            const fn = pendingRefreshRef.current;
            pendingRefreshRef.current = null;
            if (fn) fn();
            // Dentro de la hoja de Órdenes/Mesas: cobrada la orden, se vuelve a la lista
            if (embedded && quedoPagada) onClose?.();
          }}
          onPrint={() => {
            // Opcional: callback después de imprimir
          }}
        />
      )}
      {/* FASE 12.6: Modal cancelar orden */}
      {showCancelOrderModal && activeOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            padding: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.3rem', color: '#dc3545' }}>
              Cancelar Orden
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                Orden: {activeOrder.daily_no ? `ORDEN ${activeOrder.daily_no}` : (activeOrder.code || `#${activeOrder.id}`)}
              </div>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                Estado: {statusLabel(activeOrder.status)}
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Motivo de cancelación (mínimo 5 caracteres) *
            </label>
            <textarea
              value={cancelOrderReason}
              onChange={(e) => setCancelOrderReason(e.target.value)}
              placeholder="Ingrese el motivo de la cancelación..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem',
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setShowCancelOrderModal(false);
                  setCancelOrderReason('');
                }}
                disabled={cancellingOrder}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: cancellingOrder ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  flex: 1,
                  opacity: cancellingOrder ? 0.6 : 1
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!cancelOrderReason.trim() || cancelOrderReason.trim().length < 5) {
                    showAlert('El motivo debe tener al menos 5 caracteres');
                    return;
                  }

                  if (!(await showConfirm(`¿Confirma cancelar esta orden?\n\nMotivo: ${cancelOrderReason.trim()}`))) {
                    return;
                  }

                  setCancellingOrder(true);
                  try {
                    const res = await axios.post(`/orders/${activeOrder.id}/cancel`, {
                      reason: cancelOrderReason.trim()
                    });
                    
                    // Obtener orden actualizada con items
                    const orderRes = await axios.get(`/orders/${activeOrder.id}`);
                    const orderData = orderRes.data;
                    
                    // Usar items_voided_list del backend o filtrar desde la orden
                    const voidedItems = res.data.items_voided_list || orderData.items?.filter(item => item.voided_at) || [];
                    
                    // Mostrar comprobante
                    setComprobanteData({
                      type: 'ORDER',
                      order: {
                        ...orderData,
                        table: tableData?.table
                      },
                      reason: cancelOrderReason.trim(),
                      user: { id: res.data.cancelled_by, name: res.data.cancelled_by_name || 'Usuario' },
                      itemsVoided: voidedItems
                    });
                    setShowComprobante(true);
                    
                    // FASE 16.3: Refresh inteligente - navegar si quedó archivada (CANCELADO)
                    await refreshAfterPayment(activeOrder.id, 'CANCELADO');
                    
                    setShowCancelOrderModal(false);
                    setCancelOrderReason('');
                  } catch (error) {
                    console.error('Error cancelando orden:', error);
                    if (error.response?.status === 409) {
                      showAlert(error.response?.data?.error || 'No se puede cancelar la orden. Hay pagos registrados.');
                    } else {
                      showAlert(error.response?.data?.error || 'Error al cancelar orden');
                    }
                  } finally {
                    setCancellingOrder(false);
                  }
                }}
                disabled={cancellingOrder || !cancelOrderReason.trim() || cancelOrderReason.trim().length < 5}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (cancellingOrder || !cancelOrderReason.trim() || cancelOrderReason.trim().length < 5) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  flex: 1,
                  opacity: (cancellingOrder || !cancelOrderReason.trim() || cancelOrderReason.trim().length < 5) ? 0.6 : 1
                }}
              >
                {cancellingOrder ? 'Cancelando...' : 'Confirmar Cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAMBIAR DE MESA (2026-08-19) */}
      {showMoveTableModal && activeOrder && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            padding: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.3rem', color: '#0d6efd' }}>
              Cambiar de mesa
            </h3>
            <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#666' }}>
              Orden {activeOrder.daily_no ? `ORDEN ${activeOrder.daily_no}` : (activeOrder.code || `#${activeOrder.id}`)} — mesa actual: {activeOrder.table_label || 'Sin mesa'}
            </div>

            {loadingFreeTables ? (
              <div style={{ padding: '1rem 0', color: '#666' }}>Cargando mesas disponibles...</div>
            ) : freeTables.length === 0 ? (
              <div style={{ padding: '1rem 0', color: '#666' }}>No hay mesas libres en este momento.</div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                gap: '0.6rem',
                marginBottom: '1rem'
              }}>
                {freeTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleMoveTable(t.id)}
                    disabled={movingTable}
                    style={{
                      padding: '1rem 0.5rem',
                      background: '#e7f1ff',
                      color: '#0d6efd',
                      border: '2px solid #0d6efd',
                      borderRadius: '8px',
                      cursor: movingTable ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                      opacity: movingTable ? 0.6 : 1
                    }}
                  >
                    {t.label || `Mesa ${t.number}`}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowMoveTableModal(false)}
              disabled={movingTable}
              style={{
                width: '100%',
                padding: '0.75rem 1.5rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: movingTable ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                opacity: movingTable ? 0.6 : 1
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* FASE 12.6: Modal anular item */}
      {showVoidItemModal && selectedItemToVoid && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            padding: '1.5rem'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.3rem', color: '#ff9800' }}>
              Anular Item
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                Item: {selectedItemToVoid.name}
              </div>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                Cantidad: {selectedItemToVoid.qty} x {formatPriceCOP(selectedItemToVoid.price)}
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Motivo de anulación (mínimo 5 caracteres) *
            </label>
            <textarea
              value={voidItemReason}
              onChange={(e) => setVoidItemReason(e.target.value)}
              placeholder="Ingrese el motivo de la anulación..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem',
                resize: 'vertical',
                marginBottom: '1rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setShowVoidItemModal(false);
                  setVoidItemReason('');
                  setSelectedItemToVoid(null);
                }}
                disabled={voidingItem}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: voidingItem ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  flex: 1,
                  opacity: voidingItem ? 0.6 : 1
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!voidItemReason.trim() || voidItemReason.trim().length < 5) {
                    showAlert('El motivo debe tener al menos 5 caracteres');
                    return;
                  }

                  if (!(await showConfirm(`¿Confirma anular este item?\n\nMotivo: ${voidItemReason.trim()}`))) {
                    return;
                  }

                  setVoidingItem(true);
                  try {
                    const res = await axios.post(`/orders/items/${selectedItemToVoid.id}/void`, {
                      reason: voidItemReason.trim()
                    });
                    
                    // Obtener orden actualizada
                    const orderRes = await axios.get(`/orders/${activeOrder.id}`);
                    const orderData = orderRes.data;
                    
                    // Mostrar comprobante
                    setComprobanteData({
                      type: 'ITEM',
                      order: {
                        ...orderData,
                        table: tableData?.table
                      },
                      item: selectedItemToVoid,
                      reason: voidItemReason.trim(),
                      user: { id: res.data.voided_by, name: res.data.voided_by_name || 'Usuario' }
                    });
                    setShowComprobante(true);
                    
                    await loadActiveOrder();
                    await loadTableData();
                    setShowVoidItemModal(false);
                    setVoidItemReason('');
                    setSelectedItemToVoid(null);
                  } catch (error) {
                    console.error('Error anulando item:', error);
                    if (error.response?.status === 409) {
                      showAlert(error.response?.data?.error || 'No se puede anular el item. Ya está pagado o anulado.');
                    } else {
                      showAlert(error.response?.data?.error || 'Error al anular item');
                    }
                  } finally {
                    setVoidingItem(false);
                  }
                }}
                disabled={voidingItem || !voidItemReason.trim() || voidItemReason.trim().length < 5}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (voidingItem || !voidItemReason.trim() || voidItemReason.trim().length < 5) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  flex: 1,
                  opacity: (voidingItem || !voidItemReason.trim() || voidItemReason.trim().length < 5) ? 0.6 : 1
                }}
              >
                {voidingItem ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FASE 12.6: Modal comprobante de anulación */}
      {showComprobante && comprobanteData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem'
          }}>
            <ComprobanteAnulacion
              type={comprobanteData.type}
              order={comprobanteData.order}
              item={comprobanteData.item}
              reason={comprobanteData.reason}
              user={comprobanteData.user}
              itemsVoided={comprobanteData.itemsVoided}
              onClose={() => {
                setShowComprobante(false);
                setComprobanteData(null);
              }}
              onPrint={() => {
                window.print();
              }}
            />
          </div>
        </div>
      )}
      {/* Cambio de variante: lista de hermanas del mismo producto */}
      <Modal open={!!swapItem} onClose={() => setSwapItem(null)} title="Cambiar producto">
        {swapItem && (
          <>
            <p style={{ margin: '0 0 0.9rem', color: 'var(--gray-600)', fontSize: '0.9375rem' }}>
              Cambiar <strong>{swapItem.name}</strong> por:
            </p>
            <div className="list-group list-group--inset">
              {getVariantSiblings(swapItem).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="list-row list-row--tap"
                  style={{ cursor: 'pointer' }}
                  onClick={() => swapItemVariant(swapItem, p)}
                >
                  <span className="list-row__main">{p.displayName || p.name}</span>
                  <span className="tnum" style={{ fontWeight: 700 }}>{formatPriceCOP(p.price)}</span>
                </button>
              ))}
            </div>
            <p style={{ margin: '0.9rem 0 0', color: 'var(--gray-500)', fontSize: '0.8125rem' }}>
              Las notas y salsas del plato se conservan; el total se ajusta solo.
            </p>
          </>
        )}
      </Modal>

      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />

      <OrderNoteModal
        open={showOrderNoteModal}
        value={activeOrder?.special_note || orderNoteDraft}
        onClose={() => setShowOrderNoteModal(false)}
        onSave={saveOrderNote}
      />

      <EditItemNoteModal
        open={!!editingSentItem}
        item={editingSentItem}
        product={editingSentItem ? findProductById(productsByCategory, editingSentItem.product_id).product : null}
        onClose={() => setEditingSentItem(null)}
        onSave={saveSentItemNote}
      />

      <EditItemNoteModal
        open={editingLocalIndex !== null}
        item={editingLocalIndex !== null ? newOrderItems[editingLocalIndex] : null}
        product={editingLocalIndex !== null ? findProductById(productsByCategory, newOrderItems[editingLocalIndex]?.product_id).product : null}
        onClose={() => setEditingLocalIndex(null)}
        onSave={saveLocalItemNote}
        adicionales={getAdicionales(productsByCategory)}
        allowAdicionales
        allowQty
      />
    </div>
  );
}

