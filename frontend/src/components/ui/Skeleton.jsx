// ESQUELETO (2026-10-26, idea del catálogo moxen.cl): tarjetas fantasma con
// un brillo que barre, para los estados de carga en vez del texto plano
// "Cargando…". Estilos en primitives.css (.skeleton); respeta
// prefers-reduced-motion (el brillo se detiene, los bloques quedan quietos).

// Una tarjeta fantasma con la silueta de las tarjetas de órdenes/contratos:
// título + pill, dos líneas de productos y el total.
export function SkeletonCard() {
  return (
    <div className="card" aria-hidden="true" style={{ padding: '1rem 1.2rem', display: 'grid', gap: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <span className="skeleton" style={{ width: '45%', height: 18 }} />
        <span className="skeleton" style={{ width: 72, height: 22, borderRadius: 999 }} />
      </div>
      <span className="skeleton" style={{ width: '70%' }} />
      <span className="skeleton" style={{ width: '55%' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <span className="skeleton" style={{ width: 56 }} />
        <span className="skeleton" style={{ width: 90, height: 20 }} />
      </div>
    </div>
  );
}

// Lista de tarjetas fantasma. role=status para que un lector de pantalla
// anuncie que está cargando sin leer los bloques.
export default function SkeletonCards({ count = 3 }) {
  return (
    <div role="status" aria-label="Cargando" style={{ display: 'grid', gap: '0.8rem' }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
