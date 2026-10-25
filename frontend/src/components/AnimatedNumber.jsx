import { useEffect, useState } from 'react';
import { formatPriceCOP } from '../utils/currency.js';
import '../styles/animated-number.css';

// Monto que RUEDA al cambiar (estilo odómetro / NumberFlow) en vez de
// reemplazarse de golpe: $17.000 → $22.000 mueve solo los dígitos que cambian.
// CSS puro, sin dependencias (una librería nueva obliga a reinstalar el POS en
// el PC del local; esto llega con "Buscar actualizaciones").
//
// props:
//   value      número a mostrar
//   format     (n) => string; por defecto formatPriceCOP
//   fromZero   true: al montarse los dígitos arrancan en 0 y ruedan hasta value
//              (confirmación de pago)
export default function AnimatedNumber({ value, format = formatPriceCOP, fromZero = false, className = '', style }) {
  // fromZero: primer frame con la cifra final pero todos los dígitos en 0
  // (mismo ancho, nada salta) y en el siguiente frame ruedan a su valor.
  const [armed, setArmed] = useState(!fromZero);

  useEffect(() => {
    if (armed) return undefined;
    let inner;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [armed]);

  const finalText = format(value);
  const text = armed ? finalText : finalText.replace(/\d/g, '0');
  const chars = text.split('');

  return (
    <span className={`anum tnum ${className}`} style={style} aria-label={finalText}>
      {chars.map((ch, i) => {
        // La llave cuenta desde la DERECHA: al pasar de $9.000 a $12.000 las
        // unidades siguen siendo las mismas columnas y solo aparece una nueva.
        const key = chars.length - i;
        if (!/\d/.test(ch)) {
          return <span key={key} className="anum-char" aria-hidden="true">{ch}</span>;
        }
        return (
          <span key={key} className="anum-char anum-digit" aria-hidden="true">
            <span className="anum-strip" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
