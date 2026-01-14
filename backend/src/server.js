import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import matterRoutes from './routes/matters.js';
import matterItemRoutes from './routes/matterItems.js';
import matterTypesRoutes from './routes/matterTypes.js';
import matterPermissionsRoutes from './routes/matterPermissions.js';
import timeEntryRoutes from './routes/timeEntries.js';
import invoiceRoutes from './routes/invoices.js';
import calendarRoutes from './routes/calendar.js';
import documentRoutes, { extractTextForExistingDocuments } from './routes/documents.js';
import teamRoutes from './routes/team.js';
import firmRoutes from './routes/firm.js';
import aiRoutes from './routes/ai.js';
import integrationRoutes from './routes/integrations.js';
import adminRoutes from './routes/admin.js';
import secureAdminRoutes from './routes/secureAdmin.js';
import migrationRoutes from './routes/migration.js';
import billingDataRoutes from './routes/billingData.js';
import documentTemplatesRoutes from './routes/documentTemplates.js';
import timerStateRoutes from './routes/timerState.js';
import userSettingsRoutes from './routes/userSettings.js';
import driveRoutes from './routes/drive.js';
import documentPermissionsRoutes from './routes/documentPermissions.js';
import wordOnlineRoutes from './routes/wordOnline.js';
import driveSyncRoutes from './routes/driveSync.js';
import driveSecureRoutes from './routes/driveSecure.js';
import sharingGroupsRoutes from './routes/sharingGroups.js';
import apiKeysRoutes from './routes/apiKeys.js';

// AI Agent Tool Routes (v1 API)
import billingRoutes from './routes/billing.js';
import analyticsRoutes from './routes/analytics.js';
import aiAgentRoutes, { resumeIncompleteTasks } from './routes/aiAgent.js';
import stripeConnectRoutes from './routes/stripeConnect.js';
import notificationRoutes from './routes/notifications.js';

// Background Agent (Amplifier-powered)
import backgroundAgentRoutes from './routes/backgroundAgent.js';
import amplifierService from './services/amplifierService.js';

// Import middleware
import { apiLimiter } from './middleware/rateLimit.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for Azure (required for rate limiting behind load balancer)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token', 'X-Admin-Auth'],
}));

// Body parsing - large limit for full firm migration imports (can be 100s of MBs)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(cookieParser());

// Rate limiting
app.use('/api', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/matters', matterRoutes);
app.use('/api/matters', matterItemRoutes);  // Matter tasks, updates, contacts
app.use('/api/matters', matterPermissionsRoutes);  // Matter permissions and visibility
app.use('/api/matter-types', matterTypesRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/firm', firmRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/secure-admin', secureAdminRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/billing-data', billingDataRoutes);
app.use('/api/document-templates', documentTemplatesRoutes);
app.use('/api/timer', timerStateRoutes);
app.use('/api/user-settings', userSettingsRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/drive-sync', driveSyncRoutes);
app.use('/api/drive-secure', driveSecureRoutes);
app.use('/api/document-permissions', documentPermissionsRoutes);
app.use('/api/word-online', wordOnlineRoutes);
app.use('/api/sharing-groups', sharingGroupsRoutes);
app.use('/api/api-keys', apiKeysRoutes);

// AI Agent Tool Routes (v1 API - optimized for AI interaction)
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/agent', aiAgentRoutes);
app.use('/api/stripe/connect', stripeConnectRoutes);
app.use('/api/notifications', notificationRoutes);

// Background Agent (Amplifier-powered) - separate from normal AI
app.use('/api/v1/background-agent', backgroundAgentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🏛️  Apex Legal API Server                             ║
║                                                           ║
║     Server running on: http://localhost:${PORT}             ║
║     Environment: ${process.env.NODE_ENV || 'development'}                           ║
║                                                           ║
║     API Endpoints:                                        ║
║     • Auth:       /api/auth                               ║
║     • Clients:    /api/clients                            ║
║     • Matters:    /api/matters                            ║
║     • Time:       /api/time-entries                       ║
║     • Invoices:   /api/invoices                           ║
║     • Calendar:   /api/calendar                           ║
║     • Documents:  /api/documents                          ║
║     • Team:       /api/team                               ║
║     • Firm:       /api/firm                               ║
║     • AI:         /api/ai                                 ║
║     • Integrations: /api/integrations                     ║
║     • Admin:      /api/admin                              ║
║     • SecureAdmin: /api/secure-admin (HIPAA Compliant)   ║
║     • Migration:  /api/migration                          ║
║                                                           ║
║     AI Agent Tools (v1):                                  ║
║     • Billing:    /api/v1/billing                         ║
║     • Analytics:  /api/v1/analytics                       ║
║     • AI Agent:   /api/v1/agent                           ║
║     • Background: /api/v1/background-agent (Amplifier)    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Background task: Extract text from existing documents for AI access
  setTimeout(() => {
    extractTextForExistingDocuments().catch(err => {
      console.error('Background document extraction error:', err);
    });
  }, 5000); // Wait 5 seconds after startup
  
  // Resume any incomplete AI background tasks from before server restart
  setTimeout(() => {
    resumeIncompleteTasks().catch(err => {
      console.error('Error resuming incomplete AI tasks:', err);
    });
  }, 10000); // Wait 10 seconds after startup
  
  // Initialize Amplifier background agent service
  setTimeout(async () => {
    try {
      const configured = await amplifierService.configure();
      if (configured) {
        console.log('✓ Amplifier background agent initialized');
      } else {
        console.log('⚠ Amplifier background agent not available');
      }
    } catch (err) {
      console.error('Amplifier initialization error:', err);
    }
  }, 15000); // Wait 15 seconds after startup
});

export default app;
// Deploy 1764554650
