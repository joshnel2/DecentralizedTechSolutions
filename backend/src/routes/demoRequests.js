import express from 'express';
import pool from '../db/connection.js';

const router = express.Router();

/**
 * POST /api/demo-requests
 * Public endpoint - no authentication required
 * Handles demo booking requests from the landing page
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, company, phone, firmSize, message } = req.body;

    // Validate required fields
    if (!name || !email || !company || !firmSize) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name, email, company, and firm size are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Insert demo request into database
    const result = await pool.query(
      `INSERT INTO demo_requests (name, email, company, phone, firm_size, message, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, created_at`,
      [name, email, company, phone || null, firmSize, message || null]
    );

    console.log(`New demo request from ${email} (${company})`);

    res.status(201).json({
      success: true,
      message: 'Demo request submitted successfully',
      requestId: result.rows[0].id
    });

  } catch (error) {
    console.error('Demo request error:', error);
    
    // Handle unique constraint violation (duplicate email)
    if (error.code === '23505') {
      return res.status(409).json({ 
        error: 'A demo request with this email already exists',
        success: false
      });
    }

    res.status(500).json({ 
      error: 'Failed to submit demo request',
      success: false
    });
  }
});

/**
 * GET /api/demo-requests
 * Admin endpoint to list demo requests (would need auth in production)
 */
router.get('/', async (req, res) => {
  try {
    // In production, this should require admin authentication
    const adminAuth = req.headers['x-admin-auth'];
    if (adminAuth !== process.env.ADMIN_AUTH_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT id, name, email, company, phone, firm_size, message, status, created_at
       FROM demo_requests
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.json({ requests: result.rows });

  } catch (error) {
    console.error('Get demo requests error:', error);
    res.status(500).json({ error: 'Failed to fetch demo requests' });
  }
});

export default router;
