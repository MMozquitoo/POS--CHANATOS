import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ZoomControl from '../../components/ZoomControl.jsx';
import PageHeader from '../../components/ui/PageHeader';
import Icon from '../../components/ui/Icon';
import { ADMIN_NAV } from '../../components/shell/cajaNav';
import '../../components/ui/ui.css';
import './Caja.css';

// ADMINISTRACIÓN (/mas) — rediseño 2026-10. Antes "OPCIONES": una lista de
// botones de colores con las mismas pantallas que ahora tiene la barra
// lateral. Queda como portada de Administración con la MISMA lista
// (cajaNav.js), para no mantener dos menús distintos. Salir vive en la barra
// lateral (escritorio) y en el menú (celular); el zoom de la app de
// escritorio (Electron) sigue acá.
const DESCRIPCIONES = {
  '/menu': 'Productos, precios, sabores y recetas',
  '/compras': 'Compras de insumos y gastos generales',
  '/historial': 'Pagos y cierres anteriores',
  '/cierre': 'Arqueo y cierre del turno',
  '/auditoria': 'Quién hizo qué y cuándo',
  '/aplicacion': 'Actualizaciones, respaldos y datos',
  '/conexion': 'Servidor y diagnóstico de red',
  '/impresora': 'Impresora de recibos',
  '/identidad': 'Nombre, logo y datos del recibo',
};

export default function MasCaja() {
  const navigate = useNavigate();
  const [tapped, setTapped] = useState(null);
  const isElectron = typeof window !== 'undefined' && !!window.posElectron;

  return (
    <div className="workspace admin-page">
      <div className="workspace__main">
        <PageHeader
          title="Administración"
          subtitle="Herramientas fuera del servicio"
          actions={isElectron ? <ZoomControl /> : null}
        />
        <div className="admin-grid">
          {ADMIN_NAV.map((item) => (
            <button
              key={item.to}
              type="button"
              className="surface admin-card"
              onClick={() => {
                setTapped(item.to);
                navigate(item.to);
              }}
            >
              <span className="admin-card__icon"><Icon name={item.icon} size={22} play={tapped === item.to} /></span>
              <span className="admin-card__body">
                <strong>{item.label}</strong>
                <span>{DESCRIPCIONES[item.to]}</span>
              </span>
              <Icon name="chevronRight" size={18} className="admin-card__chev" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
