import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Caja.css';
import CajaHeader from '../../components/CajaHeader.jsx';
import ModalHost from '../../components/ModalHost';
import { useAlert, useConfirm, usePrompt } from '../../hooks/useModal';

export default function ConfigImpresora() {
  const { alertState, showAlert, closeAlert } = useAlert();
  const { confirmState, showConfirm, acceptConfirm, cancelConfirm } = useConfirm();
  const { promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt } = usePrompt();
  const navigate = useNavigate();
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Detectar si está en Electron
  const isElectron = typeof window !== 'undefined' && !!window.posElectron;

  // Si no es Electron, redirigir
  useEffect(() => {
    if (!isElectron) {
      navigate('/mas');
    }
  }, [isElectron, navigate]);

  // Cargar impresoras al montar
  useEffect(() => {
    if (!isElectron) return;

    const loadPrinters = async () => {
      try {
        setLoading(true);
        setError(null);
        const printerList = await window.posElectron.getPrinters();
        setPrinters(printerList || []);

        // Determinar impresora seleccionada por defecto
        const savedDeviceName = localStorage.getItem('pos_printer_deviceName');
        
        if (savedDeviceName && printerList.some(p => p.name === savedDeviceName)) {
          // Usar la guardada si existe en la lista
          setSelectedPrinter(savedDeviceName);
        } else if (printerList.length > 0) {
          // Buscar la que tiene isDefault: true
          const defaultPrinter = printerList.find(p => p.isDefault);
          if (defaultPrinter) {
            setSelectedPrinter(defaultPrinter.name);
          } else {
            // Usar la primera de la lista
            setSelectedPrinter(printerList[0].name);
          }
        }
      } catch (err) {
        console.error('Error al cargar impresoras:', err);
        setError(`Error al cargar impresoras: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadPrinters();
  }, [isElectron]);

  const handleSave = () => {
    if (!selectedPrinter) {
      showAlert('Por favor selecciona una impresora');
      return;
    }

    try {
      setSaving(true);
      localStorage.setItem('pos_printer_deviceName', selectedPrinter);
      showAlert('Impresora guardada correctamente');
    } catch (err) {
      console.error('Error al guardar:', err);
      showAlert(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePrintTest = async () => {
    if (!selectedPrinter) {
      showAlert('Por favor selecciona una impresora primero');
      return;
    }

    if (!isElectron) {
      showAlert('Impresión térmica solo disponible en la aplicación Electron');
      return;
    }

    try {
      setPrinting(true);
      
      // Obtener formato guardado o usar 80mm por defecto
      const savedFormat = localStorage.getItem('reciboPrintFormat') || '80mm';
      const pageSize = savedFormat === 'A4' ? 'A4' : savedFormat;

      // Imprimir ticket de prueba
      await window.posElectron.printReceipt({
        deviceName: selectedPrinter,
        pageSize: pageSize,
        copies: 1,
        silent: true
      });

      showAlert('Ticket de prueba impreso correctamente');
    } catch (err) {
      console.error('Error al imprimir prueba:', err);
      showAlert(`No se pudo imprimir directo: ${err.message}\n\nUsa "Imprimir" normal como alternativa.`);
      
      // Fallback: abrir ventana de impresión con ticket de prueba
      const testWindow = window.open('', '_blank');
      if (testWindow) {
        testWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Ticket de Prueba - CHANATOS</title>
            <style>
              @media print {
                * {
                  background: white !important;
                  color: black !important;
                  box-shadow: none !important;
                }
                body {
                  margin: 0;
                  padding: 10mm;
                  font-size: 11px;
                }
              }
              body {
                font-family: monospace;
                max-width: 80mm;
                margin: 0 auto;
                padding: 10mm;
              }
              h1 { text-align: center; font-size: 16px; margin: 10px 0; }
              .separator { border-top: 1px solid #333; margin: 10px 0; }
              .item { margin: 5px 0; }
              .total { font-size: 14px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 1px solid #333; }
            </style>
          </head>
          <body>
            <h1>CHANATOS</h1>
            <div class="separator"></div>
            <div>Orden: PRUEBA</div>
            <div>Fecha: ${new Date().toLocaleString('es-CO')}</div>
            <div class="separator"></div>
            <div class="item">1 x Ticket de Prueba</div>
            <div style="font-size: 9px; margin-left: 10px;">$ 0  x1   =   $ 0</div>
            <div class="separator"></div>
            <div class="total">TOTAL: $ 0</div>
            <div style="text-align: center; margin-top: 20px; font-size: 9px;">¡Gracias por su compra!</div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 500);
              };
            </script>
          </body>
          </html>
        `);
        testWindow.document.close();
      }
    } finally {
      setPrinting(false);
    }
  };

  if (!isElectron) {
    return (
      <div className="caja-container">
        <CajaHeader title="IMPRESORA" backTo="/mas" />
        <div className="caja-content" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Esta función solo está disponible en la aplicación Electron.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="caja-container">
      <CajaHeader title="IMPRESORA" backTo="/mas" />

      <div className="caja-content" style={{ maxWidth: '600px', margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>Detectando impresoras...</p>
          </div>
        )}

        {error && (
          <div style={{ 
            background: '#ffebee', 
            color: '#c62828', 
            padding: '1rem', 
            borderRadius: '8px', 
            marginBottom: '1rem' 
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {printers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>No se encontraron impresoras disponibles.</p>
                <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                  Asegúrate de que tu impresora térmica esté conectada y encendida.
                </p>
              </div>
            ) : (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Impresoras Disponibles:</h3>
                <div style={{ 
                  background: 'white', 
                  border: '1px solid #ddd', 
                  borderRadius: '8px',
                  padding: '0.5rem'
                }}>
                  {printers.map((printer) => {
                    const isSelected = selectedPrinter === printer.name;
                    const isDefault = printer.isDefault;
                    const displayName = printer.displayName || printer.name;

                    return (
                      <label
                        key={printer.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.75rem',
                          cursor: 'pointer',
                          borderBottom: printers.indexOf(printer) < printers.length - 1 ? '1px solid #eee' : 'none',
                          background: isSelected ? '#e3f2fd' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#f5f5f5';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <input
                          type="radio"
                          name="printer"
                          value={printer.name}
                          checked={isSelected}
                          onChange={(e) => setSelectedPrinter(e.target.value)}
                          style={{ marginRight: '0.75rem', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
                            {displayName}
                          </div>
                          {isDefault && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              background: '#4caf50', 
                              color: 'white', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              marginLeft: '0.5rem'
                            }}>
                              (Default)
                            </span>
                          )}
                          {isSelected && (
                            <span style={{ 
                              fontSize: '0.75rem', 
                              background: '#2196f3', 
                              color: 'white', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              marginLeft: '0.5rem'
                            }}>
                              (Seleccionada)
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleSave}
                disabled={!selectedPrinter || saving || printers.length === 0}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '0.75rem',
                  background: saving ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving || !selectedPrinter ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}
              >
                {saving ? 'Guardando...' : 'GUARDAR'}
              </button>
              <button
                onClick={handlePrintTest}
                disabled={!selectedPrinter || printing || printers.length === 0}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '0.75rem',
                  background: printing ? '#ccc' : '#F5BB4C',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: printing || !selectedPrinter ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '1rem'
                }}
              >
                {printing ? 'Imprimiendo...' : 'IMPRIMIR PRUEBA'}
              </button>
              <button
                onClick={() => navigate('/mas')}
                style={{
                  flex: 1,
                  minWidth: '100px',
                  padding: '0.75rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Cerrar
              </button>
            </div>

            {selectedPrinter && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.75rem', 
                background: '#e8f5e9', 
                borderRadius: '8px',
                fontSize: '0.9rem'
              }}>
                <strong>Impresora seleccionada:</strong> {printers.find(p => p.name === selectedPrinter)?.displayName || selectedPrinter}
              </div>
            )}
          </>
        )}
      </div>
      <ModalHost alertApi={{ alertState, showAlert, closeAlert }} confirmApi={{ confirmState, showConfirm, acceptConfirm, cancelConfirm }} promptApi={{ promptState, showPrompt, setPromptValue, acceptPrompt, cancelPrompt }} />
    </div>
  );
}
