import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import useLiveOrders, { useNow } from '../../hooks/useLiveOrders';
import { tablesLayout } from '../../layouts/tablesLayout';
import PageHeader from '../../components/ui/PageHeader';
import CajaCerradaAviso from '../../components/ui/CajaCerradaAviso';
import SidePanel, { SidePanelIdle } from '../../components/ui/SidePanel';
import { StatusPill } from '../../components/ui/StatusPill';
import Icon from '../../components/ui/Icon';
import EmptyState from '../../components/EmptyState';
import OrderDetail from '../../components/orders/OrderDetail';
import OrderActions from '../../components/orders/OrderActions';
import { useOrderWorkspace } from '../../components/orders/OrderWorkspaceHost';
import { formatPriceCOP } from '../../utils/currency';
import {
  VENTANILLA_NUMBER,
  DOMICILIOS_NUMBER,
  clockLabel,
  elapsedLabel,
  elapsedShort,
  minutesSince,
  orderNumber,
  placeOf,
  statusTone,
  urgencyOf,
} from '../../utils/orderView';
import './Mesas.css';

// Vista MESAS de Caja (rediseño 2026-10, referencia docs/referencias-diseno/04):
// el plano REAL del local al centro (layouts/tablesLayout.js: 1-2-3 / 4-5-6 /
// 7-hueco-8, Ventanilla y Domicilios a la izquierda) y el detalle de la mesa
// seleccionada a la derecha, sin salir del plano.
//
// La selección vive en la URL (?sel=<id de mesa>): al abrir la mesa para
// agregar/cobrar (DetalleMesa, la lógica de siempre) y volver, sigue igual.
const STATUS_ORDER = ['libre', 'NUEVO', 'EN_PREP', 'LISTO'];
const LEGEND = {
  libre: 'Libre',
  NUEVO: 'Nueva',
  EN_PREP: 'En preparación',
  LISTO: 'Lista para cobrar',
};
// En la mesa del celular no cabe el texto largo (3 columnas a 320–390px)
const LEGEND_SHORT = {
  libre: 'Libre',
  NUEVO: 'Nueva',
  EN_PREP: 'En prep.',
  LISTO: 'Lista',
};

// Filas y columnas del plano a partir de las posiciones reales (x/y en %)
function buildGrid() {
  const regular = tablesLayout.filter((l) => l.id !== VENTANILLA_NUMBER && l.id !== DOMICILIOS_NUMBER);
  const ys = [...new Set(regular.map((l) => l.y))].sort((a, b) => a - b);
  const xs = [...new Set(regular.map((l) => l.x))].sort((a, b) => a - b);
  return {
    rows: ys.length,
    cols: xs.length,
    cells: regular.map((l) => ({ number: l.id, row: ys.indexOf(l.y) + 1, col: xs.indexOf(l.x) + 1 })),
  };
}
const GRID = buildGrid();

export default function Mesas() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const selId = Number(params.get('sel')) || null;
  const { orders, tables, refreshing, error, reload, changedIds } = useLiveOrders({ withTables: true });
  const now = useNow();
  // Hoja de trabajo compartida (OrderWorkspaceHost): cobrar, agregar,
  // revisar e iniciar orden, sin salir del plano
  const ws = useOrderWorkspace();

  const from = `${location.pathname}${location.search}`;

  const byNumber = useMemo(() => {
    const map = new Map();
    (tables || []).forEach((t) => map.set(Number(t.number), t));
    return map;
  }, [tables]);

  const ordersByTable = useMemo(() => {
    const map = new Map();
    (orders || []).forEach((o) => {
      const list = map.get(o.table_id) || [];
      list.push(o);
      map.set(o.table_id, list);
    });
    // la más antigua primero (una mesa física tiene una sola cuenta activa)
    map.forEach((list) => list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))));
    return map;
  }, [orders]);

  const select = (tableId) => {
    const next = new URLSearchParams(params);
    if (tableId && tableId !== selId) next.set('sel', String(tableId));
    else next.delete('sel');
    setParams(next, { replace: true });
  };

  // Resumen de estados para la leyenda
  const counts = useMemo(() => {
    const c = { libre: 0, NUEVO: 0, EN_PREP: 0, LISTO: 0 };
    GRID.cells.forEach(({ number }) => {
      const t = byNumber.get(number);
      if (!t) return;
      const o = ordersByTable.get(t.id)?.[0];
      c[o ? o.status : 'libre'] += 1;
    });
    return c;
  }, [byNumber, ordersByTable]);

  const selectedTable = useMemo(() => (tables || []).find((t) => t.id === selId) || null, [tables, selId]);

  useEffect(() => {
    if (tables && selId && !selectedTable) select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, selId, selectedTable]);

  const ocupadas = counts.NUEVO + counts.EN_PREP + counts.LISTO;
  const subtitle = tables ? (
    <>
      <span>{ocupadas} ocupadas · {counts.libre} libres</span>
      {counts.LISTO > 0 && <span className="sub-strong">{counts.LISTO} por cobrar</span>}
      {refreshing && <span className="sub-muted">Actualizando…</span>}
    </>
  ) : 'Cargando el salón…';

  const renderTable = ({ number, row, col }) => {
    const table = byNumber.get(number);
    if (!table) return null;
    const order = ordersByTable.get(table.id)?.[0] || null;
    const status = order ? order.status : 'libre';
    const selected = selId === table.id;
    const paid = Number(order?.paidAmount) || 0;
    const urgency = order ? urgencyOf(order, now) : 'ok';
    return (
      <button
        key={number}
        type="button"
        className={`mesa-tile mesa-tile--${order ? statusTone(status) : 'libre'} ${selected ? 'is-selected' : ''} ${order && changedIds.has(order.id) ? 'is-flash' : ''}`}
        style={{ gridRow: row, gridColumn: col }}
        onClick={() => select(table.id)}
        aria-pressed={selected}
        aria-label={`Mesa ${number}, ${LEGEND[status]}${order ? `, ${formatPriceCOP(order.saldo)}` : ''}`}
      >
        <span className="mesa-chairs mesa-chairs--top" aria-hidden="true"><i /><i /></span>
        <span className="mesa-top">
          <span className="mesa-num tnum">{number}</span>
          {order && (
            <span className={`mesa-time mesa-time--${urgency}`}>
              <Icon name="clock" size={13} strokeWidth={2.2} />
              <span className="mesa-status__long">{elapsedLabel(minutesSince(order.created_at, now))}</span>
              <span className="mesa-status__short">{elapsedShort(minutesSince(order.created_at, now))}</span>
            </span>
          )}
        </span>
        <span className="mesa-status">
          <span className="mesa-dot" aria-hidden="true" />
          <span className="mesa-status__long">{LEGEND[status]}</span>
          <span className="mesa-status__short" aria-hidden="true">{LEGEND_SHORT[status]}</span>
        </span>
        {order && (
          <span className="mesa-amount tnum">
            <span className="mesa-amount__label">{paid > 0 ? 'Saldo' : status === 'LISTO' ? 'Por cobrar' : 'Total'}</span>
            {formatPriceCOP(order.saldo)}
          </span>
        )}
        <span className="mesa-chairs mesa-chairs--bottom" aria-hidden="true"><i /><i /></span>
      </button>
    );
  };

  const renderStation = (number) => {
    const table = byNumber.get(number);
    if (!table) return null;
    const list = ordersByTable.get(table.id) || [];
    const isVentanilla = number === VENTANILLA_NUMBER;
    const selected = selId === table.id;
    const listas = list.filter((o) => o.status === 'LISTO').length;
    const saldo = list.reduce((s, o) => s + (Number(o.saldo) || 0), 0);
    const flash = list.some((o) => changedIds.has(o.id));
    return (
      <button
        key={number}
        type="button"
        className={`station-tile ${isVentanilla ? 'station-tile--ventanilla' : 'station-tile--domicilio'} ${selected ? 'is-selected' : ''} ${flash ? 'is-flash' : ''}`}
        onClick={() => select(table.id)}
        aria-pressed={selected}
      >
        <span className="station-icon"><Icon name={isVentanilla ? 'ventanilla' : 'domicilio'} size={22} play={selected} /></span>
        <span className="station-body">
          <span className="station-name">{isVentanilla ? 'Ventanilla' : 'Domicilios'}</span>
          <span className="station-meta">
            {list.length === 0
              ? 'Sin órdenes'
              : `${list.length} ${list.length === 1 ? 'orden' : 'órdenes'}${listas ? ` · ${listas} lista${listas === 1 ? '' : 's'}` : ''}`}
          </span>
          {list.length > 0 && <span className="station-amount tnum">{formatPriceCOP(saldo)}</span>}
        </span>
      </button>
    );
  };

  // ---------- Panel ----------
  let panel = null;
  if (selectedTable) {
    const number = Number(selectedTable.number);
    const isStation = number === VENTANILLA_NUMBER || number === DOMICILIOS_NUMBER;
    const list = ordersByTable.get(selectedTable.id) || [];
    const fromSel = `/mesas?sel=${selectedTable.id}`;

    if (isStation) {
      const name = number === VENTANILLA_NUMBER ? 'Ventanilla' : 'Domicilios';
      panel = (
        <SidePanel
          open
          panelKey={selectedTable.id}
          onClose={() => select(null)}
          title={name}
          subtitle={`${list.length} ${list.length === 1 ? 'orden abierta' : 'órdenes abiertas'}`}
          footer={
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => ws.abrirEstacion(number === VENTANILLA_NUMBER ? 'VENTANILLA' : 'DOMICILIOS')}
            >
              Nueva orden de {name.toLowerCase()}
            </button>
          }
        >
          {list.length === 0 ? (
            <EmptyState compact icon={number === VENTANILLA_NUMBER ? 'ventanilla' : 'domicilio'} title="Sin órdenes abiertas" description="Las órdenes nuevas aparecen aquí apenas se crean." />
          ) : (
            <ul className="station-orders">
              {list.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className={`station-order ${changedIds.has(o.id) ? 'flash-update' : ''}`}
                    onClick={() => ws.abrirOrden(o)}
                  >
                    <span className="station-order__num tnum">#{orderNumber(o)}</span>
                    <span className="station-order__body">
                      <StatusPill status={o.status} short />
                      <span className="station-order__meta">
                        {placeOf(o).rappi ? 'Rappi · ' : ''}{elapsedLabel(minutesSince(o.created_at, now))} · {clockLabel(o.created_at)}
                      </span>
                    </span>
                    <span className="station-order__amount tnum">{formatPriceCOP(o.saldo)}</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SidePanel>
      );
    } else {
      const order = list[0] || null;
      panel = order ? (
        <SidePanel
          open
          panelKey={`${selectedTable.id}-${order.id}`}
          onClose={() => select(null)}
          title={`Mesa ${number}`}
          badge={<StatusPill status={order.status} />}
          subtitle={
            <span>
              Orden {orderNumber(order)} · {elapsedLabel(minutesSince(order.created_at, now))} · desde las {clockLabel(order.created_at)}
            </span>
          }
          footer={<OrderActions order={order} from={fromSel} onDone={reload} onOpen={(o, opts) => ws.abrirOrden(o, opts)} />}
        >
          <OrderDetail order={order} />
        </SidePanel>
      ) : (
        <SidePanel
          open
          panelKey={selectedTable.id}
          onClose={() => select(null)}
          title={`Mesa ${number}`}
          badge={<span className="pill mesa-pill-libre"><span className="pill__dot" />Libre</span>}
          footer={
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => ws.abrirMesa(selectedTable)}
            >
              Iniciar orden
            </button>
          }
        >
          <EmptyState compact icon="mesas" title="Mesa libre" description="Inicia una orden para agregar productos y enviarla a cocina." />
        </SidePanel>
      );
    }
  }

  return (
    <div className="workspace workspace--panel mesas-page">
      <div className="workspace__main">
        <PageHeader title="Mesas" subtitle={subtitle} />
        <CajaCerradaAviso />

        {error && <div className="page-error" role="alert">{error}</div>}

        <section className="surface plano" aria-label="Plano del salón">
          <div className="plano-stations" aria-label="Fuera del salón">
            <div className="plano-label">Fuera del salón</div>
            {renderStation(VENTANILLA_NUMBER)}
            {renderStation(DOMICILIOS_NUMBER)}
          </div>
          <div className="plano-salon">
            <div className="plano-label">Salón</div>
            <div
              className="plano-grid"
              style={{ gridTemplateColumns: `repeat(${GRID.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID.rows}, auto)` }}
            >
              {tables ? GRID.cells.map(renderTable) : GRID.cells.map((c) => (
                <div key={c.number} className="mesa-tile mesa-tile--skeleton" style={{ gridRow: c.row, gridColumn: c.col }} />
              ))}
            </div>
          </div>
        </section>

        <section className="surface plano-legend" aria-label="Estados">
          {STATUS_ORDER.map((s) => (
            <span key={s} className={`legend-item legend-item--${s === 'libre' ? 'libre' : statusTone(s)}`}>
              <span className="mesa-dot" aria-hidden="true" />
              {LEGEND[s]}
              <strong className="tnum">{counts[s]}</strong>
            </span>
          ))}
        </section>
      </div>

      {panel || (
        <SidePanelIdle>
          <EmptyState compact icon="mesas" title="Selecciona una mesa para comenzar" description="Verás su orden, productos, abonos y saldo sin salir del plano." />
        </SidePanelIdle>
      )}
    </div>
  );
}
