import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

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
