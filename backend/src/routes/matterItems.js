import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getTodayInTimezone } from '../utils/dateUtils.js';

const router = Router();

// ============================================
// MATTER TASKS
// ============================================

// Get all tasks for a matter
router.get('/:matterId/tasks', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { matterId } = req.params;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `SELECT t.*, u.first_name || ' ' || u.last_name as assignee_name
       FROM matter_tasks t
       LEFT JOIN users u ON t.assignee = u.id
       WHERE t.matter_id = $1
       ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
      [matterId]
    );
    
    res.json({
      tasks: result.rows.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.due_date,
        assignee: t.assignee,
        assigneeName: t.assignee_name,
        completedAt: t.completed_at,
        createdBy: t.created_by,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      }))
    });
  } catch (error) {
    console.error('Get matter tasks error:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

// Create task for a matter
router.post('/:matterId/tasks', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId } = req.params;
    const { name, description, status = 'pending', priority = 'medium', dueDate, assignee } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Task name is required' });
    }
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `INSERT INTO matter_tasks (firm_id, matter_id, name, description, status, priority, due_date, assignee, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.firmId, matterId, name, description, status, priority, dueDate || null, assignee || null, req.user.id]
    );
    
    const t = result.rows[0];
    res.status(201).json({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      assignee: t.assignee,
      completedAt: t.completed_at,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Create matter task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:matterId/tasks/:taskId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId, taskId } = req.params;
    const { name, description, status, priority, dueDate, assignee } = req.body;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    // Update completed_at based on status
    let completedAt = null;
    if (status === 'completed') {
      const existing = await query('SELECT completed_at FROM matter_tasks WHERE id = $1', [taskId]);
      if (existing.rows.length > 0 && !existing.rows[0].completed_at) {
        completedAt = new Date().toISOString();
      } else if (existing.rows.length > 0) {
        completedAt = existing.rows[0].completed_at;
      }
    }
    
    const result = await query(
      `UPDATE matter_tasks SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        due_date = COALESCE($5, due_date),
        assignee = COALESCE($6, assignee),
        completed_at = CASE WHEN $3 = 'completed' THEN COALESCE($7, completed_at, NOW()) ELSE NULL END,
        updated_at = NOW()
       WHERE id = $8 AND matter_id = $9
       RETURNING *`,
      [name, description, status, priority, dueDate, assignee, completedAt, taskId, matterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const t = result.rows[0];
    res.json({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      assignee: t.assignee,
      completedAt: t.completed_at,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    });
  } catch (error) {
    console.error('Update matter task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:matterId/tasks/:taskId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId, taskId } = req.params;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      'DELETE FROM matter_tasks WHERE id = $1 AND matter_id = $2 RETURNING id',
      [taskId, matterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error('Delete matter task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ============================================
// MATTER UPDATES
// ============================================

// Get all updates for a matter
router.get('/:matterId/updates', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { matterId } = req.params;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `SELECT u.*, usr.first_name || ' ' || usr.last_name as created_by_name
       FROM matter_updates u
       LEFT JOIN users usr ON u.created_by = usr.id
       WHERE u.matter_id = $1
       ORDER BY u.date DESC, u.created_at DESC`,
      [matterId]
    );
    
    res.json({
      updates: result.rows.map(u => ({
        id: u.id,
        date: u.date,
        title: u.title,
        description: u.description,
        category: u.category,
        createdBy: u.created_by,
        createdByName: u.created_by_name,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      }))
    });
  } catch (error) {
    console.error('Get matter updates error:', error);
    res.status(500).json({ error: 'Failed to get updates' });
  }
});

// Create update for a matter
router.post('/:matterId/updates', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId } = req.params;
    const { date, title, description, category = 'general' } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Update title is required' });
    }
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `INSERT INTO matter_updates (firm_id, matter_id, date, title, description, category, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.firmId, matterId, date || getTodayInTimezone(), title, description, category, req.user.id]
    );
    
    const u = result.rows[0];
    res.status(201).json({
      id: u.id,
      date: u.date,
      title: u.title,
      description: u.description,
      category: u.category,
      createdBy: u.created_by,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    });
  } catch (error) {
    console.error('Create matter update error:', error);
    res.status(500).json({ error: 'Failed to create update' });
  }
});

// Update an update record
router.put('/:matterId/updates/:updateId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId, updateId } = req.params;
    const { date, title, description, category } = req.body;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `UPDATE matter_updates SET
        date = COALESCE($1, date),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        category = COALESCE($4, category),
        updated_at = NOW()
       WHERE id = $5 AND matter_id = $6
       RETURNING *`,
      [date, title, description, category, updateId, matterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Update not found' });
    }
    
    const u = result.rows[0];
    res.json({
      id: u.id,
      date: u.date,
      title: u.title,
      description: u.description,
      category: u.category,
      createdBy: u.created_by,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    });
  } catch (error) {
    console.error('Update matter update error:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Delete update
router.delete('/:matterId/updates/:updateId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId, updateId } = req.params;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      'DELETE FROM matter_updates WHERE id = $1 AND matter_id = $2 RETURNING id',
      [updateId, matterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Update not found' });
    }
    
    res.json({ message: 'Update deleted' });
  } catch (error) {
    console.error('Delete matter update error:', error);
    res.status(500).json({ error: 'Failed to delete update' });
  }
});

// ============================================
// MATTER CONTACTS
// ============================================

// Get all contacts for a matter
router.get('/:matterId/contacts', authenticate, requirePermission('matters:view'), async (req, res) => {
  try {
    const { matterId } = req.params;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `SELECT * FROM matter_contacts
       WHERE matter_id = $1
       ORDER BY name ASC`,
      [matterId]
    );
    
    res.json({
      contacts: result.rows.map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
        firm: c.firm,
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }))
    });
  } catch (error) {
    console.error('Get matter contacts error:', error);
    res.status(500).json({ error: 'Failed to get contacts' });
  }
});

// Create contact for a matter
router.post('/:matterId/contacts', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId } = req.params;
    const { name, role, firm, email, phone, notes } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Contact name is required' });
    }
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `INSERT INTO matter_contacts (firm_id, matter_id, name, role, firm, email, phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.user.firmId, matterId, name, role, firm, email, phone, notes]
    );
    
    const c = result.rows[0];
    res.status(201).json({
      id: c.id,
      name: c.name,
      role: c.role,
      firm: c.firm,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Create matter contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
router.put('/:matterId/contacts/:contactId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId, contactId } = req.params;
    const { name, role, firm, email, phone, notes } = req.body;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      `UPDATE matter_contacts SET
        name = COALESCE($1, name),
        role = COALESCE($2, role),
        firm = COALESCE($3, firm),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        notes = COALESCE($6, notes),
        updated_at = NOW()
       WHERE id = $7 AND matter_id = $8
       RETURNING *`,
      [name, role, firm, email, phone, notes, contactId, matterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    const c = result.rows[0];
    res.json({
      id: c.id,
      name: c.name,
      role: c.role,
      firm: c.firm,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Update matter contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
router.delete('/:matterId/contacts/:contactId', authenticate, requirePermission('matters:edit'), async (req, res) => {
  try {
    const { matterId, contactId } = req.params;
    
    // Verify matter belongs to user's firm
    const matterCheck = await query(
      'SELECT id FROM matters WHERE id = $1 AND firm_id = $2',
      [matterId, req.user.firmId]
    );
    
    if (matterCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Matter not found' });
    }
    
    const result = await query(
      'DELETE FROM matter_contacts WHERE id = $1 AND matter_id = $2 RETURNING id',
      [contactId, matterId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    console.error('Delete matter contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;
