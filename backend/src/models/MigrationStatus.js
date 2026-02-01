const mongoose = require('mongoose');

const migrationStatusSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['data', 'schema', 'full'],
    default: 'data'
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'rolling_back', 'rolled_back', 'archived'],
    default: 'pending'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  failedAt: {
    type: Date
  },
  rollbackStartedAt: {
    type: Date
  },
  rollbackCompletedAt: {
    type: Date
  },
  archivedAt: {
    type: Date
  },
  error: {
    type: String
  },
  metadata: {
    type: Object,
    default: {}
  },
  steps: [{
    name: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending'
    },
    startedAt: {
      type: Date
    },
    completedAt: {
      type: Date
    },
    failedAt: {
      type: Date
    },
    error: String
  }],
  logs: [{
    message: String,
    level: {
      type: String,
      enum: ['info', 'warn', 'error'],
      default: 'info'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

migrationStatusSchema.index({ status: 1 });
migrationStatusSchema.index({ createdBy: 1 });
migrationStatusSchema.index({ createdAt: -1 });
migrationStatusSchema.index({ type: 1 });

migrationStatusSchema.virtual('duration').get(function() {
  if (!this.startedAt) return null;
  
  const endTime = this.completedAt || this.failedAt || new Date();
  return endTime - this.startedAt;
});

migrationStatusSchema.virtual('progress').get(function() {
  if (!this.steps || this.steps.length === 0) return 0;
  
  const completedSteps = this.steps.filter(step => step.status === 'completed').length;
  return Math.round((completedSteps / this.steps.length) * 100);
});

/// Method to add log entry
migrationStatusSchema.methods.addLog = function(message, level = 'info') {
  this.logs.push({
    message,
    level,
    timestamp: new Date()
  });
};

// Method to check if migration can be rolled back
migrationStatusSchema.methods.canRollback = function() {
  return this.status === 'completed' && !this.rollbackStartedAt;
};

// Pre-save middleware
migrationStatusSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.addLog(`Migration status changed to: ${this.status}`);
  }
  next();
});

const MigrationStatus = mongoose.model('MigrationStatus', migrationStatusSchema);

module.exports = MigrationStatus;