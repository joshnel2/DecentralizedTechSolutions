import { Router } from 'express';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Roles that see all clients
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

// Get all clients - OPTIMIZED: Uses subquery for matter counts instead of slow JOIN + GROUP BY
router.get('/', authenticate, requirePermission('clients:view'), async (req, res) => {
  try {
    const { search, type, isActive, view: requestedView = 'my', limit = 1000000, offset = 0 } = req.query;
    
    // Only admins/owners can view "all" clients - everyone else forced to "my"
    const isAdmin = req.user.role === 'owner' || req.user.role === 'admin';
    const view = (requestedView === 'all' && !isAdmin) ? 'my' : requestedView;
    
    // OPTIMIZED: Skip matter_count in list view - fetched on detail page if needed
    let sql = `
      SELECT c.*
      FROM clients c
      WHERE c.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    // "My Clients" filter - only show clients user created or has matters with
    if (view === 'my') {
      sql += ` AND (
        c.created_by = $${paramIndex}
        OR EXISTS (
          SELECT 1 FROM matters m2 
          WHERE m2.client_id = c.id 
          AND (m2.responsible_attorney = $${paramIndex} 
               OR m2.originating_attorney = $${paramIndex}
               OR m2.created_by = $${paramIndex}
               OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m2.id AND ma.user_id = $${paramIndex}))
        )
      )`;
      params.push(req.user.id);
      paramIndex++;
    }

    if (search) {
      sql += ` AND (c.display_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (type) {
      sql += ` AND c.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (isActive !== undefined) {
      sql += ` AND c.is_active = $${paramIndex}`;
      params.push(isActive === 'true');
      paramIndex++;
    }

    sql += ` ORDER BY c.display_name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    // Run both queries in parallel for speed
    const [result, countResult] = await Promise.all([
      query(sql, params),
      query('SELECT COUNT(*) FROM clients WHERE firm_id = $1', [req.user.firmId])
    ]);

    res.json({
      clients: result.rows.map(c => ({
        id: c.id,
        type: c.type,
        name: c.display_name,
        displayName: c.display_name,
        firstName: c.first_name,
        lastName: c.last_name,
        companyName: c.company_name,
        email: c.email,
        phone: c.phone,
        addressStreet: c.address_street,
        addressCity: c.address_city,
        addressState: c.address_state,
        addressZip: c.address_zip,
        notes: c.notes,
        tags: c.tags,
        contactType: c.contact_type,
        isActive: c.is_active,
        matterIds: [], // Skip loading matter IDs in list view - fetch on detail page if needed
        matterCount: 0, // Skip in list view for performance - fetch on detail page
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

// Get single client
router.get('/:id', authenticate, requirePermission('clients:view'), async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, 
              array_agg(DISTINCT m.id) FILTER (WHERE m.id IS NOT NULL) as matter_ids
       FROM clients c
       LEFT JOIN matters m ON m.client_id = c.id
       WHERE c.id = $1 AND c.firm_id = $2
       GROUP BY c.id`,
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const c = result.rows[0];
    res.json({
      id: c.id,
      type: c.type,
      name: c.display_name,
      displayName: c.display_name,
      firstName: c.first_name,
      lastName: c.last_name,
      companyName: c.company_name,
      email: c.email,
      phone: c.phone,
      addressStreet: c.address_street,
      addressCity: c.address_city,
      addressState: c.address_state,
      addressZip: c.address_zip,
      notes: c.notes,
      tags: c.tags,
      contactType: c.contact_type,
      isActive: c.is_active,
      matterIds: c.matter_ids || [],
      createdBy: c.created_by,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Failed to get client' });
  }
});

// Create client
router.post('/', authenticate, requirePermission('clients:create'), async (req, res) => {
  try {
    const {
      type = 'person',
      displayName,
      name, // Alternative field name from frontend
      firstName,
      lastName,
      companyName,
      email,
      phone,
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      notes,
      tags = [],
      contactType = 'client',
    } = req.body;

    // Use displayName or name (frontend sends name sometimes)
    const clientName = displayName || name;
    
    if (!clientName || clientName.trim() === '') {
      return res.status(400).json({ error: 'Client name is required' });
    }

    // Helper to convert empty strings to null
    const emptyToNull = (val) => (val && val.trim() !== '') ? val : null;

    const result = await query(
      `INSERT INTO clients (
        firm_id, type, display_name, first_name, last_name, company_name,
        email, phone, address_street, address_city, address_state, address_zip,
        notes, tags, contact_type, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        req.user.firmId, type, clientName, emptyToNull(firstName), emptyToNull(lastName), emptyToNull(companyName),
        emptyToNull(email), emptyToNull(phone), emptyToNull(addressStreet), emptyToNull(addressCity), 
        emptyToNull(addressState), emptyToNull(addressZip),
        emptyToNull(notes), tags || [], contactType, req.user.id
      ]
    );

    const c = result.rows[0];

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'client.created', 'client', $3, $4)`,
      [req.user.firmId, req.user.id, c.id, JSON.stringify({ displayName })]
    );

    res.status(201).json({
      id: c.id,
      type: c.type,
      name: c.display_name,
      displayName: c.display_name,
      firstName: c.first_name,
      lastName: c.last_name,
      companyName: c.company_name,
      email: c.email,
      phone: c.phone,
      addressStreet: c.address_street,
      addressCity: c.address_city,
      addressState: c.address_state,
      addressZip: c.address_zip,
      notes: c.notes,
      tags: c.tags,
      contactType: c.contact_type,
      isActive: c.is_active,
      matterIds: [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
router.put('/:id', authenticate, requirePermission('clients:edit'), async (req, res) => {
  try {
    const {
      type,
      displayName,
      firstName,
      lastName,
      companyName,
      email,
      phone,
      addressStreet,
      addressCity,
      addressState,
      addressZip,
      notes,
      tags,
      contactType,
      isActive,
    } = req.body;

    // Check client exists and belongs to firm
    const existing = await query(
      'SELECT id FROM clients WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await query(
      `UPDATE clients SET
        type = COALESCE($1, type),
        display_name = COALESCE($2, display_name),
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        company_name = COALESCE($5, company_name),
        email = COALESCE($6, email),
        phone = COALESCE($7, phone),
        address_street = COALESCE($8, address_street),
        address_city = COALESCE($9, address_city),
        address_state = COALESCE($10, address_state),
        address_zip = COALESCE($11, address_zip),
        notes = COALESCE($12, notes),
        tags = COALESCE($13, tags),
        contact_type = COALESCE($14, contact_type),
        is_active = COALESCE($15, is_active)
      WHERE id = $16
      RETURNING *`,
      [
        type, displayName, firstName, lastName, companyName,
        email, phone, addressStreet, addressCity, addressState, addressZip,
        notes, tags, contactType, isActive, req.params.id
      ]
    );

    const c = result.rows[0];

    res.json({
      id: c.id,
      type: c.type,
      displayName: c.display_name,
      firstName: c.first_name,
      lastName: c.last_name,
      companyName: c.company_name,
      email: c.email,
      phone: c.phone,
      addressStreet: c.address_street,
      addressCity: c.address_city,
      addressState: c.address_state,
      addressZip: c.address_zip,
      notes: c.notes,
      tags: c.tags,
      contactType: c.contact_type,
      isActive: c.is_active,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client
router.delete('/:id', authenticate, requirePermission('clients:delete'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM clients WHERE id = $1 AND firm_id = $2 RETURNING id',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'client.deleted', 'client', $3)`,
      [req.user.firmId, req.user.id, req.params.id]
    );

    res.json({ message: 'Client deleted' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
