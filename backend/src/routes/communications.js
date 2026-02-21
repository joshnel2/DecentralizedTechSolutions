import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Get communications for a matter or client
router.get('/', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { matterId, clientId, type, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT c.*, 
             u.first_name || ' ' || u.last_name as user_name,
             m.name as matter_name, m.number as matter_number,
             cl.display_name as client_name
      FROM communications c
      LEFT JOIN users u ON c.user_id = u.id
      LEFT JOIN matters m ON c.matter_id = m.id
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.firm_id = $1
    `;
    const params = [req.user.firmId];
    let idx = 2;

    if (matterId) { sql += ` AND c.matter_id = $${idx}`; params.push(matterId); idx++; }
    if (clientId) { sql += ` AND c.client_id = $${idx}`; params.push(clientId); idx++; }
    if (type) { sql += ` AND c.type = $${idx}`; params.push(type); idx++; }

    sql += ` ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      communications: result.rows.map(c => ({
        id: c.id,
        matterId: c.matter_id,
        matterName: c.matter_name,
        matterNumber: c.matter_number,
        clientId: c.client_id,
        clientName: c.client_name,
        userId: c.user_id,
        userName: c.user_name,
        type: c.type,
        direction: c.direction,
        subject: c.subject,
        body: c.body,
        fromAddress: c.from_address,
        toAddress: c.to_address,
        phoneNumber: c.phone_number,
        durationSeconds: c.duration_seconds,
        isBillable: c.is_billable,
        createdAt: c.created_at,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get communications error:', error);
    res.status(500).json({ error: 'Failed to get communications' });
  }
});

// Log a communication
router.post('/', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const {
      matterId, clientId, type = 'note', direction = 'outbound',
      subject, body, fromAddress, toAddress, phoneNumber,
      durationSeconds, isBillable = false,
    } = req.body;

    if (!type) return res.status(400).json({ error: 'Type is required' });

    const result = await query(
      `INSERT INTO communications (firm_id, matter_id, client_id, user_id, type, direction, subject, body, from_address, to_address, phone_number, duration_seconds, is_billable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [req.user.firmId, matterId || null, clientId || null, req.user.id, type, direction, subject, body, fromAddress, toAddress, phoneNumber, durationSeconds, isBillable]
    );

    const c = result.rows[0];
    res.status(201).json({
      id: c.id, type: c.type, direction: c.direction, subject: c.subject,
      body: c.body, createdAt: c.created_at,
    });
  } catch (error) {
    console.error('Log communication error:', error);
    res.status(500).json({ error: 'Failed to log communication' });
  }
});

// Delete a communication
router.delete('/:id', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM communications WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete communication error:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
