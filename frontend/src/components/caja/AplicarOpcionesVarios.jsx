import { useMemo, useState } from 'react';
import axios from 'axios';
import OpcionesProductoField from './OpcionesProductoField';
import { parseListaProducto } from '../SalsasChips';

// Salsas o "Quitar" para VARIOS productos a la vez (dentro de "Salsas, quitar y
// sabores"): ej. todas las hamburguesas con sus salsas y las papas con otras.
// Se marca la categoría entera o producto por producto y se aplica con
// PATCH /products/options/bulk. Producto por producto también se puede desde
// Menú → Editar.
export default function AplicarOpcionesVarios({ products, generales, showAlert, onApplied }) {
  const [campo, setCampo] = useState('salsas');
  const [valor, setValor] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [aplicando, setAplicando] = useState(false);

  const porCategoria = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => {
      const list = map.get(p.category) || [];
      list.push(p);
      map.set(p.category, list);
    });
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [products]);

  const toggle = (id) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleCategoria = (list) => setSel((prev) => {
    const next = new Set(prev);
    const todas = list.every((p) => next.has(p.id));
    list.forEach((p) => (todas ? next.delete(p.id) : next.add(p.id)));
    return next;
  });

  const estado = (p) => {
    const l = parseListaProducto(p[campo]);
    if (l === null) return 'general';
    if (l.length === 0) return 'no lleva';
    return l.join(', ');
  };

  const nombreCampo = campo === 'salsas' ? 'salsas' : '«Quitar»';
  const aplicar = async () => {
    if (sel.size === 0) {
      await showAlert('Marca al menos un producto');
      return;
    }
    setAplicando(true);
    try {
      await axios.patch('/products/options/bulk', {
        productIds: [...sel],
        field: campo,
        value: valor === null ? null : valor.split(',').filter(Boolean),
      });
      await showAlert(`Listo: ${sel.size} ${sel.size === 1 ? 'producto actualizado' : 'productos actualizados'} (${nombreCampo}).`);
      setSel(new Set());
      onApplied?.();
    } catch (err) {
      await showAlert(err.response?.data?.error || 'No se pudo aplicar');
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h4 style={{ margin: '0 0 0.4rem 0' }}>Salsas y «Quitar» por producto</h4>
      <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.6rem 0' }}>
        Para que cada producto muestre las suyas (las hamburguesas unas, las papas
        otras). Elige la lista, marca los productos o la categoría entera y aplica.
      </p>
      <div className="segmented" role="radiogroup" aria-label="Qué configurar" style={{ marginBottom: '0.75rem' }}>
        {[['salsas', 'Salsas'], ['quitar', 'Quitar']].map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={campo === k}
            className={`segmented__btn ${campo === k ? 'is-active' : ''}`}
            onClick={() => { setCampo(k); setValor(null); }}
          >
            {t}
          </button>
        ))}
      </div>

      <OpcionesProductoField
        label={campo === 'salsas' ? 'Salsas para los productos marcados' : '«Quitar» para los productos marcados'}
        tipo={campo}
        value={valor}
        generales={generales[campo] || []}
        onChange={setValor}
      />

      <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '0.5rem' }}>
        {porCategoria.length === 0 && <p style={{ color: '#999', fontSize: '0.85rem', margin: 0 }}>No hay productos.</p>}
        {porCategoria.map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => toggleCategoria(list)}
              style={{ border: 'none', background: 'none', padding: '0.35rem 0', fontWeight: 800, fontSize: '0.85rem', color: '#7a6230', cursor: 'pointer', minHeight: 36 }}
            >
              {list.every((p) => sel.has(p.id)) ? 'Desmarcar' : 'Marcar'} toda la categoría · {String(cat).replace(/_/g, ' ').toLowerCase()}
            </button>
            {list.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                <span style={{ flex: 1 }}>{p.name}{p.variant ? ` - ${p.variant}` : ''}</span>
                <span style={{ color: '#999', fontSize: '0.8rem', textAlign: 'right' }}>{estado(p)}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="btn-chanatos"
        onClick={aplicar}
        disabled={aplicando}
        style={{ marginTop: '0.75rem', width: '100%', padding: '0.7rem' }}
      >
        {aplicando ? 'Aplicando...' : `Aplicar ${nombreCampo} a ${sel.size || 'los'} ${sel.size === 1 ? 'producto' : 'productos'}`}
      </button>
    </div>
  );
}
