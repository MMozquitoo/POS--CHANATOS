import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import { formatBogotaTime, formatBogotaDateTime, getBogotaDateString } from '../../utils/timezone.js';
import CajaHeader from '../../components/CajaHeader.jsx';
import { useDebounce } from '../../hooks/useDebounce';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function Auditoria() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  
  // Estados principales
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados de filtros
  const [dateRange, setDateRange] = useState('HOY');
  const [fromDate, setFromDate] = useState(getBogotaDateString());
  const [toDate, setToDate] = useState(getBogotaDateString());
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [tableFilter, setTableFilter] = useState('TODAS');
  const [searchCode, setSearchCode] = useState('');
  const debouncedSearch = useDebounce(searchCode, 300);

  // Estados de detalle
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    loadEvents();
  }, [dateRange, fromDate, toDate, typeFilter, tableFilter, debouncedSearch]);

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

  const loadEvents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (tableFilter !== 'TODAS') params.append('tableNumber', tableFilter);
      if (debouncedSearch.trim()) params.append('orderCode', debouncedSearch.trim());
      params.append('limit', '200');
      
      const res = await axios.get(`/audit?${params.toString()}`);
      setEvents(res.data.events || []);
    } catch (error) {
      console.error('Error cargando auditoría:', error);
      showAlert('Error al cargar auditoría');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action) => {
    const labels = {
      'ORDER_CREATED': 'Orden Creada',
      'ORDER_STATUS_CHANGED': 'Estado Cambiado',
      'ORDER_CANCELLED': 'Orden Cancelada',
      'ORDER_ARCHIVED': 'Orden Archivada',
      'PAYMENT_CREATED': 'Pago Creado',
      'ORDER_ITEM_ADDED': 'Item Agregado',
      'ORDER_ITEM_UPDATED': 'Item Actualizado',
      'ORDER_ITEM_REMOVED': 'Item Eliminado',
      'CASH_OPENED': 'Caja Abierta',
      'CASH_CLOSED': 'Caja Cerrada'
    };
    return labels[action] || action;
  };

  const getEntityTypeLabel = (entityType) => {
    const labels = {
      'order': 'Orden',
      'payment': 'Pago',
      'order_item': 'Item',
      'cash_session': 'Caja'
    };
    return labels[entityType] || entityType;
  };

  const getTableLabel = (event) => {
    if (event.table_number === 9) return 'VENTANILLA';
    if (event.table_number === 10) return 'DOMICILIOS';
    if (event.table_number) return `Mesa ${event.table_number}`;
    return null;
  };

  return (
    <div className="caja-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <CajaHeader title="AUDITORÍA" backTo="/mas" />

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

          {/* Tipo y Mesa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: 'bold' }}>
                Tipo
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}
              >
                <option value="ALL">TODO</option>
                <option value="PAYMENTS">PAGOS</option>
                <option value="ORDERS">ÓRDENES</option>
                <option value="ITEMS">ITEMS</option>
                <option value="CASH">CAJA</option>
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
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Total Eventos</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#333' }}>
              {events.length}
            </div>
          </div>
        </div>

        {/* Lista de eventos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Cargando eventos...
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                No hay eventos registrados
              </div>
              <div style={{ fontSize: '0.9rem' }}>
                Ajusta los filtros para ver más resultados
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {events.map(event => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
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
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#333', marginBottom: '0.25rem' }}>
                        {getActionLabel(event.action)}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {event.summary || 'Sin resumen'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '0.85rem', 
                        color: '#666',
                        padding: '0.25rem 0.5rem',
                        background: '#f8f9fa',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginBottom: '0.25rem'
                      }}>
                        {getEntityTypeLabel(event.entity_type)}
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #eee',
                    fontSize: '0.85rem',
                    color: '#666'
                  }}>
                    <div>
                      {formatBogotaTime(event.created_at)}
                    </div>
                    <div>
                      {event.user_name || `Usuario #${event.user_id || 'N/A'}`}
                      {getTableLabel(event) && ` • ${getTableLabel(event)}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle */}
      {selectedEvent && (
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
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Detalle del Evento</h2>
              <button
                onClick={() => setSelectedEvent(null)}
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

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '8px' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Acción:</strong> {getActionLabel(selectedEvent.action)}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Tipo:</strong> {getEntityTypeLabel(selectedEvent.entity_type)}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Fecha/Hora:</strong> {formatBogotaDateTime(new Date(selectedEvent.created_at))}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Usuario:</strong> {selectedEvent.user_name || `Usuario #${selectedEvent.user_id || 'N/A'}`}
                </div>
                {selectedEvent.table_number && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Mesa:</strong> {getTableLabel(selectedEvent)}
                  </div>
                )}
                {selectedEvent.order_id && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Orden ID:</strong> {selectedEvent.order_id}
                  </div>
                )}
                {selectedEvent.summary && (
                  <div>
                    <strong>Resumen:</strong> {selectedEvent.summary}
                  </div>
                )}
              </div>

              {selectedEvent.meta && Object.keys(selectedEvent.meta).length > 0 && (
                <div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Detalles (Meta)</h3>
                  <pre style={{
                    padding: '1rem',
                    background: '#f8f9fa',
                    borderRadius: '8px',
                    overflow: 'auto',
                    fontSize: '0.85rem',
                    border: '1px solid #ddd'
                  }}>
                    {JSON.stringify(selectedEvent.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
