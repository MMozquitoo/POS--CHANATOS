import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/database.js';

const router = express.Router();

// Sesiones: caché en memoria (validateSession debe ser síncrona) + persistencia
// en SQLite para que sobrevivan reinicios del servidor.
const sessions = new Map(); // token -> { userId, role, createdAt }
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// Cargar sesiones vigentes desde la BD al arrancar (llamada desde server.js)
export async function loadSessionsFromDb() {
  const db = getDb();
  const cutoff = Date.now() - SESSION_TTL_MS;
  await db.run('DELETE FROM sessions WHERE created_at <= ?', [cutoff]);
  const rows = await db.all('SELECT token, user_id, role, created_at FROM sessions');
  for (const row of rows) {
    sessions.set(row.token, {
      userId: row.user_id,
      role: row.role,
      createdAt: row.created_at,
    });
  }
  console.log(`🔑 ${rows.length} sesión(es) restauradas desde la base de datos`);
}

// Limpiar sesiones antiguas cada 5 minutos (memoria y BD)
setInterval(() => {
  const now = Date.now();
  const expired = [];
  for (const [token, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
      expired.push(token);
    }
  }
  if (expired.length > 0) {
    const db = getDb();
    db.run('DELETE FROM sessions WHERE created_at <= ?', [now - SESSION_TTL_MS]).catch(() => {});
  }
}, 5 * 60 * 1000);

// Almacenamiento de intentos fallidos (para rate limiting)
const failedAttempts = new Map(); // userId o IP -> { count, blockedUntil }

// POST /api/auth/pin
router.post('/pin', async (req, res) => {
  console.log('POST /api/auth/pin recibido desde IP:', req.ip);
  try {
    const { pin } = req.body;

    if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ error: 'PIN inválido (debe ser 4-6 dígitos)' });
    }

    // Verificar rate limiting
    const clientId = req.ip || 'unknown';
    const attempt = failedAttempts.get(clientId);
    
    if (attempt && attempt.blockedUntil > Date.now()) {
      const secondsLeft = Math.ceil((attempt.blockedUntil - Date.now()) / 1000);
      return res.status(429).json({ 
        error: 'Demasiados intentos fallidos', 
        retryAfter: secondsLeft 
      });
    }

    // Buscar usuario por PIN
    const db = getDb();
    const users = await db.all('SELECT * FROM users WHERE is_active = 1');
    
    let user = null;
    for (const u of users) {
      const match = await bcrypt.compare(pin, u.pin_hash);
      if (match) {
        user = u;
        break;
      }
    }

    if (!user) {
      // Registrar intento fallido
      const currentAttempt = failedAttempts.get(clientId) || { count: 0, blockedUntil: 0 };
      currentAttempt.count += 1;
      
      if (currentAttempt.count >= 3) {
        currentAttempt.blockedUntil = Date.now() + 30000; // 30 segundos
        currentAttempt.count = 0; // Reset después del bloqueo
      }
      
      failedAttempts.set(clientId, currentAttempt);
      
      return res.status(401).json({ error: 'PIN incorrecto' });
    }

    // Limpiar intentos fallidos al tener éxito
    failedAttempts.delete(clientId);

    // Crear sesión (memoria + BD para sobrevivir reinicios)
    const token = crypto.randomBytes(32).toString('hex');
    const createdAt = Date.now();
    sessions.set(token, {
      userId: user.id,
      role: user.role,
      createdAt
    });
    await db.run(
      'INSERT INTO sessions (token, user_id, role, created_at) VALUES (?, ?, ?, ?)',
      [token, user.id, user.role, createdAt]
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-session-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const session = sessions.get(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    const db = getDb();
    const user = await db.get('SELECT id, name, role FROM users WHERE id = ?', [session.userId]);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error en /me:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-session-token'];

  if (token) {
    sessions.delete(token);
    try {
      await getDb().run('DELETE FROM sessions WHERE token = ?', [token]);
    } catch (error) {
      console.error('Error eliminando sesión persistida:', error);
    }
  }

  res.json({ message: 'Sesión cerrada' });
});

// Exportar función para validar sesión en otros módulos
export const validateSession = (token) => {
  if (!token) return null;
  return sessions.get(token);
};

export default router;

