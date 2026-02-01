const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const AzureScanner = require('../services/AzureScanner');

router.post('/scan', [auth, adminAuth], async (req, res) => {
  try {
    const { subscriptionId, resourceGroups, scanTypes } = req.body;
    
    if (!subscriptionId) {
      return res.status(400).json({ message: 'Subscription ID is required' });
    }

    const scanner = new AzureScanner([
      ...(req.body.clientId ? [req.body.clientId] : []),
      process.env.AZURE_CLIENT_ID
    ].filter(Boolean)[0], [
      ...(req.body.clientSecret ? [req.body.clientSecret] : []),
      process.env.AZURE_CLIENT_SECRET
    ].filter(Boolean)[0], [
      ...(req.body.tenantId ? [req.body.tenantId] : []),
      process.env.AZURE_TENANT_ID
    ].filter(Boolean)[0]);

    const scanResults = await scanner.scanSubscription(subscriptionId, {
      resourceGroups,
      scanTypes: scanTypes || ['resources', 'security', 'compliance']
    });

    res.json({
      message: 'Azure scan completed successfully',
      scanId: scanResults.scanId,
      results: scanResults,
      scannedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Azure scan error:', error);
    res.status(500).json({ 
      message: 'Azure scan failed',
      error: error.message 
    });
  }
});

router.get('/resources/:subscriptionId', [auth, adminAuth], async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const scanner = new AzureScanner(
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET,
      process.env.AZURE_TENANT_ID
    );

    const resources = await scanner.getResources(subscriptionId);
    
    res.json({
      subscriptionId,
      resources,
      count: resources.length,
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get Azure resources error:', error);
    res.status(500).json({ 
      message: 'Failed to get Azure resources',
      error: error.message 
    });
  }
});

router.get('/security-assessment/:subscriptionId', [auth, adminAuth], async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const scanner = new AzureScanner(
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET,
      process.env.AZURE_TENANT_ID
    );

    const assessment = await scanner.securityAssessment(subscriptionId);
    
    res.json({
      subscriptionId,
      assessment,
      assessedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Azure security assessment error:', error);
    res.status(500).json({ 
      message: 'Security assessment failed',
      error: error.message 
    });
  }
});

module.exports = router;