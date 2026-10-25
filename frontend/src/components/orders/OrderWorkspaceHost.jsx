import { createContext, useContext, useMemo, useState } from 'react';
import OrderWorkspace from './OrderWorkspace';

// Una sola hoja de trabajo para todo Caja (2026-10): abrir una orden o una
// mesa desde Mesas, Cocina o el "+" ya no cambia de pantalla — se abre la hoja
// encima de donde uno está (OrderWorkspace → DetalleMesa embedded).
// Órdenes tiene la suya propia porque guarda la hoja abierta en la URL.
//
//   const ws = useOrderWorkspace();      // null fuera de Caja (Mesero)
//   ws?.abrirOrden(order, { agregar })   // orden existente
//   ws?.abrirMesa(table)                 // mesa: su orden activa o crear una
//   ws?.abrirEstacion('DOMICILIOS')      // pedido nuevo de Ventanilla/Domicilios
const Ctx = createContext(null);

export function useOrderWorkspace() {
  return useContext(Ctx);
}

export default function OrderWorkspaceHost({ children }) {
  const [abierta, setAbierta] = useState(null);
  const api = useMemo(() => ({
    abrirOrden: (order, opts = {}) => setAbierta({ order, agregar: !!opts.agregar }),
    abrirMesa: (table) => setAbierta({ table }),
    abrirEstacion: (estacion) => setAbierta({ estacion }), // 'VENTANILLA' | 'DOMICILIOS'
  }), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {abierta && (
        <OrderWorkspace
          order={abierta.order || null}
          table={abierta.table || null}
          estacion={abierta.estacion || null}
          startAdding={!!abierta.agregar}
          onClose={() => setAbierta(null)}
        />
      )}
    </Ctx.Provider>
  );
}
