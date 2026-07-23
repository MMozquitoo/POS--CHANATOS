import { useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function MasCaja() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [actualizando, setActualizando] = useState(false);
  const [respaldando, setRespaldando] = useState(false);
  const archivoRef = useRef(null);

  // Detectar si está en Electron
  const isElectron = typeof window !== 'undefined' && !!window.posElectron;

  // Descarga el respaldo y lo guarda como archivo. 'excel' = editable y movible;
  // 'db' = copia exacta de la base de datos.
  // OJO: el aviso va SIEMPRE con respaldando ya en false. Mientras está en true se
  // muestra la pantalla de espera, que no monta el ModalHost (el aviso no aparecería).
  const descargarRespaldo = async (tipo) => {
    setRespaldando(true);
    let aviso;
    try {
      const { data } = await axios.get(`/backup/${tipo}`, { responseType: 'blob' });
      const fecha = new Date().toLocaleDateString('sv-SE');
      const nombre = tipo === 'excel'
        ? `POS-Chanatos-${fecha}.xlsx`
        : `POS-Chanatos-${fecha}.db`;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      aviso = `Respaldo descargado: ${nombre}\n\nGuárdalo en una USB o en el correo antes de reinstalar.`;
    } catch (e) {
      aviso = 'No se pudo descargar el respaldo. Intenta de nuevo.';
    }
    setRespaldando(false);
    await showAlert(aviso);
  };

  const restaurarRespaldo = async (archivo) => {
    if (!archivo) return;
    const ok = await showConfirm(
      `Vas a restaurar los datos desde "${archivo.name}".\n\n` +
      'ESTO REEMPLAZA las ventas, pagos y productos que hay ahora en este equipo por los del archivo. ¿Continuar?'
    );
    if (!ok) return;
    setRespaldando(true);
    let aviso;
    let restaurado = false;
    try {
      const { data } = await axios.post('/backup/import', archivo, {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const detalle = Object.entries(data.resumen || {})
        .map(([tabla, n]) => `${tabla}: ${n}`)
        .join('\n');
      aviso = `Datos restaurados correctamente.\n\n${detalle}\n\nSe va a cerrar la sesión para recargar todo.`;
      restaurado = true;
    } catch (e) {
      aviso = e.response?.data?.error || 'No se pudo restaurar el archivo. Los datos quedaron como estaban.';
    }
    setRespaldando(false);
    await showAlert(aviso);
    // Los usuarios también se reemplazan: la sesión actual puede quedar huérfana.
    if (restaurado) logout();
  };

  const buscarActualizaciones = async () => {
    try {
      const { data } = await axios.get('/update/check');
      if (!data.updateAvailable) {
        await showAlert('Ya tienes la última versión instalada.');
        return;
      }
      const ok = await showConfirm('Hay una versión nueva. ¿Actualizar ahora? La aplicación se reiniciará sola en unos segundos.');
      if (!ok) return;
      setActualizando(true);
      await axios.post('/update/apply');
      // El servidor se reinicia solo; recargar SIN caché para ver la versión nueva.
      setTimeout(async () => {
        try {
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch { /* ignorar */ }
        window.location.reload(true);
      }, 11000);
    } catch (e) {
      setActualizando(false);
      await showAlert('No se pudo actualizar ahora. Verifica el internet e intenta de nuevo.');
    }
  };

  if (respaldando) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#FFF8E7', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1rem', padding: '2rem', textAlign: 'center', zIndex: 5000
      }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#1a1a2e' }}>Trabajando con el respaldo</div>
        <div style={{ fontSize: '1.1rem', color: '#555' }}>No cierres la aplicación. Puede tardar unos segundos.</div>
      </div>
    );
  }

  if (actualizando) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#FFF8E7', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1rem', padding: '2rem', textAlign: 'center', zIndex: 5000
      }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#1a1a2e' }}>Actualizando POS Chanatos</div>
        <div style={{ fontSize: '1.1rem', color: '#555' }}>No cierres la aplicación. Se reiniciará sola en unos segundos.</div>
      </div>
    );
  }

  return (
    <div className="caja-container">
      <CajaHeader 
        title="OPCIONES"
        backTo="/centro"
      />
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '1rem',
        background: '#f8f9fa',
        borderBottom: '1px solid #ddd'
      }}>
        <button
          onClick={async () => {
            if (await showConfirm('¿Cerrar sesión?')) {
              logout();
            }
          }}
          className="btn-danger"
          style={{ width: '100%', maxWidth: '300px', padding: '0.75rem 2rem' }}
        >
          SALIR
        </button>
      </div>

      <div className="caja-content caja-page">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {user?.role === 'CAJA' && (
            <>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/reportes')}
                style={{ background: '#F5BB4C', color: '#1a1a2e', fontWeight: 'bold' }}
              >
                REPORTES DE VENTAS
              </button>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/historial-cierres')}
              >
                HISTORIAL DE CIERRES
              </button>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/auditoria')}
              >
                AUDITORÍA
              </button>
            </>
          )}

          {user?.role === 'CAJA' && (
            <button
              className="caja-menu-option"
              onClick={() => navigate('/menu')}
            >
              MENÚ (PRECIOS)
            </button>
          )}

          <button
            className="caja-menu-option"
            onClick={() => navigate('/historial')}
          >
            HISTORIAL DE PAGOS
          </button>

          {user?.role === 'CAJA' && (
            <button
              className="caja-menu-option"
              onClick={buscarActualizaciones}
              style={{ background: '#2e7d32', color: 'white', fontWeight: 'bold' }}
            >
              BUSCAR ACTUALIZACIONES
            </button>
          )}

          {user?.role === 'CAJA' && (
            <>
              <button
                className="caja-menu-option"
                onClick={() => descargarRespaldo('excel')}
                disabled={respaldando}
              >
                DESCARGAR DATOS (EXCEL)
              </button>

              <button
                className="caja-menu-option"
                onClick={() => archivoRef.current?.click()}
                disabled={respaldando}
              >
                RESTAURAR DATOS DESDE ARCHIVO
              </button>

              <button
                className="caja-menu-option"
                onClick={() => descargarRespaldo('db')}
                disabled={respaldando}
              >
                COPIA DE SEGURIDAD COMPLETA
              </button>

              <input
                ref={archivoRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = '';
                  restaurarRespaldo(archivo);
                }}
              />
            </>
          )}

          {user?.role === 'CAJA' && (
            <>
              <button
                className="caja-menu-option"
                onClick={() => navigate('/config-servidor')}
              >
                SERVIDOR
              </button>

              <button
                className="caja-menu-option"
                onClick={() => navigate('/diagnostico')}
              >
                DIAGNÓSTICO
              </button>
            </>
          )}

          {isElectron && (
            <button
              className="caja-menu-option"
              onClick={() => navigate('/config-impresora')}
            >
              IMPRESORA
            </button>
          )}
        </div>
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}


