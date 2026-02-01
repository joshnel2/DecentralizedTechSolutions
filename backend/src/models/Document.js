const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxLength: 200
  },
  description: {
    type: String,
    trim: true,
    maxLength: 1000
  },
  filename: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  hash: {
    type: String,
    required: true,
    unique: true
  },
  ipfsHash: {
    type: String,
    required: true
  },
  ipfsSynced: {
    type: Boolean,
    default: false
  },
  ipfsSyncedAt: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  category: {
    type: String,
    enum: ['general', 'contracts', 'technical', 'administrative', 'financial', 'legal', 'personal'],
    default: 'general'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accessLevel: {
    type: String,
    enum: ['public', 'private', 'restricted'],
    default: 'private'
  },
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permission: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'read'
    }
  }],
  metadata: {
    originalName: String,
    uploadDate: {
      type: Date,
      default: Date.now
    },
    version: {
      type: Number,
      default: 1
    },
    versionHistory: [{
      version: Number,
      updatedAt: Date,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changes: [String]
    }],
    checksum: String,
    encryptionType: String
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
documentSchema.index({ hash: 1 });
documentSchema.index({ ipfsHash: 1 });
documentSchema.index({ uploadedBy: 1 });
documentSchema.index({ category: 1 });
documentSchema.index({ tags: 1 });
documentSchema.index({ createdAt: -1 });
documentSchema.index({ 'metadata.version': 1 });
documentSchema.index({ deleted: 1 });

// Virtual for document path
documentSchema.virtual('documentPath').get(function() {
  return `/documents/${this._id}`;
});

// Method to get document URL
documentSchema.methods.getDocumentUrl = function() {
  return `${process.env.BASE_URL || 'http://localhost:3000'}/api/documents/${this._id}/content`;
};

// Method to check if user has access
documentSchema.methods.hasAccess = function(userId, requiredPermission = 'read') {
  if (this.deleted) return false;
  
  if (this.accessLevel === 'public' && requiredPermission === 'read') return true;
  
  if (this.uploadedBy.toString() === userId.toString()) return true;
  
  const sharedAccess = this.sharedWith.find(share => 
    share.user.toString() === userId.toString()
  );
  
  if (!sharedAccess) return false;
  
  const permissionLevels = { read: 1, write: 2, admin: 3 };
  const userLevel = permissionLevels[sharedAccess.permission];
  const requiredLevel = permissionLevels[requiredPermission];
  
  return userLevel >= requiredLevel;
};

// Method to add metadata version
documentSchema.methods.addVersion = function(userId, changes = []) {
  const newVersion = {
    version: this.metadata.version + 1,
    updatedAt: new Date(),
    updatedBy: userId,
    changes
  };
  
  this.metadata.versionHistory.push(newVersion);
  this.metadata.version = newVersion.version;
};

// Pre-save middleware
documentSchema.pre('save', function(next) {
  if (this.isModified('metadata.version')) {
    this.updatedAt = new Date();
  }
  next();
});

// Static method to find by hash
documentSchema.statics.findByHash = function(hash) {
  return this.findOne({ hash, deleted: false });
};

// Static method to get documents by user
documentSchema.statics.getUserDocuments = function(userId, options = {}) {
  const query = {
    $or: [
      { uploadedBy: userId },
      { sharedWith: { $elemMatch: { user: userId } } },
      { accessLevel: 'public' }
    ],
    deleted: false
  };

  return this.find(query)
    .sort(options.sort || { createdAt: -1 })
    .limit(options.limit || 10)
    .skip(options.skip || 0)
    .populate('uploadedBy', 'name email')
    .populate('sharedWith.user', 'name email');
};

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;