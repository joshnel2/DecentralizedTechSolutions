const mongoose = require('mongoose');

const azureScanSchema = new mongoose.Schema({
  scanResults: {
    type: Object,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  resourceCount: {
    type: Number,
    default: 0
  },
  securityIssueCount: {
    type: Number,
    default: 0
  },
  criticalIssues: [{
    resource: String,
    issue: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical']
    }
  }],
  recommendations: [{
    resource: String,
    recommendation: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high']
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

azureScanSchema.index({ timestamp: -1 });
azureScanSchema.index({ securityIssueCount: -1 });
azureScanSchema.index({ resourceCount: -1 });

const AzureScan = mongoose.model('AzureScan', azureScanSchema);

module.exports = AzureScan;