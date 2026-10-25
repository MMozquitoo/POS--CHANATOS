import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import useLiveOrders, { useNow } from '../../hooks/useLiveOrders';
import PageHeader from '../../components/ui/PageHeader';
import CajaCerradaAviso from '../../components/ui/CajaCerradaAviso';
import SidePanel, { SidePanelIdle } from '../../components/ui/SidePanel';
import { StatusPill, PlaceTag } from '../../components/ui/StatusPill';
import Icon from '../../components/ui/Icon';
import EmptyState from '../../components/EmptyState';
import OrderCard from '../../components/orders/OrderCard';
import OrderDetail from '../../components/orders/OrderDetail';
import OrderActions from '../../components/orders/OrderActions';
import OrderWorkspace from '../../components/orders/OrderWorkspace';
import { placeTitle } from '../../components/orders/OrderCard';
import { clockLabel, elapsedLabel, minutesSince, orderNumber, placeOf } from '../../utils/orderView';
import { formatPriceCOP } from '../../utils/currency';
import './Ordenes.css';

// Vista ÓRDENES de Caja (rediseño 2026-10, referencia
// docs/referencias-diseno/05): buscador + filtros por estado y servicio,
// tarjetas al centro y el detalle de la seleccionada a la derecha.
//
// Filtros, búsqueda y selección viven en la URL (?estado=&servicio=&q=&sel=):
// al ir a cobrar y volver (DetalleMesa vuelve a state.from) todo queda igual,
// y el desplazamiento se guarda en sessionStorage.
const ESTADOS = [
  { key: '', label: 'Todas' },
  { key: 'NUEVO', label: 'Nuevas' },
  { key: 'EN_PREP', label: 'En preparación' },
  { key: 'LISTO', label: 'Listas para cobrar' },
];

const SERVICIOS = [
  { key: '', label: 'Todos los servicios' },
  { key: 'MESA', label: 'Mesas' },
  { key: 'VENTANILLA', label: 'Ventanilla' },
  { key: 'DOMICILIO', label: 'Domicilios' },
  { key: 'RAPPI', label: 'Rappi' },
];

const SCROLL_KEY = 'ordenes-scroll';

function matchesServicio(order, servicio) {
  if (!servicio) return true;
  const place = placeOf(order);
  if (servicio === 'RAPPI') return !!place.rappi;
  return place.kind === servicio;
}

function matchesQuery(order, q) {
  if (!q) return true;
  const needle = q.trim().toLowerCase().replace(/^#/, '');
  if (!needle) return true;
  const place = placeOf(order);
  const haystack = [
    orderNumber(order),
    order.code,
    place.label,
    order.customer_name || '',
    order.table_number != null ? `mesa ${order.table_number}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  // "12" busca la orden 12 o la mesa 12; "mesa 3" busca esa mesa
  return haystack.split(/\s+/).includes(needle) || haystack.includes(needle);
}

export default function Ordenes() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') || '';
  const servicio = params.get('servicio') || '';
  const q = params.get('q') || '';
  const selId = Number(params.get('sel')) || null;
  // Hoja de trabajo abierta (?abierta=<orden>): cobrar o modificar sin salir
  const abiertaId = Number(params.get('abierta')) || null;
  const { orders, refreshing, error, reload, changedIds } = useLiveOrders();
  const now = useNow();
  const restoredRef = useRef(false);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // La orden se guarda al abrir: si se cobra y sale de la lista en vivo, la
  // hoja sigue mostrando el recibo hasta que el cajero la cierre
  const [abierta, setAbierta] = useState(null);
  const openOrder = (order, opts = {}) => {
    setAbierta({ order, agregar: !!opts.agregar });
    const next = new URLSearchParams(params);
    next.set('sel', String(order.id));
    next.set('abierta', String(order.id));
    setParams(next, { replace: true });
  };
  const closeOrder = () => {
    setAbierta(null);
    setParam('abierta', '');
    reload();
  };
  // Volver con ?abierta= en la URL (recargar la página): reabrir esa orden
  useEffect(() => {
    if (!abiertaId) {
      if (abierta) setAbierta(null);
      return;
    }
    if (abierta?.order.id === abiertaId || !orders) return;
    const o = orders.find((x) => x.id === abiertaId);
    if (o) setAbierta({ order: o, agregar: false });
    else setParam('abierta', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertaId, orders]);

  const from = `${location.pathname}${location.search}`;

  // Más antiguas primero (lo que lleva más tiempo esperando va arriba)
  const sorted = useMemo(
    () => (orders || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    [orders]
  );

  const base = useMemo(
    () => sorted.filter((o) => matchesServicio(o, servicio) && matchesQuery(o, q)),
    [sorted, servicio, q]
  );

  const counts = useMemo(() => {
    const c = { '': base.length, NUEVO: 0, EN_PREP: 0, LISTO: 0 };
    base.forEach((o) => {
      c[o.status] = (c[o.status] || 0) + 1;
    });
    return c;
  }, [base]);

  const visible = useMemo(() => (estado ? base.filter((o) => o.status === estado) : base), [base, estado]);
  const selected = useMemo(() => (orders || []).find((o) => o.id === selId) || null, [orders, selId]);

  // Si la orden seleccionada se cerró (pagada/cancelada en otra sesión), se
  // suelta la selección sin vaciar la pantalla
  useEffect(() => {
    if (orders && selId && !selected && !abiertaId) setParam('sel', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, selId, selected]);

  // Desplazamiento: guardar mientras se usa, restaurar al volver
  useEffect(() => {
    const onScroll = () => {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      } catch { /* sin almacenamiento: no pasa nada */ }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (restoredRef.current || !orders) return;
    restoredRef.current = true;
    try {
      const y = Number(sessionStorage.getItem(SCROLL_KEY));
      if (y > 0) window.scrollTo(0, y);
    } catch { /* idem */ }
  }, [orders]);

  const listas = counts.LISTO || 0;
  const subtitle = orders
    ? (
      <>
        <span>{(orders || []).length} abiertas</span>
        {listas > 0 && <span className="sub-strong">{listas} por cobrar</span>}
        {refreshing && <span className="sub-muted">Actualizando…</span>}
      </>
    )
    : 'Cargando órdenes…';

  const selectedPlace = selected ? placeOf(selected) : null;

  return (
    <div className={`workspace workspace--panel ordenes-page`}>
      <div className="workspace__main">
        <PageHeader title="Órdenes" subtitle={subtitle} />
        <CajaCerradaAviso />

        <section className="surface ordenes-filters">
          <div className="toolbar">
            <label className="search-field">
              <Icon name="search" size={20} />
              <input
                type="search"
                inputMode="search"
                placeholder="Buscar por orden, mesa o cliente"
                value={q}
                onChange={(e) => setParam('q', e.target.value)}
                aria-label="Buscar por número de orden, mesa o cliente"
              />
            </label>
            <select
              className="ordenes-select"
              value={servicio}
              onChange={(e) => setParam('servicio', e.target.value)}
              aria-label="Filtrar por servicio"
            >
              {SERVICIOS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="chips ordenes-chips" role="tablist" aria-label="Filtrar por estado">
            {ESTADOS.map((e) => (
              <button
                key={e.key || 'todas'}
                type="button"
                role="tab"
                aria-selected={estado === e.key}
                className={`chip ${estado === e.key ? 'is-active' : ''}`}
                onClick={() => setParam('estado', e.key)}
              >
                {e.label}
                <span className="chip__count tnum">{counts[e.key] || 0}</span>
              </button>
            ))}
          </div>
        </section>

        {error && <div className="page-error" role="alert">{error}</div>}

        {!orders ? (
          <div className="order-grid" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="order-card order-card--skeleton" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="surface">
            {orders.length === 0 ? (
              <EmptyState
                icon="check"
                title="Todo al día"
                description="No hay órdenes abiertas. Las nuevas aparecen aquí al instante."
              />
            ) : (
              <EmptyState
                icon="search"
                title="Ninguna orden coincide"
                description="Prueba con otro número u otro filtro."
                actionLabel="Quitar filtros"
                onAction={() => setParams(new URLSearchParams(), { replace: true })}
              />
            )}
          </div>
        ) : (
          <div className="order-grid">
            {visible.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                now={now}
                from={from}
                selected={o.id === selId}
                flash={changedIds.has(o.id)}
                onSelect={(order) => setParam('sel', order.id === selId ? '' : String(order.id))}
                onOpen={openOrder}
              />
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <SidePanel
          open
          panelKey={selected.id}
          onClose={() => setParam('sel', '')}
          title={placeTitle(selectedPlace)}
          badge={<StatusPill status={selected.status} />}
          subtitle={
            <>
              <span className="order-card__num tnum">#{orderNumber(selected)}</span>
              {selectedPlace.rappi && <PlaceTag place={selectedPlace} />}
              <span>
                {elapsedLabel(minutesSince(selected.created_at, now))} · {clockLabel(selected.created_at)}
              </span>
            </>
          }
          footer={<OrderActions order={selected} from={from} onDone={reload} onOpen={openOrder} />}
        >
          <OrderDetail order={selected} />
        </SidePanel>
      ) : (
        <SidePanelIdle>
          <EmptyState
            compact
            icon="ordenes"
            title="Selecciona una orden"
            description={
              listas > 0
                ? `${listas} ${listas === 1 ? 'orden está lista' : 'órdenes están listas'} para cobrar: ${formatPriceCOP(
                    (orders || []).filter((o) => o.status === 'LISTO').reduce((s, o) => s + (Number(o.saldo) || 0), 0)
                  )} en total.`
                : 'Aquí verás sus productos, notas, abonos y saldo.'
            }
          />
        </SidePanelIdle>
      )}
      {abierta && <OrderWorkspace order={abierta.order} startAdding={abierta.agregar} onClose={closeOrder} />}
    </div>
  );
}
