import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import CalculadoraVuelto from '../../components/CalculadoraVuelto.jsx';
import Recibo from '../../components/Recibo.jsx';
import ComprobanteAnulacion from '../../components/ComprobanteAnulacion.jsx';
import SalsasChips from '../../components/SalsasChips';
import PagoDividido from '../../components/caja/PagoDividido.jsx';
import { useConnection } from '../../contexts/ConnectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import { useDetalleMesaRefresh } from '../../hooks/useOrdersRefresh.js';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

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
    return '/centro-total'; // Panel de caja
  }
  if (user?.role === 'MESERO') {
    return '/'; // Panel de mesero
  }

  // 3) Último fallback
  return '/centro-total';
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
    'TRANSFERENCIA': 'TRANSFERENCIA'
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

export default function DetalleMesa() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const { tableId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get('orderId');
  const { isOnline } = useConnection();
  const { user } = useAuth();
  const backTo = getBackRoute(location, user);
  
  const [tableData, setTableData] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [loading, setLoading] = useState(true);
  const [disableReason, setDisableReason] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  
  // Validar tableId al inicio
  const isValidTableId = tableId && !isNaN(parseInt(tableId)) && parseInt(tableId) > 0;

  // Crear pedido desde caja (simple)
  const [newOrderItems, setNewOrderItems] = useState([]);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');
  const [editingItem, setEditingItem] = useState(null);

  // Estados para orden activa
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeOrderItems, setActiveOrderItems] = useState([]);
  
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

  async function loadProducts() {
    try {
      const res = await axios.get('/products/flat');
      setProducts(res.data);
      // También obtener productos por categoría
      const resByCategory = await axios.get('/products');
      setProductsByCategory(resByCategory.data);
      // Seleccionar primera categoría por defecto
      const categories = Object.keys(resByCategory.data);
      if (categories.length > 0) {
        setSelectedCategory(categories[0]);
      }
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

  async function loadOpenOrdersByService(table, preferredOrderId) {
    const n = table?.number != null ? Number(table.number) : NaN;
    const service = n === 9 ? 'VENTANILLA' : n === 10 ? 'DOMICILIO' : null;
    if (!service) return;
    try {
      const res = await axios.get(`/orders/service/${service}?only_open=1`);
      const list = Array.isArray(res.data) ? res.data : [];
      setOpenOrdersList(list);
      const ids = list.map((o) => o.id);
      const preferred = preferredOrderId != null ? Number(preferredOrderId) : null;
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

  // Abrir sesión de caja
  async function openCashSession() {
    const cash = parseFloat(initialCash) || 0;
    if (cash < 0) {
      showAlert('El efectivo inicial no puede ser negativo');
      return;
    }

    setOpeningCash(true);
    try {
      await axios.post('/cash/open', { initialCash: cash });
      setInitialCash('');
      await checkCashSession(); // Recargar estado
      showAlert('✅ Caja abierta correctamente');
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
      showAlert(`Orden bloqueada. No se pueden agregar items cuando la orden está en estado ${activeOrder.status}.`);
      await loadActiveOrder();
      return;
    }

    try {
      const wasListo = activeOrder.status === 'LISTO';
      await axios.post(`/orders/${activeOrder.id}/items`, { items });
      await loadActiveOrder();
      await loadTableData();
      showAlert(wasListo ? 'Items agregados. La orden volvió a cocina para preparar lo nuevo.' : 'Items agregados correctamente');
    } catch (error) {
      console.error('Error agregando items a orden:', error);
      // FASE 12.4: Manejo de error 409 (orden bloqueada)
      if (error.response?.status === 409) {
        showAlert(error.response?.data?.error || 'Orden bloqueada. No se puede modificar.');
        await loadActiveOrder();
      } else {
        showAlert(error.response?.data?.error || 'Error al agregar items');
      }
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

  // Cobrar la orden activa
  // FASE F9: pago dividido desde la vista de mesa (varios métodos en un cobro)
  const processSplitPayment = async (paymentLines) => {
    try {
      await axios.post('/payments', { orderId: activeOrder.id, payments: paymentLines });
      setShowSplit(false);

      // Recibo con los métodos combinados
      try {
        const orderRes = await axios.get(`/orders/${activeOrder.id}`);
        setReciboData({
          order: {
            ...orderRes.data,
            table_label: tableData?.table?.label ||
              (tableData?.table?.number ? `Mesa ${tableData.table.number}` : 'Sin mesa'),
          },
          payment: {
            method: paymentLines.map(l => l.method).join(' + '),
            amount: paymentLines.reduce((s, l) => s + l.amount, 0),
            created_at: new Date().toISOString(),
          },
          items: orderRes.data.items || [],
        });
        setChangeAmount(0);
        setShowRecibo(true);
      } catch (reciboError) {
        console.error('Error preparando recibo:', reciboError);
        showAlert('Pago dividido procesado correctamente');
      }

      await loadActiveOrder();
      await loadTableData();
    } catch (error) {
      console.error('Error procesando pago dividido:', error);
      setShowSplit(false);
      showAlert(error.response?.data?.error || 'Error al procesar el pago dividido');
    }
  };

  const payActiveOrder = async () => {
    // Evitar doble click (FASE 10)
    if (loadingPay) {
      return;
    }

    // FASE 9.1: Verificar sesión de caja antes de cobrar
    if (cashSessionActive === false) {
      showAlert('⚠️ Debes ABRIR CAJA antes de cobrar');
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

      if (!(await showConfirm(`¿Cobrar ORDEN ${activeOrder.daily_no || activeOrder.code || activeOrder.id} por ${formatPriceCOP(total)}?`))) {
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

      const paymentRes = await axios.post('/payments/items', payload);

      let reciboShown = false;
      // Obtener datos completos para el recibo
      try {
        // Obtener orden actualizada con items
        const orderRes = await axios.get(`/orders/${activeOrder.id}`);
        const paidItems = orderRes.data.items?.filter(item => pendingItemIds.includes(item.id)) || [];
        const payment = paymentRes.data.payments?.[0] || paymentRes.data.payment || {
          method: paymentMethod,
          amount: total,
          created_at: new Date().toISOString()
        };
        
        // Calcular vuelto si es efectivo
        let vuelto = 0;
        if (paymentMethod === 'EFECTIVO' && receivedAmount > 0) {
          vuelto = receivedAmount - total;
          if (vuelto < 0) vuelto = 0;
        }
        
        // Preparar datos del recibo
        setReciboData({
          order: {
            ...orderRes.data,
            table_label: tableData.table?.label || 
                        (tableData.table?.number === 9 ? 'VENTANILLA' : 
                         tableData.table?.number === 10 ? 'DOMICILIOS' : 
                         tableData.table?.number ? `Mesa ${tableData.table.number}` : 'Sin mesa')
          },
          payment: {
            ...payment,
            method: paymentMethod,
            amount: total
          },
          items: paidItems
        });
        
        setChangeAmount(vuelto);
        setShowRecibo(true);
        setReceivedAmount(0);
        reciboShown = true;
      } catch (error) {
        console.error('Error obteniendo datos para recibo:', error);
        showAlert('Pago procesado correctamente');
      }

      // FASE 16.3: Verificar estado de la orden después del pago (para refresh/navigate al cerrar recibo)
      let orderStatus = null;
      try {
        const orderRes = await axios.get(`/orders/${activeOrder.id}`);
        orderStatus = orderRes.data?.status;
      } catch (err) {
        console.error('Error obteniendo estado de orden:', err);
      }

      // Fase 16 fix recibo: no clear ni refresh/navigate aquí. Se hace al cerrar el recibo (evita parpadeo).
      const orderId = activeOrder.id;
      pendingRefreshRef.current = async () => {
        setActiveOrder(null);
        setActiveOrderItems([]);
        setCreatingNewOrder(false);
        setSelectedOrderId(null);
        setNewOrderItems([]);
        if (orderStatus) {
          await refreshAfterPayment(orderId, orderStatus);
        } else {
          await refreshMesa();
        }
      };
      setLoadingPay(false);
      if (!reciboShown) {
        const fn = pendingRefreshRef.current;
        pendingRefreshRef.current = null;
        if (fn) fn();
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

    // Validar que la orden tenga items antes de cambiar a EN_PREP o LISTO
    if (newStatus === 'EN_PREP' || newStatus === 'LISTO') {
      const items = activeOrderItems || [];
      const pendingItems = items.filter(item => !item.paid_at && !item.voided_at);
      if (pendingItems.length === 0) {
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
        channel: 'MESA',
        service,
        items: newOrderItems,
      });

      setNewOrderItems([]);
      setCreatingNewOrder(false);
      showAlert('Pedido creado');
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

  const addNewOrderItem = (product) => {
    setNewOrderItems((prev) => [
      ...prev,
      { 
        name: product.displayName || product.name, 
        qty: 1, 
        price: product.price, 
        notes: '',
        product_id: product.id  // Fase 1: incluir product_id
      },
    ]);
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
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }

    if (editingItem !== null) {
      // Editar item existente en la lista de nuevo pedido
      updateNewOrderItem(editingItem, {
        name: customName.trim(),
        price: parseFloat(customPrice),
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
          price: parseFloat(customPrice),
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
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }

    const itemId = window.editingItemId;
    if (itemId) {
      try {
        await axios.patch(`/orders/items/${itemId}`, {
          name: customName.trim(),
          price: parseFloat(customPrice),
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
            onClick={() => navigate(backTo, { replace: true })}
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
            onClick={() => navigate(backTo, { replace: true })}
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
  const activeOrderTotal = safeActiveOrderItems.reduce((sum, item) => {
    if (!item || !item.qty || !item.price) return sum;
    return sum + (item.qty * item.price);
  }, 0);
  
  // Función para cambiar de mesa (FASE O2: preservar state.from)
  const handleMesaChange = (newTableId) => {
    navigate(`/mesa/${newTableId}`, { state: location.state ?? {} });
  };

  // Obtener estado visual de mesa
  const getTableStatus = (table) => {
    if (!table || !table.id) return 'libre';
    // Buscar si esta mesa tiene orden activa
    if (table.id === parseInt(tableId)) {
      if (activeOrder && activeOrder.status) {
        if (activeOrder.status === 'LISTO') return 'listo';
        return 'activa';
      }
    }
    // Verificar si tiene items pendientes desde tableData
    if (tableData && tableData.table && table.id === tableData.table.id) {
      if (tableData.summary?.pendingItems > 0) return 'activa';
    }
    return 'libre';
  };

  return (
    <div className="detalle-mesa-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="detalle-mesa-header" style={{ flexShrink: 0 }}>
        <button onClick={() => navigate(backTo, { replace: true })} className="back-btn">← Volver</button>
        <h1>
          {tableData.table && tableData.table.number === 9 ? 'VENTANILLA' :
           tableData.table && tableData.table.number === 10 ? 'DOMICILIOS' :
           (tableData.table && tableData.table.label) || (tableData.table && `Mesa ${tableData.table.number}`) || 'Mesa'}
        </h1>
      </header>

      <div className="detalle-mesa-content" style={{ 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: '250px 1fr 350px', 
        gap: '1rem', 
        overflow: 'hidden',
        padding: '1rem'
      }}>
        {/* COLUMNA IZQUIERDA: Selector de Mesas */}
        <div className="mesas-sidebar" style={{ 
          background: '#f8f9fa', 
          borderRadius: '12px', 
          padding: '1rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>Mesas</h3>
          
          {/* Mesas 1-8 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(num => {
              const table = allTables.find(t => t.number === num);
              const status = getTableStatus(table || { id: null, number: num });
              const isActive = table?.id === parseInt(tableId);
              
              return (
                <button
                  key={num}
                  onClick={() => handleMesaChange(table?.id || num)}
                  style={{
                    padding: '1rem',
                    background: isActive ? '#F5BB4C' : 
                               status === 'activa' ? '#ffc107' :
                               status === 'listo' ? '#28a745' : 'white',
                    color: isActive || status === 'activa' || status === 'listo' ? 'white' : '#333',
                    border: isActive ? '3px solid #D4A03A' : '2px solid #ddd',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    transition: 'all 0.2s'
                  }}
                >
                  {num}
                </button>
              );
            })}
          </div>
          
          {/* Mesa 9 - VENTANILLA */}
          {(() => {
            const table = allTables.find(t => t.number === 9);
            const status = getTableStatus(table || { id: null, number: 9 });
            const isActive = table?.id === parseInt(tableId);
            
            return (
              <button
                onClick={() => handleMesaChange(table?.id || 9)}
                style={{
                  padding: '1rem',
                  background: isActive ? '#F5BB4C' : 
                             status === 'activa' ? '#ffc107' :
                             status === 'listo' ? '#28a745' : '#F5BB4C',
                  color: 'white',
                  border: isActive ? '3px solid #d4a341' : '2px solid #d4a341',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
              >
                VENTANILLA
              </button>
            );
          })()}
          
          {/* Mesa 10 - DOMICILIOS */}
          {(() => {
            const table = allTables.find(t => t.number === 10);
            const status = getTableStatus(table || { id: null, number: 10 });
            const isActive = table?.id === parseInt(tableId);
            
            return (
              <button
                onClick={() => handleMesaChange(table?.id || 10)}
                style={{
                  padding: '1rem',
                  background: isActive ? '#28a745' : 
                             status === 'activa' ? '#ffc107' :
                             status === 'listo' ? '#28a745' : '#28a745',
                  color: 'white',
                  border: isActive ? '3px solid #1e7e34' : '2px solid #1e7e34',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
              >
                DOMICILIOS
              </button>
            );
          })()}
        </div>

        {/* COLUMNA CENTRO: Orden Activa */}
        <div className="order-center-panel" style={{ 
          background: '#f8f9fa', 
          borderRadius: '12px', 
          padding: '1.5rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {/* FASE M8.9: ÓRDENES ABIERTAS + NUEVA ORDEN (solo Ventanilla/Domicilios) */}
          {isSpecialTable(tableData?.table?.number) && (
            <div style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {openOrdersList.length > 1 && (
                  <>
                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>ÓRDENES ABIERTAS</span>
                    {openOrdersList.map((ord, idx) => (
                      <button
                        type="button"
                        key={ord.id}
                        onClick={async () => {
                          setCreatingNewOrder(false);
                          setSelectedOrderId(ord.id);
                          await loadOrderDetail(ord.id);
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          background: selectedOrderId === ord.id ? '#F5BB4C' : '#f8f9fa',
                          color: selectedOrderId === ord.id ? 'white' : '#6c757d',
                          border: '1px solid ' + (selectedOrderId === ord.id ? '#F5BB4C' : '#dee2e6'),
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: selectedOrderId === ord.id ? 'bold' : 500,
                          fontSize: '0.9rem',
                          transition: 'all 0.2s'
                        }}
                      >
                        {ord.daily_no ? `ORDEN ${ord.daily_no}` : ord.code || `ORDEN ${idx + 1}`}
                      </button>
                    ))}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCreatingNewOrder(true);
                    setNewOrderItems([]);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.9rem'
                  }}
                >
                  NUEVA ORDEN
                </button>
              </div>
            </div>
          )}

          {/* Panel de orden activa o Crear Nueva Orden */}
          {!creatingNewOrder && activeOrder && activeOrder.id ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {activeOrder.daily_no ? `ORDEN ${activeOrder.daily_no}` : (activeOrder.code || `ORDEN ${activeOrder.id}`)}
                  </h2>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                    Estado: <strong>{activeOrder.status || 'N/A'}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {activeOrder.status === 'NUEVO' && (
                    <button
                      onClick={async () => {
                        if (await showConfirm('¿Enviar esta orden a preparación?')) {
                          updateActiveOrderStatus('EN_PREP');
                        }
                      }}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: '#F5BB4C',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Enviar a Preparación
                    </button>
                  )}
                  {activeOrder.status === 'EN_PREP' && (
                    <button
                      onClick={async () => {
                        if (await showConfirm('¿Marcar esta orden como LISTO?')) {
                          updateActiveOrderStatus('LISTO');
                        }
                      }}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 'bold'
                      }}
                    >
                      Marcar Listo
                    </button>
                  )}
                  
                  {/* FASE 12.6: Botón cancelar orden */}
                  {activeOrder.status !== 'PAGADA' && activeOrder.status !== 'CANCELADO' && (
                    <button
                      onClick={() => setShowCancelOrderModal(true)}
                      disabled={cancellingOrder}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: cancellingOrder ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        opacity: cancellingOrder ? 0.6 : 1,
                        transition: 'opacity 0.2s, transform 0.1s'
                      }}
                      onMouseEnter={(e) => {
                        if (!cancellingOrder) {
                          e.currentTarget.style.opacity = '0.85';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!cancellingOrder) {
                          e.currentTarget.style.opacity = '1';
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!cancellingOrder) {
                          e.currentTarget.style.transform = 'scale(0.98)';
                        }
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      {cancellingOrder ? 'Procesando...' : 'CANCELAR ORDEN'}
                    </button>
                  )}
                </div>
              </div>

              {/* FASE 12.4: Banner de bloqueo según estado */}
              {activeOrder.status === 'LISTO' && (
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
              
              {/* Items de la orden activa */}
              {safeActiveOrderItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666', marginBottom: '1rem' }}>
                  No hay items pendientes en esta orden
                </div>
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
                          {item.is_custom && (
                            <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>
                          )}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.9rem' }}>
                          {item.qty}x {formatPriceCOP(item.price)} = {formatPriceCOP(item.qty * item.price)}
                          {item.notes && <span> • {item.notes}</span>}
                        </div>
                      </div>
                      {['NUEVO', 'EN_PREP'].includes(activeOrder.status) && (
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
                      
                      {/* FASE 12.6: Botón anular item (si no está pagado ni anulado) */}
                      {!item.paid_at && !item.voided_at && (
                        <button
                          onClick={() => {
                            setSelectedItemToVoid(item);
                            setShowVoidItemModal(true);
                          }}
                          disabled={voidingItem && selectedItemToVoid?.id === item.id}
                          style={{ 
                            padding: '0.5rem 0.75rem', 
                            background: '#ff9800', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '6px', 
                            cursor: (voidingItem && selectedItemToVoid?.id === item.id) ? 'not-allowed' : 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            opacity: (voidingItem && selectedItemToVoid?.id === item.id) ? 0.6 : 1,
                            transition: 'opacity 0.2s, transform 0.1s'
                          }}
                          onMouseEnter={(e) => {
                            if (!(voidingItem && selectedItemToVoid?.id === item.id)) {
                              e.currentTarget.style.opacity = '0.85';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!(voidingItem && selectedItemToVoid?.id === item.id)) {
                              e.currentTarget.style.opacity = '1';
                            }
                          }}
                          onMouseDown={(e) => {
                            if (!(voidingItem && selectedItemToVoid?.id === item.id)) {
                              e.currentTarget.style.transform = 'scale(0.98)';
                            }
                          }}
                          onMouseUp={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          {(voidingItem && selectedItemToVoid?.id === item.id) ? 'Procesando...' : 'ANULAR'}
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

              {/* Formulario para agregar items (NUEVO, EN_PREP o LISTO; LISTO vuelve a cocina) */}
              {['NUEVO', 'EN_PREP', 'LISTO'].includes(activeOrder.status) && (
                <div style={{ 
                  background: 'white', 
                  padding: '1.5rem', 
                  borderRadius: '12px', 
                  border: '2px solid #F5BB4C',
                  marginTop: '1rem'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    Agregar Items
                  </h3>
            
            {/* Botón OTRO */}
            <button 
              onClick={() => {
                setEditingItem(null);
                setCustomName('');
                setCustomPrice('');
                setCustomQty(1);
                setCustomNotes('');
                setShowCustomProduct(true);
              }}
              className="custom-product-btn"
              style={{ marginBottom: '1rem', padding: '0.75rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              + Otro producto
            </button>
          
          {/* Selector de categorías */}
          <div className="category-tabs">
            {Object.keys(productsByCategory).map(category => (
              <button
                key={category}
                className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Productos de la categoría seleccionada */}
          {selectedCategory && productsByCategory[selectedCategory] && (
            <div className="products-grid-caja">
              {productsByCategory[selectedCategory].map((p) => (
                <button key={p.id} className="product-btn-caja" onClick={() => addNewOrderItem(p)}>
                  <div className="product-name-btn">{p.displayName || p.name}</div>
                  <div className="product-price-btn">{formatPriceCOP(p.price)}</div>
                </button>
              ))}
            </div>
          )}
          {newOrderItems.length > 0 && (
            <div className="new-order-list">
              {newOrderItems.map((it, idx) => (
                <div key={idx} className="new-order-item">
                  <div className="new-order-item-name">
                    {it.name}
                    {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                  </div>
                  <div className="new-order-item-controls">
                    <button onClick={() => updateNewOrderItem(idx, { qty: Math.max(1, it.qty - 1) })}>-</button>
                    <input
                      type="number"
                      value={it.qty}
                      min="1"
                      onChange={(e) => updateNewOrderItem(idx, { qty: parseInt(e.target.value) || 1 })}
                    />
                    <button onClick={() => updateNewOrderItem(idx, { qty: it.qty + 1 })}>+</button>
                  </div>
                  <div style={{ flex: '1 1 100%', minWidth: 0 }}>
                    <input
                      className="new-order-notes"
                      value={it.notes || ''}
                      placeholder="Notas (opcional)"
                      onChange={(e) => updateNewOrderItem(idx, { notes: e.target.value })}
                    />
                    <SalsasChips value={it.notes || ''} onChange={(v) => updateNewOrderItem(idx, { notes: v })} />
                  </div>
                  <button className="btn-danger-outline" onClick={() => removeNewOrderItem(idx)}>Quitar</button>
                </div>
              ))}
                  <button 
                    className="pay-all-btn" 
                    onClick={async () => {
                      await addItemsToActiveOrder(newOrderItems);
                      setNewOrderItems([]);
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
              
              {/* Botón OTRO */}
              <button 
                onClick={() => {
                  setEditingItem(null);
                  setCustomName('');
                  setCustomPrice('');
                  setCustomQty(1);
                  setCustomNotes('');
                  setShowCustomProduct(true);
                }}
                style={{ 
                  marginBottom: '1rem', 
                  padding: '0.75rem', 
                  background: '#F5BB4C', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '8px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  width: '100%',
                  fontSize: '1rem'
                }}
              >
                + Otro producto
              </button>
            
              {/* Selector de categorías */}
              <div className="category-tabs" style={{ marginBottom: '1rem' }}>
                {Object.keys(productsByCategory).map(category => (
                  <button
                    key={category}
                    className={`category-tab ${selectedCategory === category ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {category.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              {/* Productos de la categoría seleccionada */}
              {selectedCategory && productsByCategory[selectedCategory] && (
                <div className="products-grid-caja" style={{ marginBottom: '1rem' }}>
                  {productsByCategory[selectedCategory].map((p) => (
                    <button key={p.id} className="product-btn-caja" onClick={() => addNewOrderItem(p)}>
                      <div className="product-name-btn">{p.displayName || p.name}</div>
                      <div className="product-price-btn">{formatPriceCOP(p.price)}</div>
                    </button>
                  ))}
                </div>
              )}
              
              {newOrderItems.length > 0 && (
                <div className="new-order-list" style={{ 
                  background: 'white', 
                  padding: '1rem', 
                  borderRadius: '8px',
                  border: '2px solid #F5BB4C'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>Items a agregar:</h3>
                  {newOrderItems.map((it, idx) => (
                    <div key={idx} className="new-order-item" style={{ 
                      padding: '0.75rem', 
                      marginBottom: '0.5rem', 
                      background: '#f8f9fa', 
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>
                          {it.name}
                          {it.isCustom && <span style={{ marginLeft: '0.5rem', background: '#F5BB4C', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>OTRO</span>}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>
                          {it.qty}x {formatPriceCOP(it.price)} = {formatPriceCOP(it.qty * it.price)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button onClick={() => updateNewOrderItem(idx, { qty: Math.max(1, it.qty - 1) })} style={{ padding: '0.25rem 0.5rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>−</button>
                        <input
                          type="number"
                          value={it.qty}
                          min="1"
                          onChange={(e) => updateNewOrderItem(idx, { qty: parseInt(e.target.value) || 1 })}
                          style={{ width: '50px', padding: '0.25rem', textAlign: 'center', border: '1px solid #ddd', borderRadius: '4px' }}
                        />
                        <button onClick={() => updateNewOrderItem(idx, { qty: it.qty + 1 })} style={{ padding: '0.25rem 0.5rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                        <button className="btn-danger-outline" onClick={() => removeNewOrderItem(idx)} style={{ padding: '0.25rem 0.5rem', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
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

        {/* COLUMNA DERECHA: Resumen y Cobro */}
        <div className="resumen-panel" style={{ 
          background: '#f8f9fa', 
          borderRadius: '12px', 
          padding: '1.5rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {/* FASE 9.1: Bloqueo si no hay sesión de caja activa */}
          {cashSessionActive === false && (
            <div style={{ 
              background: '#fff3cd', 
              padding: '1.5rem', 
              borderRadius: '12px',
              border: '2px solid #ffc107',
              marginBottom: '1rem'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 'bold', color: '#856404' }}>
                ⚠️ Debes ABRIR CAJA antes de cobrar
              </h3>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#856404' }}>
                  Efectivo inicial:
                </label>
                <input
                  type="number"
                  value={initialCash}
                  onChange={(e) => setInitialCash(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="100"
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem', 
                    fontSize: '1rem', 
                    border: '2px solid #ffc107', 
                    borderRadius: '8px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                onClick={openCashSession}
                disabled={openingCash}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: openingCash ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: openingCash ? 'not-allowed' : 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold'
                }}
              >
                {openingCash ? 'Abriendo...' : 'ABRIR CAJA'}
              </button>
            </div>
          )}

          {activeOrder && activeOrder.id ? (
            <>
              <div style={{ 
                background: 'white', 
                padding: '1.5rem', 
                borderRadius: '12px',
                border: '2px solid #F5BB4C'
              }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>Resumen</h3>
                
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#666' }}>Items:</span>
                    <span style={{ fontWeight: 'bold' }}>{safeActiveOrderItems.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#666' }}>Estado:</span>
                    <span style={{ 
                      fontWeight: 'bold',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      background: (activeOrder.status === 'NUEVO') ? '#ffc107' :
                                 (activeOrder.status === 'EN_PREP') ? '#F5BB4C' :
                                 (activeOrder.status === 'LISTO') ? '#28a745' : '#6c757d',
                      color: 'white'
                    }}>
                      {activeOrder.status || 'N/A'}
                    </span>
                  </div>
                </div>

                <div style={{ 
                  borderTop: '2px solid #333', 
                  paddingTop: '1rem',
                  marginTop: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>TOTAL:</span>
                    <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#F5BB4C' }}>
                      {formatPriceCOP(activeOrderTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Métodos de pago - SOLO visible cuando status === LISTO */}
              {activeOrder.status === 'LISTO' && activeOrderItems.length > 0 && cashSessionActive === true ? (
                <div style={{ 
                  background: 'white', 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: '2px solid #28a745'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>Método de Pago</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                    <button
                      onClick={() => setPaymentMethod('EFECTIVO')}
                      style={{
                        padding: '1rem',
                        background: paymentMethod === 'EFECTIVO' ? '#28a745' : '#f0f0f0',
                        color: paymentMethod === 'EFECTIVO' ? 'white' : '#333',
                        border: paymentMethod === 'EFECTIVO' ? '3px solid #1e7e34' : '2px solid #ddd',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      EFECTIVO
                    </button>
                    <button
                      onClick={() => setPaymentMethod('TARJETA')}
                      style={{
                        padding: '1rem',
                        background: paymentMethod === 'TARJETA' ? '#28a745' : '#f0f0f0',
                        color: paymentMethod === 'TARJETA' ? 'white' : '#333',
                        border: paymentMethod === 'TARJETA' ? '3px solid #1e7e34' : '2px solid #ddd',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      TARJETA
                    </button>
                    <button
                      onClick={() => setPaymentMethod('TRANSFERENCIA')}
                      style={{
                        padding: '1rem',
                        background: paymentMethod === 'TRANSFERENCIA' ? '#28a745' : '#f0f0f0',
                        color: paymentMethod === 'TRANSFERENCIA' ? 'white' : '#333',
                        border: paymentMethod === 'TRANSFERENCIA' ? '3px solid #1e7e34' : '2px solid #ddd',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        transition: 'all 0.2s'
                      }}
                    >
                      TRANSFERENCIA
                    </button>
                  </div>
                  
                  <button
                    onClick={() => {
                      setShowCalculator(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.9rem',
                      marginBottom: '1rem'
                    }}
                  >
                    CALCULADORA
                  </button>

                  {/* PASO 14.3: Mensaje cuando no hay conexión */}
                  {!isOnline && (
                    <div style={{
                      padding: '0.75rem',
                      background: '#fff3cd',
                      border: '1px solid #ffc107',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      textAlign: 'center',
                      fontSize: '0.9rem',
                      color: '#856404',
                      fontWeight: 'bold'
                    }}>
                      No hay conexión. Operación no disponible.
                    </div>
                  )}
                  
                  {/* PASO 14.4: Mensaje cuando se está refrescando tras reconectar */}
                  {isOnline && isRefreshingOnReconnect && (
                    <div style={{
                      padding: '0.75rem',
                      background: '#d4edda',
                      border: '1px solid #28a745',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      textAlign: 'center',
                      fontSize: '0.9rem',
                      color: '#155724',
                      fontWeight: 'bold'
                    }}>
                      Conexión restaurada. Actualizando...
                    </div>
                  )}
                  
                  <button
                    onClick={() => payActiveOrder()}
                    disabled={loadingPay || !isOnline}
                    style={{
                      width: '100%',
                      padding: '1.5rem',
                      background: loadingPay || !isOnline ? '#6c757d' : '#F5BB4C',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: loadingPay || !isOnline ? 'not-allowed' : 'pointer',
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      boxShadow: loadingPay || !isOnline ? 'none' : '0 4px 12px rgba(245, 187, 76, 0.4)',
                      opacity: loadingPay || !isOnline ? 0.6 : 1,
                      transition: 'opacity 0.2s, transform 0.1s'
                    }}
                    onMouseEnter={(e) => {
                      if (!loadingPay && isOnline) {
                        e.currentTarget.style.opacity = '0.85';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loadingPay && isOnline) {
                        e.currentTarget.style.opacity = '1';
                      }
                    }}
                    onMouseDown={(e) => {
                      if (!loadingPay && isOnline) {
                        e.currentTarget.style.transform = 'scale(0.98)';
                      }
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {loadingPay ? 'Procesando...' : 'COBRAR'}
                  </button>

                  <button
                    onClick={() => setShowSplit(true)}
                    disabled={loadingPay || !isOnline}
                    style={{
                      width: '100%',
                      padding: '0.9rem',
                      marginTop: '0.75rem',
                      background: '#1a1a2e',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: loadingPay || !isOnline ? 'not-allowed' : 'pointer',
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      opacity: loadingPay || !isOnline ? 0.6 : 1
                    }}
                  >
                    PAGO DIVIDIDO
                  </button>
                </div>
              ) : activeOrder.status === 'LISTO' && activeOrderItems.length > 0 && cashSessionActive === false ? (
                /* FASE 9.1: Mensaje cuando está LISTO pero no hay sesión de caja */
                <div style={{ 
                  background: 'white', 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: '2px solid #dc3545',
                  textAlign: 'center'
                }}>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#dc3545' }}>
                    ⚠️ Debes ABRIR CAJA para cobrar
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                    Abre la caja arriba para poder procesar el pago
                  </p>
                </div>
              ) : (
                /* Mensaje informativo cuando no está LISTO */
                <div style={{ 
                  background: 'white', 
                  padding: '1.5rem', 
                  borderRadius: '12px',
                  border: '2px solid #ffc107',
                  textAlign: 'center'
                }}>
                  {activeOrder.status === 'NUEVO' ? (
                    <>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#856404' }}>
                        ⚠️ Debe enviarse a preparación
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                        La orden debe estar en estado LISTO para poder cobrar
                      </p>
                    </>
                  ) : activeOrder.status === 'EN_PREP' ? (
                    <>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#856404' }}>
                        ⏳ La cocina debe marcar como LISTO
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                        Espera a que la orden esté LISTA para poder cobrar
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#856404' }}>
                        ⚠️ No se puede cobrar
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                        Solo se puede cobrar cuando la orden está en estado LISTO
                      </p>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ 
              background: 'white', 
              padding: '2rem', 
              borderRadius: '12px',
              textAlign: 'center',
              color: '#666'
            }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No hay orden activa</p>
              <p style={{ fontSize: '0.9rem' }}>Crea una orden para ver el resumen</p>
            </div>
          )}
        </div>
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
                    const current = parseFloat(customPrice) || 0;
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

      {/* Pago dividido (varios métodos en un cobro) */}
      {showSplit && activeOrder && (
        <PagoDividido
          total={activeOrderTotal}
          onCancel={() => setShowSplit(false)}
          onConfirm={processSplitPayment}
        />
      )}

      {/* Calculadora de vuelto (el monto recibido alimenta el vuelto del recibo) */}
      {showCalculator && activeOrder && (
        <CalculadoraVuelto
          total={activeOrderTotal}
          onClose={() => setShowCalculator(false)}
          onConfirm={(recibido) => setReceivedAmount(recibido)}
        />
      )}

      {/* Recibo */}
      {showRecibo && reciboData && (
        <Recibo
          order={reciboData.order}
          payment={reciboData.payment}
          items={reciboData.items}
          changeAmount={changeAmount}
          onClose={() => {
            setShowRecibo(false);
            setReciboData(null);
            setChangeAmount(0);
            const fn = pendingRefreshRef.current;
            pendingRefreshRef.current = null;
            if (fn) fn();
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
                Estado: {activeOrder.status}
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
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}

