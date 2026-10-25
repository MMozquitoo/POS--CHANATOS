import { useState } from 'react';
import { parseListaProducto } from '../SalsasChips';
import { normalizarQuitar } from '../QuitarChips';

// Salsas o "Quitar" de UN producto (Menú → Editar producto, y el panel de
// aplicar a varios). Tres modos, guardados en products.salsas / products.quitar:
//   Lista general → null   (lo que esté en "Salsas, quitar y sabores")
//   Propias       → "A,B"  (marcadas de la general + las que se escriban)
//   No lleva      → ""     (la sección no aparece al armar el pedido)
//
// value: null | string · onChange(null | string)
// generales: la lista general actual (para marcar/desmarcar rápido)
// tipo: 'salsas' | 'quitar' ("tomate" en quitar se guarda como "Sin tomate")
export default function OpcionesProductoField({ label, value, onChange, generales = [], tipo = 'salsas', ayuda }) {
  const [nueva, setNueva] = useState('');
  const lista = parseListaProducto(value);
  const modo = lista === null ? 'general' : lista.length === 0 ? 'ninguna' : 'propias';

  const setLista = (arr) => onChange(arr.join(','));
  const elegirModo = (m) => {
    if (m === modo) return;
    if (m === 'general') onChange(null);
    else if (m === 'ninguna') onChange('');
    // Propias arranca con la general marcada: más fácil quitar que escribir todo
    else setLista(generales.length ? generales : []);
  };

  const propias = lista || [];
  const tiene = (op) => propias.some((p) => p.toLowerCase() === op.toLowerCase());
  const toggle = (op) => setLista(tiene(op) ? propias.filter((p) => p.toLowerCase() !== op.toLowerCase()) : [...propias, op]);
  const agregar = () => {
    const v = tipo === 'quitar' ? normalizarQuitar(nueva) : nueva.replace(/,/g, ' ').trim();
    if (v && !tiene(v)) setLista([...propias, v]);
    setNueva('');
  };
  // Las escritas a mano (no están en la general) se muestran aparte para borrarlas
  const extras = propias.filter((p) => !generales.some((g) => g.toLowerCase() === p.toLowerCase()));

  const chip = (activo) => ({
    padding: '0.45rem 0.8rem',
    minHeight: 40,
    borderRadius: 999,
    border: `1.5px solid ${activo ? (tipo === 'quitar' ? '#C0392B' : '#F5BB4C') : '#e5d9bd'}`,
    background: activo ? (tipo === 'quitar' ? '#C0392B' : '#F5BB4C') : '#FFFDF7',
    color: activo ? (tipo === 'quitar' ? '#fff' : '#1a1a2e') : '#8a7443',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
  });

  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>{label}</label>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {[['general', 'Lista general'], ['propias', 'Propias'], ['ninguna', 'No lleva']].map(([m, t]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            className={`segmented__btn ${modo === m ? 'is-active' : ''}`}
            onClick={() => elegirModo(m)}
          >
            {t}
          </button>
        ))}
      </div>

      {modo === 'general' && (
        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>
          Usa la lista general{generales.length ? `: ${generales.join(', ')}` : ''}.
        </div>
      )}
      {modo === 'ninguna' && (
        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>
          Al armar el pedido no aparece esta sección para este producto.
        </div>
      )}
      {modo === 'propias' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
            {generales.map((g) => (
              <button key={g} type="button" style={chip(tiene(g))} onClick={() => toggle(g)} aria-pressed={tiene(g)}>
                {g}
              </button>
            ))}
            {extras.map((p) => (
              <button key={p} type="button" style={chip(true)} onClick={() => toggle(p)} aria-label={`Quitar ${p} de este producto`}>
                {p} ×
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="text"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
              placeholder={tipo === 'quitar' ? 'Otra (ej: Sin papas)' : 'Otra salsa solo para este producto'}
              aria-label={`Agregar a ${label}`}
              style={{ flex: 1, padding: '0.6rem', border: '1px solid #ddd', borderRadius: 8, fontSize: '1rem' }}
            />
            <button type="button" className="btn btn--secondary" onClick={agregar}>+ Agregar</button>
          </div>
        </>
      )}
      {ayuda && <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.35rem' }}>{ayuda}</div>}
    </div>
  );
}
