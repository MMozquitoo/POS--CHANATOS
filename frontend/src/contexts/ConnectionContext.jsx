import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const ConnectionContext = createContext();

/**
 * FASE 19: Contexto para monitorear conexión con el backend
 * - Single source of truth de polling (19.1)
 * - Lock anti-paralelo mejorado (19.2)
 * - Throttle de logs (19.3)
 * - Stop polling when hidden (19.4)
 * - PASO 19.X: DEBUG PERF flag para controlar logs
 */
export function ConnectionProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [lastError, setLastError] = useState(null);
  
  // PASO 19.X — DEBUG PERF flag (apagado por defecto)
  const PERF_DEBUG = typeof window !== "undefined" && localStorage.getItem("perf_debug") === "1";
  
  const timerRef = useRef(null);
  const runningRef = useRef(false);
  const inFlightRef = useRef(false);
  const checkCountRef = useRef(0);
  const lastNetworkLogAtRef = useRef(0);
  const abortControllerRef = useRef(null);
  const isVisibleRef = useRef(true);

  // Función para obtener URL base
  const getApiBaseUrl = () => {
    const savedUrl = localStorage.getItem('pos_server_url');
    if (savedUrl && savedUrl.trim()) {
      return savedUrl.trim();
    }
    const origin = window.location.origin;
    if (origin.includes(':5173')) {
      return origin.replace(':5173', ':3000');
    }
    if (origin.includes(':3000')) {
      return origin;
    }
    return import.meta.env.VITE_API_URL || 'http://localhost:3000';
  };

  // Calcular intervalo con backoff
  // FASE 19.MINI: Optimizar para reducir spam de requests
  const getInterval = () => {
    const count = checkCountRef.current;
    if (count === 0) return 10000; // 10s cuando está online (reducido de 8s para menos requests)
    if (count === 1) return 15000; // 15s después del primer fallo
    return 30000; // 30s máximo cuando está caído (reducido de 20s para menos requests cuando offline)
  };

  // FASE 19.2: Verificar conexión con lock anti-paralelo mejorado + AbortController
  const checkHealth = useCallback(async () => {
    // Si ya hay un check en vuelo, ignorar
    if (inFlightRef.current) {
      return;
    }

    // FASE 19.4: No hacer check si la pestaña está oculta
    if (!isVisibleRef.current) {
      return;
    }

    inFlightRef.current = true;
    const baseUrl = getApiBaseUrl();
    const healthUrl = `${baseUrl}/api/health`;
    
    // FASE 19.2: AbortController para cancelar requests anteriores
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      const timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      }, 3000);
      
      const response = await axios.get(healthUrl, {
        signal: controller.signal,
        timeout: 3000
      });
      
      clearTimeout(timeoutId);
      
      // Verificar que no fue abortado
      if (controller.signal.aborted) {
        return;
      }
      
      if (response.data && (response.data.status === 'ok' || response.data.ok === true)) {
        setIsOnline(true);
        setLastError(null);
        setLastCheckedAt(new Date());
        checkCountRef.current = 0;
      } else {
        throw new Error('Respuesta inesperada del servidor');
      }
    } catch (error) {
      // Ignorar errores de abort
      if (error.name === 'AbortError' || error.name === 'CanceledError' || controller.signal.aborted) {
        return;
      }
      
      const now = Date.now();
      const errorMessage = error.code === 'ECONNABORTED' || error.message?.includes('timeout')
        ? 'Timeout: El servidor no responde'
        : error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')
        ? 'No se pudo conectar al servidor'
        : error.message || 'Error de conexión';
      
      setIsOnline(false);
      setLastError(errorMessage);
      setLastCheckedAt(new Date());
      
      // FASE 19.3: Throttle logs mejorado - solo log cada 5-10s para errores de red repetidos
      // PASO 19.X: SOLO si PERF_DEBUG está activo
      if (PERF_DEBUG && now - lastNetworkLogAtRef.current > 5000) {
        console.warn('[CONNECTION] Servidor offline:', errorMessage);
        lastNetworkLogAtRef.current = now;
      }
      
      checkCountRef.current += 1;
    } finally {
      inFlightRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, []);

  // Programar siguiente check
  const scheduleNext = useCallback((ms) => {
    // PASO 16.2.2: Pausar health checks temporalmente en desarrollo para debug
    if (import.meta.env?.DEV) {
      // Temporal: pausar health checks para poder debuggear payments/items
      // TODO: Volver a habilitar después de arreglar el 400
      return;
    }
    
    // FASE 19.4: No programar si está oculto
    if (!isVisibleRef.current) {
      return;
    }
    
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      checkHealth().then(() => {
        if (runningRef.current && isVisibleRef.current) {
          scheduleNext(getInterval());
        }
      });
    }, ms);
  }, [checkHealth]);

  // Tick: ejecutar check y programar siguiente
  const tick = useCallback(async () => {
    await checkHealth();
    if (runningRef.current) {
      scheduleNext(getInterval());
    }
  }, [checkHealth, scheduleNext]);

  // Iniciar monitoreo (idempotente)
  const startMonitor = useCallback(() => {
    if (runningRef.current) {
      return; // Ya está corriendo
    }
    runningRef.current = true;
    scheduleNext(0); // Primera verificación inmediata
  }, [scheduleNext]);

  // Detener monitoreo
  const stopMonitor = useCallback(() => {
    runningRef.current = false;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    // FASE 19.2: Abortar request en vuelo si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Forzar verificación inmediata
  const checkNow = useCallback(async () => {
    checkCountRef.current = 0;
    await checkHealth();
  }, [checkHealth]);

  // Iniciar monitoreo al montar (solo una vez)
  useEffect(() => {
    startMonitor();
    return () => {
      stopMonitor();
    };
  }, []); // Sin dependencias - solo se ejecuta una vez

  // Escuchar cambios en localStorage para actualizar URL
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'pos_server_url') {
        stopMonitor();
        checkCountRef.current = 0;
        startMonitor();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [startMonitor, stopMonitor]);

  // FASE 19.4: Escuchar cambios de visibilidad de la pestaña
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      isVisibleRef.current = isVisible;
      
      if (isVisible) {
        // Al volver visible: reanudar y hacer check inmediato
        if (runningRef.current) {
          checkNow();
          scheduleNext(getInterval());
        }
      } else {
        // Al ocultarse: pausar polling (pero mantener runningRef para reanudar)
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Inicializar estado
    isVisibleRef.current = !document.hidden;
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkNow, scheduleNext]);

  return (
    <ConnectionContext.Provider
      value={{
        isOnline,
        lastCheckedAt,
        lastError,
        checkNow,
        startMonitor,
        stopMonitor
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection debe usarse dentro de ConnectionProvider');
  }
  return context;
}
