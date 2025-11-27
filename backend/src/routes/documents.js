import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const firmDir = path.join(uploadDir, req.user.firmId);
    
    try {
      await fs.mkdir(firmDir, { recursive: true });
      cb(null, firmDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

// Get documents
router.get('/', authenticate, requirePermission('documents:view'), async (req, res) => {
  try {
    const { matterId, clientId, search, status, limit = 100, offset = 0 } = req.query;
    
    let sql = `
      SELECT d.*,
             m.name as matter_name,
             m.number as matter_number,
             u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.firm_id = $1
    `;
    const params = [req.user.firmId];
    let paramIndex = 2;

    if (matterId) {
      sql += ` AND d.matter_id = $${paramIndex}`;
      params.push(matterId);
      paramIndex++;
    }

    if (clientId) {
      sql += ` AND d.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (search) {
      sql += ` AND d.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      sql += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    sql += ` ORDER BY d.uploaded_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    res.json({
      documents: result.rows.map(d => ({
        id: d.id,
        name: d.name,
        originalName: d.original_name,
        type: d.type,
        size: d.size,
        matterId: d.matter_id,
        matterName: d.matter_name,
        matterNumber: d.matter_number,
        clientId: d.client_id,
        version: d.version,
        isLatestVersion: d.is_latest_version,
        status: d.status,
        isConfidential: d.is_confidential,
        aiSummary: d.ai_summary,
        tags: d.tags,
        uploadedBy: d.uploaded_by,
        uploadedByName: d.uploaded_by_name,
        uploadedAt: d.uploaded_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Upload document
router.post('/', authenticate, requirePermission('documents:upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { matterId, clientId, tags, isConfidential = false, status = 'draft' } = req.body;

    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, size, path,
        tags, is_confidential, status, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.user.firmId, matterId || null, clientId || null,
        req.file.filename, req.file.originalname, req.file.mimetype,
        req.file.size, req.file.path,
        tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
        isConfidential === 'true' || isConfidential === true,
        status, req.user.id
      ]
    );

    const d = result.rows[0];

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'document.uploaded', 'document', $3, $4)`,
      [req.user.firmId, req.user.id, d.id, JSON.stringify({ name: d.name, size: d.size })]
    );

    res.status(201).json({
      id: d.id,
      name: d.name,
      originalName: d.original_name,
      type: d.type,
      size: d.size,
      matterId: d.matter_id,
      version: d.version,
      status: d.status,
      uploadedAt: d.uploaded_at,
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Download document
router.get('/:id/download', authenticate, requirePermission('documents:view'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Check if file exists
    try {
      await fs.access(doc.path);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(doc.path, doc.original_name);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Update document metadata
router.put('/:id', authenticate, requirePermission('documents:edit'), async (req, res) => {
  try {
    const existing = await query(
      'SELECT id FROM documents WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { name, matterId, clientId, tags, isConfidential, status, aiSummary } = req.body;

    const result = await query(
      `UPDATE documents SET
        name = COALESCE($1, name),
        matter_id = COALESCE($2, matter_id),
        client_id = COALESCE($3, client_id),
        tags = COALESCE($4, tags),
        is_confidential = COALESCE($5, is_confidential),
        status = COALESCE($6, status),
        ai_summary = COALESCE($7, ai_summary)
      WHERE id = $8
      RETURNING *`,
      [name, matterId, clientId, tags, isConfidential, status, aiSummary, req.params.id]
    );

    const d = result.rows[0];
    res.json({
      id: d.id,
      name: d.name,
      matterId: d.matter_id,
      tags: d.tags,
      status: d.status,
      updatedAt: d.updated_at,
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/:id', authenticate, requirePermission('documents:delete'), async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND firm_id = $2',
      [req.params.id, req.user.firmId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Delete file from disk
    try {
      await fs.unlink(doc.path);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Delete from database
    await query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id)
       VALUES ($1, $2, 'document.deleted', 'document', $3)`,
      [req.user.firmId, req.user.id, req.params.id]
    );

    res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

export default router;
