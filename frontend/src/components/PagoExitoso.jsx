import { useEffect, useRef, useState } from 'react';
import AnimatedNumber from './AnimatedNumber.jsx';
import { formatPriceCOP } from '../utils/currency.js';
import '../styles/pago-exitoso.css';

// Confirmación de cobro (2026-10, experimento del dueño con referencias de
// motion: NumberFlow / Klarna / Kiwi). Una forma mostaza se expande detrás del
// monto, el monto rueda desde 0, entra "PAGADO" y la composición se recoge
// para dejar ver el recibo. <1 s en total y TOCAR LA PANTALLA LA SALTA: el
// cajero nunca espera a una animación en hora pico. El vuelto NO alarga la
// animación: queda fijo y destacado en el recibo (Recibo.jsx, .recibo-vuelto).
//
// props:
//   amount   monto cobrado
//   change   vuelto (efectivo) — se muestra si > 0, es lo que el cajero necesita
//   method   texto del método ("Efectivo", "Transferencia"...)
//   onDone   se llama al terminar (o al tocar)
const HOLD_MS = 760;
const EXIT_MS = 200;

export default function PagoExitoso({ amount, change = 0, method, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const salir = () => {
    setLeaving((ya) => {
      if (!ya) setTimeout(() => doneRef.current?.(), EXIT_MS);
      return true;
    });
  };

  useEffect(() => {
    const t = setTimeout(salir, HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`pago-ok ${leaving ? 'pago-ok--leaving' : ''}`}
      onClick={salir}
      role="status"
      aria-live="polite"
    >
      <div className="pago-ok-blob" aria-hidden="true" />
      <div className="pago-ok-content">
        <div className="pago-ok-word" aria-label="Pagado">
          {'PAGADO'.split('').map((l, i) => (
            <span key={i} className="pago-ok-letter" style={{ '--i': i }} aria-hidden="true">
              <span>{l}</span>
            </span>
          ))}
        </div>
        <AnimatedNumber value={amount} fromZero className="pago-ok-amount" />
        {method && <div className="pago-ok-method">{method}</div>}
        {change > 0 && (
          <div className="pago-ok-change tnum">Vuelto {formatPriceCOP(change)}</div>
        )}
      </div>
    </div>
  );
}
