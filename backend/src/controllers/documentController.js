const DocumentService = require('../services/documentService');
const { validationResult } = require('express-validator');
const logger = require('../services/logger');

const documentService = new DocumentService();

class DocumentController {
  async uploadDocument(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const metadata = {
        title: req.body.title || req.file.originalname,
        description: req.body.description,
        tags: req.body.tags ? req.body.tags.split(',') : [],
        category: req.body.category || 'general',
        userId: req.user.id
      };

      const document = await documentService.uploadDocument(req.file, metadata);
      
      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        document: {
          id: document._id,
          title: document.title,
          ipfsHash: document.ipfsHash,
          hash: document.hash
        }
      });

    } catch (error) {
      logger.error(`Upload document error: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        error: 'Document upload failed' 
      });
    }
  }

  async getDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.getDocument(id);

      if (!document.hasAccess(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        success: true,
        document: {
          id: document._id,
          title: document.title,
          description: document.description,
          filename: document.filename,
          mimetype: document.mimetype,
          size: document.size,
          hash: document.hash,
          ipfsHash: document.ipfsHash,
          tags: document.tags,
          category: document.category,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          metadata: document.metadata
        }
      });

    } catch (error) {
      logger.error(`Get document error: ${error.message}`);
      if (error.message === 'Document not found') {
        return res.status(404).json({ 
          success: false, 
          error: 'Document not found' 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get document' 
      });
    }
  }

  async getDocumentContent(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.getDocument(id);

      if (!document.hasAccess(req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const content = await documentService.getDocumentContent(id);
      
      res.set({
        'Content-Type': document.mimetype,
        'Content-Disposition': `inline; filename="${document.filename}"`
      });
      
      res.send(content);

    } catch (error) {
      logger.error(`Get document content error: ${error.message}`);
      if (error.message === 'Document not found') {
        return res.status(404).json({ 
          success: false, 
          error: 'Document not found' 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get document content' 
      });
    }
  }

  async listDocuments(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        category,
        tags,
        search
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        userId: req.user.id,
        category,
        tags: tags ? tags.split(',') : undefined,
        search
      };

      const result = await documentService.listDocuments(options);

      res.json({
        success: true,
        documents: result.documents,
        pagination: {
          currentPage: result.currentPage,
          totalPages: result.totalPages,
          totalItems: result.total,
          hasNext: result.currentPage < result.totalPages,
          hasPrev: result.currentPage > 1
        }
      });

    } catch (error) {
      logger.error(`List documents error: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to list documents' 
      });
    }
  }

  async updateDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.getDocument(id);

      if (!document.hasAccess(req.user.id, 'write')) {
        return res.status(403).json({ error: 'Write access denied' });
      }

      const updates = {
        ...req.body,
        updatedBy: req.user.id
      };

      const updatedDocument = await documentService.updateDocument(id, updates);

      res.json({
        success: true,
        message: 'Document updated successfully',
        document: updatedDocument
      });

    } catch (error) {
      logger.error(`Update document error: ${error.message}`);
      if (error.message === 'Document not found') {
        return res.status(404).json({ 
          success: false, 
          error: 'Document not found' 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update document' 
      });
    }
  }

  async deleteDocument(req, res) {
    try {
      const { id } = req.params;
      const document = await documentService.getDocument(id);

      if (!document.hasAccess(req.user.id, 'admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      await documentService.deleteDocument(id, req.user.id);

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });

    } catch (error) {
      logger.error(`Delete document error: ${error.message}`);
      if (error.message === 'Document not found') {
        return res.status(404).json({ 
          success: false, 
          error: 'Document not found' 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete document' 
      });
    }
  }

  async getDocumentStats(req, res) {
    try {
      const stats = await documentService.getDocumentStats();
      
      res.json({
        success: true,
        stats: {
          totalDocuments: stats.totalDocuments,
          totalSize: stats.totalSize,
          averageSize: stats.averageSize,
          categoryBreakdown: stats.categoryBreakdown,
          timestamp: stats.timestamp
        }
      });

    } catch (error) {
      logger.error(`Get document stats error: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get document statistics' 
      });
    }
  }
}

module.exports = new DocumentController();