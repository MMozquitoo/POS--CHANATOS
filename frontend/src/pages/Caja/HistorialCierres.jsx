import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatPriceCOP } from '../../utils/currency.js';
import { formatBogotaDateTime } from '../../utils/timezone.js';
import ReporteCierre from '../../components/ReporteCierre.jsx';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

// Helpers locales para diferencias de cierre
function getDiffLabel(diff) {
  if (diff > 0) return "SOBRANTE";
  if (diff < 0) return "FALTANTE";
  return "CUADRA";
}

function getDiffColor(diff) {
  if (diff > 0) return "var(--green-text)";
  if (diff < 0) return "var(--red-text)";
  return "var(--brand-deep)";
}

// embedded=true: se usa dentro de Historial.jsx (pestaña "Cierres"), sin su
// propio CajaHeader/container.
export default function HistorialCierres({ embedded = false }) {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
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
      showAlert('Error al cargar historial de cierres');
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
      showAlert('Error al cargar reporte de cierre');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleCloseReport = () => {
    setReport(null);
    setSelectedSession(null);
  };

  if (loading) {
    const loadingContent = (
      <div className="caja-content" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Cargando...</p>
      </div>
    );
    if (embedded) return loadingContent;
    return (
      <div className="caja-container">
        <CajaHeader title="HISTORIAL DE CIERRES" backTo="/mas" />
        {loadingContent}
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
        declared_card: report.session.declared_card ?? null,
        diff_card: report.session.diff_card ?? null,
        declared_transfer: report.session.declared_transfer ?? null,
        diff_transfer: report.session.diff_transfer ?? null,
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
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
              Error: No se pudo cargar el reporte de cierre
            </div>
          )}
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={handleCloseReport}
              className="btn-secondary"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const listContent = (
    <>
      <div className="caja-content" style={{ padding: '1rem' }}>
        {sessions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-500)' }}>
            <p style={{ fontSize: 'var(--text-20)' }}>No hay cierres registrados</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '720px', margin: '0 auto' }}>
            {sessions.map((session) => {
              const diff = session.diff_cash;
              const diffLabel = getDiffLabel(diff);
              const diffColor = getDiffColor(diff);
              const hasCardDiff = session.diff_card !== null && session.diff_card !== undefined;
              const hasTransferDiff = session.diff_transfer !== null && session.diff_transfer !== undefined;

              return (
                <div
                  key={session.id}
                  onClick={() => handleViewReport(session.id)}
                  className="card card--tap"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: 'var(--text-17)' }}>
                        {formatBogotaDateTime(new Date(session.closed_at))}
                      </strong>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewReport(session.id);
                      }}
                      className="btn btn--primary btn--sm"
                    >
                      Ver
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: 'var(--text-15)', color: 'var(--gray-500)' }}>
                    <div>
                      <strong>Total ventas:</strong> {formatPriceCOP(session.total_sales || 0)}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong># Pagos:</strong> {session.payment_count || 0}
                    </div>
                    <div>
                      <strong>Diferencia efectivo:</strong>{' '}
                      <span style={{ color: diffColor, fontWeight: 'bold' }}>
                        {diffLabel} {formatPriceCOP(Math.abs(diff || 0))}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <strong>Cerrado por:</strong> Usuario #{session.closed_by}
                    </div>
                    {hasCardDiff && (
                      <div>
                        <strong>Diferencia tarjeta:</strong>{' '}
                        <span style={{ color: getDiffColor(session.diff_card), fontWeight: 'bold' }}>
                          {getDiffLabel(session.diff_card)} {formatPriceCOP(Math.abs(session.diff_card || 0))}
                        </span>
                      </div>
                    )}
                    {hasTransferDiff && (
                      <div style={{ textAlign: hasCardDiff ? 'right' : 'left' }}>
                        <strong>Diferencia transf.:</strong>{' '}
                        <span style={{ color: getDiffColor(session.diff_transfer), fontWeight: 'bold' }}>
                          {getDiffLabel(session.diff_transfer)} {formatPriceCOP(Math.abs(session.diff_transfer || 0))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </>
  );

  if (embedded) return listContent;

  return (
    <div className="caja-container">
      <CajaHeader title="HISTORIAL DE CIERRES" backTo="/mas" />
      {listContent}
    </div>
  );
}
