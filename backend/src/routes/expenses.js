import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Get expenses (optionally filtered by matter)
router.get('/', authenticate, requirePermission('billing:view'), async (req, res) => {
  try {
    const { matterId, status, billable, limit = 500, offset = 0 } = req.query;
    const isAdmin = ['owner', 'admin', 'billing'].includes(req.user.role);

    let sql = `
      SELECT e.*, 
             m.name as matter_name, m.number as matter_number,
             u.first_name || ' ' || u.last_name as user_name
      FROM expenses e
      LEFT JOIN matters m ON e.matter_id = m.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.firm_id = $1
    `;
    const params = [req.user.firmId];
    let idx = 2;

    if (!isAdmin) {
      sql += ` AND e.user_id = $${idx}`;
      params.push(req.user.id);
      idx++;
    }

    if (matterId) {
      sql += ` AND e.matter_id = $${idx}`;
      params.push(matterId);
      idx++;
    }
    if (status) {
      sql += ` AND e.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (billable !== undefined) {
      sql += ` AND e.billable = $${idx}`;
      params.push(billable === 'true');
      idx++;
    }

    sql += ` ORDER BY e.date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      expenses: result.rows.map(e => ({
        id: e.id,
        matterId: e.matter_id,
        matterName: e.matter_name,
        matterNumber: e.matter_number,
        userId: e.user_id,
        userName: e.user_name,
        date: e.date,
        description: e.description,
        amount: parseFloat(e.amount),
        category: e.category,
        expenseType: e.expense_type,
        billable: e.billable,
        billed: e.billed,
        hasReceipt: e.has_receipt,
        receiptUrl: e.receipt_url,
        reimbursable: e.reimbursable,
        reimbursed: e.reimbursed,
        status: e.status,
        invoiceId: e.invoice_id,
        createdAt: e.created_at,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ error: 'Failed to get expenses' });
  }
});

// Create expense
router.post('/', authenticate, requirePermission('billing:create'), async (req, res) => {
  try {
    const {
      matterId, date, description, amount, category,
      expenseType = 'other', billable = true, reimbursable = false,
    } = req.body;

    if (!description || !amount) {
      return res.status(400).json({ error: 'Description and amount are required' });
    }

    const result = await query(
      `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, expense_type, billable, reimbursable)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.user.firmId, matterId || null, req.user.id, date || new Date(), description, amount, category, expenseType, billable, reimbursable]
    );

    const e = result.rows[0];
    res.status(201).json({
      id: e.id, matterId: e.matter_id, date: e.date, description: e.description,
      amount: parseFloat(e.amount), category: e.category, expenseType: e.expense_type,
      billable: e.billable, status: e.status, createdAt: e.created_at,
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

// Update expense
router.put('/:id', authenticate, requirePermission('billing:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id, user_id FROM expenses WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const isAdmin = ['owner', 'admin', 'billing'].includes(req.user.role);
    if (!isAdmin && existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own expenses' });
    }

    const { date, description, amount, category, expenseType, billable, reimbursable, status } = req.body;

    await query(
      `UPDATE expenses SET
        date = COALESCE($1, date), description = COALESCE($2, description),
        amount = COALESCE($3, amount), category = COALESCE($4, category),
        expense_type = COALESCE($5, expense_type), billable = COALESCE($6, billable),
        reimbursable = COALESCE($7, reimbursable), status = COALESCE($8, status),
        updated_at = NOW()
       WHERE id = $9`,
      [date, description, amount, category, expenseType, billable, reimbursable, status, req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

// Delete expense
router.delete('/:id', authenticate, requirePermission('billing:delete'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM expenses WHERE id = $1 AND firm_id = $2 AND billed = false RETURNING id',
      [req.params.id, req.user.firmId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Expense not found or already billed' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
