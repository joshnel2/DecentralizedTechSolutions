const mongoose = require('mongoose');
const { create } = require('ipfs-http-client');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const Document = require('../models/Document');

class DocumentService {
  constructor() {
    this.ipfs = create({ 
      url: process.env.IPFS_URL || 'http://localhost:5001',
      timeout: 30000
    });
  }

  async uploadDocument(file, metadata = {}) {
    try {
      const fileBuffer = await fs.readFile(file.path);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // Check if document already exists
      const existingDoc = await Document.findOne({ hash: fileHash });
      if (existingDoc) {
        logger.info(`Document already exists: ${existingDoc._id}`);
        return existingDoc;
      }

      // Upload to IPFS
      const ipfsResult = await this.ipfs.add(fileBuffer);
      const ipfsHash = ipfsResult.path;

      // Create document record
      const document = new Document({
        title: metadata.title || file.originalname,
        description: metadata.description || '',
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        hash: fileHash,
        ipfsHash: ipfsHash,
        tags: metadata.tags || [],
        category: metadata.category || 'general',
        uploadedBy: metadata.userId,
        metadata: {
          originalName: file.originalname,
          uploadDate: new Date(),
          version: 1
        }
      });

      await document.save();

      // Clean up temp file
      await fs.unlink(file.path);

      logger.info(`Document uploaded successfully: ${document._id}`);
      return document;

    } catch (error) {
      logger.error(`Document upload failed: ${error.message}`);
      throw error;
    }
  }

  async getDocument(id) {
    try {
      const document = await Document.findById(id);
      if (!document) {
        throw new Error('Document not found');
      }
      return document;
    } catch (error) {
      logger.error(`Get document failed: ${error.message}`);
      throw error;
    }
  }

  async getDocumentContent(id) {
    try {
      const document = await this.getDocument(id);
      const content = await this.ipfs.cat(document.ipfsHash);
      return content;
    } catch (error) {
      logger.error(`Get document content failed: ${error.message}`);
      throw error;
    }
  }

  async listDocuments(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        category,
        tags,
        search,
        userId
      } = options;

      const query = {};
      
      if (category) query.category = category;
      if (userId) query.uploadedBy = userId;
      if (tags && tags.length > 0) query.tags = { $in: tags };
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const documents = await Document.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('uploadedBy', 'name email');

      const total = await Document.countDocuments(query);

      return {
        documents,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      };
    } catch (error) {
      logger.error(`List documents failed: ${error.message}`);
      throw error;
    }
  }

  async updateDocument(id, updates) {
    try {
      const document = await Document.findById(id);
      if (!document) {
        throw new Error('Document not found');
      }

      // Track version history
      const versionHistory = {
        version: document.metadata.version + 1,
        updatedAt: new Date(),
        updatedBy: updates.updatedBy,
        changes: Object.keys(updates).filter(key => key !== 'updatedBy')
      };

      Object.assign(document, updates);
      document.metadata.version += 1;
      document.metadata.versionHistory.push(versionHistory);
      document.updatedAt = new Date();

      await document.save();

      logger.info(`Document updated: ${document._id}`);
      return document;
    } catch (error) {
      logger.error(`Update document failed: ${error.message}`);
      throw error;
    }
  }

  async deleteDocument(id, userId) {
    try {
      const document = await Document.findById(id);
      if (!document) {
        throw new Error('Document not found');
      }

      // Mark as deleted instead of actually deleting
      document.deleted = true;
      document.deletedBy = userId;
      document.deletedAt = new Date();

      await document.save();

      logger.info(`Document marked as deleted: ${document._id}`);
      return { message: 'Document deleted successfully' };
    } catch (error) {
      logger.error(`Delete document failed: ${error.message}`);
      throw error;
    }
  }

  async syncWithIPFS() {
    try {
      const documents = await Document.find({ 
        deleted: false,
        ipfsSynced: false 
      });

      let synced = 0;
      for (const doc of documents) {
        try {
          // Verify IPFS content is accessible
          await this.ipfs.cat(doc.ipfsHash);
          doc.ipfsSynced = true;
          doc.ipfsSyncedAt = new Date();
          await doc.save();
          synced++;
        } catch (error) {
          logger.error(`IPFS sync failed for document ${doc._id}: ${error.message}`);
        }
      }

      logger.info(`IPFS sync completed: ${synced}/${documents.length} documents`);
      return { synced, total: documents.length };
    } catch (error) {
      logger.error(`IPFS sync failed: ${error.message}`);
      throw error;
    }
  }

  async getDocumentStats() {
    try {
      const stats = await Document.aggregate([
        {
          $group: {
            _id: null,
            totalDocuments: { $sum: 1 },
            totalSize: { $sum: '$size' },
            averageSize: { $avg: '$size' },
            documentsByCategory: {
              $push: {
                $cond: [{ $eq: ['$deleted', false] }, '$category', '$$REMOVE']
              }
            }
          }
        }
      ]);

      const categoryStats = await Document.aggregate([
        { $match: { deleted: false } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalSize: { $sum: '$size' }
          }
        }
      ]);

      return {
        totalDocuments: stats[0]?.totalDocuments || 0,
        totalSize: stats[0]?.totalSize || 0,
        averageSize: stats[0]?.averageSize || 0,
        categoryBreakdown: categoryStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Get document stats failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = DocumentService;