import { useCallback, useRef, useState } from 'react';
import Modal from '../components/Modal';

// "Volver" (o cerrar la hoja de cobro) con productos en el borrador que
// todavía no se enviaron: se pregunta antes de salir, porque al salir se
// pierden. Pasaba al buscar "‹ Categorías" y tocar "Volver" por error.
// Botones explícitos ("Seguir armando" / "Salir sin enviar"), no
// "Cancelar/Aceptar", que en este caso confunde.
//
// const { confirmarSalida, salirModal } = useSalirConBorrador(borrador.length)
// onClick={async () => { if (await confirmarSalida()) navigate(...) }}
// ... y renderizar {salirModal}
export default function useSalirConBorrador(cantidad) {
  const [open, setOpen] = useState(false);
  const resolver = useRef(null);

  const confirmarSalida = useCallback(() => {
    if (!cantidad) return Promise.resolve(true);
    setOpen(true);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, [cantidad]);

  const responder = (salir) => {
    setOpen(false);
    resolver.current?.(salir);
    resolver.current = null;
  };

  const salirModal = (
    <Modal
      open={open}
      onClose={() => responder(false)}
      title="Hay productos sin enviar"
      actions={<>
        <button className="btn btn--secondary" onClick={() => responder(true)}>Salir sin enviar</button>
        <button className="btn btn--primary" onClick={() => responder(false)} style={{ flex: 1 }}>Seguir armando</button>
      </>}
    >
      <p style={{ margin: 0 }}>
        {cantidad === 1 ? 'Tienes 1 producto' : `Tienes ${cantidad} productos`} en el borrador que todavía no
        se enviaron a cocina. Si sales ahora, se pierden.
      </p>
    </Modal>
  );

  return { confirmarSalida, salirModal };
}
