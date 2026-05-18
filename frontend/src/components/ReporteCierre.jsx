import { useState, useEffect } from 'react';
import { formatPriceCOP } from '../utils/currency.js';
import { formatBogotaDateTime } from '../utils/timezone.js';

export default function ReporteCierre({ snapshot, format: initialFormat, showControls = true }) {
  // ALL hooks must be declared before any conditional returns
  // Estado para formato de impresión (default: 80mm)
  const [printFormat, setPrintFormat] = useState(() => {
    if (initialFormat) return initialFormat;
    const saved = localStorage.getItem('cierre_format');
    return saved || '80MM';
  });

  // Guardar preferencia cuando cambia
  useEffect(() => {
    localStorage.setItem('cierre_format', printFormat);
  }, [printFormat]);

  if (!snapshot) {
    return null;
  }

  const handlePrint = () => {
    window.print();
  };

  const getDiffLabel = (diff) => {
    if (diff === null || diff === undefined) return 'N/A';
    if (diff < 0) return 'FALTANTE';
    if (diff > 0) return 'SOBRANTE';
    return 'CUADRA';
  };

  const getDiffColor = (diff) => {
    if (diff === null || diff === undefined) return '#666';
    if (diff < 0) return '#dc3545';
    if (diff > 0) return '#28a745';
    return '#F5BB4C';
  };

  const diff = snapshot.diff_cash;
  const diffLabel = getDiffLabel(diff);
  const diffColor = getDiffColor(diff);

  // Obtener nombre del cajero si está disponible (por ahora solo ID)
  const cajeroName = snapshot.closed_by ? `Usuario #${snapshot.closed_by}` : 'N/A';

  return (
    <div>
      {/* Controles (solo si showControls) */}
      {showControls && (
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          background: '#f8f9fa', 
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Formato:</label>
            <select
              value={printFormat}
              onChange={(e) => setPrintFormat(e.target.value)}
              style={{
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '0.9rem'
              }}
            >
              <option value="80MM">80mm</option>
              <option value="58MM">58mm</option>
              <option value="A4">A4</option>
            </select>
          </div>
          <button
            onClick={handlePrint}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#F5BB4C',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem'
            }}
          >
            IMPRIMIR
          </button>
        </div>
      )}

      {/* Reporte imprimible */}
      <div 
        id="close-print"
        className={`reporte-cierre-print print-${printFormat.toLowerCase()}`}
        style={{
          background: 'white',
          padding: printFormat === 'A4' ? '2rem' : '1rem',
          borderRadius: '8px',
          border: '1px solid #ddd',
          maxWidth: printFormat === 'A4' ? '210mm' : printFormat === '80MM' ? '80mm' : '58mm',
          margin: '0 auto'
        }}
      >
        {/* Encabezado PRO */}
        <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '2px solid #333', paddingBottom: '0.75rem' }}>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: printFormat === 'A4' ? '1.8rem' : '1.2rem', fontWeight: 'bold' }}>
            CHANATOS
          </h1>
          <div style={{ fontSize: printFormat === 'A4' ? '0.9rem' : '0.7rem', marginBottom: '0.25rem', color: '#666' }}>
            NIT: --
          </div>
          <div style={{ fontSize: printFormat === 'A4' ? '0.9rem' : '0.7rem', marginBottom: '0.25rem', color: '#666' }}>
            Dirección: --
          </div>
          <div style={{ fontSize: printFormat === 'A4' ? '0.9rem' : '0.7rem', color: '#666' }}>
            Tel: --
          </div>
        </div>

        {/* Título */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: printFormat === 'A4' ? '1.5rem' : '1.1rem', fontWeight: 'bold' }}>
            CIERRE DE CAJA
          </h2>
          <div style={{ fontSize: printFormat === 'A4' ? '0.9rem' : '0.75rem', color: '#666', marginTop: '0.25rem' }}>
            {formatBogotaDateTime(new Date(snapshot.closed_at))}
          </div>
        </div>

        {/* Datos de sesión */}
        <div style={{ 
          marginBottom: '1rem', 
          paddingBottom: '1rem', 
          borderBottom: '2px solid #333',
          fontSize: printFormat === 'A4' ? '0.95rem' : '0.8rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong>Sesión ID:</strong>
            <span>{snapshot.sessionId}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong>Apertura:</strong>
            <span>{formatBogotaDateTime(new Date(snapshot.opened_at))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong>Cierre:</strong>
            <span>{formatBogotaDateTime(new Date(snapshot.closed_at))}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Cajero:</strong>
            <span>{cajeroName}</span>
          </div>
        </div>

        {/* Totales por método */}
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: printFormat === 'A4' ? '1.2rem' : '1rem',
            fontWeight: 'bold',
            borderBottom: '1px solid #333',
            paddingBottom: '0.5rem'
          }}>
            Ventas por Método
          </h3>
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '0.4rem',
              fontSize: printFormat === 'A4' ? '0.95rem' : '0.8rem'
            }}>
              <span><strong>EFECTIVO:</strong></span>
              <span>{formatPriceCOP(snapshot.totals.total_cash || 0)}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '0.4rem',
              fontSize: printFormat === 'A4' ? '0.95rem' : '0.8rem'
            }}>
              <span><strong>TARJETA:</strong></span>
              <span>{formatPriceCOP(snapshot.totals.total_card || 0)}</span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '0.4rem',
              fontSize: printFormat === 'A4' ? '0.95rem' : '0.8rem'
            }}>
              <span><strong>TRANSFERENCIA:</strong></span>
              <span>{formatPriceCOP(snapshot.totals.total_transfer || 0)}</span>
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '2px solid #333',
            fontSize: printFormat === 'A4' ? '1.2rem' : '1rem',
            fontWeight: 'bold'
          }}>
            <span>TOTAL VENTAS:</span>
            <span>{formatPriceCOP(snapshot.totals.total_sales || 0)}</span>
          </div>
        </div>

        {/* Arqueo de efectivo */}
        <div style={{ 
          marginBottom: '1rem', 
          padding: printFormat === 'A4' ? '1.5rem' : '1rem',
          background: '#f8f9fa',
          borderRadius: '6px',
          border: '2px solid #333',
          fontSize: printFormat === 'A4' ? '0.95rem' : '0.8rem'
        }}>
          <h3 style={{ 
            margin: '0 0 0.75rem 0', 
            fontSize: printFormat === 'A4' ? '1.2rem' : '1rem',
            fontWeight: 'bold',
            borderBottom: '1px solid #333',
            paddingBottom: '0.5rem'
          }}>
            Arqueo de Efectivo
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>Efectivo inicial:</span>
            <span>{formatPriceCOP(snapshot.initial_cash || 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>Ventas en efectivo:</span>
            <span>{formatPriceCOP(snapshot.totals.total_cash || 0)}</span>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #333',
            fontWeight: 'bold'
          }}>
            <span>Efectivo esperado:</span>
            <span>{formatPriceCOP(snapshot.expected_cash || 0)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
            <span>Efectivo contado:</span>
            <span>{formatPriceCOP(snapshot.closing_cash || 0)}</span>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '2px solid #333',
            fontSize: printFormat === 'A4' ? '1.5rem' : '1.2rem',
            fontWeight: 'bold',
            color: diffColor
          }}>
            <span>Diferencia ({diffLabel}):</span>
            <span>{formatPriceCOP(Math.abs(diff || 0))}</span>
          </div>
        </div>

        {/* Resumen */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '1rem', 
          paddingTop: '1rem', 
          borderTop: '1px solid #ddd',
          fontSize: printFormat === 'A4' ? '0.9rem' : '0.75rem',
          color: '#666'
        }}>
          <p style={{ margin: '0.25rem 0' }}>
            Total de pagos: {snapshot.totals.payment_count || 0}
          </p>
        </div>

        {/* Pie */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '1.5rem', 
          paddingTop: '1rem', 
          borderTop: '1px solid #ddd',
          fontSize: printFormat === 'A4' ? '0.9rem' : '0.75rem',
          color: '#666',
          fontStyle: 'italic'
        }}>
          Documento de cierre de caja
        </div>
      </div>

      {/* Estilos de impresión */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #close-print,
          #close-print * {
            visibility: visible;
          }
          #close-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
            padding: ${printFormat === 'A4' ? '20mm' : '10mm'};
            border: none;
            box-shadow: none;
          }
          .reporte-cierre-print {
            box-shadow: none !important;
            border: none !important;
          }
          button,
          select,
          .caja-header {
            display: none !important;
          }
        }
        @page {
          size: ${printFormat === 'A4' ? 'A4' : printFormat === '80MM' ? '80mm auto' : '58mm auto'};
          margin: 0;
        }
        .print-80mm {
          max-width: 80mm;
        }
        .print-58mm {
          max-width: 58mm;
        }
        .print-a4 {
          max-width: 210mm;
        }
      `}</style>
    </div>
  );
}
