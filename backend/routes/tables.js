import express from 'express';
import { getDb } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/tables
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const tables = await db.all('SELECT * FROM tables ORDER BY number');
    
    // Para cada mesa, verificar si tiene pedido activo
    const tablesWithStatus = await Promise.all(
      tables.map(async (table) => {
        // Las mesas 9 (Ventanilla) y 10 (Domicilio) siempre están activas y no se pueden cerrar
        if (table.number === 9 || table.number === 10) {
          return {
            ...table,
            status: 'pedido_activo'
          };
        }

        // FASE O1: activa = NUEVO, EN_PREP, LISTO; no archivadas
        const activeOrder = await db.get(
          `SELECT id, status, created_at 
           FROM orders 
           WHERE table_id = ? 
             AND paid_at IS NULL 
             AND archived_at IS NULL 
             AND status IN ('NUEVO', 'EN_PREP', 'LISTO')
           ORDER BY created_at DESC 
           LIMIT 1`,
          [table.id]
        );

        let status = 'libre';
        if (activeOrder) {
          if (activeOrder.status === 'LISTO') {
            status = 'pedido_listo';
          } else {
            status = 'pedido_activo';
          }
        }

        return {
          ...table,
          status
        };
      })
    );

    res.json(tablesWithStatus);
  } catch (error) {
    console.error('Error obteniendo mesas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/tables/service-counts - Contar pedidos pendientes por servicio
router.get('/service-counts', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    
    // FASE O1: activa = NUEVO, EN_PREP, LISTO; excluir PAGADA, CANCELADO, archivadas
    const ventanillaCount = await db.get(
      `SELECT COUNT(*) as count 
       FROM orders 
       WHERE service = 'VENTANILLA' 
         AND paid_at IS NULL 
         AND archived_at IS NULL 
         AND status IN ('NUEVO', 'EN_PREP', 'LISTO')`
    );
    const domicilioCount = await db.get(
      `SELECT COUNT(*) as count 
       FROM orders 
       WHERE service = 'DOMICILIO' 
         AND paid_at IS NULL 
         AND archived_at IS NULL 
         AND status IN ('NUEVO', 'EN_PREP', 'LISTO')`
    );

    res.json({
      ventanilla: ventanillaCount?.count || 0,
      domicilio: domicilioCount?.count || 0
    });
  } catch (error) {
    console.error('Error contando pedidos por servicio:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;

