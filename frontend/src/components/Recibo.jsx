import { useState, useEffect } from 'react';
import { formatPriceCOP } from '../utils/currency.js';
import { paymentMethodLabel } from '../utils/statusLabels.js';
import { formatBogotaDateTime } from '../utils/timezone.js';
import ModalHost from './ModalHost';
import BrandMark from './BrandMark';
import PagoExitoso from './PagoExitoso.jsx';
import useBusiness from '../hooks/useBusiness';
import { useAlert, useConfirm, usePrompt } from '../hooks/useModal';

// Impresión/PDF ocultos por ahora (no hay impresora en el local y el dueño no
// los usa): el recibo queda guardado en la BD y se puede reabrir desde
// Historial de pagos. Cuando llegue la impresora térmica, poner en true.
const SHOW_PRINT_CONTROLS = false;

// celebrate: true SOLO justo después de cobrar (DetalleMesa) — muestra la
// confirmación animada (PagoExitoso) encima antes de dejar ver el recibo. Al
// reabrir un recibo desde Historial no se pasa.

// Impresión directa en térmica (sin diálogo): oculta hasta que el local tenga
// impresora (dueño, 2026-10-25). La app de escritorio actual NO expone
// posElectron.getPrinters/printReceipt — el botón fallaba con un aviso de error
// antes de abrir el diálogo normal. Para activarla: agregar esas funciones en
// desktop/preload.js + main.js (requiere reinstalar el .exe, la actualización
// remota no toca la app de escritorio), volver a mostrar /impresora en
// cajaNav.js y poner esto en true.
const IMPRESORA_TERMICA_LISTA = false;
export default function Recibo({ order, payment, items, onClose, onPrint, changeAmount, celebrate = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  // ALL hooks must be declared before any conditional returns
  const [showIntro, setShowIntro] = useState(celebrate);
  const business = useBusiness();
  // Estado para formato de impresión (default: 80mm)
  const [printFormat, setPrintFormat] = useState(() => {
    const saved = localStorage.getItem('reciboPrintFormat');
    return saved || '80mm';
  });

  // Guardar preferencia cuando cambia
  useEffect(() => {
    localStorage.setItem('reciboPrintFormat', printFormat);
  }, [printFormat]);

  if (!order || !payment || !items) {
    return null;
  }

  // Helpers para normalización numérica
  const toNumber = (v) => {
    const num = Number(parseFloat(v));
    return isNaN(num) ? 0 : num;
  };

  // Normalizar items con cálculo de subtotales
  const normalizedItems = items.map(item => {
    const qty = toNumber(item.qty || item.quantity || 1);
    const price = toNumber(item.price || item.unit_price || item.unitPrice || 0);
    const subtotal = qty * price;

    return {
      qty,
      name: item.name || item.product_name || 'Item',
      price,
      notes: item.notes || '',
      subtotal,
      hasPrice: price > 0
    };
  });

  // Agrupar items iguales (mismo producto + misma nota, ej. mismo sabor) para
  // que la factura diga "3x Jugo" en vez de tres líneas de "1x Jugo" (pedido
  // del dueño 2026-08-19: sin desglose individual por ítem).
  const groupedItems = Object.values(
    normalizedItems.reduce((acc, item) => {
      const key = `${item.name}|${item.notes}`;
      if (!acc[key]) {
        acc[key] = { ...item };
      } else {
        acc[key].qty += item.qty;
        acc[key].subtotal += item.subtotal;
      }
      return acc;
    }, {})
  );

  // Calcular total sumando subtotales
  const total = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const isEfectivo = payment.method === 'EFECTIVO';

  // Detectar si está en Electron
  const isElectron = typeof window !== 'undefined' && !!window.posElectron;

  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  const handleSavePDF = () => {
    showAlert('Para guardar como PDF:\n\n1. Haz clic en "Imprimir"\n2. En el diálogo de impresión, elige "Guardar como PDF"\n3. Selecciona la ubicación y guarda');
  };

  // Compartir el recibo por WhatsApp como TEXTO (dueño, 2026-10-25): sin
  // instalar nada y funciona igual en APK, PWA y PC — el link wa.me abre
  // WhatsApp con el recibo listo para elegir el chat. Útil en domicilios.
  const textoRecibo = () => {
    const lineas = [];
    lineas.push(`*${(business.business_name || 'Chanatos').toUpperCase()}*`);
    if (order?.table_label) lineas.push(order.table_label);
    const num = order?.daily_no ? `Orden ${order.daily_no}` : (order?.code || '');
    if (num) lineas.push(`${num}${order?.customer_name ? ` · ${order.customer_name}` : ''}`);
    lineas.push('');
    groupedItems.forEach((it) => {
      lineas.push(`${it.qty}x ${it.name} — ${formatPriceCOP(it.subtotal)}`);
    });
    lineas.push('');
    if ((order?.discount_amount || 0) > 0) {
      lineas.push(`Subtotal: ${formatPriceCOP(total)}`);
      lineas.push(`Descuento: -${formatPriceCOP(order.discount_amount)}`);
    }
    lineas.push(`*Total: ${formatPriceCOP(Math.max(0, total - (order?.discount_amount || 0)))}*`);
    if ((payment?.tip_amount || 0) > 0) lineas.push(`Propina: ${formatPriceCOP(payment.tip_amount)}`);
    if ((order?.payments?.length || 0) > 1) {
      lineas.push('Pagos:');
      order.payments.forEach((p) => lineas.push(`- ${paymentMethodLabel(p.method)}: ${formatPriceCOP(p.amount)}`));
    } else if (payment?.method) {
      lineas.push(`Pago: ${paymentMethodLabel(payment.method)}`);
    }
    if (business.receipt_footer) {
      lineas.push('');
      lineas.push(business.receipt_footer);
    }
    return lineas.join('\n');
  };

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(textoRecibo())}`;
    window.open(url, '_blank', 'noopener');
    if (onPrint) onPrint();
  };

  const handleThermalPrint = async () => {
    if (!isElectron) {
      showAlert('Impresión térmica solo disponible en la aplicación Electron');
      return;
    }

    try {
      // Obtener impresoras disponibles
      const printers = await window.posElectron.getPrinters();
      
      if (!printers || printers.length === 0) {
        showAlert('No se encontraron impresoras disponibles.\n\nSe abrirá el diálogo de impresión normal.');
        handlePrint();
        return;
      }

      // Primero: intentar usar la impresora guardada en localStorage
      const savedPrinterName = localStorage.getItem('pos_printer_deviceName');
      let deviceName = null;

      if (savedPrinterName) {
        // Verificar que la impresora guardada existe en la lista actual
        const savedPrinter = printers.find(p => p.name === savedPrinterName);
        if (savedPrinter) {
          deviceName = savedPrinterName;
        }
      }

      // Si no hay guardada o no existe, buscar sugerida
      if (!deviceName) {
        const thermalKeywords = ['POS', 'XP', 'Epson', 'Thermal', 'TM', 'Receipt', 'Térmica', 'Termica'];
        const suggestedPrinter = printers.find(p => 
          thermalKeywords.some(keyword => 
            p.name.toLowerCase().includes(keyword.toLowerCase()) ||
            (p.displayName && p.displayName.toLowerCase().includes(keyword.toLowerCase()))
          )
        );

        if (suggestedPrinter) {
          deviceName = suggestedPrinter.name;
        } else {
          // Usar la impresora por defecto del sistema
          const defaultPrinter = printers.find(p => p.isDefault);
          if (defaultPrinter) {
            deviceName = defaultPrinter.name;
          } else {
            // Último recurso: primera impresora de la lista
            deviceName = printers[0].name;
          }
        }
      }

      // Llamar a la impresión directa
      await window.posElectron.printReceipt({
        deviceName: deviceName,
        silent: true,
        copies: 1,
        pageSize: printFormat === 'A4' ? 'A4' : printFormat
      });

      // Guardar la impresora que funcionó (si no estaba guardada)
      if (deviceName && deviceName !== savedPrinterName) {
        localStorage.setItem('pos_printer_deviceName', deviceName);
      }

      if (onPrint) onPrint();
    } catch (error) {
      console.error('Error en impresión térmica:', error);
      // Fallback a impresión normal
      showAlert(`Error al imprimir en térmica: ${error.message}\n\nSe abrirá el diálogo de impresión normal.`);
      handlePrint();
    }
  };

  return (
    <div className="recibo-container" style={{ 
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
      {showIntro && (
        <PagoExitoso
          // El TOTAL de la cuenta, no el del último pago (dueño, 2026-10-25):
          // con cuenta dividida ($16.000 + $14.000) decía "PAGADO $14.000".
          // Este aviso solo sale cuando la cuenta quedó pagada completa, así
          // que muestra lo mismo que el TOTAL del recibo.
          amount={Math.max(0, total - (order?.discount_amount || 0)) || toNumber(payment.amount)}
          change={toNumber(changeAmount)}
          method={(order?.payments?.length || 0) > 1 ? 'Cuenta completa' : paymentMethodLabel(payment.method)}
          onDone={() => setShowIntro(false)}
        />
      )}
      <div className="recibo-content" style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '12px',
        maxWidth: '400px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        {/* Cerrar con X (siempre visible arriba a la derecha) */}
        <div className="recibo-controls" style={{
          position: 'sticky',
          top: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '0.5rem',
          zIndex: 1
        }}>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              border: 'none',
              background: '#e9ecef',
              color: '#333',
              fontSize: '1.35rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Controles de impresión (no se imprimen; ocultos por ahora) */}
        {SHOW_PRINT_CONTROLS && (
        <div className="recibo-controls" style={{
          marginBottom: '1rem'
        }}>
          {/* Selector de formato */}
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #ddd'
          }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '0.5rem', 
              fontWeight: 'bold', 
              fontSize: '0.9rem',
              color: '#333'
            }}>
              Formato de Impresión:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {['80mm', '58mm', 'A4'].map(format => (
                <button
                  key={format}
                  onClick={() => setPrintFormat(format)}
                  style={{
                    flex: 1,
                    minWidth: '80px',
                    padding: '0.5rem',
                    background: printFormat === format ? '#F5BB4C' : 'white',
                    color: printFormat === format ? 'white' : '#333',
                    border: `2px solid ${printFormat === format ? '#F5BB4C' : '#ddd'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s'
                  }}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {IMPRESORA_TERMICA_LISTA && isElectron && (printFormat === '80mm' || printFormat === '58mm') && (
              <button
                onClick={handleThermalPrint}
                style={{
                  flex: '1 1 100%',
                  padding: '0.75rem',
                  background: '#F5BB4C',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}
              >
                Imprimir en térmica
              </button>
            )}
            <button
              onClick={handlePrint}
              style={{
                flex: '1 1 auto',
                minWidth: '110px',
                whiteSpace: 'nowrap',
                padding: '0.75rem',
                background: '#F5BB4C',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Imprimir
            </button>
            <button
              onClick={handleSavePDF}
              style={{
                flex: '1 1 auto',
                minWidth: '110px',
                whiteSpace: 'nowrap',
                padding: '0.75rem',
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}
            >
              Guardar PDF
            </button>
            <button
              onClick={handleWhatsApp}
              style={{
                flex: '1 1 auto',
                minWidth: '110px',
                whiteSpace: 'nowrap',
                padding: '0.75rem',
                background: '#25D366',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.9rem'
              }}
            >
              WhatsApp
            </button>
            <button
              onClick={onClose}
              style={{
                flex: '1 1 auto',
                minWidth: '110px',
                whiteSpace: 'nowrap',
                padding: '0.75rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
        )}

        {/* Vuelto destacado (solo pantalla, no se imprime): es la plata que el
            cajero tiene que entregar — fijo y grande, sin animación */}
        {isEfectivo && toNumber(changeAmount) > 0 && (
          <div className="recibo-vuelto tnum" role="status">
            <span>Vuelto</span>
            <strong>{formatPriceCOP(toNumber(changeAmount))}</strong>
          </div>
        )}

        {/* Contenido del recibo (imprimible) */}
        {/* recibo-paper: despliegue del comprobante plegado (rediseño 2026-10).
            Arranca cuando termina la confirmación «PAGADO» (o al abrirlo desde
            Historial); la X y las acciones quedan disponibles desde el primer
            instante — la animación no retrasa nada. No afecta la impresión. */}
        <div 
          id="receipt-print"
          className={`recibo-body recibo-paper ${showIntro ? 'is-folded' : 'is-unfolding'} print-${printFormat}`}
          style={{
            border: '1px solid #ddd',
            padding: '1.5rem',
            borderRadius: '8px'
          }}
        >
          {/* Encabezado PRO */}
          <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            {/* El logo solo EN PANTALLA: impreso (térmica o PDF) la "C" con
                fondo amarillo sale como un cuadro negro (dueño, 2026-10-25) —
                en papel queda solo CHANATOS en texto. */}
            <div className="recibo-logo" style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.35rem' }}>
              <BrandMark size={40} />
            </div>
            {/* Identidad del negocio (Administración → Identidad del negocio).
                NIT, dirección y teléfono SOLO si están configurados: antes salía
                "NIT: --" fijo, que en un recibo parece un dato faltante. */}
            <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.06em' }}>
              {(business.business_name || 'Chanatos').toUpperCase()}
            </h1>
            {business.business_nit && <div style={{ fontSize: '0.75rem', marginBottom: '0.15rem' }}>NIT {business.business_nit}</div>}
            {business.business_address && <div style={{ fontSize: '0.75rem', marginBottom: '0.15rem' }}>{business.business_address}</div>}
            {business.business_phone && <div style={{ fontSize: '0.75rem', marginBottom: '0.15rem' }}>Tel. {business.business_phone}</div>}
            <div style={{ borderTop: '1px solid #333', marginTop: '0.5rem' }}></div>
          </div>

          {/* Datos de la orden */}
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Orden:</strong> {order.daily_no ? `ORDEN ${order.daily_no}` : order.code || `#${order.id}`}
            </div>
            {order.table_label && (
              <div style={{ marginBottom: '0.3rem' }}>
                <strong>Mesa:</strong> {order.table_label}
              </div>
            )}
            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Fecha:</strong> {formatBogotaDateTime(new Date(payment.created_at || new Date()))}
            </div>
            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Estado:</strong> Pagada
            </div>
            <div style={{ borderTop: '1px solid #333', marginTop: '0.5rem' }}></div>
          </div>

          {/* Lista de productos agrupados (sin desglose de precio unitario por
              ítem — pedido del dueño: la factura solo dice "3x Jugo", no tres
              líneas de "1x Jugo" con precio c/u repetido) */}
          <div style={{ marginBottom: '0.75rem' }}>
            {groupedItems.map((item, idx) => (
              <div key={idx} style={{
                marginBottom: '0.4rem',
                paddingBottom: '0.4rem',
                borderBottom: idx < groupedItems.length - 1 ? '1px solid #ddd' : 'none'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong>{item.qty}x {item.name}</strong>
                  <span>{formatPriceCOP(item.subtotal)}</span>
                </div>
                {item.notes && (
                  <div style={{
                    fontSize: '0.75rem',
                    fontStyle: 'italic',
                    marginTop: '0.1rem'
                  }}>
                    {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Separador */}
          <div style={{ borderTop: '1px solid #333', margin: '0.5rem 0' }}></div>

          {/* Totales PRO */}
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span>Items:</span>
              <span>{normalizedItems.reduce((sum, item) => sum + item.qty, 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span>Subtotal:</span>
              <span>{formatPriceCOP(total)}</span>
            </div>
            {(order?.discount_amount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span>Descuento{order?.discount_reason ? ` (${order.discount_reason})` : ''}:</span>
                <span>-{formatPriceCOP(order.discount_amount)}</span>
              </div>
            )}
            <div className="receipt-total" style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px solid #333',
              paddingTop: '0.5rem',
              marginTop: '0.5rem',
              fontWeight: 'bold',
              fontSize: '1.1rem'
            }}>
              <span>TOTAL:</span>
              <span>{formatPriceCOP(Math.max(0, total - (order?.discount_amount || 0)))}</span>
            </div>
            {(payment?.tip_amount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                <span>Propina:</span>
                <span>{formatPriceCOP(payment.tip_amount)}</span>
              </div>
            )}
          </div>

          {/* Separador */}
          <div style={{ borderTop: '1px solid #333', margin: '0.5rem 0' }}></div>

          {/* Pago PRO. Cuenta dividida ya pagada: se listan TODOS los pagos
              (el recibo final es de la cuenta completa, 2026-10-25) */}
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            {(order?.payments?.length || 0) > 1 ? (
              <div style={{ marginBottom: '0.3rem' }}>
                <strong>Pagos:</strong>
                {order.payments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{paymentMethodLabel(p.method)}</span>
                    <span>{formatPriceCOP(p.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Pago:</strong> {paymentMethodLabel(payment.method)}
            </div>
            )}
            {/* "Pagó/Vuelto" habla del ÚLTIMO pago en efectivo: con varios pagos
                listados arriba solo aparece si hubo vuelto que informar */}
            {isEfectivo && changeAmount !== undefined && changeAmount !== null
              && ((order?.payments?.length || 0) <= 1 || toNumber(changeAmount) > 0) && (
              <>
                <div style={{ marginBottom: '0.3rem' }}>
                  <strong>Pagó:</strong> {formatPriceCOP(toNumber(payment.amount) + toNumber(payment.tip_amount) + toNumber(changeAmount))}
                </div>
                {changeAmount > 0 && (
                  <div style={{ marginBottom: '0.3rem' }}>
                    <strong>Vuelto:</strong> {formatPriceCOP(changeAmount)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Separador */}
          <div style={{ borderTop: '1px solid #333', margin: '0.5rem 0' }}></div>

          {/* Footer profesional */}
          <div style={{ 
            marginTop: '0.75rem',
            textAlign: 'center',
            fontSize: '0.85rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>{business.receipt_footer || 'Gracias por venir a Chanatos'}</div>
            <div style={{ borderTop: '1px solid #333', marginTop: '0.5rem' }}></div>
          </div>
        </div>

        {/* Acciones SIEMPRE visibles (el resto de controles de impresión sigue
            oculto con SHOW_PRINT_CONTROLS hasta que haya impresora) */}
        <div className="recibo-acciones" style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={handleWhatsApp}
            style={{
              flex: 2, minHeight: '48px', padding: '0.7rem', background: '#25D366', color: 'white',
              border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem'
            }}
          >
            Enviar por WhatsApp
          </button>
          <button
            onClick={handlePrint}
            style={{
              flex: 1, minHeight: '48px', padding: '0.7rem', background: '#f1f3f5', color: '#333',
              border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem'
            }}
          >
            Imprimir
          </button>
        </div>
      </div>

      {/* Estilos para impresión */}
      <style>{`
        /* Estilos en pantalla según formato seleccionado */
        .print-80mm {
          max-width: 80mm;
          margin: 0 auto;
        }
        
        .print-58mm {
          max-width: 58mm;
          margin: 0 auto;
        }
        
        .print-a4 {
          max-width: 210mm;
          margin: 0 auto;
        }
        
        @media print {
          /* CRÍTICO: Todo en blanco/negro, sin colores, sin sombras, sin fondos */
          * {
            background: white !important;
            background-color: white !important;
            color: black !important;
            box-shadow: none !important;
            text-shadow: none !important;
            border-color: black !important;
          }
          
          body {
            background: white !important;
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Ocultar todo excepto el recibo */
          body * {
            visibility: hidden;
          }
          
          #receipt-print,
          #receipt-print * {
            visibility: visible;
            background: white !important;
            background-color: white !important;
            color: black !important;
            box-shadow: none !important;
            text-shadow: none !important;
            border-radius: 0 !important;
          }
          
          /* En papel el recibo va ARRIBA y centrado, no flotando en la mitad
             de la hoja: se conserva el flex de pantalla (centra horizontal)
             pero alineado al tope. */
          .recibo-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            align-items: flex-start !important;
            background: white !important;
            background-color: white !important;
            padding: 0 !important;
            margin: 0;
            box-shadow: none !important;
          }
          
          .recibo-logo,
          .recibo-acciones,
          .recibo-controls {
            display: none !important;
          }
          
          .recibo-content {
            max-width: none !important;
            width: auto !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            padding: 0;
            margin: 0;
            border: none;
            background: white !important;
            background-color: white !important;
            border-radius: 0 !important;
          }
          
          .recibo-body {
            border: none;
            padding: 0;
            margin: 0;
            background: white !important;
            background-color: white !important;
            border-radius: 0 !important;
          }
          
          /* Formato 80mm (ticket estándar). HOY no hay impresora térmica: esto
             sale en hoja A4/carta o en PDF, y a tamaño real quedaba un cuadrito
             perdido en la mitad (dueño, 2026-10-25). zoom agranda el ticket a
             ~13 cm de ancho, legible en papel normal. La térmica de verdad NO
             pasa por acá (usará posElectron.printReceipt): al llegar la
             impresora, quitar el zoom o condicionarlo. */
          .print-80mm {
            width: 124mm !important;
            max-width: 124mm !important;
            margin: 6mm auto 0;
            padding: 10px 14px !important;
            font-size: 14px !important;
            line-height: 1.35 !important;
            background: white !important;
            color: black !important;
          }
          
          .print-80mm h1 {
            font-size: 20px !important;
            margin: 2px 0 3px 0 !important;
            color: black !important;
            font-weight: bold !important;
            line-height: 1.2 !important;
          }

          .print-80mm img {
            width: 26px !important;
            height: 26px !important;
          }
          
          .print-80mm p {
            font-size: 8px !important;
            margin: 1px 0 !important;
            color: black !important;
            line-height: 1.2 !important;
          }
          
          .print-80mm span {
            font-size: 9px !important;
            color: black !important;
            line-height: 1.2 !important;
          }
          
          .print-80mm div {
            font-size: 9px !important;
            color: black !important;
            line-height: 1.2 !important;
            margin: 0 !important;
          }
          
          .print-80mm strong {
            font-weight: bold !important;
            color: black !important;
          }
          
          .print-80mm .receipt-total {
            font-size: 12px !important;
            font-weight: bold !important;
            color: black !important;
            line-height: 1.2 !important;
          }
          
          .print-80mm [style*="border"] {
            border-color: black !important;
          }
          
          .print-80mm [style*="marginBottom"] {
            margin-bottom: 2px !important;
          }
          
          .print-80mm [style*="marginTop"] {
            margin-top: 2px !important;
          }
          
          /* Formato 58mm (ticket pequeño) */
          .print-58mm {
            width: 58mm !important;
            max-width: 58mm !important;
            margin: 0 auto;
            padding: 3px 5px !important;
            font-size: 9px !important;
            line-height: 1.1 !important;
            background: white !important;
            color: black !important;
          }
          
          .print-58mm h1 {
            font-size: 11px !important;
            margin: 2px 0 2px 0 !important;
            color: black !important;
            font-weight: bold !important;
            line-height: 1.1 !important;
          }

          .print-58mm img {
            width: 22px !important;
            height: 22px !important;
          }
          
          .print-58mm p {
            font-size: 7px !important;
            margin: 1px 0 !important;
            color: black !important;
            line-height: 1.1 !important;
          }
          
          .print-58mm span {
            font-size: 8px !important;
            color: black !important;
            line-height: 1.1 !important;
          }
          
          .print-58mm div {
            font-size: 8px !important;
            color: black !important;
            line-height: 1.1 !important;
            margin: 0 !important;
          }
          
          .print-58mm strong {
            font-weight: bold !important;
            color: black !important;
          }
          
          .print-58mm .receipt-total {
            font-size: 10px !important;
            font-weight: bold !important;
            color: black !important;
            line-height: 1.1 !important;
          }
          
          .print-58mm [style*="border"] {
            border-color: black !important;
          }
          
          .print-58mm [style*="marginBottom"] {
            margin-bottom: 2px !important;
          }
          
          .print-58mm [style*="marginTop"] {
            margin-top: 2px !important;
          }
          
          /* Formato A4 (papel normal) */
          .print-a4 {
            width: 100% !important;
            max-width: 210mm !important;
            margin: 0 auto;
            padding: 12mm !important;
            font-size: 12px !important;
            line-height: 1.3 !important;
            background: white !important;
            color: black !important;
          }
          
          .print-a4 h1 {
            font-size: 18px !important;
            margin: 4px 0 6px 0 !important;
            color: black !important;
            font-weight: bold !important;
            line-height: 1.3 !important;
          }
          
          .print-a4 p {
            font-size: 10px !important;
            margin: 2px 0 !important;
            color: black !important;
            line-height: 1.3 !important;
          }
          
          .print-a4 span {
            font-size: 11px !important;
            color: black !important;
            line-height: 1.3 !important;
          }
          
          .print-a4 div {
            font-size: 11px !important;
            color: black !important;
            line-height: 1.3 !important;
          }
          
          .print-a4 strong {
            font-weight: bold !important;
            color: black !important;
          }
          
          .print-a4 .receipt-total {
            font-size: 16px !important;
            font-weight: bold !important;
            color: black !important;
            line-height: 1.3 !important;
          }
          
          .print-a4 [style*="border"] {
            border-color: black !important;
          }
        }
      `}</style>
      
      {/* Estilos @page dinámicos según formato */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page {
              size: ${printFormat === '80mm' ? '80mm auto' : printFormat === '58mm' ? '58mm auto' : 'A4'};
              margin: ${printFormat === 'A4' ? '12mm' : '0'};
            }
          }
        `
      }} />
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
