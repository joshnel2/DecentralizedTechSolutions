import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { generateSecureToken, hashToken } from '../utils/auth.js';

const router = Router();

// Get all API keys for firm
router.get('/', authenticate, requirePermission('settings:manage'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, key_prefix, permissions, last_used, is_active, expires_at, created_by, created_at
       FROM api_keys
       WHERE firm_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [req.user.firmId]
    );

    res.json({
      apiKeys: result.rows.map(k => ({
        id: k.id,
        name: k.name,
        // Show prefix with masked rest
        key: `${k.key_prefix}${'•'.repeat(32)}`,
        keyPrefix: k.key_prefix,
        permissions: k.permissions || [],
        lastUsed: k.last_used,
        isActive: k.is_active,
        expiresAt: k.expires_at,
        createdBy: k.created_by,
        createdAt: k.created_at,
      })),
    });
  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({ error: 'Failed to get API keys' });
  }
});

// Create new API key
router.post('/', authenticate, requirePermission('settings:manage'), async (req, res) => {
  try {
    const { name, permissions = [], expiresAt } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'API key name is required' });
    }

    // Generate a secure API key
    const rawKey = generateSecureToken(32);
    const keyPrefix = `apex_${rawKey.slice(0, 8)}`;
    const fullKey = `apex_${rawKey}`;
    const keyHash = hashToken(fullKey);

    const result = await query(
      `INSERT INTO api_keys (firm_id, name, key_hash, key_prefix, permissions, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, key_prefix, permissions, expires_at, created_at`,
      [req.user.firmId, name, keyHash, keyPrefix, permissions, expiresAt || null, req.user.id]
    );

    const apiKey = result.rows[0];

    // Log the action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'api_key.created', 'api_key', $3, $4)`,
      [req.user.firmId, req.user.id, apiKey.id, JSON.stringify({ name, permissions })]
    );

    // Return the full key ONLY on creation (it won't be retrievable later)
    res.status(201).json({
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: fullKey, // Full key only shown once!
        keyPrefix: apiKey.key_prefix,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expires_at,
        createdAt: apiKey.created_at,
      },
      message: 'API key created. Save this key - it will not be shown again.',
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Delete/revoke API key
router.delete('/:id', authenticate, requirePermission('settings:manage'), async (req, res) => {
  try {
    const result = await query(
      `UPDATE api_keys SET is_active = false
       WHERE id = $1 AND firm_id = $2
       RETURNING id`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Log the action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'api_key.revoked', 'api_key', $3)`,
      [req.user.firmId, req.user.id, req.params.id]
    );

    res.json({ message: 'API key revoked' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
