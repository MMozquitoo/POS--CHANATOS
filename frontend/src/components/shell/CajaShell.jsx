import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../hooks/useModal';
import ModalHost from '../ModalHost';
import BrandMark from '../BrandMark';
import useBusiness from '../../hooks/useBusiness';
import Icon from '../ui/Icon';
import { MAIN_NAV, ADMIN_NAV, sectionFor } from './cajaNav';
import CajaDelDiaButton from './CajaDelDiaButton';
import useSonidoCaja, { sonidoCajaOn } from '../../hooks/useSonidoCaja';
import { playKitchenChime, playNewOrderChime, notifyDesktop, unlockAudio } from '../../utils/kitchenSound';
import { orderNumber, placeOf } from '../../utils/orderView';
import './shell.css';

// Contenedor común de CAJA en escritorio (rediseño 2026-10, referencia
// docs/referencias-diseno/02): barra lateral fija + área de trabajo. La barra
// lateral solo existe >768px (≤768 manda caja/BottomNav, ver
// mobile-polish.css); 769–1099px se recoge a una columna de iconos.
//
// El encabezado de cada sección lo pone la pantalla (PageHeader / CajaHeader),
// así el título y sus acciones viven junto al contenido que controlan.
export default function CajaShell({ children }) {
  const location = useLocation();
  const { logout, socket } = useAuth();
  const [sonido, setSonido] = useSonidoCaja();

  // Aviso sonoro en cualquier pantalla de Caja: pedido NUEVO llegando a cocina
  // (toc-toc grave) y orden que queda LISTA (ding-ding ascendente). El push
  // nativo se desactivó porque crasheaba el APK; esto es el chime de cocina
  // reutilizado, y en la app de escritorio además una notificación de Windows
  // si la ventana está minimizada (notifyDesktop). El chime que CocinaCaja
  // tenía propio para order:new se quitó: este es el único que suena.
  useEffect(() => {
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    if (!socket) return undefined;
    const alQuedarLista = (payload) => {
      const order = payload?.order;
      if (!order || order.status !== 'LISTO' || !sonidoCajaOn()) return;
      playKitchenChime();
      notifyDesktop({
        title: 'Orden lista para cobrar',
        body: `${placeOf(order).label} · Orden ${orderNumber(order)}`,
      });
    };
    const alLlegarACocina = (payload) => {
      const order = payload?.order;
      if (!order || !sonidoCajaOn()) return;
      playNewOrderChime();
      const items = order.items?.length;
      notifyDesktop({
        title: 'Nueva orden en cocina',
        body: `${placeOf(order).label} · Orden ${orderNumber(order)}${items ? ` — ${items} item${items === 1 ? '' : 's'}` : ''}`,
      });
    };
    socket.on('order:status-changed', alQuedarLista);
    socket.on('order:new', alLlegarACocina);
    return () => {
      socket.off('order:status-changed', alQuedarLista);
      socket.off('order:new', alLlegarACocina);
      document.removeEventListener('pointerdown', unlockAudio);
    };
  }, [socket]);
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const section = sectionFor(location.pathname, location.state);
  const businessName = useBusiness().business_name;
  const [adminOpen, setAdminOpen] = useState(section === 'admin');

  // Al entrar a una herramienta de Administración, el grupo queda abierto
  useEffect(() => {
    if (section === 'admin') setAdminOpen(true);
  }, [section]);

  const salir = async () => {
    if (await showConfirm('¿Cerrar sesión?')) logout();
  };

  // PÍLDORA (2026-10-26, idea del catálogo moxen.cl): el resaltado mostaza de
  // la sección activa es UN solo span que se desliza al enlace activo en vez
  // de aparecer de golpe en cada uno. Se mide el enlace activo (offsetTop
  // dentro del nav) al cambiar de sección y al redimensionar (769–1099px la
  // barra se recoge a iconos y cambian las alturas). Fuera del nav principal
  // (Administración/Cierre) la píldora se desvanece donde quedó.
  const navRef = useRef(null);
  const [pill, setPill] = useState({ top: 0, height: 0, visible: false });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const mide = () => {
      const activo = nav.querySelector('.shell-link.is-active');
      if (activo) {
        setPill({ top: activo.offsetTop, height: activo.offsetHeight, visible: true });
      } else {
        setPill((p) => ({ ...p, visible: false }));
      }
    };
    mide();
    window.addEventListener('resize', mide);
    return () => window.removeEventListener('resize', mide);
  }, [section]);

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Navegación principal">
        <div className="shell-brand">
          <BrandMark size={34} />
          <div className="shell-brand-text">
            <strong>{businessName}</strong>
            <span>Punto de venta</span>
          </div>
        </div>

        <nav className="shell-nav shell-nav--main" ref={navRef}>
          <span
            className="shell-pill"
            aria-hidden="true"
            style={{
              transform: `translateY(${pill.top}px)`,
              height: pill.height || 0,
              opacity: pill.visible ? 1 : 0,
            }}
          />
          {MAIN_NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={`shell-link ${section === item.key ? 'is-active' : ''}`}
              aria-current={section === item.key ? 'page' : undefined}
              title={item.label}
            >
              <Icon name={item.icon} size={22} play={section === item.key} />
              <span className="shell-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shell-nav shell-nav--secondary">
          <button
            type="button"
            className={`shell-link shell-link--group ${section === 'admin' ? 'is-active' : ''}`}
            aria-expanded={adminOpen}
            onClick={() => setAdminOpen((v) => !v)}
            title="Administración"
          >
            <Icon name="admin" size={22} play={adminOpen} />
            <span className="shell-link-label">Administración</span>
            <Icon name="chevronDown" size={16} className={`shell-chevron ${adminOpen ? 'is-open' : ''}`} />
          </button>
          {adminOpen && (
            <div className="shell-subnav">
              {ADMIN_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `shell-sublink ${isActive ? 'is-active' : ''}`}
                  title={item.label}
                >
                  <Icon name={item.icon} size={18} play={location.pathname === item.to} />
                  <span className="shell-link-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={`shell-link shell-sonido ${sonido ? '' : 'is-off'}`}
          onClick={() => setSonido(!sonido)}
          title={sonido ? 'Suena cuando una orden queda lista. Tocar para silenciar' : 'Sonido silenciado. Tocar para activarlo'}
          aria-pressed={sonido}
        >
          <Icon name={sonido ? 'campana' : 'campanaOff'} size={22} play={sonido} />
          <span className="shell-link-label">{sonido ? 'Sonido de órdenes' : 'Sonido apagado'}</span>
        </button>

        <CajaDelDiaButton />

        <button type="button" className="shell-link shell-logout" onClick={salir} title="Salir">
          <Icon name="salir" size={22} />
          <span className="shell-link-label">Salir</span>
        </button>
      </aside>

      <div className="shell-content">{children}</div>

      <ModalHost confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} />
    </div>
  );
}
