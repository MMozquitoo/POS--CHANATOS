import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Caja.css';
import { formatBogotaTime, formatBogotaDate, getBogotaDateString } from '../../utils/timezone.js';
import { formatPriceCOP, formatPriceSimplified } from '../../utils/currency.js';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function HistorialSesiones() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState([]);
  const [daysWithSessions, setDaysWithSessions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayStats, setDayStats] = useState(null);
  const [manualTransactions, setManualTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: 'INGRESO',
    description: '',
    amount: ''
  });

  useEffect(() => {
    loadHistory();
  }, [currentDate]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const res = await axios.get(`/cash/history?month=${month}&year=${year}`);
      setSessions(res.data.sessions);
      setDaysWithSessions(res.data.daysWithSessions);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDayStats = async (date) => {
    setLoadingStats(true);
    setSelectedDate(date);
    try {
      const [statsRes, transactionsRes] = await Promise.all([
        axios.get(`/cash/stats/${date}`),
        axios.get(`/cash/manual-transactions/${date}`)
      ]);
      setDayStats(statsRes.data);
      setManualTransactions(transactionsRes.data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
      setDayStats(null);
      setManualTransactions([]);
    } finally {
      setLoadingStats(false);
    }
  };

  const addManualTransaction = async () => {
    if (!selectedDate) return;
    if (!newTransaction.description.trim() || !newTransaction.amount || parseFloat(newTransaction.amount) <= 0) {
      showAlert('Completa todos los campos correctamente');
      return;
    }

    try {
      await axios.post('/cash/manual-transactions', {
        transaction_date: selectedDate,
        type: newTransaction.type,
        description: newTransaction.description.trim(),
        amount: parseFloat(newTransaction.amount)
      });
      
      // Recargar transacciones y estadísticas
      await loadDayStats(selectedDate);
      
      // Resetear formulario
      setNewTransaction({ type: 'INGRESO', description: '', amount: '' });
      setShowAddTransaction(false);
      showAlert('Transacción agregada correctamente');
    } catch (error) {
      console.error('Error agregando transacción:', error);
      showAlert(error.response?.data?.error || 'Error al agregar transacción');
    }
  };

  const deleteManualTransaction = async (id) => {
    if (!(await showConfirm('¿Estás seguro de borrar esta transacción?'))) return;

    try {
      await axios.delete(`/cash/manual-transactions/${id}`);
      // Recargar transacciones
      await loadDayStats(selectedDate);
      showAlert('Transacción eliminada correctamente');
    } catch (error) {
      console.error('Error borrando transacción:', error);
      showAlert(error.response?.data?.error || 'Error al borrar transacción');
    }
  };

  const changeMonth = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
    setSelectedDate(null);
    setDayStats(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    const today = getBogotaDateString(); // Usar zona horaria America/Bogota
    loadDayStats(today);
  };

  // Generar días del calendario
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 = Domingo
    
    const days = [];
    
    // Días vacíos al inicio
    for (let i = 0; i < startingDay; i++) {
      days.push({ day: null, date: null });
    }
    
    // Días del mes
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        day: i,
        date: dateStr,
        hasSession: daysWithSessions.includes(dateStr),
        isToday: dateStr === getBogotaDateString(), // Usar zona horaria America/Bogota
        isSelected: dateStr === selectedDate
      });
    }
    
    return days;
  };

  const formatCurrency = (amount) => {
    // Usar formato exacto en COP según reglas operativas
    return formatPriceCOP(amount || 0);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '-';
    // Usar zona horaria America/Bogota
    return formatBogotaTime(dateStr);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // Usar zona horaria America/Bogota
    return formatBogotaDate(dateStr, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="caja-container historial-sesiones">
      <header className="caja-header">
        <button onClick={() => navigate('/')} className="back-btn">← Volver</button>
        <h1>HISTORIAL DE CAJA</h1>
        <button onClick={goToToday} className="today-btn">Hoy</button>
      </header>

      <div className="historial-content">
        {/* Calendario */}
        <div className="calendar-section">
          <div className="calendar-header">
            <button onClick={() => changeMonth(-1)} className="nav-btn">◀</button>
            <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
            <button onClick={() => changeMonth(1)} className="nav-btn">▶</button>
          </div>

          <div className="calendar-grid">
            {dayNames.map(day => (
              <div key={day} className="calendar-day-name">{day}</div>
            ))}
            
            {generateCalendarDays().map((dayInfo, idx) => (
              <div
                key={idx}
                className={`calendar-day ${!dayInfo.day ? 'empty' : ''} 
                           ${dayInfo.hasSession ? 'has-session' : ''} 
                           ${dayInfo.isToday ? 'today' : ''} 
                           ${dayInfo.isSelected ? 'selected' : ''}`}
                onClick={() => dayInfo.day && loadDayStats(dayInfo.date)}
              >
                {dayInfo.day}
                {dayInfo.hasSession && <span className="session-dot">●</span>}
              </div>
            ))}
          </div>

          <div className="calendar-legend">
            <span><span className="dot has-session">●</span> Día con sesión</span>
            <span><span className="dot today">●</span> Hoy</span>
          </div>
        </div>

        {/* Estadísticas del día seleccionado */}
        <div className="stats-section">
          {!selectedDate ? (
            <div className="no-selection">
              <p>👆 Selecciona un día en el calendario para ver las estadísticas</p>
            </div>
          ) : loadingStats ? (
            <div className="loading">Cargando estadísticas...</div>
          ) : !dayStats ? (
            <div className="no-data">
              <p>No hay datos para este día</p>
            </div>
          ) : (
            <>
              <h2>{formatDate(selectedDate)}</h2>

              {/* Resumen de Caja */}
              <div className="stats-card cash-summary">
                <h3>Resumen de Caja</h3>
                {dayStats.sessions.length === 0 ? (
                  <p className="no-sessions">No hubo sesiones de caja este día</p>
                ) : (
                  <>
                    <div className="sessions-list">
                      {dayStats.sessions.map((session, idx) => (
                        <div key={session.id} className={`session-item ${!session.closed_at ? 'open' : ''}`}>
                          <div className="session-header">
                            <span className="session-number">Sesión {idx + 1}</span>
                            <span className={`session-status ${session.closed_at ? 'closed' : 'open'}`}>
                              {session.closed_at ? '✓ Cerrada' : 'Abierta'}
                            </span>
                          </div>
                          <div className="session-times">
                            <span>Apertura: {formatTime(session.opened_at)}</span>
                            {session.closed_at && <span>Cierre: {formatTime(session.closed_at)}</span>}
                          </div>
                          <div className="session-amounts">
                            <div className="amount-item">
                              <span className="label">Efectivo Inicial:</span>
                              <span className="value">{formatCurrency(session.initial_cash)}</span>
                            </div>
                            {session.closed_at && (
                              <div className="amount-item">
                                <span className="label">Efectivo Final:</span>
                                <span className="value">{formatCurrency(session.final_cash)}</span>
                              </div>
                            )}
                          </div>
                          <div className="session-user">
                            <span>Abrió: {session.opened_by_name}</span>
                            {session.closed_by_name && <span>Cerró: {session.closed_by_name}</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="cash-totals">
                      <div className={`total-item ${dayStats.cashSummary.difference >= 0 ? 'positive' : 'negative'}`}>
                        <span className="label">Efectivo Esperado:</span>
                        <span className="value">{formatCurrency(dayStats.cashSummary.expectedCash)}</span>
                      </div>
                      <div className="total-item">
                        <span className="label">Efectivo Contado:</span>
                        <span className="value">{formatCurrency(dayStats.cashSummary.actualCash)}</span>
                      </div>
                      <div className={`total-item difference ${dayStats.cashSummary.difference >= 0 ? 'positive' : 'negative'}`}>
                        <span className="label">Diferencia:</span>
                        <span className="value">
                          {dayStats.cashSummary.difference >= 0 ? '+' : ''}
                          {formatCurrency(dayStats.cashSummary.difference)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Transacciones Manuales (Ingresos/Egresos) */}
              <div className="stats-card manual-transactions">
                <div className="transactions-header">
                  <h3>Ingresos / Egresos Manuales</h3>
                  {selectedDate && (
                    <button 
                      onClick={() => setShowAddTransaction(!showAddTransaction)} 
                      className="add-transaction-btn"
                    >
                      {showAddTransaction ? '✕ Cancelar' : '+ Agregar'}
                    </button>
                  )}
                </div>

                {showAddTransaction && selectedDate && (
                  <div className="add-transaction-form">
                    <div className="form-row">
                      <div className="form-group-small">
                        <label>Tipo</label>
                        <select
                          value={newTransaction.type}
                          onChange={(e) => setNewTransaction({ ...newTransaction, type: e.target.value })}
                          className="form-input"
                        >
                          <option value="INGRESO">Ingreso</option>
                          <option value="EGRESO">Egreso</option>
                        </select>
                      </div>
                      <div className="form-group-small">
                        <label>Monto</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="number"
                            value={newTransaction.amount}
                            onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="form-input"
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const current = parseFloat(newTransaction.amount) || 0;
                              setNewTransaction({ ...newTransaction, amount: (current + 500).toString() });
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
                    </div>
                    <div className="form-group">
                      <label>Descripción</label>
                      <input
                        type="text"
                        value={newTransaction.description}
                        onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })}
                        placeholder="Ej: Pago de factura de luz"
                        className="form-input"
                      />
                    </div>
                    <button onClick={addManualTransaction} className="save-transaction-btn">
                      Guardar
                    </button>
                  </div>
                )}

                {manualTransactions.length === 0 ? (
                  <p className="no-transactions">No hay transacciones manuales este día</p>
                ) : (
                  <>
                    <div className="transactions-summary">
                      <div className="transaction-summary-item ingreso">
                        <span className="label">Total Ingresos:</span>
                        <span className="value">
                          {formatCurrency(
                            manualTransactions
                              .filter(t => t.type === 'INGRESO')
                              .reduce((sum, t) => sum + parseFloat(t.amount), 0)
                          )}
                        </span>
                      </div>
                      <div className="transaction-summary-item egreso">
                        <span className="label">Total Egresos:</span>
                        <span className="value">
                          {formatCurrency(
                            manualTransactions
                              .filter(t => t.type === 'EGRESO')
                              .reduce((sum, t) => sum + parseFloat(t.amount), 0)
                          )}
                        </span>
                      </div>
                      <div className={`transaction-summary-item neto ${manualTransactions.filter(t => t.type === 'INGRESO').reduce((sum, t) => sum + parseFloat(t.amount), 0) - manualTransactions.filter(t => t.type === 'EGRESO').reduce((sum, t) => sum + parseFloat(t.amount), 0) >= 0 ? 'positive' : 'negative'}`}>
                        <span className="label">Neto:</span>
                        <span className="value">
                          {formatCurrency(
                            manualTransactions
                              .filter(t => t.type === 'INGRESO')
                              .reduce((sum, t) => sum + parseFloat(t.amount), 0) -
                            manualTransactions
                              .filter(t => t.type === 'EGRESO')
                              .reduce((sum, t) => sum + parseFloat(t.amount), 0)
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="transactions-list">
                      {manualTransactions.map((transaction) => (
                        <div key={transaction.id} className={`transaction-item ${transaction.type.toLowerCase()}`}>
                          <div className="transaction-main">
                            <div className="transaction-type-badge">
                              {transaction.type === 'INGRESO' ? '📥' : '📤'}
                              <span>{transaction.type}</span>
                            </div>
                            <div className="transaction-details">
                              <div className="transaction-description">{transaction.description}</div>
                              <div className="transaction-meta">
                                <span>{formatTime(transaction.created_at)}</span>
                                <span>{transaction.created_by_name}</span>
                              </div>
                            </div>
                            <div className="transaction-amount">
                              <span className={`amount-value ${transaction.type.toLowerCase()}`}>
                                {transaction.type === 'INGRESO' ? '+' : '-'}
                                {formatCurrency(transaction.amount)}
                              </span>
                            </div>
                            <button
                              onClick={() => deleteManualTransaction(transaction.id)}
                              className="delete-transaction-btn"
                              title="Borrar"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Pagos */}
              <div className="stats-card payments-summary">
                <h3>💳 Pagos del Día</h3>
                <div className="payment-total">
                  <span className="big-number">{formatCurrency(dayStats.payments.total)}</span>
                  <span className="count">{dayStats.payments.count} transacciones</span>
                </div>
                <div className="payment-methods">
                  {dayStats.payments.byMethod.map(pm => (
                    <div key={pm.method} className="method-item">
                      <span className="method-icon">
                        {pm.method === 'EFECTIVO' ? '💵' : pm.method === 'TARJETA' ? '💳' : '📱'}
                      </span>
                      <span className="method-name">{pm.method}</span>
                      <span className="method-count">{pm.count}</span>
                      <span className="method-total">{formatCurrency(pm.total)}</span>
                    </div>
                  ))}
                  {dayStats.payments.byMethod.length === 0 && (
                    <p className="no-payments">No hubo pagos este día</p>
                  )}
                </div>
              </div>

              {/* Órdenes */}
              <div className="stats-card orders-summary">
                <h3>📋 Órdenes del Día</h3>
                <div className="orders-grid">
                  <div className="order-stat">
                    <span className="stat-number">{dayStats.orders.total_orders || 0}</span>
                    <span className="stat-label">Total</span>
                  </div>
                  <div className="order-stat pagados">
                    <span className="stat-number">{dayStats.orders.pagados || 0}</span>
                    <span className="stat-label">Pagados</span>
                  </div>
                  <div className="order-stat cancelados">
                    <span className="stat-number">{dayStats.orders.cancelados || 0}</span>
                    <span className="stat-label">Cancelados</span>
                  </div>
                </div>
              </div>

              {/* Top Items */}
              {dayStats.topItems && dayStats.topItems.length > 0 && (
                <div className="stats-card top-items">
                  <h3>🏆 Más Vendidos</h3>
                  <div className="items-list">
                    {dayStats.topItems.map((item, idx) => (
                      <div key={idx} className="top-item">
                        <span className="rank">#{idx + 1}</span>
                        <span className="item-name">{item.name}</span>
                        <span className="item-qty">{item.total_qty} uds</span>
                        <span className="item-total">{formatCurrency(item.total_sales)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}

