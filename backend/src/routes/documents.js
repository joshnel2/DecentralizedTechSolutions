import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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
    // Allow common document types by MIME type
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
      'application/octet-stream', // Fallback for some browsers
    ];

    // Also allow by file extension as fallback
    const allowedExtensions = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.webp'
    ];
    
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${ext})`), false);
    }
  },
});

// Extract text from uploaded file (without saving)
// Used for real-time document analysis in AI Assistant
const extractUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,
  },
});

router.post('/extract-text', authenticate, extractUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let textContent = '';

    if (ext === '.pdf') {
      try {
        const pdfData = await pdfParse(req.file.buffer);
        textContent = pdfData.text;
        if (!textContent || textContent.trim().length === 0) {
          textContent = `[PDF file "${req.file.originalname}" - No extractable text found. This may be a scanned image-based PDF.]`;
        }
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        textContent = `[Unable to extract text from PDF. File: ${req.file.originalname}]`;
      }
    } else if (ext === '.docx') {
      try {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        textContent = result.value;
        if (!textContent || textContent.trim().length === 0) {
          textContent = `[DOCX file "${req.file.originalname}" - No text content found.]`;
        }
      } catch (docxError) {
        console.error('DOCX parse error:', docxError);
        textContent = `[Unable to extract text from Word document. File: ${req.file.originalname}]`;
      }
    } else if (ext === '.doc') {
      textContent = `[Old Word format (.doc): ${req.file.originalname}. Please convert to .docx for text extraction.]`;
    } else if (['.txt', '.md', '.json', '.csv', '.xml', '.html', '.js', '.ts', '.jsx', '.tsx', '.css', '.sql'].includes(ext)) {
      textContent = req.file.buffer.toString('utf-8');
    } else if (['.xls', '.xlsx'].includes(ext)) {
      textContent = `[Excel file: ${req.file.originalname}. Spreadsheet content not yet supported for text extraction.]`;
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      textContent = `[Image file: ${req.file.originalname}. Image analysis would require OCR processing.]`;
    } else {
      textContent = `[File: ${req.file.originalname}. Cannot extract text from this file type (${ext}).]`;
    }

    res.json({
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
      content: textContent,
    });
  } catch (error) {
    console.error('Extract text error:', error);
    res.status(500).json({ error: 'Failed to extract text from document' });
  }
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

// Extract text content from document (for AI analysis)
router.get('/:id/content', authenticate, requirePermission('documents:view'), async (req, res) => {
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

    let textContent = '';
    const ext = path.extname(doc.original_name).toLowerCase();

    // Extract text based on file type
    if (ext === '.pdf') {
      try {
        const dataBuffer = await fs.readFile(doc.path);
        const pdfData = await pdfParse(dataBuffer);
        textContent = pdfData.text;
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        textContent = `[Unable to extract PDF text. File: ${doc.original_name}]`;
      }
    } else if (['.txt', '.md', '.json', '.csv', '.xml', '.html', '.js', '.ts', '.jsx', '.tsx', '.css', '.sql'].includes(ext)) {
      // Text-based files - read directly
      textContent = await fs.readFile(doc.path, 'utf-8');
    } else if (ext === '.docx') {
      // Word .docx files - use mammoth
      try {
        const result = await mammoth.extractRawText({ path: doc.path });
        textContent = result.value;
      } catch (docxError) {
        console.error('DOCX parse error:', docxError);
        textContent = `[Unable to extract Word document text. File: ${doc.original_name}]`;
      }
    } else if (ext === '.doc') {
      // Old .doc format - mammoth doesn't support it well
      textContent = `[Old Word format (.doc): ${doc.original_name}. Please convert to .docx for text extraction.]`;
    } else if (['.xls', '.xlsx'].includes(ext)) {
      // Excel files would need a library like xlsx
      textContent = `[Excel file: ${doc.original_name}. Spreadsheet content available but not extracted as text.]`;
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      // Image files
      textContent = `[Image file: ${doc.original_name}. Image analysis would require OCR processing.]`;
    } else {
      textContent = `[File: ${doc.original_name}. Cannot extract text from this file type (${ext}).]`;
    }

    res.json({
      id: doc.id,
      name: doc.original_name,
      type: doc.type,
      size: doc.size,
      content: textContent,
    });
  } catch (error) {
    console.error('Extract content error:', error);
    res.status(500).json({ error: 'Failed to extract document content' });
  }
});

// Save generated document (from Document Automation - saves text content as a file)
router.post('/save-generated', authenticate, requirePermission('documents:upload'), async (req, res) => {
  try {
    const { name, content, matterId, clientId, templateName, tags = [] } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    // Create the file
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const firmDir = path.join(uploadDir, req.user.firmId);
    
    // Ensure directory exists
    await fs.mkdir(firmDir, { recursive: true });
    
    // Generate unique filename
    const timestamp = new Date().toISOString().split('T')[0];
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `${uuidv4()}-${sanitizedName}_${timestamp}.txt`;
    const filePath = path.join(firmDir, filename);
    
    // Write content to file
    await fs.writeFile(filePath, content, 'utf-8');
    
    // Get file stats
    const stats = await fs.stat(filePath);
    
    // Add template name to tags if provided
    const docTags = [...tags];
    if (templateName) {
      docTags.push(`template:${templateName}`);
    }
    docTags.push('generated');

    // Save to database
    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, size, path,
        tags, is_confidential, status, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.user.firmId, 
        matterId || null, 
        clientId || null,
        filename, 
        `${sanitizedName}_${timestamp}.txt`, 
        'text/plain',
        stats.size, 
        filePath,
        docTags,
        false,
        'draft', 
        req.user.id
      ]
    );

    const d = result.rows[0];

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'document.generated', 'document', $3, $4)`,
      [req.user.firmId, req.user.id, d.id, JSON.stringify({ name: d.name, templateName })]
    );

    res.status(201).json({
      id: d.id,
      name: d.name,
      originalName: d.original_name,
      type: d.type,
      size: d.size,
      matterId: d.matter_id,
      clientId: d.client_id,
      tags: d.tags,
      status: d.status,
      uploadedAt: d.uploaded_at,
    });
  } catch (error) {
    console.error('Save generated document error:', error);
    res.status(500).json({ error: 'Failed to save generated document' });
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
