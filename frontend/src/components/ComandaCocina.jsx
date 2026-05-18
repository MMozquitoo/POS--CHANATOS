import { formatBogotaDateTime } from '../utils/timezone.js';

export default function ComandaCocina({ order, onClose, onPrint }) {
  if (!order || !order.items) {
    return null;
  }

  const handlePrint = () => {
    window.print();
    if (onPrint) onPrint();
  };

  return (
    <div className="comanda-container" style={{ 
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
      <div className="comanda-content" style={{
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
        <div className="comanda-controls" style={{ 
          marginBottom: '1rem', 
          display: 'flex', 
          gap: '0.5rem'
        }}>
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

        {/* Contenido de la comanda (imprimible) */}
        <div className="comanda-body" style={{
          border: '2px solid #333',
          padding: '1.5rem',
          borderRadius: '8px'
        }}>
          {/* Encabezado */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #333', paddingBottom: '1rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold' }}>COMANDA</h1>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '1rem', fontWeight: 'bold' }}>
              Restaurante Chanatos
            </p>
          </div>

          {/* Información de la orden */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
              <span style={{ fontWeight: 'bold' }}>Orden:</span>
              <span style={{ fontWeight: 'bold', fontSize: '1.3rem' }}>
                {order.daily_no ? `ORDEN ${order.daily_no}` : order.code || `#${order.id}`}
              </span>
            </div>
            {order.table_label && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                <span style={{ fontWeight: 'bold' }}>Mesa:</span>
                <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{order.table_label}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 'bold' }}>Fecha/Hora:</span>
              <span>{formatBogotaDateTime(new Date(order.created_at))}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>Estado:</span>
              <span style={{ 
                fontWeight: 'bold',
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                background: order.status === 'NUEVO' ? '#ffc107' :
                           order.status === 'EN_PREP' ? '#F5BB4C' :
                           order.status === 'LISTO' ? '#28a745' : '#6c757d',
                color: 'white'
              }}>
                {order.status}
              </span>
            </div>
          </div>

          {/* Separador */}
          <div style={{ borderTop: '2px solid #333', margin: '1rem 0' }}></div>

          {/* Items */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center' }}>ITEMS:</h3>
            {order.items.map((item, idx) => (
              <div key={idx} style={{ 
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: idx < order.items.length - 1 ? '1px solid #333' : 'none'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
                    {item.qty}x {item.name}
                  </span>
                </div>
                {item.notes && (
                  <div style={{ 
                    fontSize: '1rem', 
                    color: '#333', 
                    fontStyle: 'italic', 
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #ddd'
                  }}>
                    <strong>Nota:</strong> {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Separador */}
          <div style={{ borderTop: '2px solid #333', margin: '1rem 0' }}></div>

          {/* Pie de página */}
          <div style={{ 
            marginTop: '1.5rem', 
            paddingTop: '1rem', 
            borderTop: '1px solid #333',
            textAlign: 'center',
            fontSize: '0.9rem'
          }}>
            <p style={{ margin: '0.25rem 0', fontWeight: 'bold' }}>Comanda generada el {formatBogotaDateTime(new Date())}</p>
          </div>
        </div>
      </div>

      {/* Estilos para impresión */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .comanda-container,
          .comanda-container * {
            visibility: visible;
          }
          .comanda-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: white;
            padding: 0;
          }
          .comanda-controls {
            display: none !important;
          }
          .comanda-content {
            max-width: 100%;
            box-shadow: none;
            padding: 1rem;
          }
          .comanda-body {
            border: 2px solid #000;
          }
        }
      `}</style>
    </div>
  );
}
