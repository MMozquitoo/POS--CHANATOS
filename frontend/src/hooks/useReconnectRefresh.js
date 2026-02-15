import { useEffect, useRef, useState } from 'react';
import { useConnection } from '../contexts/ConnectionContext';

/**
 * PASO 14.4: Hook para refrescar datos automáticamente al reconectar
 * 
 * @param {Object} options
 * @param {boolean} options.enabled - Si está habilitado
 * @param {() => Promise<void> | void} options.onReconnect - Función a ejecutar al reconectar
 * @param {number} [options.debounceMs=2500] - Tiempo de debounce en ms
 * @returns {{ isRefreshing: boolean }} - Estado de refresh
 */
export function useReconnectRefresh({ enabled = true, onReconnect, debounceMs = 2500 }) {
  const { isOnline } = useConnection();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const wasOfflineRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const hasRefreshedRef = useRef(false);
  const lastErrorRef = useRef(null);

  useEffect(() => {
    // Si está deshabilitado, no hacer nada
    if (!enabled || !onReconnect) {
      return;
    }

    // Detectar transición offline -> online
    if (!wasOfflineRef.current && !isOnline) {
      // Acabamos de ir offline
      wasOfflineRef.current = true;
      hasRefreshedRef.current = false;
    } else if (wasOfflineRef.current && isOnline) {
      // Acabamos de reconectar (offline -> online)
      wasOfflineRef.current = false;
      
      // Solo refrescar una vez por reconexión
      if (!hasRefreshedRef.current) {
        // Limpiar timer anterior si existe
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        
        // Debounce: esperar un poco antes de refrescar
        debounceTimerRef.current = setTimeout(async () => {
          setIsRefreshing(true);
          hasRefreshedRef.current = true;
          
          try {
            await onReconnect();
            lastErrorRef.current = null;
          } catch (error) {
            // Manejar errores silenciosamente (solo log 1 vez)
            if (!lastErrorRef.current || lastErrorRef.current !== error.message) {
              console.warn('[RECONNECT] Error al refrescar datos:', error.message);
              lastErrorRef.current = error.message;
            }
          } finally {
            setIsRefreshing(false);
          }
        }, debounceMs);
      }
    } else if (isOnline) {
      // Estamos online, resetear flag para la próxima vez
      wasOfflineRef.current = false;
    }

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOnline, enabled, onReconnect, debounceMs]);

  // Resetear cuando se desmonta o se deshabilita
  useEffect(() => {
    if (!enabled) {
      wasOfflineRef.current = false;
      hasRefreshedRef.current = false;
      setIsRefreshing(false);
    }
  }, [enabled]);

  return { isRefreshing };
}
