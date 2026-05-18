import { createContext, useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { getApiBaseUrl } from "../utils/api";

const AuthContext = createContext();

// Obtener URL completa para API (con /api)
const getApiUrl = () => {
  const baseUrl = getApiBaseUrl();
  // Evitar duplicar /api
  if (baseUrl.endsWith('/api')) {
    return baseUrl;
  }
  return `${baseUrl}/api`;
};

// Obtener URL para WebSocket (sin /api)
const getWebSocketUrl = () => {
  return getApiBaseUrl();
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  // PASO 19.X — DEBUG PERF flag (apagado por defecto)
  const PERF_DEBUG = typeof window !== "undefined" && localStorage.getItem("perf_debug") === "1";

  // FASE 14.2: Configurar axios con baseURL dinámico
  const updateAxiosBaseUrl = () => {
    axios.defaults.baseURL = getApiUrl();
  };
  
  // Inicializar baseURL al montar
  updateAxiosBaseUrl();
  
  // Log para debugging (solo si PERF_DEBUG está activo)
  if (PERF_DEBUG) {
    console.log("🔧 Configuración API:", {
      apiBaseUrl: getApiBaseUrl(),
      apiUrl: getApiUrl(),
      wsUrl: getWebSocketUrl(),
      windowLocation: window.location.origin,
      fullPath: window.location.href,
    });
  }

  // FASE 19.3: Throttle centralizado para evitar spam de logs de red
  const lastNetworkLogAtRef = useRef(0);
  const THROTTLE_MS = 5000; // 5 segundos para errores de red repetidos

  // Interceptors registered once inside useEffect with cleanup
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        if (PERF_DEBUG) {
          console.log("Request:", config.method?.toUpperCase(), config.url);
          console.log("Headers:", config.headers);
          console.log("Data:", config.data);
        }
        return config;
      },
      (error) => {
        if (PERF_DEBUG) {
          console.error("Request error:", error);
        }
        return Promise.reject(error);
      }
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        if (PERF_DEBUG) {
          console.log("Response:", response.status, response.config.url);
        }
        return response;
      },
      (error) => {
        const now = Date.now();
        const isNetworkError = !error.response && (
          error.code === 'ECONNABORTED' ||
          error.code === 'ECONNREFUSED' ||
          error.message?.includes('Network Error') ||
          error.message?.includes('timeout')
        );

        if (isNetworkError) {
          if (PERF_DEBUG && now - lastNetworkLogAtRef.current > THROTTLE_MS) {
            console.warn("Error de red (throttled):", error.message || error.code);
            lastNetworkLogAtRef.current = now;
          }
        } else {
          if (PERF_DEBUG) {
            console.error(
              "Response error:",
              error.response?.status,
              error.config?.url
            );
            const data = error.response?.data;
            console.error("Error data JSON:", data ? JSON.stringify(data, null, 2) : null);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  useEffect(() => {
    // FASE 14.2: Actualizar baseURL al cambiar localStorage (escuchar cambios)
    const handleStorageChange = () => {
      updateAxiosBaseUrl();
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Intentar recuperar sesión
    const token = localStorage.getItem("token");
    if (token) {
      // Asegurar que baseURL esté actualizado
      updateAxiosBaseUrl();
      
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      axios.defaults.headers.common["x-session-token"] = token;

      // Usar ruta relativa (baseURL ya está configurado con la URL completa)
      axios
        .get("/auth/me")
        .then((res) => {
          setUser(res.data.user);
      // FASE 19.9: Conectar WebSocket con configuración optimizada
      const wsUrl = getWebSocketUrl();
      const ws = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });
      
      // FASE 19.9: Throttle logs de socket disconnect - SOLO si PERF_DEBUG
      let lastSocketLogAt = 0;
      ws.on('disconnect', (reason) => {
        const now = Date.now();
        if (PERF_DEBUG && now - lastSocketLogAt > 5000) {
          console.warn('[SOCKET] Desconectado:', reason);
          lastSocketLogAt = now;
        }
      });
      
      // PASO 19.X: Logs de socket connect_error - SOLO si PERF_DEBUG
      ws.on('connect_error', (error) => {
        if (PERF_DEBUG) {
          console.warn('[SOCKET] Error de conexión:', error.message);
        }
      });
      
      setSocket(ws);
        })
        .catch(() => {
          localStorage.removeItem("token");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const login = async (pin) => {
    try {
      // FASE 14.2: Asegurar que baseURL esté actualizado antes de login
      updateAxiosBaseUrl();
      
      // Usar ruta relativa (baseURL ya está configurado con la URL completa)
      // Esto hará: http://host:3000/api + /auth/pin = http://host:3000/api/auth/pin
      if (PERF_DEBUG) {
        console.log("🔐 Login attempt:", { pin, baseURL: axios.defaults.baseURL, fullUrl: `${axios.defaults.baseURL}/auth/pin` });
      }
      const res = await axios.post("/auth/pin", { pin });
      const { token, user } = res.data;

      localStorage.setItem("token", token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      axios.defaults.headers.common["x-session-token"] = token;

      setUser(user);

      // FASE 19.9: Conectar WebSocket con configuración optimizada
      // Desconectar socket anterior si existe
      if (socket) {
        socket.disconnect();
      }
      const wsUrl = getWebSocketUrl();
      const ws = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });
      
      // FASE 19.9: Throttle logs de socket disconnect - SOLO si PERF_DEBUG
      let lastSocketLogAt = 0;
      ws.on('disconnect', (reason) => {
        const now = Date.now();
        if (PERF_DEBUG && now - lastSocketLogAt > 5000) {
          console.warn('[SOCKET] Desconectado:', reason);
          lastSocketLogAt = now;
        }
      });
      
      // PASO 19.X: Logs de socket connect_error - SOLO si PERF_DEBUG
      ws.on('connect_error', (error) => {
        if (PERF_DEBUG) {
          console.warn('[SOCKET] Error de conexión:', error.message);
        }
      });
      
      setSocket(ws);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || "Error al iniciar sesión",
      };
    }
  };

  const logout = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        await axios.post("/auth/logout");
      } catch (error) {
        if (PERF_DEBUG) {
          console.error("Error al cerrar sesión:", error);
        }
      }
    }

    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
    delete axios.defaults.headers.common["x-session-token"];

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }

    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, socket }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
}
