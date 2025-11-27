import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Get events
router.get('/', authenticate, requirePermission('calendar:view'), async (req, res) => {
  try {
    const { startDate, endDate, matterId, type, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT e.*,
             m.name as matter_name,
             m.number as matter_number,
             c.display_name as client_name
      FROM calendar_events e
      LEFT JOIN matters m ON e.matter_id = m.id
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND e.start_time >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      sql += ` AND e.start_time <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (matterId) {
      sql += ` AND e.matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    if (type) {
      sql += ` AND e.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    sql += ` ORDER BY e.start_time ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      events: result.rows.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        type: e.type,
        matterId: e.matter_id,
        matterName: e.matter_name,
        matterNumber: e.matter_number,
        clientId: e.client_id,
        clientName: e.client_name,
        startTime: e.start_time,
        endTime: e.end_time,
        allDay: e.all_day,
        location: e.location,
        attendees: e.attendees,
        reminders: e.reminders,
        color: e.color,
        isPrivate: e.is_private,
        status: e.status,
        createdBy: e.created_by,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Create event
router.post('/', authenticate, requirePermission('calendar:create'), async (req, res) => {
  try {
    const {
      title,
      description,
      type = 'meeting',
      matterId,
      clientId,
      startTime,
      endTime,
      allDay = false,
      location,
      attendees = [],
      reminders = [],
      color = '#3B82F6',
      isPrivate = false,
    } = req.body;

    if (!title || !startTime || !endTime) {
      return res.status(400).json({ error: 'Title, start time, and end time are required' });
    }

    const result = await query(
      `INSERT INTO calendar_events (
        firm_id, title, description, type, matter_id, client_id,
        start_time, end_time, all_day, location, attendees, reminders,
        color, is_private, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        req.user.firmId, title, description, type, matterId, clientId,
        startTime, endTime, allDay, location, JSON.stringify(attendees),
        JSON.stringify(reminders), color, isPrivate, req.user.id
      ]
    );

    const e = result.rows[0];
    res.status(201).json({
      id: e.id,
      title: e.title,
      description: e.description,
      type: e.type,
      matterId: e.matter_id,
      clientId: e.client_id,
      startTime: e.start_time,
      endTime: e.end_time,
      allDay: e.all_day,
      location: e.location,
      attendees: e.attendees,
      reminders: e.reminders,
      color: e.color,
      isPrivate: e.is_private,
      status: e.status,
      createdAt: e.created_at,
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/:id', authenticate, requirePermission('calendar:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id FROM calendar_events WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const {
      title,
      description,
      type,
      matterId,
      clientId,
      startTime,
      endTime,
      allDay,
      location,
      attendees,
      reminders,
      color,
      isPrivate,
      status,
    } = req.body;

    const result = await query(
      `UPDATE calendar_events SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        type = COALESCE($3, type),
        matter_id = COALESCE($4, matter_id),
        client_id = COALESCE($5, client_id),
        start_time = COALESCE($6, start_time),
        end_time = COALESCE($7, end_time),
        all_day = COALESCE($8, all_day),
        location = COALESCE($9, location),
        attendees = COALESCE($10, attendees),
        reminders = COALESCE($11, reminders),
        color = COALESCE($12, color),
        is_private = COALESCE($13, is_private),
        status = COALESCE($14, status)
      WHERE id = $15
      RETURNING *`,
      [
        title, description, type, matterId, clientId, startTime, endTime,
        allDay, location,
        attendees ? JSON.stringify(attendees) : null,
        reminders ? JSON.stringify(reminders) : null,
        color, isPrivate, status, req.params.id
      ]
    );

    const e = result.rows[0];
    res.json({
      id: e.id,
      title: e.title,
      description: e.description,
      type: e.type,
      startTime: e.start_time,
      endTime: e.end_time,
      status: e.status,
      updatedAt: e.updated_at,
    });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/:id', authenticate, requirePermission('calendar:delete'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM calendar_events WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

export default router;
