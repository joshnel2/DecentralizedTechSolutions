import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get all user settings
router.get('/', authenticate, async (req, res) => {
  try {
    // Check which columns exist to handle different database states
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name IN ('email_signature', 'ai_custom_instructions', 'settings', 'notification_preferences')`
    );
    const existingCols = colCheck.rows.map(r => r.column_name);
    
    // Build dynamic query based on existing columns
    const selectCols = [];
    if (existingCols.includes('email_signature')) selectCols.push('email_signature');
    if (existingCols.includes('ai_custom_instructions')) selectCols.push('ai_custom_instructions');
    if (existingCols.includes('settings')) selectCols.push('settings');
    if (existingCols.includes('notification_preferences')) selectCols.push('notification_preferences');
    
    // Always select at least id to ensure we get a row
    const selectClause = selectCols.length > 0 ? selectCols.join(', ') : '1 as placeholder';
    
    const result = await query(
      `SELECT ${selectClause} FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      emailSignature: user.email_signature || '',
      aiCustomInstructions: user.ai_custom_instructions || '',
      settings: user.settings || {},
      notificationPreferences: user.notification_preferences || {}
    });
  } catch (error) {
    console.error('Get user settings error:', error);
    res.status(500).json({ error: 'Failed to get user settings' });
  }
});

// Update user settings
router.put('/', authenticate, async (req, res) => {
  try {
    const { emailSignature, settings, notificationPreferences } = req.body;
    
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (emailSignature !== undefined) {
      updates.push(`email_signature = $${paramIndex++}`);
      values.push(emailSignature);
    }
    
    if (settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(settings));
    }
    
    if (notificationPreferences !== undefined) {
      updates.push(`notification_preferences = $${paramIndex++}`);
      values.push(JSON.stringify(notificationPreferences));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No settings to update' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(req.user.id);
    
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update user settings error:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

// Get user's AI settings
router.get('/ai', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT ai_custom_instructions FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      aiCustomInstructions: result.rows[0].ai_custom_instructions || ''
    });
  } catch (error) {
    console.error('Get AI settings error:', error);
    res.status(500).json({ error: 'Failed to get AI settings' });
  }
});

// Update user's AI settings
router.put('/ai', authenticate, async (req, res) => {
  try {
    const { aiCustomInstructions } = req.body;

    // Validate input - limit to 2000 characters
    if (aiCustomInstructions && aiCustomInstructions.length > 2000) {
      return res.status(400).json({ 
        error: 'Custom instructions must be 2000 characters or less' 
      });
    }

    // Update the user's AI custom instructions
    await query(
      'UPDATE users SET ai_custom_instructions = $1, updated_at = NOW() WHERE id = $2',
      [aiCustomInstructions || null, req.user.id]
    );

    // Log the action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, ip_address, details)
       VALUES ($1, $2, 'user.ai_settings_updated', 'user', $2, $3, $4)`,
      [
        req.user.firmId, 
        req.user.id, 
        req.ip,
        JSON.stringify({ instructionsLength: (aiCustomInstructions || '').length })
      ]
    );

    res.json({ 
      message: 'AI settings updated successfully',
      aiCustomInstructions: aiCustomInstructions || ''
    });
  } catch (error) {
    console.error('Update AI settings error:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

export default router;
