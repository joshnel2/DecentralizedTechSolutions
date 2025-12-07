import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get timer state for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM user_timer_state WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Return empty state if no timer exists
      return res.json({
        isRunning: false,
        isPaused: false,
        matterId: null,
        matterName: null,
        clientId: null,
        clientName: null,
        startTime: null,
        pausedAt: null,
        accumulatedSeconds: 0,
      });
    }

    const t = result.rows[0];
    res.json({
      id: t.id,
      isRunning: t.is_running,
      isPaused: t.is_paused,
      matterId: t.matter_id,
      matterName: t.matter_name,
      clientId: t.client_id,
      clientName: t.client_name,
      startTime: t.start_time,
      pausedAt: t.paused_at,
      accumulatedSeconds: t.accumulated_seconds,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Get timer state error:', error);
    res.status(500).json({ error: 'Failed to get timer state' });
  }
});

// Update/create timer state (upsert)
router.put('/', authenticate, async (req, res) => {
  try {
    const {
      isRunning,
      isPaused,
      matterId,
      matterName,
      clientId,
      clientName,
      startTime,
      pausedAt,
      accumulatedSeconds,
    } = req.body;

    const result = await query(
      `INSERT INTO user_timer_state (user_id, firm_id, is_running, is_paused, matter_id, matter_name, client_id, client_name, start_time, paused_at, accumulated_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
         is_running = COALESCE($3, user_timer_state.is_running),
         is_paused = COALESCE($4, user_timer_state.is_paused),
         matter_id = $5,
         matter_name = $6,
         client_id = $7,
         client_name = $8,
         start_time = $9,
         paused_at = $10,
         accumulated_seconds = COALESCE($11, user_timer_state.accumulated_seconds),
         updated_at = NOW()
       RETURNING *`,
      [
        req.user.id, req.user.firmId, isRunning, isPaused, matterId, matterName,
        clientId, clientName, startTime, pausedAt, accumulatedSeconds || 0
      ]
    );

    const t = result.rows[0];
    res.json({
      id: t.id,
      isRunning: t.is_running,
      isPaused: t.is_paused,
      matterId: t.matter_id,
      matterName: t.matter_name,
      clientId: t.client_id,
      clientName: t.client_name,
      startTime: t.start_time,
      pausedAt: t.paused_at,
      accumulatedSeconds: t.accumulated_seconds,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Update timer state error:', error);
    res.status(500).json({ error: 'Failed to update timer state' });
  }
});

// Clear timer state (stop/discard)
router.delete('/', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE user_timer_state SET
        is_running = false,
        is_paused = false,
        matter_id = NULL,
        matter_name = NULL,
        client_id = NULL,
        client_name = NULL,
        start_time = NULL,
        paused_at = NULL,
        accumulated_seconds = 0,
        updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      isRunning: false,
      isPaused: false,
      matterId: null,
      matterName: null,
      clientId: null,
      clientName: null,
      startTime: null,
      pausedAt: null,
      accumulatedSeconds: 0,
    });
  } catch (error) {
    console.error('Clear timer state error:', error);
    res.status(500).json({ error: 'Failed to clear timer state' });
  }
});

export default router;
