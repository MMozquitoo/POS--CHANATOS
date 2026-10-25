import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

// ¿Hay una caja abierta? (GET /cash/session/active). null mientras carga.
// Se actualiza solo cuando alguien abre o cierra caja en cualquier equipo
// (cash:session-opened / cash:session-closed). Con la caja cerrada los pedidos
// se toman normal, pero no se puede cobrar y la página de pedidos web no deja
// pedir (webOrdersPoller.js le reporta el estado) — por eso Mesas y Órdenes
// lo avisan (CajaCerradaAviso).
export default function useCajaAbierta() {
  const { socket } = useAuth();
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const res = await axios.get('/cash/session/active');
        if (vivo) setAbierta(!!res.data?.active);
      } catch {
        // Sin conexión no se afirma nada: el aviso no aparece por un error de red
      }
    };
    cargar();
    if (!socket) return () => { vivo = false; };
    socket.on('cash:session-opened', cargar);
    socket.on('cash:session-closed', cargar);
    socket.on('connect', cargar);
    return () => {
      vivo = false;
      socket.off('cash:session-opened', cargar);
      socket.off('cash:session-closed', cargar);
      socket.off('connect', cargar);
    };
  }, [socket]);

  return abierta;
}
