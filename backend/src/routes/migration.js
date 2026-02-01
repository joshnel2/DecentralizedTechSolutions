const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const MigrationService = require('../services/migrationService');

router.post('/create', [auth, adminAuth], [
  body('name').notEmpty().withMessage('Migration name is required'),
  body('type').isIn(['schema', 'data', 'both']).withMessage('Invalid migration type'),
  body('targetVersion').notEmpty().withMessage('Target version is required'),
  body('changes').isArray({ min: 1 }).withMessage('At least one change is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const migration = await MigrationService.createMigration({
      ...req.body,
      createdBy: req.user.id
    });

    res.status(201).json({
      message: 'Migration created successfully',
      migration
    });
  } catch (error) {
    console.error('Create migration error:', error);
    res.status(500).json({ 
      message: 'Failed to create migration',
      error: error.message 
    });
  }
});

router.get('/list', [auth, adminAuth], async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, search } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const migrations = await MigrationService.getMigrations(filters, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json(migrations);
  } catch (error) {
    console.error('Get migrations error:', error);
    res.status(500).json({ 
      message: 'Failed to get migrations',
      error: error.message 
    });
  }
});

router.get('/:id', [auth, adminAuth], async (req, res) => {
  try {
    const migration = await MigrationService.getMigrationById(req.params.id);
    
    if (!migration) {
      return res.status(404).json({ message: 'Migration not found' });
    }

    res.json({ migration });
  } catch (error) {
    console.error('Get migration error:', error);
    res.status(500).json({ 
      message: 'Failed to get migration',
      error: error.message 
    });
  }
});

router.post('/:id/execute', [auth, adminAuth], async (req, res) => {
  try {
    const { dryRun = false } = req.body;
    
    const result = await MigrationService.executeMigration(req.params.id, {
      executedBy: req.user.id,
      dryRun
    });

    res.json({
      message: dryRun ? 'Dry run completed' : 'Migration executed successfully',
      result
    });
  } catch (error) {
    console.error('Execute migration error:', error);
    res.status(500).json({ 
      message: 'Migration execution failed',
      error: error.message 
    });
  }
});

router.post('/:id/rollback', [auth, adminAuth], async (req, res) => {
  try {
    const result = await MigrationService.rollbackMigration(req.params.id, {
      rolledBackBy: req.user.id
    });

    res.json({
      message: 'Migration rolled back successfully',
      result
    });
  } catch (error) {
    console.error('Rollback migration error:', error);
    res.status(500).json({ 
      message: 'Migration rollback failed',
      error: error.message 
    });
  }
});

router.get('/:id/history', [auth, adminAuth], async (req, res) => {
  try {
    const history = await MigrationService.getMigrationHistory(req.params.id);
    
    res.json({ history });
  } catch (error) {
    console.error('Get migration history error:', error);
    res.status(500).json({ 
      message: 'Failed to get migration history',
      error: error.message 
    });
  }
});

router.get('/status/current', [auth, adminAuth], async (req, res) => {
  try {
    const currentStatus = await MigrationService.getCurrentMigrationStatus();
    
    res.json({ status: currentStatus });
  } catch (error) {
    console.error('Get current status error:', error);
    res.status(500).json({ 
      message: 'Failed to get current status',
      error: error.message 
    });
  }
});

module.exports = router;