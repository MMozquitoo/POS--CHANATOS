import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import './Instagram.css';
import CajaHeader from '../../components/CajaHeader';
import EmptyState from '../../components/EmptyState';
import ModalHost from '../../components/ModalHost';
import SidePanel, { SidePanelIdle } from '../../components/ui/SidePanel';
import BrandMark from '../../components/BrandMark';
import Icon from '../../components/ui/Icon';
import { useAlert, useConfirm } from '../../hooks/useModal';
import { toast } from '../../components/ui/Toast';
import SkeletonCards from '../../components/ui/Skeleton';
import '../../components/ui/ui.css';

// CALENDARIO DE INSTAGRAM (2026-10-30): el POS publica solo a la hora
// indicada (instagramPoller.js). Cada día del calendario se arma con algo
// nuevo (sube imagen) o con una pieza de la biblioteca ya generada (campaña
// "30 días" importada con scripts/import-instagram-library.js). Arrastrar
// una pieza entre días la reprograma (PATCH scheduledAt); una vez publicada
// ya no se mueve, solo se puede borrar.

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.85;
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
// "2026-10-30 14:30:00" → "2026-10-30" / "14:30"
function fechaDeScheduled(ts) { return String(ts || '').slice(0, 10); }
function horaDeScheduled(ts) { return String(ts || '').slice(11, 16) || '12:00'; }

function buildMonthMatrix(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes = 0
  const start = new Date(year, month, 1 - startOffset);
  const dias = [];
  const cursor = new Date(start);
  for (let i = 0; i < 42; i++) {
    dias.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

function formatearFechaLarga(key) {
  const [y, m, d] = key.split('-').map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ESTADO_STYLE = {
  PENDIENTE: { background: 'var(--blue-tint)', color: 'var(--blue-text)', dot: 'var(--blue)', label: 'Programada' },
  PUBLICADO: { background: 'var(--green-tint)', color: 'var(--green-text)', dot: 'var(--green)', label: 'Publicada' },
  ERROR: { background: 'var(--red-tint)', color: 'var(--red-text)', dot: 'var(--red)', label: 'Error' },
};

function DayCell({ date, inMonth, isToday, items, selected, isNew, onSelect, onDropPost }) {
  const key = dateKey(date);
  const visibles = items.slice(0, 2);
  const resto = items.length - visibles.length;
  return (
    <button
      type="button"
      className={`ig-day${inMonth ? '' : ' is-outside'}${isToday ? ' is-today' : ''}${selected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`}
      onClick={() => onSelect(key)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDropPost(id, key);
      }}
    >
      <span className="ig-day__num">{date.getDate()}</span>
      {visibles.length > 0 && (
        <span className="ig-day__thumbs">
          {visibles.map((p) => (
            <img
              key={p.id}
              src={p.image_url}
              alt=""
              draggable={p.status !== 'PUBLICADO'}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/plain', String(p.id));
              }}
              className="ig-day__thumb"
              style={{ borderColor: ESTADO_STYLE[p.status]?.dot || 'transparent' }}
            />
          ))}
          {resto > 0 && <span className="ig-day__more">+{resto}</span>}
        </span>
      )}
    </button>
  );
}

function DayPanel({ dayKey, esPasado, items, library, busy, setBusy, onChanged, onAdded, showAlert, showConfirm }) {
  const [modoAgregar, setModoAgregar] = useState(false);
  const [tipo, setTipo] = useState('POST');
  const [fuente, setFuente] = useState('biblioteca');
  const [libraryIdSel, setLibraryIdSel] = useState(null);
  const [preview, setPreview] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [hora, setHora] = useState('12:00');

  const libreriaFiltrada = library.filter((it) => it.type === tipo);

  const resetForm = () => {
    setModoAgregar(false);
    setLibraryIdSel(null);
    setPreview('');
    setImageDataUrl('');
    setCaption('');
    setHora('12:00');
  };

  const elegirTipo = (t) => {
    setTipo(t);
    setLibraryIdSel(null);
    setPreview('');
    setImageDataUrl('');
  };

  const onImagen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Elige una imagen', { tone: 'error' });
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setImageDataUrl(dataUrl);
      setPreview(dataUrl);
      setLibraryIdSel(null);
    } catch {
      toast('No se pudo procesar la imagen', { tone: 'error' });
    }
  };

  const elegirDeLibreria = (item) => {
    setLibraryIdSel(item.id);
    setPreview(item.image_url);
    setImageDataUrl('');
    setCaption(item.caption || '');
  };

  const agregar = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (fuente === 'biblioteca' && !libraryIdSel) {
      toast('Elige una pieza de la biblioteca', { tone: 'error' });
      return;
    }
    if (fuente === 'nueva' && !imageDataUrl) {
      toast('Sube una imagen', { tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const body = {
        type: tipo,
        scheduledAt: `${dayKey}T${hora}`,
        caption: tipo === 'POST' ? (caption.trim() || null) : null,
      };
      if (fuente === 'biblioteca') body.libraryId = libraryIdSel;
      else body.image = imageDataUrl;
      await axios.post('/instagram/posts', body);
      toast('Agregada al día');
      resetForm();
      onAdded?.(dayKey);
      await onChanged();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo agregar');
    } finally {
      setBusy(false);
    }
  };

  const cambiarHora = async (post, nuevaHora) => {
    if (!nuevaHora || nuevaHora === horaDeScheduled(post.scheduled_at)) return;
    try {
      await axios.patch(`/instagram/posts/${post.id}`, { scheduledAt: `${dayKey}T${nuevaHora}` });
      await onChanged();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo cambiar la hora');
    }
  };

  const mover = async (post) => {
    const nueva = window.prompt('Mover al día (AAAA-MM-DD):', dayKey);
    if (!nueva || nueva === dayKey) return;
    if (nueva < dateKey(new Date())) {
      toast('No puedes mover algo a un día que ya pasó', { tone: 'error' });
      return;
    }
    try {
      await axios.patch(`/instagram/posts/${post.id}`, { scheduledAt: `${nueva}T${horaDeScheduled(post.scheduled_at)}` });
      toast('Movida');
      await onChanged();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo mover');
    }
  };

  const eliminar = async (post) => {
    const pregunta = post.status === 'PUBLICADO'
      ? '¿Borrar esta publicación de Instagram? Deja de verse en la cuenta real de Chanatos.'
      : '¿Cancelar esta publicación programada?';
    if (!(await showConfirm(pregunta))) return;
    setBusy(true);
    try {
      await axios.delete(`/instagram/posts/${post.id}`);
      toast(post.status === 'PUBLICADO' ? 'Borrada de Instagram' : 'Cancelada');
      await onChanged();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo borrar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ig-day-panel">
      {items.length === 0 && !modoAgregar && (
        <p className="ig-day-panel__empty">Nada programado este día todavía.</p>
      )}

      {items.map((post) => {
        const estilo = ESTADO_STYLE[post.status] || {};
        return (
          <div key={post.id} className="ig-item-card">
            <div className="ig-item-card__top">
              <img src={post.image_url} alt="" className="ig-item-card__thumb" />
              <div className="ig-item-card__info">
                <div className="ig-item-card__row">
                  <BrandMark size={16} />
                  <strong>chanatoss</strong>
                  <span className="pill" style={{ background: estilo.background, color: estilo.color }}>
                    {post.type === 'STORY' ? 'Historia' : 'Publicación'} · {estilo.label}
                  </span>
                </div>
                {post.caption && <p className="ig-item-card__caption">{post.caption}</p>}
                {post.status === 'ERROR' && post.error_message && (
                  <p className="ig-item-card__error">{post.error_message}</p>
                )}
              </div>
            </div>
            <div className="ig-item-card__actions">
              {post.status !== 'PUBLICADO' ? (
                <>
                  <input
                    type="time"
                    defaultValue={horaDeScheduled(post.scheduled_at)}
                    onBlur={(e) => cambiarHora(post, e.target.value)}
                  />
                  <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => mover(post)}>
                    Mover
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => eliminar(post)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  {post.permalink && (
                    <a href={post.permalink} target="_blank" rel="noreferrer" className="btn btn--secondary">
                      Ver en Instagram ↗
                    </a>
                  )}
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => eliminar(post)}>
                    Borrar de Instagram
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {esPasado ? (
        <p className="ig-day-panel__empty">Este día ya pasó: no se puede agregar nada nuevo acá.</p>
      ) : !modoAgregar ? (
        <button type="button" className="btn btn--primary" style={{ width: '100%' }} onClick={() => setModoAgregar(true)}>
          + Agregar a este día
        </button>
      ) : (
        <form className="ig-add-form" onSubmit={agregar}>
          <div className="segmented">
            <button type="button" className={`segmented__btn${tipo === 'POST' ? ' is-active' : ''}`} onClick={() => elegirTipo('POST')}>
              Publicación
            </button>
            <button type="button" className={`segmented__btn${tipo === 'STORY' ? ' is-active' : ''}`} onClick={() => elegirTipo('STORY')}>
              Historia
            </button>
          </div>

          <div className="segmented">
            <button type="button" className={`segmented__btn${fuente === 'biblioteca' ? ' is-active' : ''}`} onClick={() => setFuente('biblioteca')}>
              Biblioteca
            </button>
            <button type="button" className={`segmented__btn${fuente === 'nueva' ? ' is-active' : ''}`} onClick={() => setFuente('nueva')}>
              Subir nueva
            </button>
          </div>

          {fuente === 'biblioteca' ? (
            libreriaFiltrada.length === 0 ? (
              <p className="ig-day-panel__empty">No hay nada en la biblioteca de este tipo.</p>
            ) : (
              <div className={`ig-library-grid${tipo === 'STORY' ? ' ig-library-grid--story' : ''}`}>
                {libreriaFiltrada.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`ig-library-item${libraryIdSel === item.id ? ' is-selected' : ''}`}
                    onClick={() => elegirDeLibreria(item)}
                    title={item.caption || item.label}
                  >
                    <img src={item.image_url} alt="" />
                  </button>
                ))}
              </div>
            )
          ) : (
            <label className="btn btn--secondary" style={{ display: 'inline-flex' }}>
              {preview ? 'Cambiar imagen' : 'Elegir imagen'}
              <input type="file" accept="image/*" onChange={onImagen} hidden />
            </label>
          )}

          {preview && <img src={preview} alt="Vista previa" className="ig-preview-img" />}

          {tipo === 'POST' && (
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Texto de la publicación (opcional)"
              rows={3}
              maxLength={2000}
            />
          )}

          <label className="ig-time-field">
            <span>Hora</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn--ghost" onClick={resetForm}>Cancelar</button>
            <button type="submit" className="btn btn--primary" disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function Instagram() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const [posts, setPosts] = useState([]);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configurado, setConfigurado] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedKey, setSelectedKey] = useState(null);
  const [justAddedKey, setJustAddedKey] = useState(null);

  useEffect(() => {
    if (!justAddedKey) return undefined;
    const t = setTimeout(() => setJustAddedKey(null), 900);
    return () => clearTimeout(t);
  }, [justAddedKey]);

  const load = useCallback(async () => {
    try {
      const [statusRes, postsRes, libRes] = await Promise.all([
        axios.get('/instagram/status'),
        axios.get('/instagram/posts'),
        axios.get('/instagram/library'),
      ]);
      setConfigurado(statusRes.data.configurado);
      setPosts(postsRes.data.posts || []);
      setLibrary(libRes.data.items || []);
    } catch (error) {
      await showAlert(error.response?.data?.error || 'Error al cargar Instagram');
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { load(); }, [load]);

  const porDia = useMemo(() => {
    const map = new Map();
    for (const p of posts) {
      const key = fechaDeScheduled(p.scheduled_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    for (const arr of map.values()) arr.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    return map;
  }, [posts]);

  const dias = useMemo(() => buildMonthMatrix(viewDate), [viewDate]);
  const hoyKey = dateKey(new Date());

  const cambiarMes = (delta) => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const moverPost = async (id, nuevaFechaKey) => {
    const post = posts.find((p) => String(p.id) === String(id));
    if (!post) return;
    if (post.status === 'PUBLICADO') {
      toast('Ya está publicada, no se puede mover', { tone: 'error' });
      return;
    }
    if (nuevaFechaKey < hoyKey) {
      toast('No puedes mover algo a un día que ya pasó', { tone: 'error' });
      return;
    }
    if (fechaDeScheduled(post.scheduled_at) === nuevaFechaKey) return;
    try {
      await axios.patch(`/instagram/posts/${id}`, { scheduledAt: `${nuevaFechaKey}T${horaDeScheduled(post.scheduled_at)}` });
      toast('Movida');
      await load();
    } catch (error) {
      await showAlert(error.response?.data?.error || 'No se pudo mover');
    }
  };

  return (
    <div className="caja-container">
      <CajaHeader title="Instagram" backTo="/mas" />

      <div className="workspace workspace--panel instagram-page">
        <div className="workspace__main">
          {loading ? (
            <SkeletonCards count={3} />
          ) : !configurado ? (
            <EmptyState
              icon="alerta"
              title="Instagram no está configurado"
              description="Falta el token de acceso en el servidor. Pide que lo configuren antes de programar publicaciones."
            />
          ) : (
            <>
              <div className="card ig-cal-toolbar">
                <button type="button" className="icon-btn" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
                  <Icon name="chevronLeft" />
                </button>
                <strong className="ig-cal-title">{MESES[viewDate.getMonth()]} {viewDate.getFullYear()}</strong>
                <button type="button" className="icon-btn" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
                  <Icon name="chevronRight" />
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => { const d = new Date(); d.setDate(1); setViewDate(d); setSelectedKey(dateKey(new Date())); }}
                >
                  Hoy
                </button>
              </div>

              <div className="card ig-cal">
                <div className="ig-cal-head">
                  {DIAS.map((d) => <span key={d}>{d}</span>)}
                </div>
                <div className="ig-cal-grid">
                  {dias.map((date) => {
                    const key = dateKey(date);
                    return (
                      <DayCell
                        key={key}
                        date={date}
                        inMonth={date.getMonth() === viewDate.getMonth()}
                        isToday={key === hoyKey}
                        items={porDia.get(key) || []}
                        selected={key === selectedKey}
                        isNew={key === justAddedKey}
                        onSelect={setSelectedKey}
                        onDropPost={moverPost}
                      />
                    );
                  })}
                </div>
              </div>

              {library.length > 0 && (
                <p style={{ fontSize: 'var(--text-13)', color: 'var(--gray-600)', margin: 0 }}>
                  {library.length} piezas en la biblioteca · toca un día y "+ Agregar a este día" para usarlas
                </p>
              )}
            </>
          )}
        </div>

        {selectedKey ? (
          <SidePanel open onClose={() => setSelectedKey(null)} title={formatearFechaLarga(selectedKey)} panelKey={selectedKey}>
            <DayPanel
              dayKey={selectedKey}
              esPasado={selectedKey < hoyKey}
              items={porDia.get(selectedKey) || []}
              library={library}
              busy={busy}
              setBusy={setBusy}
              onChanged={load}
              onAdded={setJustAddedKey}
              showAlert={showAlert}
              showConfirm={showConfirm}
            />
          </SidePanel>
        ) : (
          <SidePanelIdle>
            <EmptyState compact icon="instagram" title="Elige un día" description="Toca un día del calendario para ver o programar algo." />
          </SidePanelIdle>
        )}
      </div>

      <ModalHost
        alertApi={{ alertState, showAlert, closeAlert }}
        confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }}
      />
    </div>
  );
}
