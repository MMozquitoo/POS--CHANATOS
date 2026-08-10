import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import './Reportes.css';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaTime, formatBogotaDateTime, getBogotaDateString } from '../../utils/timezone.js';
import Recibo from '../../components/Recibo.jsx';
import CajaHeader from '../../components/CajaHeader.jsx';
import Modal from '../../components/Modal';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { useDebounce } from '../../hooks/useDebounce';

// embedded=true: se usa dentro de HistorialGeneral.jsx (pestaña "Pagos"), sin
// su propio CajaHeader/container.
export default function Historial({ embedded = false }) {
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

  // Desglose de items desplegado por tarjeta (mismo patrón de Listo para cobrar)
  const [expandedIds, setExpandedIds] = useState(new Set());

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
      EFECTIVO: 'var(--green-text)',
      TARJETA: 'var(--brand-deep)',
      TRANSFERENCIA: 'var(--blue-text)'
    };
    return colors[method] || 'var(--gray-600)';
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

  const content = (
    <div className={embedded ? undefined : "caja-container"} style={{ height: embedded ? '100%' : '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header unificado (FASE 13.3) */}
      {!embedded && <CajaHeader title="HISTORIAL DE PAGOS" backTo="/mas" />}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Filtros */}
        <div style={{
          padding: '1rem',
          background: 'var(--gray-50)',
          borderBottom: '1px solid var(--separator)',
          flexShrink: 0,
          overflowY: 'auto'
        }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          {/* Rango rápido */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-500)', marginBottom: '0.5rem', fontWeight: 700 }}>
              Rango de Fecha
            </div>
            <div className="segmented">
              {['HOY', 'AYER', '7_DIAS', 'RANGO'].map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`segmented__btn${dateRange === range ? ' is-active' : ''}`}
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
                <label style={{ display: 'block', fontSize: 'var(--text-13)', color: 'var(--gray-500)', marginBottom: '0.25rem' }}>
                  Desde
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-15)'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 'var(--text-13)', color: 'var(--gray-500)', marginBottom: '0.25rem' }}>
                  Hasta
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-15)'
                  }}
                />
              </div>
            </div>
          )}

          {/* Método y Mesa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-13)', color: 'var(--gray-500)', marginBottom: '0.25rem', fontWeight: 700 }}>
                Método
              </label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-15)'
                }}
              >
                <option value="TODOS">TODOS</option>
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TARJETA">TARJETA</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-13)', color: 'var(--gray-500)', marginBottom: '0.25rem', fontWeight: 700 }}>
                Mesa
              </label>
              <select
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-15)'
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
            <label style={{ display: 'block', fontSize: 'var(--text-13)', color: 'var(--gray-500)', marginBottom: '0.25rem', fontWeight: 700 }}>
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
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-15)'
              }}
            />
          </div>
        </div>
        </div>

        {/* Resumen */}
        <div style={{
          padding: '1rem',
          background: '#fff',
          borderBottom: '1px solid var(--separator)',
          flexShrink: 0
        }}>
          <div className="rep-kpis" style={{ maxWidth: '720px', margin: '0 auto', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="rep-kpi">
              <div className="rep-kpi-value" style={{ color: 'var(--brand-deep)' }}>{formatPriceCOP(total)}</div>
              <div className="rep-kpi-label">Total Pagos</div>
            </div>
            <div className="rep-kpi">
              <div className="rep-kpi-value">{payments.length}</div>
              <div className="rep-kpi-label">Cantidad</div>
            </div>
          </div>
        </div>

        {/* Lista de pagos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
              Cargando pagos...
            </div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
              <div style={{ fontSize: 'var(--text-20)', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--gray-900)' }}>
                No hay pagos registrados
              </div>
              <div style={{ fontSize: 'var(--text-15)' }}>
                Ajusta los filtros para ver más resultados
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '720px', margin: '0 auto' }}>
              {payments.map(payment => (
                <button
                  key={payment.id}
                  onClick={() => handleViewDetail(payment)}
                  className="card card--tap"
                  style={{ width: '100%', textAlign: 'left', border: 'none' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-17)', color: 'var(--gray-900)', marginBottom: '0.25rem' }}>
                        {getOrderCode(payment)}
                      </div>
                      <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-500)' }}>
                        {getTableLabel(payment)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="tnum" style={{
                        fontWeight: 700,
                        fontSize: 'var(--text-20)',
                        color: getMethodColor(payment.method),
                        marginBottom: '0.25rem'
                      }}>
                        {formatPriceCOP(payment.amount)}
                      </div>
                      <div style={{
                        fontSize: 'var(--text-13)',
                        color: 'var(--gray-600)',
                        padding: '0.25rem 0.5rem',
                        background: 'var(--gray-50)',
                        borderRadius: 'var(--radius-xs)',
                        display: 'inline-block'
                      }}>
                        {getMethodLabel(payment.method)}
                      </div>
                      {(payment.items || []).length > 0 && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(payment.id)) next.delete(payment.id);
                              else next.add(payment.id);
                              return next;
                            });
                          }}
                          style={{
                            marginTop: '0.35rem',
                            fontSize: 'var(--text-13)',
                            color: 'var(--gray-500)',
                            textDecoration: 'underline',
                            cursor: 'pointer'
                          }}
                        >
                          {payment.items.length} item(s) {expandedIds.has(payment.id) ? '▴' : '▾'}
                        </div>
                      )}
                    </div>
                  </div>
                  {expandedIds.has(payment.id) && (payment.items || []).length > 0 && (
                    <div style={{
                      margin: '0.25rem 0 0.5rem',
                      padding: '0.6rem 0.75rem',
                      background: 'var(--gray-50)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-13)',
                      color: 'var(--gray-900)'
                    }}>
                      {payment.items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: idx < payment.items.length - 1 ? '0.3rem' : 0 }}>
                          <span style={{ minWidth: 0 }}>
                            {item.qty}x {item.name}
                            {item.notes && (
                              <span style={{ color: 'var(--gray-500)', fontStyle: 'italic' }}> — {item.notes}</span>
                            )}
                          </span>
                          <span className="tnum" style={{ flexShrink: 0, fontWeight: 600 }}>
                            {formatPriceCOP(item.qty * item.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid var(--separator)'
                  }}>
                    <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-500)' }}>
                      {formatBogotaTime(payment.created_at)}
                    </div>
                    <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-500)' }}>
                      Por: {payment.created_by_name || 'Usuario'}
                    </div>
                    {payment.voided_at && (
                      <span className="pill pill--cancelado">ANULADO</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle */}
      <Modal
        open={!!selectedPayment}
        onClose={() => {
          setSelectedPayment(null);
          setReceiptData(null);
          setShowReceipt(false);
          setShowVoidModal(false);
          setVoidReason('');
        }}
        title="Detalle de Pago"
        actions={
          selectedPayment && !loadingReceipt && receiptData ? (
            <>
              <button
                onClick={() => {
                  setSelectedPayment(null);
                  setReceiptData(null);
                  setShowReceipt(false);
                  setShowVoidModal(false);
                  setVoidReason('');
                }}
                className="btn-secondary"
              >
                Cerrar
              </button>
              <button onClick={handlePrintReceipt} className="btn-chanatos">
                REIMPRIMIR RECIBO
              </button>
              {!selectedPayment.voided_at && (
                <button onClick={() => setShowVoidModal(true)} className="btn-danger">
                  ANULAR PAGO
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => {
                setSelectedPayment(null);
                setReceiptData(null);
              }}
              className="btn-secondary"
            >
              Cerrar
            </button>
          )
        }
      >
        {selectedPayment && (
          <>
            {/* FASE 12.5: Badge de anulado */}
            {selectedPayment.voided_at && (
              <div style={{
                padding: '1rem',
                background: 'var(--red-tint)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1rem',
                color: 'var(--red-text)'
              }}>
                <strong>PAGO ANULADO</strong>
                <div style={{ marginTop: '0.5rem', fontSize: 'var(--text-15)' }}>
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
                <div className="list-group list-group--inset" style={{ marginBottom: '1rem' }}>
                  <div className="list-row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Orden</span>
                    <strong>{getOrderCode(selectedPayment)}</strong>
                  </div>
                  <div className="list-row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Mesa</span>
                    <strong>{getTableLabel(selectedPayment)}</strong>
                  </div>
                  <div className="list-row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Fecha/Hora</span>
                    <strong>{formatBogotaDateTime(new Date(selectedPayment.created_at))}</strong>
                  </div>
                  <div className="list-row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Método</span>
                    <strong>{getMethodLabel(selectedPayment.method)}</strong>
                  </div>
                  <div className="list-row" style={{ justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Total</span>
                    <strong className="tnum">{formatPriceCOP(selectedPayment.amount)}</strong>
                  </div>
                </div>

                {receiptData.items && receiptData.items.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div className="list-header" style={{ padding: '0 0 8px' }}>Items</div>
                    <div className="list-group list-group--inset">
                      {receiptData.items.map((item, idx) => (
                        <div key={idx} className="list-row" style={{ justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>{item.name}</div>
                            <div style={{ fontSize: 'var(--text-13)', color: 'var(--gray-500)' }}>
                              {item.qty}x {formatPriceCOP(item.price)}
                            </div>
                          </div>
                          <div className="tnum" style={{ fontWeight: 700 }}>
                            {formatPriceCOP(item.qty * item.price)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                Error al cargar detalle
              </div>
            )}
          </>
        )}
      </Modal>

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
      <Modal
        open={showVoidModal && !!selectedPayment}
        onClose={() => {
          setShowVoidModal(false);
          setVoidReason('');
        }}
        title="Anular Pago"
        actions={
          <>
            <button
              onClick={() => {
                setShowVoidModal(false);
                setVoidReason('');
              }}
              disabled={voidingPayment}
              className="btn-secondary"
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
              className="btn-danger"
            >
              {voidingPayment ? 'Anulando...' : 'Confirmar Anulación'}
            </button>
          </>
        }
      >
        {selectedPayment && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', fontSize: 'var(--text-15)', color: 'var(--gray-500)' }}>
                Pago: {formatPriceCOP(selectedPayment.amount)} - {getMethodLabel(selectedPayment.method)}
              </div>
              <div style={{ fontSize: 'var(--text-15)', color: 'var(--gray-500)' }}>
                Orden: {getOrderCode(selectedPayment)}
              </div>
            </div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700 }}>
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
                border: '1px solid var(--gray-200)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-15)',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </>
        )}
      </Modal>
    </div>
  );

  return (
    <>
    {content}
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
