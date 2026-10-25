import useBusiness, { logoSrc } from '../hooks/useBusiness';

// Toque de marca sutil: el ícono oficial (la "C" con fondo amarillo, mismo
// archivo que el favicon/ícono de la app) junto al título de cada pantalla
// principal — dueño, 2026-09. Un solo componente para que el tamaño/radio
// quede igual en Caja/Cocina/Mesero en vez de repetir el <img> a mano.
// Rediseño 2026-10: si en "Identidad del negocio" se subió otro logo, se usa
// ese (object-fit: contain conserva sus proporciones).
export default function BrandMark({ size = 22, style }) {
  const business = useBusiness();
  return (
    <img
      src={logoSrc(business)}
      alt=""
      width={size}
      height={size}
      style={{
        borderRadius: Math.round(size * 0.28),
        flexShrink: 0,
        display: 'block',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}
