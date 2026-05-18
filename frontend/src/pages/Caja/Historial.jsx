import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaTime, formatBogotaDateTime, getBogotaDateString } from '../../utils/timezone.js';
import Recibo from '../../components/Recibo.jsx';
import CajaHeader from '../../components/CajaHeader.jsx';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { useDebounce } from '../../hooks/useDebounce';

export default function Historial() {
  const navigate = useNavigate();
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();

  // Estados principales
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de filtros
  const [dateRange, setDateRange] = useState('HOY'); // HOY, AYER, 7_DIAS, RANGO
  const [fromDate, setFromDate] = useState(getBogotaDateString());
  const [toDate, setToDate] = useState(getBogotaDateString());
  const [methodFilter, setMethodFilter] = useState('TODOS');
  const [tableFilter, setTableFilter] = useState('TODAS');
  const [searchCode, setSearchCode] = useState('');
  const debouncedSearch = useDebounce(searchCode, 300);

  // Estados de detalle
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  
  // Estados para anulación (FASE 12.5)
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidingPayment, setVoidingPayment] = useState(false);

  useEffect(() => {
    loadPayments();
  }, [dateRange, fromDate, toDate, methodFilter, tableFilter, debouncedSearch]);

  // Calcular fechas según rango rápido
  useEffect(() => {
    const today = new Date();
    const bogotaDate = getBogotaDateString();
    
    if (dateRange === 'HOY') {
      setFromDate(bogotaDate);
      setToDate(bogotaDate);
    } else if (dateRange === 'AYER') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      setFromDate(yesterdayStr);
      setToDate(yesterdayStr);
    } else if (dateRange === '7_DIAS') {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
      setFromDate(sevenDaysAgoStr);
      setToDate(bogotaDate);
    }
  }, [dateRange]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (methodFilter !== 'TODOS') params.append('method', methodFilter);
      if (tableFilter !== 'TODAS') params.append('tableNumber', tableFilter);
      if (debouncedSearch.trim()) params.append('orderCode', debouncedSearch.trim());
      params.append('limit', '200');
      
      const res = await axios.get(`/payments?${params.toString()}`);
      // Asegurar que siempre sea un array
      const paymentsData = res.data?.payments || res.data || [];
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
    } catch (error) {
      console.error('Error cargando pagos:', error);
      // No crashear la UI, solo mostrar array vacío
      setPayments([]);
      // Solo mostrar alert si es un error crítico (no 404, etc.)
      if (error.response?.status !== 404) {
        await showAlert('Error al cargar historial de pagos');
      }
    } finally {
      setLoading(false);
    }
  };

  const getMethodLabel = (method) => {
    const labels = {
      EFECTIVO: 'Efectivo',
      TARJETA: 'Tarjeta',
      TRANSFERENCIA: 'Transferencia'
    };
    return labels[method] || method;
  };

  const getMethodColor = (method) => {
    const colors = {
      EFECTIVO: '#28a745',
      TARJETA: '#F5BB4C',
      TRANSFERENCIA: '#6c757d'
    };
    return colors[method] || '#666';
  };

  const getTableLabel = (payment) => {
    if (payment.table_number === 9) return 'VENTANILLA';
    if (payment.table_number === 10) return 'DOMICILIOS';
    if (payment.table_number) return `Mesa ${payment.table_number}`;
    return 'SIN MESA';
  };

  const getOrderCode = (payment) => {
    return payment.daily_no ? `ORDEN ${payment.daily_no}` : payment.order_code || `#${payment.order_id}`;
  };

  const handleViewDetail = async (payment) => {
    setSelectedPayment(payment);
    setShowVoidModal(false);
    setVoidReason('');
    setLoadingReceipt(true);
    
    try {
      const res = await axios.get(`/orders/${payment.order_id}/receipt-data`);
      const data = res.data;
      
      // Construir datos para Recibo.jsx
      const receiptData = {
        order: {
          id: data.order.id,
          code: data.order.code,
          daily_no: data.order.daily_no,
          table_id: data.order.table_id,
          table_label: data.order.table_label,
          created_at: data.order.created_at
        },
        payment: {
          id: payment.id,
          method: payment.method,
          amount: payment.amount,
          created_at: payment.created_at
        },
        items: data.items,
        changeAmount: 0 // Para reimpresión, no hay vuelto
      };
      
      setReceiptData(receiptData);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      await showAlert('Error al cargar detalle del pago');
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handlePrintReceipt = () => {
    setShowReceipt(true);
  };

  const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <>
    <div className="caja-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header unificado (FASE 13.3) */}
      <CajaHeader title="HISTORIAL DE PAGOS" backTo="/mas" />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Filtros */}
        <div style={{ 
          padding: '1rem', 
          background: '#f8f9fa', 
          borderBottom: '2px solid #ddd',
          flexShrink: 0,
          overflowY: 'auto'
        }}>
          {/* Rango rápido */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Rango de Fecha
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['HOY', 'AYER', '7_DIAS', 'RANGO'].map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: dateRange === range ? '#F5BB4C' : 'white',
                    color: dateRange === range ? 'white' : '#333',
                    border: '2px solid #F5BB4C',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.9rem'
                  }}
                >
                  {range === '7_DIAS' ? '7 DÍAS' : range}
                </button>
              ))}
            </div>
          </div>

          {/* Fechas personalizadas (solo si RANGO) */}
          {dateRange === 'RANGO' && (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                  Desde
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                  Hasta
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '0.9rem'
                  }}
                />
              </div>
            </div>
          )}

          {/* Método y Mesa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: 'bold' }}>
                Método
              </label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="TODOS">TODOS</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TARJETA">TARJETA</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: 'bold' }}>
                Mesa
              </label>
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="TODAS">TODAS</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <option key={num} value={num}>
                    {num === 9 ? 'VENTANILLA' : num === 10 ? 'DOMICILIOS' : `Mesa ${num}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Búsqueda por código */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: 'bold' }}>
              Buscar Orden
            </label>
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="Código de orden..."
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>

        {/* Resumen */}
        <div style={{ 
          padding: '1rem', 
          background: 'white', 
          borderBottom: '1px solid #ddd',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Total Pagos</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F5BB4C' }}>
              {formatPriceCOP(total)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Cantidad</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333' }}>
              {payments.length}
            </div>
          </div>
        </div>

        {/* Lista de pagos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Cargando pagos...
            </div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                No hay pagos registrados
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                Ajusta los filtros para ver más resultados
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {payments.map(payment => (
                <button
                  key={payment.id}
                  onClick={() => handleViewDetail(payment)}
                  style={{
                    padding: '1rem',
                    background: 'white',
                    border: '2px solid #ddd',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.borderColor = '#F5BB4C';
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.borderColor = '#ddd';
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#333', marginBottom: '0.25rem' }}>
                        {getOrderCode(payment)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {getTableLabel(payment)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '1.3rem', 
                        color: getMethodColor(payment.method),
                        marginBottom: '0.25rem'
                      }}>
                        {formatPriceCOP(payment.amount)}
                      </div>
                      <div style={{ 
                        fontSize: '0.85rem', 
                        color: '#666',
                        padding: '0.25rem 0.5rem',
                        background: '#f8f9fa',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        {getMethodLabel(payment.method)}
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #eee'
                  }}>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      {formatBogotaTime(payment.created_at)}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>
                      Por: {payment.created_by_name || 'Usuario'}
                    </div>
                    {payment.voided_at && (
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#dc3545',
                        padding: '0.25rem 0.5rem',
                        background: '#f8d7da',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                      }}>
                        ANULADO
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle */}
      {selectedPayment && (
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
          zIndex: 1000,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Detalle de Pago</h2>
              <button
                onClick={() => {
                  setSelectedPayment(null);
                  setReceiptData(null);
                  setShowReceipt(false);
                  setShowVoidModal(false);
                  setVoidReason('');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Cerrar
              </button>
            </div>

            {/* FASE 12.5: Badge de anulado */}
            {selectedPayment.voided_at && (
              <div style={{ 
                padding: '1rem', 
                background: '#f8d7da', 
                border: '1px solid #dc3545', 
                borderRadius: '8px', 
                marginBottom: '1rem',
                color: '#721c24'
              }}>
                <strong>PAGO ANULADO</strong>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  <div><strong>Anulado por:</strong> {selectedPayment.voided_by_name || 'Usuario'}</div>
                  <div><strong>Fecha:</strong> {formatBogotaDateTime(new Date(selectedPayment.voided_at))}</div>
                  {selectedPayment.void_reason && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong>Motivo:</strong> {selectedPayment.void_reason}
                    </div>
                  )}
                </div>
              </div>
            )}

            {loadingReceipt ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                Cargando detalle...
              </div>
            ) : receiptData ? (
              <div>
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Orden:</strong> {getOrderCode(selectedPayment)}
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Mesa:</strong> {getTableLabel(selectedPayment)}
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Fecha/Hora:</strong> {formatBogotaDateTime(new Date(selectedPayment.created_at))}
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Método:</strong> {getMethodLabel(selectedPayment.method)}
                  </div>
                  <div>
                    <strong>Total:</strong> {formatPriceCOP(selectedPayment.amount)}
                  </div>
                </div>

                {receiptData.items && receiptData.items.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Items</h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {receiptData.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.75rem',
                            background: 'white',
                            border: '1px solid #ddd',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                            <div style={{ fontSize: '0.85rem', color: '#666' }}>
                              {item.qty}x {formatPriceCOP(item.price)}
                            </div>
                          </div>
                          <div style={{ fontWeight: 'bold' }}>
                            {formatPriceCOP(item.qty * item.price)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    onClick={handlePrintReceipt}
                    style={{
                      padding: '1rem',
                      background: '#F5BB4C',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '1rem',
                      flex: 1
                    }}
                  >
                    REIMPRIMIR RECIBO
                  </button>
                  
                  {/* FASE 12.5: Botón anular pago (solo si no está anulado) */}
                  {!selectedPayment.voided_at && (
                    <button
                      onClick={() => setShowVoidModal(true)}
                      style={{
                        padding: '1rem',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '1rem',
                        flex: 1
                      }}
                    >
                      ANULAR PAGO
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                Error al cargar detalle
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recibo para reimpresión */}
      {showReceipt && receiptData && (
        <Recibo
          order={receiptData.order}
          payment={receiptData.payment}
          items={receiptData.items}
          changeAmount={receiptData.changeAmount}
          onClose={() => {
            setShowReceipt(false);
          }}
          onPrint={() => {
            // Opcional: callback después de imprimir
          }}
        />
      )}

      {/* FASE 12.5: Modal de anulación */}
      {showVoidModal && selectedPayment && (
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
              Anular Pago
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                Pago: {formatPriceCOP(selectedPayment.amount)} - {getMethodLabel(selectedPayment.method)}
              </div>
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                Orden: {getOrderCode(selectedPayment)}
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Motivo de anulación (mínimo 5 caracteres) *
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
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
                  setShowVoidModal(false);
                  setVoidReason('');
                }}
                disabled={voidingPayment}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: voidingPayment ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  flex: 1,
                  opacity: voidingPayment ? 0.6 : 1
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!voidReason.trim() || voidReason.trim().length < 5) {
                    await showAlert('El motivo debe tener al menos 5 caracteres');
                    return;
                  }

                  if (!(await showConfirm(`¿Confirma anular este pago?\n\nMotivo: ${voidReason.trim()}`))) {
                    return;
                  }

                  setVoidingPayment(true);
                  try {
                    await axios.post(`/payments/${selectedPayment.id}/void`, {
                      reason: voidReason.trim()
                    });

                    await showAlert('Pago anulado correctamente');
                    await loadPayments();
                    // Recargar el detalle del pago actualizado
                    const updatedPayment = payments.find(p => p.id === selectedPayment.id);
                    if (updatedPayment) {
                      setSelectedPayment(updatedPayment);
                    }
                    setShowVoidModal(false);
                    setVoidReason('');
                  } catch (error) {
                    console.error('Error anulando pago:', error);
                    await showAlert(error.response?.data?.error || 'Error al anular pago');
                  } finally {
                    setVoidingPayment(false);
                  }
                }}
                disabled={voidingPayment || !voidReason.trim() || voidReason.trim().length < 5}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: (voidingPayment || !voidReason.trim() || voidReason.trim().length < 5) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  flex: 1,
                  opacity: (voidingPayment || !voidReason.trim() || voidReason.trim().length < 5) ? 0.6 : 1
                }}
              >
                {voidingPayment ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
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
