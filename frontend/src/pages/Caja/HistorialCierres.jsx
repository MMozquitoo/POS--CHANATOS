import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaDateTime } from '../../utils/timezone.js';
import ReporteCierre from '../../components/ReporteCierre.jsx';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';

// Helpers locales para diferencias de cierre
function getDiffLabel(diff) {
  if (diff > 0) return "SOBRANTE";
  if (diff < 0) return "FALTANTE";
  return "CUADRA";
}

function getDiffColor(diff) {
  if (diff > 0) return "#28a745";
  if (diff < 0) return "#dc3545";
  return "#F5BB4C";
}

export default function HistorialCierres() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/cash/sessions?limit=50');
      setSessions(res.data.sessions || []);
    } catch (error) {
      console.error('Error cargando sesiones:', error);
      alert('Error al cargar historial de cierres');
    } finally {
      setLoading(false);
    }
  };

  const handleViewReport = async (sessionId) => {
    try {
      setLoadingReport(true);
      const res = await axios.get(`/cash/session/${sessionId}/close-report`);
      setReport(res.data);
      setSelectedSession(sessionId);
    } catch (error) {
      console.error('Error cargando reporte:', error);
      alert('Error al cargar reporte de cierre');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleCloseReport = () => {
    setReport(null);
    setSelectedSession(null);
  };

  if (loading) {
    return (
      <div className="caja-container">
        <CajaHeader title="HISTORIAL DE CIERRES" backTo="/mas" />
        <div className="caja-content" style={{ textAlign: 'center', padding: '2rem' }}>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  // Si hay reporte seleccionado, mostrarlo (FASE 12.2: usar componente ReporteCierre)
  if (report) {
    // Determinar snapshot: puede venir directamente o construirlo desde datos antiguos
    let snapshot = report.snapshot;
    
    // Si no hay snapshot pero hay datos antiguos, construir snapshot compatible
    if (!snapshot && report.session) {
      snapshot = {
        sessionId: report.session.id,
        opened_at: report.session.opened_at,
        closed_at: report.session.closed_at,
        initial_cash: report.session.initial_cash || 0,
        closing_cash: report.cash?.closing_cash ?? report.session.closing_cash ?? 0,
        expected_cash: report.cash?.expected_cash ?? report.session.expected_cash ?? 0,
        diff_cash: report.cash?.diff_cash ?? report.session.diff_cash ?? null,
        totals: {
          total_cash: report.totals?.total_cash ?? report.session.total_cash ?? 0,
          total_card: report.totals?.total_card ?? report.session.total_card ?? 0,
          total_transfer: report.totals?.total_transfer ?? report.session.total_transfer ?? 0,
          total_sales: report.totals?.total_sales ?? report.session.total_sales ?? 0,
          payment_count: report.totals?.payment_count ?? report.session.payment_count ?? 0
        },
        closed_by: report.session.closed_by
      };
    }

    return (
      <div className="caja-container">
        <CajaHeader 
          title="REPORTE DE CIERRE" 
          backTo={handleCloseReport}
        />
        <div className="caja-content" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
          {snapshot ? (
            <ReporteCierre snapshot={snapshot} showControls={true} />
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              Error: No se pudo cargar el reporte de cierre
            </div>
          )}
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleCloseReport}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem'
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="caja-container">
      <CajaHeader title="HISTORIAL DE CIERRES" backTo="/mas" />
      <div className="caja-content" style={{ padding: '1rem' }}>
        {sessions.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            background: 'white', 
            borderRadius: '12px',
            color: '#666'
          }}>
            <p style={{ fontSize: '1.2rem' }}>No hay cierres registrados</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {sessions.map((session) => {
              const diff = session.diff_cash;
              const diffLabel = getDiffLabel(diff);
              const diffColor = getDiffColor(diff);
              
              return (
                <div
                  key={session.id}
                  onClick={() => handleViewReport(session.id)}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '1rem',
                    border: '1px solid #e0e0e0',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: '1.1rem' }}>
                        {formatBogotaDateTime(new Date(session.closed_at))}
                      </strong>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewReport(session.id);
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#F5BB4C',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                      }}
                    >
                      Ver
                    </button>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                    <div>
                      <strong>Total ventas:</strong> {formatPriceCOP(session.total_sales || 0)}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong># Pagos:</strong> {session.payment_count || 0}
                    </div>
                    <div>
                      <strong>Diferencia:</strong>{' '}
                      <span style={{ color: diffColor, fontWeight: 'bold' }}>
                        {diffLabel} {formatPriceCOP(Math.abs(diff || 0))}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong>Cerrado por:</strong> Usuario #{session.closed_by}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
