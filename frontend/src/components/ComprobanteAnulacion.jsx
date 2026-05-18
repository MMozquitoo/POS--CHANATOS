import { formatBogotaDateTime } from '../utils/timezone.js';
import { formatPriceCOP } from '../utils/currency.js';

export default function ComprobanteAnulacion({ 
  type, // 'ORDER' | 'ITEM'
  order,
  item,
  reason,
  user,
  itemsVoided,
  onClose,
  onPrint
}) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const getTableLabel = () => {
    if (!order) return 'SIN MESA';
    // Si order.table es un objeto
    if (order.table && order.table.number) {
      if (order.table.number === 9) return 'VENTANILLA';
      if (order.table.number === 10) return 'DOMICILIOS';
      return `Mesa ${order.table.number}`;
    }
    // Si table_number viene directamente
    if (order.table_number) {
      if (order.table_number === 9) return 'VENTANILLA';
      if (order.table_number === 10) return 'DOMICILIOS';
      return `Mesa ${order.table_number}`;
    }
    return 'SIN MESA';
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Controles (solo si no está imprimiendo) */}
      <div className="no-print" style={{ 
        marginBottom: '1rem', 
        display: 'flex', 
        gap: '0.5rem',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={onClose}
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
        <button
          onClick={handlePrint}
          style={{
            padding: '0.5rem 1rem',
            background: '#F5BB4C',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          IMPRIMIR
        </button>
      </div>

      {/* Comprobante imprimible */}
      <div id="comprobante-anulacion-print" style={{
        background: 'white',
        padding: '1rem',
        maxWidth: '80mm',
        margin: '0 auto',
        fontFamily: 'monospace',
        fontSize: '12px',
        lineHeight: '1.4'
      }}>
        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '2px solid #000', paddingBottom: '0.5rem' }}>
          <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '0.25rem' }}>
            CHANATOS
          </div>
          <div style={{ fontSize: '10px' }}>
            {formatBogotaDateTime(new Date())}
          </div>
        </div>

        {/* Tipo de anulación */}
        <div style={{ textAlign: 'center', marginBottom: '1rem', fontWeight: 'bold', fontSize: '14px' }}>
          {type === 'ORDER' ? 'ANULACIÓN DE ORDEN' : 'ANULACIÓN DE ITEM'}
        </div>

        {/* Información de orden */}
        {order && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Orden:</strong> {order.daily_no ? `ORDEN ${order.daily_no}` : (order.code || `#${order.id}`)}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Mesa:</strong> {getTableLabel()}
            </div>
            {order.status && (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Estado:</strong> {order.status}
              </div>
            )}
            {order.table_number && !order.table && (
              <div style={{ marginBottom: '0.5rem' }}>
                <strong>Mesa:</strong> {
                  order.table_number === 9 ? 'VENTANILLA' :
                  order.table_number === 10 ? 'DOMICILIOS' :
                  `Mesa ${order.table_number}`
                }
              </div>
            )}
          </div>
        )}

        {/* Información de item (si aplica) */}
        {type === 'ITEM' && item && (
          <div style={{ marginBottom: '1rem', borderTop: '1px solid #000', paddingTop: '0.5rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Item:</strong> {item.name}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Cantidad:</strong> {item.qty}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Precio:</strong> {formatPriceCOP(item.price)}
            </div>
            <div>
              <strong>Subtotal:</strong> {formatPriceCOP(item.qty * item.price)}
            </div>
          </div>
        )}

        {/* Items anulados (si es cancelación de orden) */}
        {type === 'ORDER' && itemsVoided && itemsVoided.length > 0 && (
          <div style={{ marginBottom: '1rem', borderTop: '1px solid #000', paddingTop: '0.5rem' }}>
            <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Items Anulados:
            </div>
            {itemsVoided.map((it, idx) => (
              <div key={idx} style={{ marginBottom: '0.25rem', fontSize: '11px' }}>
                {it.qty}x {it.name} - {formatPriceCOP(it.price)}
              </div>
            ))}
          </div>
        )}

        {/* Motivo */}
        <div style={{ marginBottom: '1rem', borderTop: '1px solid #000', paddingTop: '0.5rem' }}>
          <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Motivo:
          </div>
          <div style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>
            {reason}
          </div>
        </div>

        {/* Usuario */}
        {user && (
          <div style={{ marginBottom: '1rem', borderTop: '1px solid #000', paddingTop: '0.5rem' }}>
            <div>
              <strong>Anulado por:</strong> {user.name || `Usuario #${user.id}`}
            </div>
          </div>
        )}

        {/* Pie */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '1rem', 
          borderTop: '2px solid #000', 
          paddingTop: '0.5rem',
          fontSize: '10px'
        }}>
          Comprobante de Anulación
        </div>
      </div>

      {/* Estilos de impresión */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #comprobante-anulacion-print,
          #comprobante-anulacion-print * {
            visibility: visible;
          }
          #comprobante-anulacion-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            background: white;
            padding: 0;
            margin: 0;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
        }
        @page {
          size: 80mm auto;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
