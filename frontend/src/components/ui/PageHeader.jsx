import BrandMark from '../BrandMark';
import './ui.css';

// Encabezado de sección del rediseño 2026-10: nombre de la sección, una línea
// de estado y las acciones de ESA pantalla. En celular agrega el símbolo de la
// marca en versión compacta (sin quitarle espacio al título ni a las acciones).
export default function PageHeader({ title, subtitle, actions, children }) {
  return (
    <header className="page-header">
      <div className="page-header__main">
        <span className="page-header__mark" aria-hidden="true"><BrandMark size={28} /></span>
        <div className="page-header__titles">
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <div className="page-header__subtitle">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
      {children}
    </header>
  );
}
