// Toque de marca sutil: el ícono oficial (la "C" con fondo amarillo, mismo
// archivo que el favicon/ícono de la app) junto al título de cada pantalla
// principal — dueño, 2026-09. Un solo componente para que el tamaño/radio
// quede igual en Caja/Cocina/Mesero en vez de repetir el <img> a mano.
export default function BrandMark({ size = 22, style }) {
  return (
    <img
      src="/icon-192.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: Math.round(size * 0.28), flexShrink: 0, display: 'block', ...style }}
    />
  );
}
