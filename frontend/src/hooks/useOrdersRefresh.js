/**
 * Hook reutilizable para refrescar vistas de órdenes después de acciones que pueden archivar/desarchivar
 * FASE 16.3: Refresco instantáneo cuando una orden se archiva/desarchiva
 */

/**
 * Crea funciones de refresh optimista + refetch para CentroTotal
 * @param {Object} params
 * @param {Function} params.loadReadyToPay - Función para cargar órdenes listas para cobrar
 * @param {Function} params.loadTables - Función para cargar mesas
 * @param {Function} params.loadKitchenOrders - Función para cargar órdenes de cocina
 * @param {Function} params.loadOpenOrdersForService - Función para cargar órdenes por servicio
 * @param {Function} params.setReadyToPayOrders - Setter para estado de órdenes listas
 * @param {Function} params.setTables - Setter para estado de mesas
 * @param {Function} params.setKitchenOrders - Setter para estado de órdenes de cocina
 * @param {Function} params.setOpenOrdersVentanilla - Setter para órdenes de ventanilla
 * @param {Function} params.setOpenOrdersDomicilio - Setter para órdenes de domicilio
 * @param {string} params.activeTab - Tab activo ('mesas', 'cocina', 'listo')
 * @param {string} params.mesasView - Vista de mesas ('plano', 'lista')
 * @returns {Object} Funciones de refresh
 */
export function useCentroTotalRefresh({
  loadReadyToPay,
  loadTables,
  loadKitchenOrders,
  loadOpenOrdersForService,
  setReadyToPayOrders,
  setTables,
  setKitchenOrders,
  setOpenOrdersVentanilla,
  setOpenOrdersDomicilio,
  activeTab,
  mesasView
}) {
  /**
   * Refresh optimista: quita la orden del estado local inmediatamente
   * Luego hace refetch para sincronizar con backend
   */
  const refreshAfterArchive = async (orderId) => {
    // FASE 16.4.3.A: Optimistic remove de todas las listas locales
    if (setReadyToPayOrders) {
      setReadyToPayOrders(prev => prev.filter(o => o.id !== orderId));
    }
    if (setOpenOrdersVentanilla) {
      setOpenOrdersVentanilla(prev => prev.filter(o => o.id !== orderId));
    }
    if (setOpenOrdersDomicilio) {
      setOpenOrdersDomicilio(prev => prev.filter(o => o.id !== orderId));
    }
    
    // Refetch según tab activo
    if (activeTab === 'listo') {
      await loadReadyToPay?.();
    } else if (activeTab === 'cocina') {
      await loadKitchenOrders?.();
    } else if (activeTab === 'mesas') {
      await loadTables?.();
      // Ya no se cargan órdenes por servicio en modo LISTA
      // Las órdenes se muestran dentro de cada mesa cuando se navega a ella
    }
  };

  /**
   * Refresh completo del tab activo
   */
  const refreshActiveTab = async () => {
    if (activeTab === 'listo') {
      await loadReadyToPay?.();
    } else if (activeTab === 'cocina') {
      await loadKitchenOrders?.();
    } else if (activeTab === 'mesas') {
      await loadTables?.();
      // Ya no se cargan órdenes por servicio en modo LISTA
      // Las órdenes se muestran dentro de cada mesa cuando se navega a ella
    }
  };

  return {
    refreshAfterArchive,
    refreshActiveTab
  };
}

/**
 * Crea funciones de refresh para DetalleMesa
 * @param {Object} params
 * @param {Function} params.loadTableData - Función para cargar datos de mesa
 * @param {Function} params.loadActiveOrder - Función para cargar orden activa
 * @param {Function} params.loadOpenOrdersByService - Función para cargar órdenes por servicio
 * @param {Function} params.navigate - Función de navegación
 * @param {Function} params.isSpecialTable - Función para verificar si es mesa especial
 * @param {Object} params.tableData - Datos de la mesa actual
 * @returns {Object} Funciones de refresh
 */
export function useDetalleMesaRefresh({
  loadTableData,
  loadActiveOrder,
  loadOpenOrdersByService,
  navigate,
  isSpecialTable,
  tableData
}) {
  /**
   * Refresh después de cobrar/cancelar/anular
   * Si la orden quedó archivada (PAGADA/CANCELADO), navega de vuelta
   * Si quedó LISTO, recarga la mesa
   */
  const refreshAfterPayment = async (orderId, orderStatus) => {
    const isArchived = orderStatus === 'PAGADA' || orderStatus === 'CANCELADO';
    
    if (isArchived) {
      // Orden archivada: navegar de vuelta a CentroTotal
      navigate('/centro-total', { replace: true });
    } else {
      // Orden sigue activa: recargar datos de la mesa
      const data = await loadTableData?.();
      if (data?.table && isSpecialTable?.(data.table?.number)) {
        await loadOpenOrdersByService?.(data.table);
      } else {
        await loadActiveOrder?.();
      }
    }
  };

  /**
   * Refresh simple de la mesa actual
   */
  const refreshMesa = async () => {
    const data = await loadTableData?.();
    if (data?.table && isSpecialTable?.(data.table?.number)) {
      await loadOpenOrdersByService?.(data.table);
    } else {
      await loadActiveOrder?.();
    }
  };

  return {
    refreshAfterPayment,
    refreshMesa
  };
}

/**
 * Crea funciones de refresh para Ventanilla/Domicilios
 * @param {Object} params
 * @param {Function} params.loadOrders - Función para cargar órdenes
 * @param {Function} params.setOpenOrders - Setter para estado de órdenes
 * @returns {Object} Funciones de refresh
 */
export function useVentanillaRefresh({
  loadOrders,
  setOpenOrders
}) {
  /**
   * Refresh optimista: quita la orden del estado local
   * Luego hace refetch
   */
  const refreshAfterArchive = async (orderId) => {
    // Optimistic remove
    if (setOpenOrders) {
      setOpenOrders(prev => prev.filter(o => o.id !== orderId));
    }
    
    // Refetch
    await loadOrders?.();
  };

  /**
   * Refresh completo
   */
  const refresh = async () => {
    await loadOrders?.();
  };

  return {
    refreshAfterArchive,
    refresh
  };
}
