const cron = require('node-cron');
const DocumentService = require('./documentService');
const AzureService = require('./azureService');
const MigrationService = require('./migrationService');
const logger = require('./logger');

class BackgroundAgent {
  constructor() {
    this.isRunning = false;
    this.tasks = new Map();
    this.documentService = new DocumentService();
    this.azureService = new AzureService();
    this.migrationService = new MigrationService();
  }

  start() {
    if (this.isRunning) {
      logger.info('Background agent already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting background agent...');

    this.scheduleTasks();
    logger.info('Background agent started successfully');
  }

  stop() {
    this.isRunning = false;
    this.tasks.forEach(task => task.stop());
    this.tasks.clear();
    logger.info('Background agent stopped');
  }

  scheduleTasks() {
    // Document sync every 5 minutes
    this.tasks.set('document-sync', cron.schedule('*/5 * * * *', async () => {
      logger.info('Running document sync task...');
      try {
        await this.documentService.syncWithIPFS();
        logger.info('Document sync completed');
      } catch (error) {
        logger.error('Document sync failed:', error);
      }
    }));

    // Azure resource scan every hour
    this.tasks.set('azure-scan', cron.schedule('0 * * * *', async () => {
      logger.info('Running Azure scan task...');
      try {
        const scanResults = await this.azureService.scanResources();
        await this.azureService.saveScanResults(scanResults);
        logger.info('Azure scan completed');
      } catch (error) {
        logger.error('Azure scan failed:', error);
      }
    }));

    // Migration cleanup every day at 2 AM
    this.tasks.set('migration-cleanup', cron.schedule('0 2 * * *', async () => {
      logger.info('Running migration cleanup task...');
      try {
        await this.migrationService.cleanupOldMigrations();
        logger.info('Migration cleanup completed');
      } catch (error) {
        logger.error('Migration cleanup failed:', error);
      }
    }));

    // System health check every 10 minutes
    this.tasks.set('health-check', cron.schedule('*/10 * * * *', async () => {
      logger.info('Running health check task...');
      try {
        const health = await this.checkSystemHealth();
        if (!health.healthy) {
          logger.warn('System health issues detected:', health.issues);
        }
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }));

    logger.info(`Scheduled ${this.tasks.size} background tasks`);
  }

  async checkSystemHealth() {
    const health = {
      healthy: true,
      issues: [],
      checks: {}
    };

    try {
      // Check database connection
      health.checks.database = await this.checkDatabaseHealth();
      if (!health.checks.database) {
        health.healthy = false;
        health.issues.push('Database connection failed');
      }

      // Check IPFS connection
      health.checks.ipfs = await this.checkIPFSHealth();
      if (!health.checks.ipfs) {
        health.healthy = false;
        health.issues.push('IPFS connection failed');
      }

      // Check Azure connectivity
      health.checks.azure = await this.checkAzureHealth();
      if (!health.checks.azure) {
        health.healthy = false;
        health.issues.push('Azure connectivity failed');
      }

    } catch (error) {
      health.healthy = false;
      health.issues.push(`Health check error: ${error.message}`);
    }

    return health;
  }

  async checkDatabaseHealth() {
    try {
      const mongoose = require('mongoose');
      return mongoose.connection.readyState === 1;
    } catch (error) {
      return false;
    }
  }

  async checkIPFSHealth() {
    try {
      const { create } = require('ipfs-http-client');
      const ipfs = create({ url: process.env.IPFS_URL || 'http://localhost:5001' });
      const id = await ipfs.id();
      return !!id;
    } catch (error) {
      return false;
    }
  }

  async checkAzureHealth() {
    try {
      return await this.azureService.testConnection();
    } catch (error) {
      return false;
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      scheduledTasks: Array.from(this.tasks.keys()),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new BackgroundAgent();