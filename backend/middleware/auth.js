// Middleware simple de autenticación por sesión
// En MVP usamos sesión simple (podría mejorarse con JWT)

import { validateSession } from '../routes/auth.js';
import { getDb } from '../db/database.js';

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-session-token'];
    
    if (!token) {
      console.log("❌ requireAuth: No token proporcionado");
      return res.status(401).json({ error: 'No autenticado' });
    }

    const session = validateSession(token);
    
    if (!session) {
      console.log("❌ requireAuth: Sesión inválida para token:", token.substring(0, 20) + "...");
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    // Verificar que el usuario existe y está activo
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ? AND is_active = 1', [session.userId]);
    
    if (!user) {
      console.log("❌ requireAuth: Usuario no encontrado o inactivo, userId:", session.userId);
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    if (!user.id) {
      console.error("❌ requireAuth: Usuario sin id:", user);
      return res.status(401).json({ error: 'Usuario inválido' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Error en requireAuth:", error);
    return res.status(500).json({ error: 'Error en autenticación' });
  }
};

export const requireRole = (...roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado para este rol' });
    }
    
    next();
  };
};

