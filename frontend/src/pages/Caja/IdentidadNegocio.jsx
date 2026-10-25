import { useEffect, useState } from 'react';
import axios from 'axios';
import PageHeader from '../../components/ui/PageHeader';
import { toast } from '../../components/ui/Toast';
import useBusiness, { setBusiness, logoSrc, DEFAULT_LOGO } from '../../hooks/useBusiness';
import '../../components/ui/ui.css';
import './IdentidadNegocio.css';

// IDENTIDAD DEL NEGOCIO (rediseño 2026-10): nombre comercial, logo, mensaje al
// pie del recibo y datos del negocio. Se guarda en el SERVIDOR (settings) y
// todos los dispositivos lo ven al instante (socket). NIT, dirección y
// teléfono arrancan vacíos: el recibo solo los muestra si alguien los escribe.
const MAX_LOGO_BYTES = 250 * 1024;

export default function IdentidadNegocio() {
  const business = useBusiness();
  const [form, setForm] = useState(business);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Si otro dispositivo guarda mientras esta pantalla está abierta y aquí no
  // hay cambios sin guardar, se muestra lo nuevo
  useEffect(() => {
    if (!dirty) setForm(business);
  }, [business, dirty]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDirty(true);
  };

  const onLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast('El logo debe ser PNG, JPG, WEBP o SVG', { tone: 'error', duration: 3000 });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast('El logo pesa más de 250 KB. Usa una versión más liviana.', { tone: 'error', duration: 3200 });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, business_logo: String(reader.result) }));
      setDirty(true);
    };
    reader.readAsDataURL(file);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.business_name?.trim()) {
      toast('Escribe el nombre comercial', { tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await axios.put('/settings/business', {
        business_name: form.business_name,
        receipt_footer: form.receipt_footer,
        business_nit: form.business_nit,
        business_address: form.business_address,
        business_phone: form.business_phone,
        business_logo: form.business_logo,
      });
      setBusiness(res.data);
      setDirty(false);
      toast('Identidad guardada');
    } catch (err) {
      toast(err.response?.data?.error || 'No se pudo guardar. Intenta de nuevo.', { tone: 'error', duration: 3200 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workspace identidad-page">
      <div className="workspace__main">
        <PageHeader title="Identidad del negocio" subtitle="Se ve en la barra lateral, el acceso y los recibos de todos los equipos" />

        <form className="identidad-grid" onSubmit={guardar}>
          <section className="surface identidad-card">
            <h2>Marca</h2>
            <label className="field">
              <span>Nombre comercial</span>
              <input value={form.business_name || ''} onChange={set('business_name')} maxLength={40} required />
            </label>

            <div className="field">
              <span>Logo</span>
              <div className="identidad-logo">
                <img src={logoSrc(form)} alt="Logo actual" />
                <div className="identidad-logo__actions">
                  <label className="btn btn--secondary">
                    Cambiar logo
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onLogo} hidden />
                  </label>
                  {form.business_logo && (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        setForm((f) => ({ ...f, business_logo: '' }));
                        setDirty(true);
                      }}
                    >
                      Usar el logo original
                    </button>
                  )}
                  <small>Cuadrado, PNG con fondo, hasta 250 KB. Se conservan sus proporciones.</small>
                </div>
              </div>
            </div>

            <label className="field">
              <span>Mensaje al pie del recibo</span>
              <input value={form.receipt_footer || ''} onChange={set('receipt_footer')} maxLength={80} placeholder="Gracias por venir a Chanatos" />
            </label>
          </section>

          <section className="surface identidad-card">
            <h2>Datos del negocio</h2>
            <p className="identidad-hint">Opcionales. El recibo muestra solo los que estén escritos.</p>
            <label className="field">
              <span>NIT</span>
              <input value={form.business_nit || ''} onChange={set('business_nit')} maxLength={30} inputMode="numeric" />
            </label>
            <label className="field">
              <span>Dirección</span>
              <input value={form.business_address || ''} onChange={set('business_address')} maxLength={80} />
            </label>
            <label className="field">
              <span>Teléfono</span>
              <input value={form.business_phone || ''} onChange={set('business_phone')} maxLength={30} inputMode="tel" />
            </label>
          </section>

          <section className="surface identidad-card identidad-preview" aria-label="Vista previa del recibo">
            <h2>Así se ve en el recibo</h2>
            <div className="identidad-ticket">
              <img src={logoSrc(form) || DEFAULT_LOGO} alt="" />
              <strong>{(form.business_name || 'Chanatos').toUpperCase()}</strong>
              {form.business_nit && <span>NIT {form.business_nit}</span>}
              {form.business_address && <span>{form.business_address}</span>}
              {form.business_phone && <span>Tel. {form.business_phone}</span>}
              <hr />
              <em>{form.receipt_footer || 'Gracias por venir a Chanatos'}</em>
            </div>
          </section>

          <div className="identidad-save">
            <button type="submit" className="btn btn--primary btn--lg" disabled={saving || !dirty}>
              {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
