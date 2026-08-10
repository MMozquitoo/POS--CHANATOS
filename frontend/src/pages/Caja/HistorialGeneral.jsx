import { useState } from 'react';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';
import Historial from './Historial.jsx';
import HistorialCierres from './HistorialCierres.jsx';

// Junta lo que antes eran dos entradas del menú (HISTORIAL DE PAGOS e
// HISTORIAL DE CIERRES) en una sola: ambos son "mirar para atrás", no hace
// falta ir a dos menús distintos para verlos.
export default function HistorialGeneral() {
  const [tab, setTab] = useState('pagos'); // 'pagos' | 'cierres'

  return (
    <div className="caja-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CajaHeader title="HISTORIAL" backTo="/mas" />

      <div style={{ padding: '1rem', background: '#fff', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
        <div className="segmented">
          <button
            type="button"
            className={`segmented__btn${tab === 'pagos' ? ' is-active' : ''}`}
            onClick={() => setTab('pagos')}
          >
            PAGOS
          </button>
          <button
            type="button"
            className={`segmented__btn${tab === 'cierres' ? ' is-active' : ''}`}
            onClick={() => setTab('cierres')}
          >
            CIERRES
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'pagos' ? <Historial embedded /> : <HistorialCierres embedded />}
      </div>
    </div>
  );
}
