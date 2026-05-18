import { useState, useEffect } from 'react';
import { formatPriceCOP } from '../utils/currency.js';
import { formatBogotaDateTime } from '../utils/timezone.js';

export default function Recibo({ order, payment, items, onClose, onPrint, changeAmount }) {
  // ALL hooks must be declared before any conditional returns
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
    alert('Para guardar como PDF:\n\n1. Haz clic en "🖨️ Imprimir"\n2. En el diálogo de impresión, elige "Guardar como PDF"\n3. Selecciona la ubicación y guarda');
  };

  const handleThermalPrint = async () => {
    if (!isElectron) {
      alert('Impresión térmica solo disponible en la aplicación Electron');
      return;
    }

    try {
      // Obtener impresoras disponibles
      const printers = await window.posElectron.getPrinters();
      
      if (!printers || printers.length === 0) {
        alert('No se encontraron impresoras disponibles.\n\nSe abrirá el diálogo de impresión normal.');
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
      alert(`Error al imprimir en térmica: ${error.message}\n\nSe abrirá el diálogo de impresión normal.`);
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
        {/* Controles (no se imprimen) */}
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
            {isElectron && (printFormat === '80mm' || printFormat === '58mm') && (
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
                🧾 Imprimir Térmica
              </button>
            )}
            <button
              onClick={handlePrint}
              style={{
                flex: 1,
                padding: '0.75rem',
                background: '#F5BB4C',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              🖨️ Imprimir
            </button>
            <button
              onClick={handleSavePDF}
              style={{
                flex: 1,
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
              💾 PDF
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1,
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

        {/* Contenido del recibo (imprimible) */}
        <div 
          id="receipt-print"
          className={`recibo-body print-${printFormat}`}
          style={{
            border: '1px solid #ddd',
            padding: '1.5rem',
            borderRadius: '8px'
          }}
        >
          {/* Encabezado PRO */}
          <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
            <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', fontWeight: 'bold' }}>CHANATOS</h1>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.15rem' }}>NIT: --</div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.15rem' }}>Dirección: --</div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>Tel: --</div>
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
              <strong>Estado:</strong> PAGADA
            </div>
            <div style={{ borderTop: '1px solid #333', marginTop: '0.5rem' }}></div>
          </div>

          {/* Lista de productos (numerada) */}
          <div style={{ marginBottom: '0.75rem' }}>
            {normalizedItems.map((item, idx) => (
              <div key={idx} style={{ 
                marginBottom: '0.5rem',
                paddingBottom: '0.5rem',
                borderBottom: idx < normalizedItems.length - 1 ? '1px solid #ddd' : 'none'
              }}>
                {/* Primera línea: número + cantidad x nombre */}
                <div style={{ marginBottom: '0.2rem' }}>
                  <strong>{idx + 1}) {item.qty}x {item.name}</strong>
                  {!item.hasPrice && (
                    <span style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }}>(sin precio)</span>
                  )}
                </div>
                {/* Segunda línea: precio unitario c/u + Sub: subtotal */}
                <div style={{ 
                  fontSize: '0.85rem',
                  marginLeft: '1.2rem',
                  marginBottom: item.notes ? '0.15rem' : '0'
                }}>
                  {item.hasPrice ? formatPriceCOP(item.price) : '$ 0'} c/u   Sub: {formatPriceCOP(item.subtotal)}
                </div>
                {/* Tercera línea: notas (si existen) */}
                {item.notes && (
                  <div style={{ 
                    fontSize: '0.75rem', 
                    fontStyle: 'italic',
                    marginLeft: '1.2rem',
                    marginTop: '0.15rem'
                  }}>
                    Nota: {item.notes}
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
              <span>{normalizedItems.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span>Subtotal:</span>
              <span>{formatPriceCOP(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span>Descuento:</span>
              <span>{formatPriceCOP(0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Impuesto:</span>
              <span>{formatPriceCOP(0)}</span>
            </div>
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
              <span>{formatPriceCOP(total)}</span>
            </div>
          </div>

          {/* Separador */}
          <div style={{ borderTop: '1px solid #333', margin: '0.5rem 0' }}></div>

          {/* Pago PRO */}
          <div style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Pago:</strong> {payment.method}
            </div>
            {isEfectivo && changeAmount !== undefined && changeAmount !== null && (
              <>
                <div style={{ marginBottom: '0.3rem' }}>
                  <strong>Pagó:</strong> {formatPriceCOP(payment.amount + (changeAmount || 0))}
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
            <div style={{ marginBottom: '0.25rem' }}>Gracias por su compra</div>
            <div style={{ marginBottom: '0.5rem' }}>Vuelva pronto</div>
            <div style={{ borderTop: '1px solid #333', marginTop: '0.5rem' }}></div>
          </div>
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
          
          .recibo-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: white !important;
            background-color: white !important;
            padding: 0;
            margin: 0;
            box-shadow: none !important;
          }
          
          .recibo-controls {
            display: none !important;
          }
          
          .recibo-content {
            max-width: 100%;
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
          
          /* Formato 80mm (ticket estándar) */
          .print-80mm {
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto;
            padding: 4px 6px !important;
            font-size: 10px !important;
            line-height: 1.2 !important;
            background: white !important;
            color: black !important;
          }
          
          .print-80mm h1 {
            font-size: 13px !important;
            margin: 2px 0 3px 0 !important;
            color: black !important;
            font-weight: bold !important;
            line-height: 1.2 !important;
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
    </div>
  );
}
