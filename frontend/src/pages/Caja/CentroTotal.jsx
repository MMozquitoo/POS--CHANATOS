import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConnection } from '../../contexts/ConnectionContext';
import { useReconnectRefresh } from '../../hooks/useReconnectRefresh.js';
import { useCentroTotalRefresh } from '../../hooks/useOrdersRefresh.js';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { splitTables, getSpecialType } from '../../utils/tables.js';
import Recibo from '../../components/Recibo.jsx';
import ComandaCocina from '../../components/ComandaCocina.jsx';
import PlanoMesas from '../../components/PlanoMesas.jsx';
import TableCard from '../../components/TableCard.jsx';
import CocinaCaja from './CocinaCaja.jsx';
import CajaHeader from '../../components/CajaHeader.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

const FROM_CENTRO_TOTAL = { state: { from: '/centro-total' } };

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

export default function CentroTotal() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const { socket } = useAuth();
  const { isOnline } = useConnection();
  
  // Helpers para cálculo robusto de totales (no hooks, pueden estar antes)
  const toNumber = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') {
      return isNaN(v) ? 0 : v;
    }
    // Si viene "$ 4.000" o "4.000" o "4000"
    const cleaned = String(v).replace(/[^\d]/g, '');
    return cleaned ? Number(cleaned) : 0;
  };

  const computeOrderTotal = (order) => {
    // Detectar items con fallback
    const items = order.items || order.order_items || order.orderItems || [];
    
    // Calcular total desde items
    let sumFromItems = 0;
    if (items.length > 0) {
      sumFromItems = items
        .filter(item => !item.paid_at && !item.voided_at) // Solo items pendientes
        .reduce((sum, item) => {
          const qty = toNumber(item.qty ?? item.quantity ?? 1);
          const price = toNumber(item.price ?? item.unit_price ?? item.unitPrice ?? 0);
          return sum + (qty * price);
        }, 0);
    }

    // Si la suma desde items > 0, usarla
    if (sumFromItems > 0) {
      return sumFromItems;
    }

    // Si suma == 0, fallback a campos de orden
    const fallbackTotal = toNumber(
      order.total ?? 
      order.total_amount ?? 
      order.amount ?? 
      order.total_pending ?? 
      order.pendingTotal ?? 
      0
    );

    return fallbackTotal;
  };
  
  // Estado para tabs (FASE 11.3: MESAS / COCINA / LISTO PARA COBRAR)
  const [activeTab, setActiveTab] = useState('mesas'); // 'mesas', 'cocina', 'listo'
  
  // Estado para vista de mesas (PLANO o LISTA)
  const [mesasView, setMesasView] = useState('plano'); // 'plano' o 'lista'
  
  // Estados principales (Centro Total)
  const [selectedType, setSelectedType] = useState(null); // 'MESA', 'VENTANILLA', 'DOMICILIO'
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [readyToPayOrders, setReadyToPayOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [serviceCounts, setServiceCounts] = useState({ ventanilla: 0, domicilio: 0 });
  
  // Estados para Preview Cocina
  const [kitchenOrders, setKitchenOrders] = useState({ NUEVO: [], EN_PREP: [], LISTO: [] });
  const [kitchenLoading, setKitchenLoading] = useState(false);
  
  // Estados para edición
  const [productsByCategory, setProductsByCategory] = useState({});
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showAddItems, setShowAddItems] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customNotes, setCustomNotes] = useState('');
  
  // Estados para UI
  const [loading, setLoading] = useState(false);
  const [showCustomProduct, setShowCustomProduct] = useState(false);
  
  // FASE 19.5: Refs para evitar loops de refetch
  const loadingTablesRef = useRef(false);
  const loadingKitchenRef = useRef(false);
  const loadingReadyToPayRef = useRef(false);
  /** Fase 16 fix recibo: deferir refresh hasta que el usuario cierre el recibo (evita parpadeo) */
  const pendingRefreshRef = useRef(null);

  // FASE M9.2: LISTA — eliminado: ya no se usan filtros de canal, las cards navegan directamente
  
  // Estados para recibo
  const [showRecibo, setShowRecibo] = useState(false);
  const [reciboData, setReciboData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  
  // Estados para comanda cocina
  const [showComanda, setShowComanda] = useState(false);
  const [comandaOrder, setComandaOrder] = useState(null);

  // Estado para sesión activa (FASE 9.5)
  const [cashSessionActive, setCashSessionActive] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // FASE 19.5: Convertir funciones loadX a useCallback para evitar recrearlas y loops
  // FASE 19.10: Modo ahorro - no hacer refetch cuando offline
  const checkCashSession = useCallback(async () => {
    if (!isOnline) return;
    
    try {
      setCheckingSession(true);
      const res = await axios.get('/cash/session/active');
      setCashSessionActive(res.data.active || false);
    } catch (error) {
      console.error('Error verificando sesión de caja:', error);
      setCashSessionActive(false);
    } finally {
      setCheckingSession(false);
    }
  }, [isOnline]);

  const loadTables = useCallback(async () => {
    // FASE 19.5: Evitar refetch si ya está cargando
    if (loadingTablesRef.current || !isOnline) return;
    
    loadingTablesRef.current = true;
    try {
      const res = await axios.get('/tables');
      setTables(res.data || []);
    } catch (error) {
      console.error('Error cargando mesas:', error);
    } finally {
      loadingTablesRef.current = false;
    }
  }, [isOnline]);

  const loadServiceCounts = useCallback(async () => {
    if (!isOnline) return;
    
    try {
      const res = await axios.get('/tables/service-counts');
      setServiceCounts(res.data || { ventanilla: 0, domicilio: 0 });
    } catch (error) {
      console.error('Error cargando conteos de servicios:', error);
    }
  }, [isOnline]);

  const loadProducts = useCallback(async () => {
    if (!isOnline) return;
    
    try {
      const res = await axios.get('/products');
      setProductsByCategory(res.data);
      const categories = Object.keys(res.data);
      if (categories.length > 0) {
        setSelectedCategory(categories[0]);
      }
    } catch (error) {
      console.error('Error cargando productos:', error);
    }
  }, [isOnline]);

  const loadReadyToPay = useCallback(async () => {
    // FASE 19.5: Evitar refetch si ya está cargando
    if (loadingReadyToPayRef.current || !isOnline) return;
    
    loadingReadyToPayRef.current = true;
    try {
      const res = await axios.get('/orders/ready-to-pay');
      // Filtrar órdenes vacías: solo mostrar LISTO con items > 0 o total > 0
      const filtered = (res.data || []).filter(order => {
        const items = order.items || [];
        const pendingItems = items.filter(item => !item.paid_at && !item.voided_at);
        const total = order.pendingTotal || order.total || 0;
        return pendingItems.length > 0 || total > 0;
      });
      setReadyToPayOrders(filtered);
    } catch (error) {
      console.error('Error cargando órdenes listas para cobrar:', error);
    } finally {
      loadingReadyToPayRef.current = false;
    }
  }, [isOnline]);

  const loadKitchenOrders = useCallback(async () => {
    // FASE 19.5: Evitar refetch si ya está cargando
    if (loadingKitchenRef.current || !isOnline) return;
    
    loadingKitchenRef.current = true;
    setKitchenLoading(true);
    try {
      const res = await axios.get('/orders?kitchen=true');
      const allOrders = res.data.filter(o => o.status !== 'CANCELADO');
      
      setKitchenOrders({
        NUEVO: allOrders.filter(o => o.status === 'NUEVO'),
        EN_PREP: allOrders.filter(o => o.status === 'EN_PREP'),
        LISTO: allOrders.filter(o => o.status === 'LISTO')
      });
    } catch (error) {
      console.error('Error cargando pedidos de cocina:', error);
    } finally {
      setKitchenLoading(false);
      loadingKitchenRef.current = false;
    }
  }, [isOnline]);

  // FASE 16.3: Hook de refresh para órdenes archivadas (después de declarar funciones)
  const { refreshAfterArchive, refreshActiveTab } = useCentroTotalRefresh({
    loadReadyToPay,
    loadTables,
    loadKitchenOrders,
    loadOpenOrdersForService: null, // Ya no se usa
    setReadyToPayOrders,
    setTables,
    setKitchenOrders,
    setOpenOrdersVentanilla: null, // Ya no se usa
    setOpenOrdersDomicilio: null, // Ya no se usa
    activeTab,
    mesasView
  });

  // FASE 19.1: Recuperación automática al reconectar (después de declarar funciones)
  const { isRefreshing: isRefreshingOnReconnect } = useReconnectRefresh({
    enabled: true,
    onReconnect: useCallback(async () => {
      // Recargar según el tab activo
      if (activeTab === 'mesas') {
        await Promise.all([loadTables(), loadServiceCounts()]);
      } else if (activeTab === 'cocina') {
        await loadKitchenOrders();
      } else if (activeTab === 'listo') {
        await loadReadyToPay();
      }
      // Siempre recargar sesión de caja
      await checkCashSession();
    }, [activeTab, loadTables, loadServiceCounts, loadKitchenOrders, loadReadyToPay, checkCashSession])
  });

  // FASE 19.5: Normalizar useEffect - separar carga inicial de listeners de socket
  // FASE 19.8: Asegurar cleanup completo de listeners
  useEffect(() => {
    // Carga inicial solo una vez
    checkCashSession();
    loadReadyToPay();
    loadProducts();
    loadTables();
    loadServiceCounts();
  }, []); // Sin dependencias - solo al montar

  // FASE 19.5 + 19.8: Listeners de socket separados con cleanup correcto
  useEffect(() => {
    if (!socket) return;
    
    // FASE 19.5: Handlers con useCallback para evitar recrearlos
    const handleOrderStatusChanged = () => {
      if (selectedType === 'MESA' && selectedTableId) {
        loadOrders();
      } else if (selectedService) {
        loadOrders();
      }
      loadReadyToPay();
      if (activeTab === 'cocina') {
        loadKitchenOrders();
      }
      if (activeTab === 'mesas') {
        loadServiceCounts();
      }
    };
    
    const handleOrderUpdated = () => {
      if (selectedOrder) {
        loadOrderDetail(selectedOrder.id);
      }
    };
    
    const handleItemUpdated = () => {
      if (selectedOrder) {
        loadOrderDetail(selectedOrder.id);
      }
    };
    
    const handleOrderNew = () => {
      if (activeTab === 'cocina') {
        loadKitchenOrders();
      }
      if (activeTab === 'mesas') {
        loadServiceCounts();
      }
    };
    
    const handleOrderArchived = () => {
      if (activeTab === 'cocina') {
        loadKitchenOrders();
      }
      if (activeTab === 'mesas') {
        loadServiceCounts();
      }
    };
    
    socket.on('order:status-changed', handleOrderStatusChanged);
    socket.on('order:updated', handleOrderUpdated);
    socket.on('item:updated', handleItemUpdated);
    socket.on('order:new', handleOrderNew);
    socket.on('order:archived', handleOrderArchived);
    
    // FASE 19.8: Cleanup completo de listeners
    return () => {
      socket.off('order:status-changed', handleOrderStatusChanged);
      socket.off('order:updated', handleOrderUpdated);
      socket.off('item:updated', handleItemUpdated);
      socket.off('order:new', handleOrderNew);
      socket.off('order:archived', handleOrderArchived);
    };
  }, [socket, selectedType, selectedTableId, selectedService, selectedOrder, activeTab, loadReadyToPay, loadKitchenOrders, loadServiceCounts]);
  
  // FASE 19.5: Cargar cocina solo cuando cambia el tab (evitar loops)
  useEffect(() => {
    if (activeTab === 'cocina' && isOnline) {
      loadKitchenOrders();
    }
  }, [activeTab, isOnline, loadKitchenOrders]);

  // FASE M8.2: Verificar que splitTables devuelve specialTables.length === 2 cuando existen mesas 9 y 10
  useEffect(() => {
    if (import.meta.env.DEV && tables?.length) {
      const has9 = tables.some((t) => Number(t?.number) === 9);
      const has10 = tables.some((t) => Number(t?.number) === 10);
      if (has9 && has10) {
        const { specialTables: sp } = splitTables(tables);
        if (sp.length !== 2) {
          console.warn(
            '[FASE M8.2] Se esperaba specialTables.length === 2 con mesas 9 y 10. Actual:',
            sp.length
          );
        }
      }
    }
  }, [tables, splitTables]);

  // FASE 19.5: Funciones adicionales con useCallback
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar por mesa (tanto MESA como SERVICE usan tableId)
      if (selectedTableId) {
        // Intentar primero con ?active=1, si no funciona usar ?only_open=1
        try {
          const res = await axios.get(`/orders/table/${selectedTableId}?active=1`);
          // Si active=1 devuelve un objeto (orden única), convertirlo a array
          if (res.data && !Array.isArray(res.data)) {
            setOrders([res.data]);
          } else {
            setOrders(res.data || []);
          }
        } catch (activeError) {
          // Fallback a only_open=1
          const res = await axios.get(`/orders/table/${selectedTableId}?only_open=1`);
          setOrders(Array.isArray(res.data) ? res.data : []);
        }
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error('Error cargando órdenes:', error);
      showAlert(error.response?.data?.error || 'Error al cargar órdenes');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  const loadOrderDetail = useCallback(async (orderId) => {
    try {
      const res = await axios.get(`/orders/${orderId}`);
      setSelectedOrder(res.data);
      setSelectedOrderItems(res.data.items?.filter(item => !item.paid_at && !item.voided_at) || []);
    } catch (error) {
      console.error('Error cargando detalle de orden:', error);
      showAlert(error.response?.data?.error || 'Error al cargar detalle');
    }
  }, [isOnline]);

  const selectMesa = (tableNumber) => {
    // Buscar el tableId real basado en el número
    const table = tables.find(t => t.number === tableNumber);
    if (!table) {
      showAlert('Mesa no encontrada');
      return;
    }
    setSelectedType('MESA');
    setSelectedTableId(table.id);
    setSelectedService(null);
    setSelectedOrder(null);
    setSelectedOrderItems([]);
    setShowAddItems(false);
    setNewItems([]);
  };

  const selectService = (service) => {
    const serviceTableNumber = service === 'VENTANILLA' ? 9 : service === 'DOMICILIO' ? 10 : null;
    const tablesList = Array.isArray(tables) ? tables : [];
    const serviceTable = serviceTableNumber
      ? tablesList.find((t) => t && t.number === serviceTableNumber)
      : null;
    
    setSelectedType('SERVICE');
    setSelectedService(service);
    setSelectedTableId(serviceTable?.id || null);
    setSelectedOrder(null);
    setSelectedOrderItems([]);
    setShowAddItems(false);
    setNewItems([]);
  };

  // FASE 19.5: Cargar órdenes solo cuando cambian las selecciones (evitar loops)
  useEffect(() => {
    if (isOnline && ((selectedType === 'MESA' && selectedTableId) || (selectedType === 'SERVICE' && selectedService))) {
      loadOrders();
    }
  }, [selectedType, selectedTableId, selectedService, isOnline, loadOrders]);

  const handleOrderClick = (order) => {
    loadOrderDetail(order.id);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    // Validar que la orden tenga items antes de cambiar a EN_PREP o LISTO
    if (newStatus === 'EN_PREP' || newStatus === 'LISTO') {
      const order = orders.find(o => o.id === orderId) || selectedOrder;
      if (order) {
        const items = order.items || [];
        const pendingItems = items.filter(item => !item.paid_at && !item.voided_at);
        if (pendingItems.length === 0) {
          showAlert('No se puede cambiar estado: la orden no tiene items.');
          return;
        }
      }
    }

    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      await loadOrders();
      if (selectedOrder?.id === orderId) {
        await loadOrderDetail(orderId);
      }
      await loadReadyToPay();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      showAlert(error.response?.data?.error || 'Error al actualizar estado');
    }
  };

  const addItemToOrder = (product) => {
    setNewItems(prev => [...prev, {
      name: product.displayName || product.name,
      qty: 1,
      price: product.price,
      notes: '',
      product_id: product.id
    }]);
  };

  const removeNewItem = (index) => {
    setNewItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateNewItem = (index, patch) => {
    setNewItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const saveNewItems = async () => {
    if (newItems.length === 0) {
      showAlert('Agrega al menos un item');
      return;
    }
    
    if (!selectedOrder) {
      showAlert('Selecciona una orden primero');
      return;
    }

    try {
      await axios.post(`/orders/${selectedOrder.id}/items`, { items: newItems });
      setNewItems([]);
      setShowAddItems(false);
      await loadOrderDetail(selectedOrder.id);
      await loadOrders();
      showAlert('Items agregados correctamente');
    } catch (error) {
      console.error('Error agregando items:', error);
      showAlert(error.response?.data?.error || 'Error al agregar items');
    }
  };

  const editItem = async (itemId, field, value) => {
    try {
      const patch = { [field]: value };
      await axios.patch(`/orders/items/${itemId}`, patch);
      await loadOrderDetail(selectedOrder.id);
      await loadOrders();
    } catch (error) {
      console.error('Error editando item:', error);
      showAlert(error.response?.data?.error || 'Error al editar item');
    }
  };

  const deleteItem = async (itemId) => {
    if (!(await showConfirm('¿Eliminar este item?'))) return;
    
    try {
      await axios.delete(`/orders/items/${itemId}`);
      await loadOrderDetail(selectedOrder.id);
      await loadOrders();
    } catch (error) {
      console.error('Error eliminando item:', error);
      showAlert(error.response?.data?.error || 'Error al eliminar item');
    }
  };

  const payOrder = async (order, paymentMethod = 'EFECTIVO') => {
    // Validar sesión activa (FASE 9.5)
    if (!cashSessionActive) {
      showAlert('Debes ABRIR CAJA antes de cobrar');
      navigate('/mesas');
      return;
    }

    try {
      // Obtener orden completa con items
      const orderRes = await axios.get(`/orders/${order.id}`);
      const fullOrder = orderRes.data;

      // Calcular total usando helper robusto
      const total = computeOrderTotal(fullOrder);

      // Debug temporal (solo en desarrollo)
      console.log('[CENTRO TOTAL PAY DEBUG]', {
        orderId: order.id,
        orderCode: order.daily_no || order.code,
        rawOrder: fullOrder,
        computedTotal: total,
        itemsCount: (fullOrder.items || []).length,
        pendingItemsCount: (fullOrder.items || []).filter(item => !item.paid_at && !item.voided_at).length,
        orderPendingTotal: order.pendingTotal,
        orderTotal: order.total
      });

      // Validar que el total > 0 (FASE 9.5 - Fix bug cobrar por $0)
      if (total <= 0) {
        showAlert('Total inválido. Revisa precios o items.');
        return;
      }

      // Confirmar con el total calculado
      const orderCode = order.daily_no || order.code || `#${order.id}`;
      if (!(await showConfirm(`¿Cobrar ORDEN ${orderCode} por ${formatPriceCOP(total)}?`))) {
        return;
      }

      // Obtener items pendientes
      const pendingItems = fullOrder.items
        .filter(item => !item.paid_at && !item.voided_at)
        .map(item => item.id);

      if (pendingItems.length === 0) {
        showAlert('Esta orden no tiene items pendientes');
        return;
      }

      // Recalcular total desde items pendientes (debe coincidir)
      const recalculatedTotal = pendingItems.reduce((sum, itemId) => {
        const item = fullOrder.items.find(i => i.id === itemId);
        const qty = toNumber(item?.qty ?? item?.quantity ?? 1);
        const price = toNumber(item?.price ?? item?.unit_price ?? item?.unitPrice ?? 0);
        return sum + (qty * price);
      }, 0);

      // Usar el total recalculado (más preciso)
      const finalTotal = recalculatedTotal > 0 ? recalculatedTotal : total;

      // FASE 12.4: Validar que la orden esté en estado LISTO
      if (order.status !== 'LISTO') {
        showAlert(`Solo se puede cobrar cuando la orden está LISTO. Estado actual: ${order.status}`);
        await loadOrders();
        await loadReadyToPay();
        return;
      }

      // PASO 16.2.2-A: Normalizar payload
      let payload;
      try {
        const pendingItemsObjects = fullOrder.items.filter(item => pendingItems.includes(item.id));
        payload = normalizePaymentItemsPayload({
          items: pendingItemsObjects, // pasar objetos completos para extraer IDs
          method: paymentMethod,
          tableId: order.table_id,
          orderId: order.id, // preferir orderId si existe
          amount: finalTotal
        });
      } catch (normalizeError) {
        showAlert(normalizeError.message || 'Error al preparar el pago. Verifica los items seleccionados.');
        return;
      }

      // PASO 16.2.2: Instrumentación para diagnóstico del 400
      if (import.meta.env?.DEV) {
        console.log("[DEBUG payments/items] payload =", JSON.stringify(payload, null, 2));
        console.log("[DEBUG payments/items] pendingItemsObjects =", JSON.stringify(pendingItemsObjects, null, 2));
        console.log("[DEBUG payments/items] pendingItems =", pendingItems);
        console.log("[DEBUG payments/items] order.table_id =", order.table_id);
        console.log("[DEBUG payments/items] order.id =", order.id);
        console.log("[DEBUG payments/items] paymentMethod =", paymentMethod);
      }

      const paymentRes = await axios.post('/payments/items', payload);

      // Fase 16 fix recibo: mostrar recibo ANTES de refresh. Refresh al cerrar (evita parpadeo).
      const paidItems = fullOrder.items.filter(item => pendingItems.includes(item.id));
      setReciboData({
        order: fullOrder,
        payment: paymentRes.data.payments[0],
        items: paidItems
      });
      setShowRecibo(true);

      const orderId = order.id;
      const wasSelected = selectedOrder?.id === order.id;
      pendingRefreshRef.current = async () => {
        await refreshAfterArchive(orderId);
        await loadServiceCounts();
        if (wasSelected) await loadOrderDetail(orderId);
      };
    } catch (error) {
      console.error('Error procesando pago:', error);
      // FASE 12.4: Manejo de error 409 (orden bloqueada)
      if (error.response?.status === 409) {
        showAlert(error.response?.data?.error || 'Solo se puede cobrar cuando la orden está LISTO.');
        await loadOrders();
        await loadReadyToPay();
      } else {
        showAlert(error.response?.data?.error || 'Error al procesar pago');
      }
    }
  };

  const addCustomItem = () => {
    if (!customName.trim() || !customPrice || parseFloat(customPrice) <= 0) {
      showAlert('Ingresa un nombre y precio válido');
      return;
    }

    setNewItems(prev => [...prev, {
      name: customName.trim(),
      qty: customQty,
      price: parseFloat(customPrice),
      notes: customNotes,
      isCustom: true
    }]);

    setShowCustomProduct(false);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setCustomNotes('');
  };

  // Funciones adicionales (no usadas en hooks iniciales, pueden quedarse aquí)

  const updateKitchenStatus = async (orderId, newStatus) => {
    // Validar que la orden tenga items antes de cambiar a EN_PREP o LISTO
    if (newStatus === 'EN_PREP' || newStatus === 'LISTO') {
      const allOrders = [...kitchenOrders.NUEVO, ...kitchenOrders.EN_PREP, ...kitchenOrders.LISTO];
      const order = allOrders.find(o => o.id === orderId);
      if (order) {
        const items = order.items || [];
        const pendingItems = items.filter(item => !item.paid_at && !item.voided_at);
        if (pendingItems.length === 0) {
          showAlert('No se puede cambiar estado: la orden no tiene items.');
          return;
        }
      }
    }

    try {
      await axios.patch(`/orders/${orderId}/status`, { status: newStatus });
      await loadKitchenOrders();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      showAlert(error.response?.data?.error || 'Error al actualizar estado');
    }
  };

  const archiveKitchenOrder = async (orderId) => {
    try {
      await axios.patch(`/orders/${orderId}/archive`);
      await loadKitchenOrders();
    } catch (error) {
      console.error('Error archivando pedido:', error);
      showAlert(error.response?.data?.error || 'Error al archivar pedido');
    }
  };

  const cancelOrder = async (order) => {
    const reason = await showPrompt('Motivo de cancelación (mínimo 3 caracteres):');
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) {
        showAlert('El motivo debe tener al menos 3 caracteres');
      }
      return;
    }

    const orderCode = order.daily_no || order.code || `#${order.id}`;
    if (!(await showConfirm(`¿Cancelar ORDEN ${orderCode}?\n\nMotivo: ${reason}`))) {
      return;
    }

    try {
      await axios.patch(`/orders/${order.id}/cancel`, { reason: reason.trim() });
      showAlert('Orden cancelada correctamente');
      
      // FASE 16.4.3.A: Refresh optimista - quitar orden de listas locales inmediatamente
      // Esto incluye: readyToPayOrders, openOrdersVentanilla, openOrdersDomicilio
      await refreshAfterArchive(order.id);
      
      // Recargar contadores de servicios
      await loadServiceCounts();
      
      if (selectedOrder?.id === order.id) {
        await loadOrderDetail(order.id);
      }
    } catch (error) {
      console.error('Error cancelando orden:', error);
      showAlert(error.response?.data?.error || 'Error al cancelar orden');
    }
  };

  const archiveDayKitchenOrders = async () => {
    if (!(await showConfirm('¿Archivar todas las órdenes LISTO del día? Esto ocultará las órdenes archivadas de la vista.'))) {
      return;
    }
    
    try {
      await axios.post('/orders/archive-day');
      await loadKitchenOrders();
      showAlert('Órdenes del día archivadas correctamente');
    } catch (error) {
      console.error('Error archivando órdenes del día:', error);
      showAlert(error.response?.data?.error || 'Error al archivar órdenes del día');
    }
  };

  // Calcular contadores para badges en tabs
  const cocinaCount = (kitchenOrders.NUEVO?.length || 0) + (kitchenOrders.EN_PREP?.length || 0);
  const listoCount = readyToPayOrders.length;

  // FASE 16.3: Optimización con useMemo para evitar renders innecesarios
  // FASE M9.2 / M9.3: regularTables (1–8) y specialTables (9–10). Origen único, sin duplicar en grilla.
  const tablesList = useMemo(() => Array.isArray(tables) ? tables : [], [tables]);
  
  const regularTables = useMemo(() => {
    return tablesList.filter((t) => {
      if (!t || typeof t !== 'object') return false;
      const n = Number(t.number);
      return n >= 1 && n <= 8;
    });
  }, [tablesList]);
  
  const specialTables = useMemo(() => {
    return tablesList.filter((t) => {
      if (!t || typeof t !== 'object') return false;
      const n = Number(t.number);
      return n === 9 || n === 10;
    });
  }, [tablesList]);
  
  // Listas derivadas optimizadas
  const readyOrders = useMemo(() => readyToPayOrders || [], [readyToPayOrders]);

  // FASE 19.6: useCallback para evitar recrear función en cada render (ya estaba, pero asegurar)
  const handleMesaClick = useCallback((table) => {
    navigate(`/mesa/${table.id}`, FROM_CENTRO_TOTAL);
  }, [navigate]);

  const tableIdVentanilla = useMemo(() => 
    specialTables.find((t) => getSpecialType(t) === 'VENTANILLA')?.id,
    [specialTables]
  );
  const tableIdDomicilio = useMemo(() => 
    specialTables.find((t) => getSpecialType(t) === 'DOMICILIOS')?.id,
    [specialTables]
  );

  // FASE 19.6: Handler optimizado para specialTables en modo LISTA
  const handleSpecialTableClick = useCallback((table) => {
    const st = getSpecialType(table);
    const isVentanilla = st === 'VENTANILLA';
    const tableId = isVentanilla ? tableIdVentanilla : tableIdDomicilio;
    if (tableId) {
      navigate(`/mesa/${tableId}`, FROM_CENTRO_TOTAL);
    }
  }, [navigate, tableIdVentanilla, tableIdDomicilio]);

  return (
    <div className="caja-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header unificado (FASE 13.3) */}
      <CajaHeader 
        title="CENTRO DE CONTROL"
        subtitle="Caja"
        backTo="/centro"
        rightButton={{ label: "OPCIONES", to: "/mas" }}
      />
      
      {/* PASO 14.4: Mensaje cuando se está refrescando tras reconectar */}
      {isOnline && isRefreshingOnReconnect && (
        <div style={{
          padding: '0.5rem 1rem',
          background: '#d4edda',
          border: '1px solid #28a745',
          textAlign: 'center',
          fontSize: '0.85rem',
          color: '#155724',
          fontWeight: 'bold'
        }}>
          Actualizando datos...
        </div>
      )}

      {/* Tabs internos (FASE 11.3 / M4: MESAS / COCINA / LISTO PARA COBRAR) */}
      <div
        className="centro-total-tabs"
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '1rem',
          background: '#f8f9fa',
          borderBottom: '2px solid #ddd',
          flexShrink: 0
        }}
      >
        <button
          type="button"
          className="centro-total-tab"
          onClick={() => setActiveTab('mesas')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'mesas' ? '#F5BB4C' : 'white',
            color: activeTab === 'mesas' ? 'white' : '#333',
            border: '2px solid #F5BB4C',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            position: 'relative'
          }}
        >
          MESAS
        </button>
        <button
          type="button"
          className="centro-total-tab"
          onClick={() => {
            setActiveTab('cocina');
            loadKitchenOrders();
          }}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'cocina' ? '#28a745' : 'white',
            color: activeTab === 'cocina' ? 'white' : '#333',
            border: '2px solid #28a745',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            position: 'relative'
          }}
        >
          COCINA
          {cocinaCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 'bold'
              }}
            >
              {cocinaCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="centro-total-tab"
          onClick={() => {
            setActiveTab('listo');
            loadReadyToPay();
          }}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'listo' ? '#F5BB4C' : 'white',
            color: activeTab === 'listo' ? 'white' : '#333',
            border: '2px solid #F5BB4C',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '1rem',
            position: 'relative'
          }}
        >
          LISTO PARA COBRAR
          {listoCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 'bold'
              }}
            >
              {listoCount}
            </span>
          )}
        </button>
      </div>

      {/* Contenido según tab activo (FASE 11.3) */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        flex: 1, 
        overflow: 'hidden', 
        display: 'flex', 
        flexDirection: 'column',
        transition: 'opacity 150ms ease',
        opacity: (activeTab === 'cocina' && kitchenLoading) ? 0.6 : 1
      }}>
      {activeTab === 'mesas' ? (
        /* Tab MESAS - FASE M9.2: PLANO = V/D cards + plano solo 1–8; LISTA = toggle V/D + órdenes + grid 1–8 */
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Toggle PLANO / LISTA */}
          <div style={{ 
            padding: '0.75rem 1rem', 
            background: 'white', 
            borderBottom: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            flexShrink: 0
          }}>
            <button
              onClick={() => setMesasView('plano')}
              style={{
                padding: '0.5rem 1rem',
                background: mesasView === 'plano' ? '#F5BB4C' : '#f8f9fa',
                color: mesasView === 'plano' ? 'white' : '#333',
                border: '2px solid #F5BB4C',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}
            >
              PLANO
            </button>
            <button
              onClick={() => setMesasView('lista')}
              style={{
                padding: '0.5rem 1rem',
                background: mesasView === 'lista' ? '#F5BB4C' : '#f8f9fa',
                color: mesasView === 'lista' ? 'white' : '#333',
                border: '2px solid #F5BB4C',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}
            >
              LISTA
            </button>
          </div>
          
          {/* Contenido según vista */}
          {mesasView === 'plano' ? (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* FASE 16.4.2.2: V/D como cards tipo mesa usando TableCard */}
              {specialTables.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '1rem',
                    padding: '1rem',
                    background: '#f8f9fa',
                    borderBottom: '1px solid #e0e0e0',
                    flexShrink: 0
                  }}
                >
                  {specialTables.map((table) => {
                    const st = getSpecialType(table);
                    const label = st || table.label || `Mesa ${table.number}`;
                    const isVentanilla = st === 'VENTANILLA';
                    const count = isVentanilla ? serviceCounts.ventanilla : serviceCounts.domicilio;
                    return (
                      <TableCard
                        key={table.id}
                        title={label}
                        subtitle={count > 0 ? `${count} activa${count !== 1 ? 's' : ''}` : undefined}
                        number={table.number}
                        status={table.status}
                        onClick={() => handleMesaClick(table)}
                        variant="cashier"
                        highlight={true}
                      />
                    );
                  })}
                </div>
              )}
              <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                <PlanoMesas
                  tables={regularTables}
                  onMesaClick={handleMesaClick}
                  loadTables={loadTables}
                  socket={socket}
                  isCaja={true}
                />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* FASE 16.4.2.2: V/D como cards tipo mesa usando TableCard en modo LISTA */}
              {specialTables.length > 0 && (
                <section style={{ flexShrink: 0 }}>
                  {/* Cards de Ventanilla/Domicilios arriba */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                    gap: '1rem', 
                    marginBottom: '1rem' 
                  }}>
                    {specialTables.map((table) => {
                      const st = getSpecialType(table);
                      const label = st || table.label || `Mesa ${table.number}`;
                      const isVentanilla = st === 'VENTANILLA';
                      const count = isVentanilla ? serviceCounts.ventanilla : serviceCounts.domicilio;
                      
                      return (
                        <TableCard
                          key={table.id}
                          title={label}
                          subtitle={count > 0 ? `${count} activa${count !== 1 ? 's' : ''}` : undefined}
                          number={table.number}
                          status={table.status}
                          onClick={() => handleSpecialTableClick(table)}
                          variant="cashier"
                          highlight={true}
                        />
                      );
                    })}
                  </div>
                </section>
              )}
              {/* FASE 16.4.2.2: Grid mesas normales (1–8) usando TableCard — sin 9/10 */}
              <section style={{ flexShrink: 0 }}>
                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 'bold', color: '#333' }}>
                  Mesas
                </h3>
                {regularTables.length === 0 ? (
                  <EmptyState
                    title="No hay mesas activas"
                    description="Las mesas con pedidos aparecerán aquí."
                  />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                    {regularTables.map((table) => (
                      <TableCard
                        key={table.id}
                        title={table.label || `Mesa ${table.number}`}
                        number={table.number}
                        status={table.status}
                        onClick={() => handleMesaClick(table)}
                        variant="cashier"
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : activeTab === 'cocina' ? (
        /* Tab COCINA - Reutilizar CocinaCaja (FASE 11.3) */
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <CocinaCaja hideHeader={true} />
        </div>
      ) : activeTab === 'listo' ? (
        /* Tab LISTO PARA COBRAR (FASE 11.3) */
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: '#f8f9fa' }}>
          {!checkingSession && !cashSessionActive && (
            <div style={{
              background: '#fff3cd',
              border: '2px solid #ffc107',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#856404' }}>
                Debes ABRIR CAJA antes de cobrar
              </div>
              <button
                onClick={() => navigate('/centro-total')}
                style={{
                  marginTop: '1rem',
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
                Ir a Dashboard
              </button>
            </div>
          )}
          
          {readyOrders.length === 0 ? (
            <EmptyState
              title="No hay pedidos listos para cobrar"
              description="Cuando una orden esté lista, aparecerá aquí automáticamente."
            />
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {readyToPayOrders.map(order => {
                const items = order.items || [];
                const pendingItems = items.filter(item => !item.paid_at && !item.voided_at);
                const total = order.pendingTotal || order.total || 0;
                const isEmpty = pendingItems.length === 0 && total <= 0;
                
                // Determinar tableId para navegación
                let tableId = order.table_id;
                if (!tableId && order.table_number === 9) {
                  tableId = tableIdVentanilla ?? null;
                } else if (!tableId && order.table_number === 10) {
                  tableId = tableIdDomicilio ?? null;
                }
                
                return (
                  <div
                    key={order.id}
                    style={{
                      background: 'white',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      border: isEmpty ? '2px solid #dc3545' : '2px solid #F5BB4C',
                      opacity: isEmpty ? 0.6 : 1,
                      marginBottom: '1rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '1.3rem', color: '#333', marginBottom: '0.25rem' }}>
                          {order.daily_no ? `ORDEN ${order.daily_no}` : order.code}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.9rem' }}>
                          {order.table_label ? `Mesa: ${order.table_label}` : 'Sin mesa'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '1.5rem', color: '#F5BB4C', marginBottom: '0.25rem' }}>
                          {formatPriceCOP(total)}
                        </div>
                        <div style={{ color: '#666', fontSize: '0.85rem' }}>
                          {pendingItems.length || 0} item(s)
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      paddingTop: '1rem',
                      borderTop: '1px solid #eee',
                      gap: '0.5rem'
                    }}>
                      <div style={{ color: '#666', fontSize: '0.85rem' }}>
                        {new Date(order.created_at).toLocaleString('es-CO', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                      {isEmpty ? (
                        <div style={{
                          padding: '0.5rem 1rem',
                          background: '#dc3545',
                          color: 'white',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '0.9rem'
                        }}>
                          ORDEN VACÍA
                        </div>
                      ) : tableId && cashSessionActive ? (
                        <>
                          {/* PASO 14.3: Mensaje cuando no hay conexión */}
                          {!isOnline && (
                            <div style={{
                              padding: '0.5rem',
                              background: '#fff3cd',
                              border: '1px solid #ffc107',
                              borderRadius: '6px',
                              marginBottom: '0.5rem',
                              textAlign: 'center',
                              fontSize: '0.85rem',
                              color: '#856404',
                              fontWeight: 'bold'
                            }}>
                              No hay conexión. Operación no disponible.
                            </div>
                          )}
                          <button
                            onClick={() => navigate(`/mesa/${tableId}`, FROM_CENTRO_TOTAL)}
                            disabled={!isOnline}
                            style={{
                              padding: '0.75rem 1.5rem',
                              background: !isOnline ? '#6c757d' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: !isOnline ? 'not-allowed' : 'pointer',
                              fontWeight: 'bold',
                              fontSize: '1rem',
                              opacity: !isOnline ? 0.6 : 1
                            }}
                          >
                            COBRAR
                          </button>
                        </>
                      ) : (
                        <div style={{ color: '#666', fontSize: '0.9rem' }}>
                          {!cashSessionActive ? 'Abre caja para cobrar' : 'Mesa no encontrada'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
      </div>
      </div>

      {/* Recibo */}
      {showRecibo && reciboData && (
        <Recibo
          order={reciboData.order}
          payment={reciboData.payment}
          items={reciboData.items}
          onClose={() => {
            setShowRecibo(false);
            setReciboData(null);
            const fn = pendingRefreshRef.current;
            pendingRefreshRef.current = null;
            if (fn) fn();
          }}
          onPrint={() => {
            // Opcional: callback después de imprimir
          }}
        />
      )}

      {/* Comanda Cocina */}
      {showComanda && comandaOrder && (
        <ComandaCocina
          order={comandaOrder}
          onClose={() => {
            setShowComanda(false);
            setComandaOrder(null);
          }}
          onPrint={() => {
            // Opcional: callback después de imprimir
          }}
        />
      )}

      {/* Modal para producto personalizado */}
      {showCustomProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, pointerEvents: 'auto' }}>
          <div style={{ background: 'white', padding: '2rem', borderRadius: '12px', maxWidth: '500px', width: '90%' }}>
            <h3 style={{ marginBottom: '1rem' }}>Producto Personalizado (OTRO)</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Nombre *</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ej: Comida especial"
                style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Precio *</label>
              <input
                type="number"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="100"
                style={{ width: '100%', padding: '0.5rem', fontSize: '1rem', border: '1px solid #ddd', borderRadius: '6px' }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Cantidad</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button onClick={() => setCustomQty(Math.max(1, customQty - 1))} style={{ padding: '0.5rem 1rem', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>−</button>
                <input type="number" value={customQty} onChange={(e) => setCustomQty(parseInt(e.target.value) || 1)} min="1" style={{ width: '80px', padding: '0.5rem', textAlign: 'center', border: '1px solid #ddd', borderRadius: '6px' }} />
                <button onClick={() => setCustomQty(customQty + 1)} style={{ padding: '0.5rem 1rem', background: '#F5BB4C', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>+</button>
              </div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Notas</label>
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
                onClick={addCustomItem}
                style={{ flex: 1, padding: '0.75rem', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Agregar
              </button>
              <button
                onClick={() => {
                  setShowCustomProduct(false);
                  setCustomName('');
                  setCustomPrice('');
                  setCustomQty(1);
                  setCustomNotes('');
                }}
                style={{ flex: 1, padding: '0.75rem', background: '#ccc', color: 'black', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
