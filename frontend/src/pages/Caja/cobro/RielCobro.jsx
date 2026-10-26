import { formatPriceCOP } from '../../../utils/currency.js';
import AnimatedNumber from '../../../components/AnimatedNumber.jsx';

// COLUMNA DERECHA de DetalleMesa: resumen de la cuenta y cobro (riel sticky en
// desktop vía mobile-polish.css). Extraída tal cual de DetalleMesa.jsx el
// 2026-10-25 ("reordenar esa pantalla"): SOLO presentación — todo el estado y
// las reglas siguen en DetalleMesa/payActiveOrder y en el servidor.
//
// estadoPill: la pastilla de estado ya renderizada (DetalleMesa conserva su
// propio estilo local para no cambiar ni un pixel).
export default function RielCobro({
  cashSessionActive,
  initialCash,
  setInitialCash,
  openingCash,
  onAbrirCaja,
  activeOrder,
  activeOrderItems,
  activeOrderTotal,
  orderDiscount,
  paidAmount,
  saldoActual,
  pagadaAdelantado,
  esRappi,
  esMesaEspecial,
  estadoPill,
  paymentMethod,
  setPaymentMethod,
  onCalculadora,
  tipAmount,
  setTipAmount,
  onDescuento,
  isOnline,
  isRefreshingOnReconnect,
  loadingPay,
  onCobrar,
  onDividir,
}) {
  return (
    <>
    {/* COLUMNA DERECHA: Resumen y Cobro (riel sticky en desktop vía mobile-polish.css FASE F10) */}
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
            Abre la caja para poder cobrar
          </h3>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#856404' }}>
              Efectivo inicial:
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={initialCash}
              onChange={(e) => setInitialCash(e.target.value)}
              placeholder="0 (puede abrirse en cero)"
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
            onClick={onAbrirCaja}
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
            {openingCash ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>
      )}

      {activeOrder && activeOrder.id ? (
        <>
          <div style={{
            background: 'white',
            padding: '1.4rem',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-md)'
          }}>
            {/* El TOTAL es lo primero que ve el ojo */}
            <div style={{ textAlign: 'center', paddingBottom: '1rem', borderBottom: '1px solid var(--separator)' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>
                {pagadaAdelantado ? 'Pagado' : 'Total a cobrar'}
              </div>
              <div className="tnum" style={{ fontSize: '2.125rem', fontWeight: 800, letterSpacing: '-0.02em', color: pagadaAdelantado ? 'var(--green-text)' : 'var(--gray-900)', lineHeight: 1.1 }}>
                {/* Rueda al agregar/quitar items o abonar (no salta de golpe) */}
                <AnimatedNumber value={pagadaAdelantado ? paidAmount : saldoActual} />
              </div>
            </div>

            {/* Qué se está cobrando, siempre visible (dueño, 2026-08-03:
                "en el cobro no se ve nada"). Usa TODOS los items de la orden
                (no solo los pendientes): en una orden prepagada por items ya
                todos tienen paid_at y aun así deben verse. */}
            {(activeOrder.items || []).filter(i => !i.voided_at).length > 0 && (
              <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--separator)' }}>
                {(activeOrder.items || []).filter(i => !i.voided_at).map(it => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', fontSize: '0.875rem', color: 'var(--gray-700)' }}>
                    <span style={{ minWidth: 0 }}>
                      {it.qty}× {it.name}
                      {it.notes && <span style={{ color: '#B25000' }}> — {it.notes}</span>}
                    </span>
                    <span className="tnum" style={{ flexShrink: 0 }}>{formatPriceCOP(it.qty * it.price)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {orderDiscount > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', color: 'var(--gray-600)' }}>
                    <span>Subtotal</span>
                    <span className="tnum">{formatPriceCOP(activeOrderTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', color: 'var(--brand-deep)' }}>
                    <span>Descuento ({activeOrder.discount_reason})</span>
                    <span className="tnum">-{formatPriceCOP(orderDiscount)}</span>
                  </div>
                </>
              )}
              {paidAmount > 0 && !pagadaAdelantado && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', color: 'var(--green-text)' }}>
                  <span>Ya pagado</span>
                  <span className="tnum">-{formatPriceCOP(paidAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', color: 'var(--gray-600)', alignItems: 'center' }}>
                <span>Estado</span>
                {estadoPill}
              </div>
            </div>
          </div>

          {/* Prepago cubierto: NO volver a ofrecer el cobro (dueño, 2026-08-03) */}
          {pagadaAdelantado && (
            <div style={{
              background: 'var(--green-tint)',
              color: 'var(--green-text)',
              padding: '0.9rem 1.1rem',
              borderRadius: 'var(--radius-xl)',
              fontWeight: 600,
              fontSize: '0.9375rem'
            }}>
              Pago recibido. La orden sigue en cocina y se cierra sola al quedar lista.
            </div>
          )}

          {/* Métodos de pago: con orden LISTO siempre; en Ventanilla/
              Domicilios TAMBIÉN en NUEVO/EN_PREP (el cliente paga al pedir
              y asegura la venta; la orden sigue en cocina y se cierra sola
              al quedar lista — "pago adelantado", 2026-08). */}
          {(activeOrder.status === 'LISTO' ||
            (esMesaEspecial && ['NUEVO', 'EN_PREP'].includes(activeOrder.status)))
            && activeOrderItems.length > 0 && cashSessionActive === true && saldoActual > 0 ? (
            <div style={{
              background: 'white',
              padding: '1.1rem',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Método de pago</h3>
              {esRappi ? (
                <div style={{ padding: '0.55rem 0.8rem', background: '#FFE9E3', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-13)', color: '#C2330F', fontWeight: 500, marginBottom: '0.6rem' }}>
                  Pedido de Rappi: el cliente ya le pagó a Rappi. Al quedar lista se cierra sola; si la cierras acá queda como "Rappi" y no entra al arqueo de hoy.
                </div>
              ) : activeOrder.status !== 'LISTO' && (
                <div style={{ padding: '0.55rem 0.8rem', background: 'var(--blue-tint)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-13)', color: 'var(--blue-text)', fontWeight: 500, marginBottom: '0.6rem' }}>
                  Pago por adelantado: la orden sigue en cocina y se cierra sola cuando esté lista.
                </div>
              )}
              {/* 3 métodos en UNA fila: con 2 columnas el chip Contrato creaba
                  una segunda fila y el riel ya no cabía en pantallas de 768px
                  de alto (doble scrollbar en el PC del local, 2026-10-25) */}
              <div style={{ display: 'grid', gridTemplateColumns: esRappi ? '1fr' : 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.6rem' }}>
                {/* TARJETA oculta a pedido del dueño: no hay datáfono activo todavía.
                    Se deja el código de payments/reportes intacto (reversible) — ver
                    CLAUDE.md "Pendientes conocidos": evalúa Bold/Wompi. */}
                {(esRappi
                  ? [{ key: 'RAPPI', label: 'Rappi (paga después)' }]
                  : [
                    { key: 'EFECTIVO', label: 'Efectivo' },
                    { key: 'TRANSFERENCIA', label: 'Transfer.' },
                    // Contrato = fiado o pedido grande que pagan después. Pide el nombre
                    // al cobrar y queda en Administración → Deudas.
                    { key: 'CONTRATO', label: 'Contrato' },
                  ]).map(({ key, label }) => {
                  const selected = paymentMethod === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setPaymentMethod(key)}
                      title={key}
                      style={{
                        padding: '0.55rem 0.3rem',
                        minHeight: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        background: selected ? 'var(--brand-tint)' : 'var(--gray-50)',
                        color: selected ? 'var(--brand-deep)' : 'var(--gray-700)',
                        border: selected ? '2px solid var(--brand)' : '2px solid transparent',
                        borderRadius: 'var(--radius-lg)',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '0.9375rem',
                        transition: 'all 0.15s',
                        WebkitTapHighlightColor: 'transparent'
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  onCalculadora();
                }}
                style={{
                  padding: '0.5rem 1.1rem',
                  minHeight: '44px',
                  background: 'var(--gray-50)',
                  color: 'var(--gray-900)',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  marginBottom: '0.6rem'
                }}
              >
                Calculadora de vuelto
              </button>

              {/* FASE F10: propina opcional + descuento */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.9375rem', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--gray-700)' }}>Propina</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="0 (opcional)"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="tnum"
                  style={{ flex: 1, minWidth: 0, height: '44px', padding: '0 12px', border: '1.5px solid var(--gray-100)', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', fontSize: '16px' }}
                />
                <button
                  type="button"
                  onClick={() => onDescuento()}
                  style={{ padding: '0 14px', height: '44px', background: orderDiscount > 0 ? 'var(--brand-tint)' : 'var(--gray-50)', border: 'none', color: 'var(--brand-deep)', borderRadius: '999px', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {orderDiscount > 0 ? 'Desc. aplicado' : 'Descuento'}
                </button>
              </div>

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
                onClick={() => onCobrar()}
                disabled={loadingPay || !isOnline}
                style={{
                  width: '100%',
                  padding: '1rem',
                  minHeight: '56px',
                  background: 'var(--brand)',
                  color: 'var(--gray-900)',
                  border: 'none',
                  borderRadius: 'var(--radius-lg)',
                  cursor: loadingPay || !isOnline ? 'not-allowed' : 'pointer',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  boxShadow: loadingPay || !isOnline ? 'none' : '0 8px 20px rgba(245, 187, 76, 0.45)',
                  opacity: loadingPay || !isOnline ? 0.45 : 1,
                  transition: 'opacity 0.2s, transform 0.1s'
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
                onClick={onDividir}
                disabled={loadingPay || !isOnline}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  minHeight: '48px',
                  margin: '0.6rem auto 0',
                  padding: '0.7rem 1.5rem',
                  background: 'var(--gray-50)',
                  color: 'var(--gray-900)',
                  border: 'none',
                  borderRadius: 'var(--radius-lg)',
                  cursor: loadingPay || !isOnline ? 'not-allowed' : 'pointer',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  opacity: loadingPay || !isOnline ? 0.45 : 1
                }}
              >
                Dividir cuenta
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
                Abre la caja para cobrar
              </h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                Puede abrirse con $ 0; los pedidos se siguen tomando normal
              </p>
            </div>
          ) : pagadaAdelantado ? null : (
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
                    Debe enviarse a preparación
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                    La orden debe estar en estado LISTO para poder cobrar
                  </p>
                </>
              ) : activeOrder.status === 'EN_PREP' ? (
                <>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#856404' }}>
                    Falta que cocina la marque lista
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
                    Se cobra cuando la orden esté lista
                  </p>
                </>
              ) : (
                <>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold', color: '#856404' }}>
                    No se puede cobrar
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
    </>
  );
}
