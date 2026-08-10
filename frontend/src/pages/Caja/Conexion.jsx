import { useState } from 'react';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';
import Diagnostico from './Diagnostico.jsx';
import ConfigServidor from './ConfigServidor.jsx';

// Junta lo que antes eran dos entradas del menú (SERVIDOR y DIAGNÓSTICO) en
// una sola: son dos vistas de lo mismo (conectividad del POS al backend) —
// Diagnostico ya tenía un botón "IR A SERVIDOR" que las enlazaba.
export default function Conexion() {
  const [tab, setTab] = useState('estado'); // 'estado' | 'configurar'

  return (
    <div className="caja-container">
      <CajaHeader title="CONEXIÓN" backTo="/mas" />

      <div style={{ padding: '1rem', background: '#fff', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
        <div className="segmented">
          <button
            type="button"
            className={`segmented__btn${tab === 'estado' ? ' is-active' : ''}`}
            onClick={() => setTab('estado')}
          >
            ESTADO
          </button>
          <button
            type="button"
            className={`segmented__btn${tab === 'configurar' ? ' is-active' : ''}`}
            onClick={() => setTab('configurar')}
          >
            CONFIGURAR
          </button>
        </div>
      </div>

      {tab === 'estado'
        ? <Diagnostico embedded onGoToServer={() => setTab('configurar')} />
        : <ConfigServidor embedded />}
    </div>
  );
}
