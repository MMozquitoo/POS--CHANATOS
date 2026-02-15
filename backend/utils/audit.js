import { getDb } from '../db/database.js';
import { toBogotaSQLiteTimestamp } from './timezone.js';

/**
 * Helper para registrar eventos de auditoría (FASE 12.3)
 * Si falla, no interrumpe la operación principal (try/catch silencioso)
 */
export async function logAudit({
  action,
  entity_type,
  entity_id = null,
  table_number = null,
  order_id = null,
  user_id = null,
  ip = null,
  summary = null,
  meta = null
}) {
  try {
    const db = getDb();
    const timestamp = toBogotaSQLiteTimestamp(new Date());
    
    await db.run(
      `INSERT INTO audit_logs (
        created_at, action, entity_type, entity_id, table_number, 
        order_id, user_id, ip, summary, meta
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        timestamp,
        action,
        entity_type,
        entity_id,
        table_number,
        order_id,
        user_id,
        ip || null,
        summary || null,
        meta ? JSON.stringify(meta) : null
      ]
    );
  } catch (error) {
    // No lanzar error para no interrumpir la operación principal
    console.warn('[AUDIT] Error registrando auditoría:', error.message);
  }
}
