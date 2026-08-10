import { useState } from 'react';
import CajaHeader from '../../components/CajaHeader.jsx';
import './Caja.css';
import RegistrarCompra from './RegistrarCompra.jsx';
import Ingredientes from './Ingredientes.jsx';
import GastosGenerales from './GastosGenerales.jsx';

// Junta lo que antes eran tres entradas de menú separadas (Registrar
// compra / Ingredientes / Gastos generales) en una sola pantalla con
// pestañas — mismo patrón que Historial (Pagos/Cierres) y Conexión
// (Estado/Configurar). El que compra no tiene que decidir a qué menú ir:
// entra acá y por defecto ya está en "Registrar".
export default function Compras() {
  const [tab, setTab] = useState('registrar'); // 'registrar' | 'insumos' | 'generales'

  return (
    <div className="caja-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CajaHeader title="COMPRAS" backTo="/mas" />

      <div style={{ padding: '1rem', background: '#fff', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
        <div className="segmented">
          <button
            type="button"
            className={`segmented__btn${tab === 'registrar' ? ' is-active' : ''}`}
            onClick={() => setTab('registrar')}
          >
            REGISTRAR
          </button>
          <button
            type="button"
            className={`segmented__btn${tab === 'insumos' ? ' is-active' : ''}`}
            onClick={() => setTab('insumos')}
          >
            INSUMOS
          </button>
          <button
            type="button"
            className={`segmented__btn${tab === 'generales' ? ' is-active' : ''}`}
            onClick={() => setTab('generales')}
          >
            GENERALES
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'registrar' && <RegistrarCompra embedded />}
        {tab === 'insumos' && <Ingredientes embedded />}
        {tab === 'generales' && <GastosGenerales embedded />}
      </div>
    </div>
  );
}
