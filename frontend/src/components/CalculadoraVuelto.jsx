import { useState, useEffect } from 'react';
import { formatPriceCOP } from '../utils/currency.js';
import './CalculadoraVuelto.css';

export default function CalculadoraVuelto({ total = 0, onClose }) {
  const [recibido, setRecibido] = useState('');
  const [vuelto, setVuelto] = useState(0);

  useEffect(() => {
    const totalNum = parseFloat(total) || 0;
    const recibidoNum = parseFloat(recibido) || 0;
    const vueltoCalculado = recibidoNum - totalNum;
    setVuelto(vueltoCalculado >= 0 ? vueltoCalculado : 0);
  }, [total, recibido]);

  const handleBillClick = (amount) => {
    const current = parseFloat(recibido) || 0;
    setRecibido((current + amount).toString());
  };

  const handleClear = () => {
    setRecibido('');
  };

  const handleConfirm = () => {
    onClose && onClose();
  };

  return (
    <div className="calculadora-vuelto-overlay">
      <div className="calculadora-vuelto-container">
        <div className="calculadora-header">
          <h2>CALCULADORA DE VUELTO</h2>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>

        <div className="calculadora-content">
          <div className="calculadora-total-section">
            <label>Total a Cobrar:</label>
            <div className="total-display">{formatPriceCOP(total)}</div>
          </div>

          <div className="calculadora-recibido-section">
            <label>Recibido:</label>
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
            <label>Vuelto:</label>
            <div className={`vuelto-display ${vuelto >= 0 ? 'positive' : 'negative'}`}>
              {vuelto >= 0 ? formatPriceCOP(vuelto) : `Faltan: ${formatPriceCOP(Math.abs(vuelto))}`}
            </div>
          </div>

          <div className="calculadora-bills">
            <h3>Billetes Rápidos</h3>
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
              LIMPIAR
            </button>
            <button onClick={handleConfirm} className="confirm-btn">
              LISTO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
