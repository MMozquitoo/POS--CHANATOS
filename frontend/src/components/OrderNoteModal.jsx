import { useState, useEffect } from 'react';
import Modal from './Modal';

/**
 * Nota especial de LA ORDEN completa (no de un producto) — "cliente con
 * prisa", "para llevar". Independiente de agregar/editar items: no requiere
 * seleccionar ningún producto.
 */
export default function OrderNoteModal({ open, value, onClose, onSave }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNote(value || '');
  }, [open, value]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(note.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nota para cocina"
      actions={<>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn-chanatos" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
      </>}
    >
      <p style={{ marginTop: 0, color: 'var(--gray-500)', fontSize: 'var(--text-15)' }}>
        Un aviso de toda la orden, no de un plato en particular (ej. "cliente con prisa", "para llevar").
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ej: Cliente con prisa, para llevar..."
        rows={3}
        autoFocus
        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', padding: '0.6rem', border: '1.5px solid #e5e5e5', borderRadius: '8px', fontSize: '0.95rem' }}
      />
    </Modal>
  );
}
