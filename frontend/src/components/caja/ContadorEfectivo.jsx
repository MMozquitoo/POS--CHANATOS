import { formatPriceCOP } from '../../utils/currency.js';

// Conteo de efectivo por denominación para el cierre de caja (dueño,
// 2026-10-25): en vez de sumar de memoria y escribir un total, el cajero
// cuenta "3 de 50.000, 7 de 20.000…" y el sistema suma. Menos errores de
// dedo en el momento más delicado del día.
//
// value: { [denominacion]: cantidad } · onChange(nuevoValue)
// El total lo calcula el padre con totalConteo(value).
export const DENOMINACIONES = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];

export function totalConteo(value) {
  return DENOMINACIONES.reduce((s, d) => s + d * (Number(value?.[d]) || 0), 0);
}

export default function ContadorEfectivo({ value = {}, onChange }) {
  const set = (denom, qty) => {
    const n = Math.max(0, Math.min(9999, Math.floor(Number(qty) || 0)));
    onChange({ ...value, [denom]: n });
  };

  return (
    <div className="conteo-efectivo">
      {DENOMINACIONES.map((d) => {
        const qty = Number(value[d]) || 0;
        return (
          <div key={d} className={`conteo-fila ${qty > 0 ? 'is-contada' : ''}`}>
            <span className="conteo-denom tnum">{formatPriceCOP(d)}</span>
            <div className="conteo-controles">
              <button type="button" onClick={() => set(d, qty - 1)} disabled={qty === 0} aria-label={`Una menos de ${formatPriceCOP(d)}`}>
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={qty === 0 ? '' : String(qty)}
                placeholder="0"
                onChange={(e) => set(d, e.target.value.replace(/\D/g, ''))}
                aria-label={`Cantidad de ${formatPriceCOP(d)}`}
              />
              <button type="button" onClick={() => set(d, qty + 1)} aria-label={`Una más de ${formatPriceCOP(d)}`}>
                +
              </button>
            </div>
            <span className="conteo-subtotal tnum">{qty > 0 ? formatPriceCOP(d * qty) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
