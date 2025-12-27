import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import archiver from 'archiver';
import { query } from '../db/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { buildDocumentAccessFilter, canAccessDocument, requireDocumentAccess, FULL_ACCESS_ROLES } from '../middleware/documentAccess.js';
import mammoth from 'mammoth';
import { uploadFile, isAzureConfigured, downloadFile } from '../utils/azureStorage.js';

// Use createRequire for CommonJS modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// PDF.js for rendering scanned PDFs to images
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from 'canvas';

let pdfParse = null;
async function getPdfParse() {
  if (!pdfParse) {
    try {
      pdfParse = require('pdf-parse');
      console.log('[PDF] Loaded pdf-parse via require, type:', typeof pdfParse);
    } catch (err) {
      console.error('Failed to load pdf-parse:', err);
    }
  }
  return pdfParse;
}

// Azure OpenAI configuration for Vision OCR
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_VISION_DEPLOYMENT = process.env.AZURE_OPENAI_VISION_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = '2024-02-15-preview';

// Use Azure OpenAI Vision to extract text from images/scanned documents
async function extractTextWithVision(imageBuffer, mimeType, fileName) {
  if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_VISION_DEPLOYMENT) {
    console.log('Azure OpenAI Vision not configured, skipping OCR');
    return null;
  }

  try {
    const base64Image = imageBuffer.toString('base64');
    const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_VISION_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a document OCR assistant. Extract ALL text from the image exactly as it appears. Preserve formatting, paragraphs, and structure. If there are tables, represent them clearly. Do not summarize - extract the complete text.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all text from this document image (${fileName}). Return only the extracted text, nothing else.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error('Azure Vision OCR error:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Vision OCR error:', error);
    return null;
  }
}

// Convert PDF pages to images for OCR (used for scanned PDFs)
async function extractTextFromScannedPdf(pdfBuffer, fileName, maxPages = 10) {
  if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_VISION_DEPLOYMENT) {
    console.log('Azure OpenAI Vision not configured, cannot OCR scanned PDF');
    return null;
  }

  try {
    console.log(`[OCR] Converting scanned PDF "${fileName}" to images for OCR...`);
    
    // Load the PDF
    const loadingTask = getDocument({ data: pdfBuffer, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;
    const numPages = Math.min(pdfDoc.numPages, maxPages);
    
    console.log(`[OCR] PDF has ${pdfDoc.numPages} pages, processing ${numPages}`);
    
    let allText = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale = better OCR
        
        // Create canvas
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');
        
        // Render page to canvas
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // Convert canvas to PNG buffer
        const imageBuffer = canvas.toBuffer('image/png');
        
        console.log(`[OCR] Page ${pageNum}: Rendered to ${imageBuffer.length} bytes, sending to Vision...`);
        
        // Send to Vision OCR
        const pageText = await extractTextWithVision(imageBuffer, 'image/png', `${fileName}_page${pageNum}`);
        
        if (pageText && pageText.trim()) {
          allText.push(`--- Page ${pageNum} ---\n${pageText}`);
        }
        
      } catch (pageError) {
        console.error(`[OCR] Error processing page ${pageNum}:`, pageError.message);
      }
    }
    
    if (allText.length === 0) {
      return null;
    }
    
    const result = allText.join('\n\n');
    console.log(`[OCR] Successfully extracted ${result.length} characters from ${allText.length} pages`);
    
    return result;
    
  } catch (error) {
    console.error('[OCR] Scanned PDF extraction error:', error);
    return null;
  }
}

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
        const pdfParser = await getPdfParse();
        if (!pdfParser) throw new Error('PDF parser not available');
        const pdfData = await pdfParser(req.file.buffer);
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

/**
 * Get documents with Clio-style permission filtering:
 * - Admins (owner/admin): See ALL documents in the firm
 * - Regular users: See only documents they can access:
 *   1. Documents they uploaded
 *   2. Documents they own
 *   3. Documents in matters they have permission to
 *   4. Documents explicitly shared with them
 */
router.get('/', authenticate, requirePermission('documents:view'), async (req, res) => {
  try {
    const { matterId, clientId, search, status, limit = 100, offset = 0 } = req.query;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
    // Build permission-based filter
    const accessFilter = await buildDocumentAccessFilter(
      req.user.id, 
      req.user.role, 
      req.user.firmId, 
      'd',
      1
    );
    
    let sql = `
      SELECT d.*,
             m.name as matter_name,
             m.number as matter_number,
             u.first_name || ' ' || u.last_name as uploaded_by_name,
             CASE 
               WHEN d.uploaded_by = $${accessFilter.nextParamIndex} THEN true
               WHEN d.owner_id = $${accessFilter.nextParamIndex} THEN true
               ELSE false
             END as is_owned
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE ${accessFilter.whereClause}
    `;
    let params = [...accessFilter.params, req.user.id];
    let paramIndex = accessFilter.nextParamIndex + 1;

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
        externalPath: d.external_path,
        externalType: d.external_type,
        uploadedBy: d.uploaded_by,
        uploadedByName: d.uploaded_by_name,
        uploadedAt: d.uploaded_at,
        updatedAt: d.updated_at,
        isOwned: d.is_owned,
        privacyLevel: d.privacy_level,
      })),
      isAdmin,
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

/**
 * Apex Documents Section - Combined view for admins
 * Returns:
 * - For Admins: "Firm Drive" (all firm documents) + "My Documents" (their own)
 * - For Users: Only "My Documents" (documents they have access to)
 */
router.get('/sections', authenticate, requirePermission('documents:view'), async (req, res) => {
  try {
    const { search, limit = 50 } = req.query;
    const isAdmin = FULL_ACCESS_ROLES.includes(req.user.role);
    
    const response = {
      isAdmin,
      sections: [],
    };

    // ===== MY DOCUMENTS SECTION =====
    // Shows: documents user uploaded + owns + has explicit permission to
    let myDocsSql = `
      SELECT 
        d.id, d.name, d.original_name, d.type, d.size, d.folder_path,
        d.matter_id, m.name as matter_name,
        d.uploaded_at, d.version, d.privacy_level,
        CASE 
          WHEN d.uploaded_by = $1 THEN 'uploaded'
          WHEN d.owner_id = $1 THEN 'owned'
          ELSE 'shared'
        END as access_type
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      WHERE d.firm_id = $2
        AND (
          d.uploaded_by = $1 OR d.owner_id = $1
          OR EXISTS (
            SELECT 1 FROM document_permissions dp
            WHERE dp.document_id = d.id AND dp.user_id = $1 AND dp.can_view = true
              AND (dp.expires_at IS NULL OR dp.expires_at > NOW())
          )
        )
    `;
    let myDocsParams = [req.user.id, req.user.firmId];
    let paramIdx = 3;

    if (search) {
      myDocsSql += ` AND d.name ILIKE $${paramIdx}`;
      myDocsParams.push(`%${search}%`);
      paramIdx++;
    }

    myDocsSql += ` ORDER BY d.uploaded_at DESC LIMIT $${paramIdx}`;
    myDocsParams.push(parseInt(limit));

    const myDocsResult = await query(myDocsSql, myDocsParams);

    // Get my documents stats
    const myStatsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(size), 0) as total_size
      FROM documents
      WHERE firm_id = $1 AND (uploaded_by = $2 OR owner_id = $2)
    `, [req.user.firmId, req.user.id]);

    response.sections.push({
      id: 'my-documents',
      title: 'My Documents',
      description: 'Documents you\'ve uploaded, own, or have been shared with you',
      documents: myDocsResult.rows.map(d => ({
        id: d.id,
        name: d.name,
        originalName: d.original_name,
        type: d.type,
        size: d.size,
        folderPath: d.folder_path,
        matterId: d.matter_id,
        matterName: d.matter_name,
        uploadedAt: d.uploaded_at,
        version: d.version,
        privacyLevel: d.privacy_level,
        accessType: d.access_type,
      })),
      stats: {
        total: parseInt(myStatsResult.rows[0]?.total) || 0,
        totalSize: parseInt(myStatsResult.rows[0]?.total_size) || 0,
      },
      canUpload: true,
    });

    // ===== FIRM DRIVE SECTION (Admins only) =====
    if (isAdmin) {
      let firmDocsSql = `
        SELECT 
          d.id, d.name, d.original_name, d.type, d.size, d.folder_path,
          d.matter_id, m.name as matter_name,
          d.uploaded_at, d.version, d.privacy_level,
          u.first_name || ' ' || u.last_name as uploaded_by_name
        FROM documents d
        LEFT JOIN matters m ON d.matter_id = m.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.firm_id = $1
      `;
      let firmDocsParams = [req.user.firmId];
      let firmParamIdx = 2;

      if (search) {
        firmDocsSql += ` AND d.name ILIKE $${firmParamIdx}`;
        firmDocsParams.push(`%${search}%`);
        firmParamIdx++;
      }

      firmDocsSql += ` ORDER BY d.uploaded_at DESC LIMIT $${firmParamIdx}`;
      firmDocsParams.push(parseInt(limit));

      const firmDocsResult = await query(firmDocsSql, firmDocsParams);

      // Get firm-wide stats
      const firmStatsResult = await query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(size), 0) as total_size,
          COUNT(DISTINCT uploaded_by) as unique_uploaders,
          COUNT(DISTINCT matter_id) as matters_with_docs
        FROM documents
        WHERE firm_id = $1
      `, [req.user.firmId]);

      response.sections.unshift({
        id: 'firm-drive',
        title: 'Firm Drive',
        description: 'All documents across the firm',
        documents: firmDocsResult.rows.map(d => ({
          id: d.id,
          name: d.name,
          originalName: d.original_name,
          type: d.type,
          size: d.size,
          folderPath: d.folder_path,
          matterId: d.matter_id,
          matterName: d.matter_name,
          uploadedAt: d.uploaded_at,
          version: d.version,
          privacyLevel: d.privacy_level,
          uploadedByName: d.uploaded_by_name,
        })),
        stats: {
          total: parseInt(firmStatsResult.rows[0]?.total) || 0,
          totalSize: parseInt(firmStatsResult.rows[0]?.total_size) || 0,
          uniqueUploaders: parseInt(firmStatsResult.rows[0]?.unique_uploaders) || 0,
          mattersWithDocs: parseInt(firmStatsResult.rows[0]?.matters_with_docs) || 0,
        },
        canUpload: true,
        canManage: true,
        driveLink: '/drive/browse', // Link to full drive browser
      });
    }

    // ===== MATTER DOCUMENTS (for non-admins) =====
    // Users can see documents from matters they have access to
    if (!isAdmin) {
      const matterDocsSql = `
        SELECT 
          d.id, d.name, d.original_name, d.type, d.size, d.folder_path,
          d.matter_id, m.name as matter_name,
          d.uploaded_at, d.version, d.privacy_level
        FROM documents d
        JOIN matters m ON d.matter_id = m.id
        WHERE d.firm_id = $1
          AND d.uploaded_by != $2 AND d.owner_id != $2
          AND (
            m.visibility = 'firm_wide'
            OR m.responsible_attorney = $2
            OR m.originating_attorney = $2
            OR EXISTS (SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2)
            OR EXISTS (SELECT 1 FROM matter_permissions mp WHERE mp.matter_id = m.id AND mp.user_id = $2)
          )
        ORDER BY d.uploaded_at DESC
        LIMIT $3
      `;
      const matterDocsResult = await query(matterDocsSql, [req.user.firmId, req.user.id, parseInt(limit)]);

      if (matterDocsResult.rows.length > 0) {
        response.sections.push({
          id: 'matter-documents',
          title: 'Matter Documents',
          description: 'Documents from matters you\'re assigned to',
          documents: matterDocsResult.rows.map(d => ({
            id: d.id,
            name: d.name,
            originalName: d.original_name,
            type: d.type,
            size: d.size,
            folderPath: d.folder_path,
            matterId: d.matter_id,
            matterName: d.matter_name,
            uploadedAt: d.uploaded_at,
            version: d.version,
            privacyLevel: d.privacy_level,
          })),
          stats: {
            total: matterDocsResult.rows.length,
          },
          canUpload: false, // They can upload through the matter page
        });
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Get document sections error:', error);
    res.status(500).json({ error: 'Failed to get document sections' });
  }
});

// Helper function to extract text from a file
async function extractTextFromFile(filePath, originalName, mimeType = null) {
  const ext = path.extname(originalName).toLowerCase();
  let textContent = null;
  
  try {
    if (ext === '.pdf') {
      const pdfParser = await getPdfParse();
      if (!pdfParser) throw new Error('PDF parser not available');
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParser(dataBuffer);
      textContent = pdfData.text;
      
      // If PDF has no text (scanned), try OCR with Vision
      if (!textContent || textContent.trim().length < 50) {
        console.log(`PDF "${originalName}" appears to be scanned, attempting OCR...`);
        // Convert PDF pages to images and run OCR
        const ocrText = await extractTextFromScannedPdf(dataBuffer, originalName);
        if (ocrText) {
          textContent = ocrText;
          console.log(`[OCR] Successfully extracted ${ocrText.length} chars from scanned PDF`);
        } else {
          textContent = `[Scanned PDF: ${originalName} - OCR could not extract text. Ensure Azure OpenAI Vision is configured.]`;
        }
      }
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      textContent = result.value;
    } else if (['.txt', '.md', '.json', '.csv', '.xml', '.html'].includes(ext)) {
      textContent = await fs.readFile(filePath, 'utf-8');
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'].includes(ext)) {
      // Use Azure Vision OCR for images
      console.log(`Extracting text from image "${originalName}" using Azure Vision OCR...`);
      const imageBuffer = await fs.readFile(filePath);
      const imageMimeType = mimeType || `image/${ext.replace('.', '')}`;
      textContent = await extractTextWithVision(imageBuffer, imageMimeType, originalName);
      
      if (textContent) {
        console.log(`Successfully extracted ${textContent.length} characters from image`);
      }
    }
  } catch (error) {
    console.error('Text extraction error:', error);
  }
  
  // Clean up and limit size (max 100KB of text)
  if (textContent) {
    textContent = textContent.trim();
    if (textContent.length > 100000) {
      textContent = textContent.substring(0, 100000);
    }
  }
  
  return textContent || null;
}

// Upload document
router.post('/', authenticate, requirePermission('documents:upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { matterId, clientId, tags, isConfidential = false, status = 'draft' } = req.body;

    // Extract text content for AI access (including OCR for images)
    let contentText = null;
    try {
      contentText = await extractTextFromFile(req.file.path, req.file.originalname, req.file.mimetype);
    } catch (extractError) {
      console.error('Text extraction failed:', extractError);
      // Continue without text - not critical
    }

    // Build folder path for Azure
    let folderPath = 'documents';
    if (matterId) {
      // Get matter name for folder structure
      const matterResult = await query('SELECT name FROM matters WHERE id = $1', [matterId]);
      if (matterResult.rows.length > 0) {
        const matterName = matterResult.rows[0].name.replace(/[^a-zA-Z0-9 ]/g, '_');
        folderPath = `matters/${matterName}`;
      }
    }
    const azurePath = `${folderPath}/${req.file.originalname}`;

    // Upload to Azure File Share if configured
    let azureResult = null;
    try {
      const azureEnabled = await isAzureConfigured();
      if (azureEnabled) {
        azureResult = await uploadFile(req.file.path, azurePath, req.user.firmId);
        console.log(`[UPLOAD] Also uploaded to Azure: ${azureResult.path}`);
      }
    } catch (azureError) {
      console.error('[UPLOAD] Azure upload failed (continuing with local):', azureError.message);
      // Don't fail the request - local upload still succeeded
    }

    // Determine privacy level based on matter association (Clio-style)
    // - Documents in matters inherit 'team' privacy (matter team can access)
    // - Standalone documents default to 'private' (only uploader + admins)
    const privacyLevel = matterId ? 'team' : 'private';

    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, size, path,
        tags, is_confidential, status, uploaded_by, content_text, content_extracted_at,
        folder_path, external_path, owner_id, privacy_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        req.user.firmId, matterId || null, clientId || null,
        req.file.filename, req.file.originalname, req.file.mimetype,
        req.file.size, req.file.path,
        tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
        isConfidential === 'true' || isConfidential === true,
        status, req.user.id,
        contentText, contentText ? new Date() : null,
        folderPath, azureResult ? azureResult.path : null,
        req.user.id, // owner_id - uploader automatically owns the document
        privacyLevel
      ]
    );

    const d = result.rows[0];

    // Auto-create permission for uploader (Clio-style - uploader has full access)
    try {
      await query(
        `INSERT INTO document_permissions (
          document_id, firm_id, user_id, permission_level,
          can_view, can_download, can_edit, can_delete, can_share, can_manage_permissions,
          created_by
        ) VALUES ($1, $2, $3, 'full', true, true, true, true, true, true, $3)
        ON CONFLICT DO NOTHING`,
        [d.id, req.user.firmId, req.user.id]
      );
    } catch (permError) {
      console.log('[UPLOAD] Permission auto-create skipped (may already exist)');
    }

    // Create initial version record
    try {
      const contentHash = contentText 
        ? require('crypto').createHash('sha256').update(contentText).digest('hex')
        : null;
      await query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, version_label,
          content_text, content_hash, change_summary, change_type,
          word_count, character_count, file_size, created_by, created_by_name, source
        ) VALUES ($1, $2, 1, 'Initial upload', $3, $4, 'Document uploaded', 'upload', $5, $6, $7, $8, $9, 'apex')`,
        [
          d.id, req.user.firmId, contentText, contentHash,
          contentText ? contentText.split(/\s+/).filter(w => w).length : 0,
          contentText ? contentText.length : 0,
          req.file.size, req.user.id,
          `${req.user.firstName} ${req.user.lastName}`
        ]
      );
    } catch (versionError) {
      console.log('[UPLOAD] Initial version creation skipped:', versionError.message);
    }

    // Log action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'document.uploaded', 'document', $3, $4)`,
      [req.user.firmId, req.user.id, d.id, JSON.stringify({ 
        name: d.name, 
        size: d.size, 
        textExtracted: !!contentText,
        azureUploaded: !!azureResult,
        ownerId: req.user.id,
        privacyLevel
      })]
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
      contentExtracted: !!contentText,
      azurePath: azureResult?.path || null
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
    
    // First check if content is already stored in database (e.g., AI-generated documents)
    if (doc.content_text && doc.content_text.trim().length > 0) {
      return res.json({
        id: doc.id,
        name: doc.original_name || doc.name,
        type: doc.type,
        size: doc.size,
        content: doc.content_text,
      });
    }

    // If no stored content, try to extract from file
    // Check if file path exists
    if (!doc.path) {
      // No file path - this might be an external or AI-generated document without content
      return res.json({
        id: doc.id,
        name: doc.original_name || doc.name,
        type: doc.type,
        size: doc.size,
        content: doc.ai_summary || '[No content available for this document]',
      });
    }

    // Check if file exists on disk
    try {
      await fs.access(doc.path);
    } catch {
      // File doesn't exist - return any available content
      return res.json({
        id: doc.id,
        name: doc.original_name || doc.name,
        type: doc.type,
        size: doc.size,
        content: doc.ai_summary || '[File not found on server]',
      });
    }

    let textContent = '';
    const fileName = doc.original_name || doc.name || 'document';
    const ext = path.extname(fileName).toLowerCase();

    // Extract text based on file type
    if (ext === '.pdf') {
      try {
        const pdfParser = await getPdfParse();
        if (!pdfParser) throw new Error('PDF parser not available');
        const dataBuffer = await fs.readFile(doc.path);
        const pdfData = await pdfParser(dataBuffer);
        textContent = pdfData.text;
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        textContent = `[Unable to extract PDF text. File: ${fileName}]`;
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
        textContent = `[Unable to extract Word document text. File: ${fileName}]`;
      }
    } else if (ext === '.doc') {
      // Old .doc format - mammoth doesn't support it well
      textContent = `[Old Word format (.doc): ${fileName}. Please convert to .docx for text extraction.]`;
    } else if (['.xls', '.xlsx'].includes(ext)) {
      // Excel files would need a library like xlsx
      textContent = `[Excel file: ${fileName}. Spreadsheet content available but not extracted as text.]`;
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      // Image files
      textContent = `[Image file: ${fileName}. Image analysis would require OCR processing.]`;
    } else if (!ext) {
      // No extension - try to read as text (might be AI-generated content)
      try {
        textContent = await fs.readFile(doc.path, 'utf-8');
      } catch {
        textContent = `[Unable to read file content]`;
      }
    } else {
      textContent = `[File: ${fileName}. Cannot extract text from this file type (${ext}).]`;
    }

    // Store the extracted content for future requests
    if (textContent && !textContent.startsWith('[')) {
      await query(
        'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
        [textContent, doc.id]
      ).catch(err => console.error('Failed to cache content:', err));
    }

    res.json({
      id: doc.id,
      name: doc.original_name || doc.name,
      type: doc.type,
      size: doc.size,
      content: textContent,
    });
  } catch (error) {
    console.error('Extract content error:', error);
    res.status(500).json({ error: 'Failed to extract document content' });
  }
});

// Extract and store text content for a document (backfill existing docs)
router.post('/:id/extract', authenticate, requirePermission('documents:edit'), async (req, res) => {
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

    // Extract text
    const contentText = await extractTextFromFile(doc.path, doc.original_name);

    if (contentText) {
      await query(
        'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
        [contentText, doc.id]
      );
    }

    res.json({
      id: doc.id,
      name: doc.original_name,
      contentExtracted: !!contentText,
      contentLength: contentText ? contentText.length : 0
    });
  } catch (error) {
    console.error('Extract content error:', error);
    res.status(500).json({ error: 'Failed to extract document content' });
  }
});

// Batch extract content for all documents without extracted text
router.post('/extract-all', authenticate, requirePermission('documents:edit'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, path, original_name FROM documents 
       WHERE firm_id = $1 AND content_text IS NULL AND external_id IS NULL
       LIMIT 50`,
      [req.user.firmId]
    );

    let extracted = 0;
    let failed = 0;

    for (const doc of result.rows) {
      try {
        await fs.access(doc.path);
        const contentText = await extractTextFromFile(doc.path, doc.original_name);
        if (contentText) {
          await query(
            'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
            [contentText, doc.id]
          );
          extracted++;
        }
      } catch (error) {
        console.error(`Failed to extract ${doc.original_name}:`, error.message);
        failed++;
      }
    }

    res.json({
      processed: result.rows.length,
      extracted,
      failed,
      message: result.rows.length === 50 ? 'Run again to process more documents' : 'All documents processed'
    });
  } catch (error) {
    console.error('Batch extract error:', error);
    res.status(500).json({ error: 'Failed to extract document content' });
  }
});

// Download document - with Azure fallback if local file is missing
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
    
    // Determine the filename to use - prioritize original_name, then name
    const downloadFilename = doc.original_name || doc.name || 'document';
    
    // Determine MIME type
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.zip': 'application/zip',
    };
    const ext = path.extname(downloadFilename).toLowerCase();
    const contentType = mimeTypes[ext] || doc.type || 'application/octet-stream';

    // Try local file first
    let localFileExists = false;
    if (doc.path) {
      try {
        await fs.access(doc.path);
        localFileExists = true;
      } catch {
        localFileExists = false;
      }
    }

    if (localFileExists) {
      // Serve local file
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
      res.setHeader('Content-Type', contentType);
      return res.download(doc.path, downloadFilename);
    }

    // Try Azure File Share fallback
    if (doc.azure_path || doc.folder_path) {
      try {
        const { downloadFile, isAzureConfigured } = await import('../utils/azureStorage.js');
        
        const azureEnabled = await isAzureConfigured();
        if (!azureEnabled) {
          console.log('[DOWNLOAD] Azure not configured, cannot fallback');
          return res.status(404).json({ error: 'File not found on server and Azure not configured' });
        }

        // Determine the Azure path - try azure_path first, then construct from folder_path
        const azurePath = doc.azure_path || 
          (doc.folder_path ? `${doc.folder_path}/${downloadFilename}` : downloadFilename);
        
        console.log(`[DOWNLOAD] Downloading from Azure: ${azurePath}`);
        
        const fileBuffer = await downloadFile(azurePath, req.user.firmId);
        
        if (!fileBuffer || fileBuffer.length === 0) {
          return res.status(404).json({ error: 'File not found in Azure storage' });
        }

        // Set headers and send buffer
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', fileBuffer.length);
        
        console.log(`[DOWNLOAD] Serving ${downloadFilename} from Azure (${fileBuffer.length} bytes)`);
        return res.send(fileBuffer);
        
      } catch (azureError) {
        console.error('[DOWNLOAD] Azure fallback failed:', azureError.message);
        // Fall through to external file check
      }
    }
    
    // Handle external files (stored in external cloud storage like Google Drive, Dropbox)
    if (doc.external_path && doc.external_type) {
      // For external files, redirect to the external URL or return an error
      // The frontend should handle external files differently
      return res.status(400).json({ 
        error: 'External file', 
        externalPath: doc.external_path,
        externalType: doc.external_type,
        filename: downloadFilename,
        message: 'This file is stored externally. Please access it through the external service.'
      });
    }

    // No file found anywhere
    return res.status(404).json({ error: 'File not found on server or in cloud storage' });
    
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Download ALL documents as a zip file
router.get('/download-all/zip', authenticate, requirePermission('documents:view'), async (req, res) => {
  try {
    // Get all documents for this firm that the user can access
    const result = await query(
      `SELECT d.*, m.name as matter_name, c.name as client_name
       FROM documents d
       LEFT JOIN matters m ON d.matter_id = m.id
       LEFT JOIN clients c ON d.client_id = c.id
       WHERE d.firm_id = $1 AND d.is_folder = false
       ORDER BY d.folder_path, d.name`,
      [req.user.firmId]
    );

    const documents = result.rows;
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'No documents found' });
    }

    // Set up the zip response
    const firmName = req.user.firmName || 'ApexDrive';
    const zipFilename = `${firmName.replace(/[^a-zA-Z0-9]/g, '_')}_Documents_${new Date().toISOString().split('T')[0]}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create zip file' });
      }
    });

    archive.pipe(res);

    let addedCount = 0;
    let skippedCount = 0;

    for (const doc of documents) {
      // Skip external files and files without paths
      if (!doc.path || doc.external_path) {
        skippedCount++;
        continue;
      }

      try {
        await fs.access(doc.path);
        
        // Create folder structure in zip
        let zipPath = '';
        if (doc.matter_name) {
          zipPath = `Matters/${doc.matter_name.replace(/[^a-zA-Z0-9 ]/g, '_')}/`;
        } else if (doc.client_name) {
          zipPath = `Clients/${doc.client_name.replace(/[^a-zA-Z0-9 ]/g, '_')}/`;
        } else {
          zipPath = 'General/';
        }
        
        const filename = doc.original_name || doc.name || `document_${doc.id}`;
        archive.file(doc.path, { name: zipPath + filename });
        addedCount++;
      } catch {
        // File doesn't exist, skip it
        skippedCount++;
      }
    }

    console.log(`[ZIP] Created zip with ${addedCount} files, skipped ${skippedCount}`);
    await archive.finalize();
  } catch (error) {
    console.error('Bulk download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download documents' });
    }
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

    const { name, matterId, clientId, tags, isConfidential, status, aiSummary, content, externalPath, externalType } = req.body;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(name); }
    if (matterId !== undefined) { updates.push(`matter_id = $${paramIndex++}`); values.push(matterId); }
    if (clientId !== undefined) { updates.push(`client_id = $${paramIndex++}`); values.push(clientId); }
    if (tags !== undefined) { updates.push(`tags = $${paramIndex++}`); values.push(tags); }
    if (isConfidential !== undefined) { updates.push(`is_confidential = $${paramIndex++}`); values.push(isConfidential); }
    if (status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(status); }
    if (aiSummary !== undefined) { updates.push(`ai_summary = $${paramIndex++}`); values.push(aiSummary); }
    if (content !== undefined) { 
      updates.push(`content_text = $${paramIndex++}`); 
      values.push(content);
      updates.push(`size = $${paramIndex++}`);
      values.push(content.length);
      updates.push(`content_extracted_at = NOW()`);
    }
    if (externalPath !== undefined) { updates.push(`external_path = $${paramIndex++}`); values.push(externalPath); }
    if (externalType !== undefined) { updates.push(`external_type = $${paramIndex++}`); values.push(externalType); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    values.push(req.params.id);

    const result = await query(
      `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    const d = result.rows[0];
    console.log(`[DOCUMENTS] Updated document ${d.id}: ${d.name}`);
    res.json({
      id: d.id,
      name: d.name,
      matterId: d.matter_id,
      tags: d.tags,
      status: d.status,
      content: d.content_text,
      externalPath: d.external_path,
      externalType: d.external_type,
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

// Background function to extract text from existing documents
export async function extractTextForExistingDocuments() {
  try {
    // Find documents without extracted text (limit to 20 at a time to not overwhelm server)
    const result = await query(
      `SELECT id, path, original_name, firm_id FROM documents 
       WHERE content_text IS NULL 
         AND external_id IS NULL 
         AND path IS NOT NULL
       ORDER BY uploaded_at DESC
       LIMIT 20`
    );

    if (result.rows.length === 0) {
      console.log('📄 Document extraction: All documents already processed');
      return;
    }

    console.log(`📄 Document extraction: Processing ${result.rows.length} documents...`);
    
    let extracted = 0;
    let failed = 0;

    for (const doc of result.rows) {
      try {
        await fs.access(doc.path);
        const contentText = await extractTextFromFile(doc.path, doc.original_name);
        if (contentText) {
          await query(
            'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
            [contentText, doc.id]
          );
          extracted++;
        }
      } catch (error) {
        // File might not exist or extraction failed - that's ok
        failed++;
      }
    }

    console.log(`📄 Document extraction complete: ${extracted} extracted, ${failed} skipped`);
    
    // If there were documents to process, schedule another batch
    if (result.rows.length === 20) {
      setTimeout(() => {
        extractTextForExistingDocuments().catch(console.error);
      }, 10000); // Wait 10 seconds before next batch
    }
  } catch (error) {
    console.error('Document extraction error:', error);
  }
}

export { extractTextFromFile };
export default router;
