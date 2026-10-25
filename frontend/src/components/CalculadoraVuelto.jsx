import { useState, useEffect } from 'react';
import { formatPriceCOP, parseMontoCOP } from '../utils/currency.js';
import './CalculadoraVuelto.css';

// propina: si el cliente la paga con el mismo efectivo, el vuelto es
// recibido − (total + propina). Se muestra sumada al total para que el cajero
// vea exactamente cuánto tiene que cubrir lo que le entregan.
export default function CalculadoraVuelto({ total = 0, propina = 0, onClose, onConfirm }) {
  const [recibido, setRecibido] = useState('');
  const [vuelto, setVuelto] = useState(0);

  useEffect(() => {
    const totalNum = (parseMontoCOP(total) || 0) + (parseMontoCOP(propina) || 0);
    const recibidoNum = parseMontoCOP(recibido) || 0;
    const vueltoCalculado = recibidoNum - totalNum;
    setVuelto(vueltoCalculado >= 0 ? vueltoCalculado : 0);
  }, [total, propina, recibido]);

  const handleBillClick = (amount) => {
    const current = parseMontoCOP(recibido) || 0;
    setRecibido((current + amount).toString());
  };

  const handleClear = () => {
    setRecibido('');
  };

  const handleConfirm = () => {
    // Devolver el monto recibido al flujo de cobro (para vuelto en el recibo)
    const recibidoNum = parseMontoCOP(recibido) || 0;
    onConfirm && onConfirm(recibidoNum);
    onClose && onClose();
  };

  return (
    <div className="calculadora-vuelto-overlay">
      <div className="calculadora-vuelto-container">
        <div className="calculadora-header">
          <h2>Vuelto</h2>
          <button onClick={onClose} className="close-btn" aria-label="Cerrar">✕</button>
        </div>

        <div className="calculadora-content">
          <div className="calculadora-total-section">
            <label>Total a cobrar</label>
            <div className="total-display">{formatPriceCOP((parseMontoCOP(total) || 0) + (parseMontoCOP(propina) || 0))}</div>
            {(parseMontoCOP(propina) || 0) > 0 && (
              <div className="tnum" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--gray-600)', marginTop: '0.25rem' }}>
                Incluye propina {formatPriceCOP(parseMontoCOP(propina))}
              </div>
            )}
          </div>

          <div className="calculadora-recibido-section">
            <label>Recibido</label>
            <input
              type="number"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              placeholder="0"
              className="recibido-input"
              autoFocus
            />
          </div>

          <div className="calculadora-vuelto-section">
            <label>Vuelto</label>
            <div className={`vuelto-display ${vuelto >= 0 ? 'positive' : 'negative'}`}>
              {vuelto >= 0 ? formatPriceCOP(vuelto) : `Faltan: ${formatPriceCOP(Math.abs(vuelto))}`}
            </div>
          </div>

          <div className="calculadora-bills">
            <h3>Billetes rápidos</h3>
            <div className="bills-grid">
              {[1000, 2000, 5000, 10000, 20000, 50000, 100000].map(bill => (
                <button
                  key={bill}
                  onClick={() => handleBillClick(bill)}
                  className="bill-btn"
                >
                  {formatPriceCOP(bill)}
                </button>
              ))}
            </div>
          </div>

          <div className="calculadora-actions">
            <button onClick={handleClear} className="clear-btn">
              Limpiar
            </button>
            <button onClick={handleConfirm} className="confirm-btn">
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
