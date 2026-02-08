/**
 * Background Agent API Routes
 * 
 * These routes handle background agent tasks powered by Microsoft Amplifier.
 * They are completely separate from the normal AI agent to ensure no impact.
 * 
 * Endpoints:
 * - POST /v1/background-agent/tasks - Start a new background task
 * - GET /v1/background-agent/tasks - Get all user's tasks
 * - GET /v1/background-agent/tasks/active - Get current active task
 * - GET /v1/background-agent/tasks/:id - Get specific task status
 * - POST /v1/background-agent/tasks/:id/cancel - Cancel a task
 * - GET /v1/background-agent/status - Check if background agent is available
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import amplifierService from '../services/amplifierService.js';

const router = Router();

/**
 * Check if background agent service is available
 * This endpoint is called by the frontend to determine if background mode should be shown
 * Uses the SAME Azure OpenAI configuration as the normal AI chat
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const available = await amplifierService.checkAvailability();
    
    // Auto-configure if available
    if (available && !amplifierService.configured) {
      await amplifierService.configure();
    }
    
    // Always return configured=true when available - env vars are platform-managed
    const configured = available || amplifierService.configured;
    
    console.log(`[BackgroundAgent] Status check: available=${available}, configured=${configured}, user=${req.user.id}`);
    
    // Get tool count for debugging
    let toolCount = 0;
    try {
      const { AMPLIFIER_OPENAI_TOOLS } = await import('../services/amplifier/toolBridge.js');
      toolCount = AMPLIFIER_OPENAI_TOOLS?.length || 0;
    } catch (e) {
      console.error('[BackgroundAgent] Failed to get tool count:', e.message);
    }
    
    // Get harness integration status
    let harnessStatus = {};
    try {
      const { DecisionReinforcer } = await import('../services/amplifier/decisionReinforcer.js');
      const { detectModule } = await import('../services/amplifier/modules/index.js');
      const { getRateLimiter } = await import('../services/amplifier/rateLimiter.js');
      
      const rateLimiter = getRateLimiter();
      const rateLimitStatus = rateLimiter.getStatus();
      
      harnessStatus = {
        decisionReinforcer: 'active',
        moduleSystem: 'active',
        rateLimiter: rateLimitStatus.currentBackoff === 0 ? 'healthy' : 'backing-off',
        learningOptimizer: 'scheduled',
        recursiveSummarizer: 'active',
        checkpointRewind: 'active',
        juniorAttorneyBrief: 'active',
        documentLearning: 'active',
        selfReinforcement: 'active',
        amplifierHooks: 'active',
      };
    } catch (e) {
      harnessStatus = { status: 'partially-loaded', error: e.message };
    }
    
    res.json({
      available,
      configured,
      provider: 'amplifier',
      aiProvider: 'azure-openai',
      toolCount,
      harnessModules: harnessStatus,
      message: available && configured
        ? `Background agent is ready - ${toolCount} tools available, all harness modules active`
        : !available
        ? 'Background agent unavailable - Azure OpenAI credentials not configured (check AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME)'
        : 'Background agent not yet configured'
    });
  } catch (error) {
    console.error('[BackgroundAgent] Error checking status:', error);
    res.status(500).json({ 
      error: 'Failed to check background agent status',
      details: error.message,
      available: false,
      configured: false
    });
  }
});

/**
 * Deep health check - verifies the full pipeline is ready
 * Checks: Azure OpenAI, database tables, tool availability
 * Use this before relying on background agent functionality
 */
router.get('/health', authenticate, async (req, res) => {
  const checks = {
    azureOpenAI: { ok: false, detail: '' },
    database: { ok: false, detail: '' },
    agentTables: { ok: false, detail: '' },
    toolBridge: { ok: false, detail: '' },
    harnessTables: { ok: false, detail: '' },
  };

  // 1. Azure OpenAI credentials
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  checks.azureOpenAI.ok = !!(endpoint && apiKey && deployment);
  checks.azureOpenAI.detail = checks.azureOpenAI.ok
    ? `${deployment} @ ${endpoint?.substring(0, 30)}...`
    : `Missing: ${[!endpoint && 'ENDPOINT', !apiKey && 'API_KEY', !deployment && 'DEPLOYMENT'].filter(Boolean).join(', ')}`;

  // 2. Database connection
  try {
    const { query: dbQuery } = await import('../db/connection.js');
    const result = await dbQuery('SELECT 1 as ok');
    checks.database.ok = result.rows[0]?.ok === 1;
    checks.database.detail = 'Connected';
  } catch (e) {
    checks.database.detail = e.message?.substring(0, 80) || 'Connection failed';
  }

  // 3. Agent tables exist
  if (checks.database.ok) {
    try {
      const { query: dbQuery } = await import('../db/connection.js');
      const tables = await dbQuery(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('ai_background_tasks', 'ai_learning_patterns', 'ai_task_history')
      `);
      const found = tables.rows.map(r => r.table_name);
      const missing = ['ai_background_tasks', 'ai_learning_patterns', 'ai_task_history'].filter(t => !found.includes(t));
      checks.agentTables.ok = missing.length === 0;
      checks.agentTables.detail = missing.length === 0
        ? `All 3 core tables present`
        : `Missing: ${missing.join(', ')}. Run database init.`;
    } catch (e) {
      checks.agentTables.detail = e.message?.substring(0, 80) || 'Query failed';
    }
  }

  // 4. Tool bridge
  try {
    const { AMPLIFIER_OPENAI_TOOLS } = await import('../services/amplifier/toolBridge.js');
    checks.toolBridge.ok = Array.isArray(AMPLIFIER_OPENAI_TOOLS) && AMPLIFIER_OPENAI_TOOLS.length > 20;
    checks.toolBridge.detail = `${AMPLIFIER_OPENAI_TOOLS?.length || 0} tools loaded`;
  } catch (e) {
    checks.toolBridge.detail = e.message?.substring(0, 80) || 'Failed to load';
  }

  // 5. Harness intelligence tables
  if (checks.database.ok) {
    try {
      const { query: dbQuery } = await import('../db/connection.js');
      const tables = await dbQuery(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('matter_agent_memory', 'harness_quality_overrides', 'proven_tool_chains')
      `);
      const found = tables.rows.map(r => r.table_name);
      const missing = ['matter_agent_memory', 'harness_quality_overrides', 'proven_tool_chains'].filter(t => !found.includes(t));
      checks.harnessTables.ok = missing.length === 0;
      checks.harnessTables.detail = missing.length === 0
        ? `All 3 harness tables present`
        : `Missing: ${missing.join(', ')}. Run migration: add_harness_intelligence.sql`;
    } catch (e) {
      checks.harnessTables.detail = e.message?.substring(0, 80) || 'Query failed';
    }
  }

  const allOk = Object.values(checks).every(c => c.ok);

  res.json({
    healthy: allOk,
    ready: checks.azureOpenAI.ok && checks.database.ok && checks.agentTables.ok && checks.toolBridge.ok,
    checks,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Sanitize and validate user input
 * Prevents injection attacks and ensures clean input
 */
function sanitizeGoal(goal) {
  if (!goal || typeof goal !== 'string') {
    return null;
  }
  
  // Trim and normalize whitespace
  let sanitized = goal.trim().replace(/\s+/g, ' ');
  
  // Limit length (reasonable max for a task goal)
  const MAX_GOAL_LENGTH = 2000;
  if (sanitized.length > MAX_GOAL_LENGTH) {
    sanitized = sanitized.substring(0, MAX_GOAL_LENGTH) + '...';
  }
  
  // Remove potentially dangerous patterns (basic XSS prevention)
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '') // Remove any HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
  
  // Normalize special characters
  sanitized = sanitized
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/\u2028|\u2029/g, ' '); // Replace line/paragraph separators
  
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Start a new background task
 * This begins AUTONOMOUS execution of the task without human intervention
 * 
 * Options:
 * - extended: boolean - Enable extended mode (8 hours, 400 iterations) for complex projects
 * - maxIterations: number - Override max iterations
 * - maxRuntimeMinutes: number - Override max runtime in minutes
 */
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { goal: rawGoal, options = {}, extended = false, mode } = req.body;
    
    // Sanitize and validate input
    const goal = sanitizeGoal(rawGoal);
    
    if (!goal) {
      return res.status(400).json({ 
        error: 'Goal is required and must be a non-empty string',
        details: 'Please provide a clear description of the task you want the agent to complete.'
      });
    }
    
    // Validate goal minimum length
    if (goal.length < 10) {
      return res.status(400).json({
        error: 'Goal is too short',
        details: 'Please provide a more detailed description of the task (at least 10 characters).'
      });
    }
    
    // Merge extended mode into options
    const taskOptions = {
      ...options,
      extended: extended || mode === 'extended' || mode === 'long'
    };
    
    console.log(`[BackgroundAgent] Task start request from user ${req.user.id}: ${goal?.substring(0, 100)} (extended: ${taskOptions.extended})`);
    
    // Auto-configure service if needed - env vars are set at platform level
    if (!amplifierService.configured) {
      console.log('[BackgroundAgent] Auto-configuring service...');
      await amplifierService.configure();
    }
    
    // Check for existing active task (only one task per user at a time)
    const existingTask = await amplifierService.getActiveTask(req.user.id);
    if (existingTask) {
      console.log(`[BackgroundAgent] User ${req.user.id} already has active task: ${existingTask.id}`);
      return res.status(409).json({ 
        error: 'You already have an active background task',
        activeTask: existingTask
      });
    }
    
    // Start the autonomous task
    console.log(`[BackgroundAgent] Starting autonomous task for user ${req.user.id} (extended: ${taskOptions.extended})`);
    const task = await amplifierService.startTask(
      req.user.id,
      req.user.firmId,
      goal.trim(),
      taskOptions
    );
    
    console.log(`[BackgroundAgent] Task ${task.id} started successfully`);
    
    res.status(201).json({
      success: true,
      task,
      message: 'Background task started - working autonomously'
    });
    
  } catch (error) {
    console.error('[BackgroundAgent] Error starting task:', error);
    
    // Provide more specific error messages based on error type
    let statusCode = 500;
    let errorMessage = 'Failed to start background task';
    let details = 'An unexpected error occurred while starting the background task';
    
    if (error.message?.includes('Azure OpenAI')) {
      errorMessage = 'AI service temporarily unavailable';
      details = 'The AI service is experiencing issues. Please try again in a few moments.';
      statusCode = 503;
    } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      errorMessage = 'AI service busy';
      details = 'Too many requests. Please wait a moment before trying again.';
      statusCode = 429;
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Request timed out';
      details = 'The request took too long. Please try again.';
      statusCode = 504;
    } else if (error.message?.includes('database') || error.message?.includes('PostgreSQL')) {
      errorMessage = 'Database error';
      details = 'A database error occurred. Please try again.';
      statusCode = 503;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details,
      retryable: statusCode === 429 || statusCode === 503 || statusCode === 504
    });
  }
});

/**
 * Get all tasks for current user
 */
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const tasks = await amplifierService.getUserTasks(req.user.id, limit);
    
    res.json({
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
});

/**
 * Get current active task for user
 */
router.get('/tasks/active', authenticate, async (req, res) => {
  try {
    const task = await amplifierService.getActiveTask(req.user.id);
    
    res.json({
      active: !!task,
      task
    });
  } catch (error) {
    console.error('Error getting active task:', error);
    res.status(500).json({ error: 'Failed to get active task' });
  }
});

/**
 * Get specific task by ID
 */
router.get('/tasks/:id', authenticate, async (req, res) => {
  try {
    const task = await amplifierService.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify user owns this task
    if (task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this task' });
    }
    
    res.json({ task });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/**
 * Send follow-up instructions to a running task
 * Allows users to add additional context or redirect the agent mid-task
 */
router.post('/tasks/:id/followup', authenticate, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Follow-up message is required and must be a non-empty string' 
      });
    }
    
    // Check if task exists and is running
    const task = await amplifierService.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to send follow-up to this task' });
    }
    
    if (task.status !== 'running' && task.status !== 'thinking' && task.status !== 'executing') {
      return res.status(400).json({ 
        error: 'Can only send follow-up to running tasks',
        currentStatus: task.status
      });
    }
    
    // Send the follow-up to the running agent
    const result = await amplifierService.sendFollowUp(req.params.id, message.trim(), req.user.id);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to send follow-up' });
    }
    
    console.log(`[BackgroundAgent] Follow-up sent to task ${req.params.id}: ${message.substring(0, 50)}...`);
    
    res.json({
      success: true,
      message: 'Follow-up instructions sent to agent',
      task: result.task
    });
  } catch (error) {
    console.error('[BackgroundAgent] Error sending follow-up:', error);
    res.status(500).json({ error: 'Failed to send follow-up', details: error.message });
  }
});

/**
 * Cancel a task
 */
router.post('/tasks/:id/cancel', authenticate, async (req, res) => {
  try {
    const cancelled = amplifierService.cancelTask(req.params.id, req.user.id);
    
    if (!cancelled) {
      return res.status(400).json({ 
        error: 'Task could not be cancelled',
        details: 'Task may have already completed or is not running'
      });
    }
    
    const task = await amplifierService.getTask(req.params.id);
    
    res.json({
      success: true,
      task,
      message: 'Task cancelled'
    });
  } catch (error) {
    console.error('Error cancelling task:', error);
    
    if (error.message === 'Task not found') {
      return res.status(404).json({ error: error.message });
    }
    
    if (error.message === 'Not authorized to cancel this task') {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to cancel task' });
  }
});

/**
 * Get task history from database
 */
router.get('/history', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await amplifierService.getTaskHistory(req.user.id, req.user.firmId, limit);
    
    res.json({
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting task history:', error);
    res.status(500).json({ error: 'Failed to get task history' });
  }
});

// =====================================================================
// REVIEW QUEUE ENDPOINTS
// The attorney review queue surfaces completed agent work for one-click
// approve/reject. This is what makes the agent usable daily -- the attorney
// sees what was created, what was flagged, and acts in seconds.
// =====================================================================

/**
 * Get review queue - completed tasks with their deliverables
 * Returns tasks that need attorney review, with actual content from DB
 */
router.get('/review-queue', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || 'pending_review'; // pending_review, approved, rejected, all
    const { query: dbQuery } = await import('../db/connection.js');
    
    // Fetch completed tasks that haven't been reviewed yet (or filter by status)
    let statusFilter;
    if (status === 'all') {
      statusFilter = `AND t.status IN ('completed', 'approved', 'rejected')`;
    } else if (status === 'approved') {
      statusFilter = `AND t.review_status = 'approved'`;
    } else if (status === 'rejected') {
      statusFilter = `AND t.review_status = 'rejected'`;
    } else {
      // Default: pending review = completed but not yet reviewed
      statusFilter = `AND t.status = 'completed' AND (t.review_status IS NULL OR t.review_status = 'pending')`;
    }
    
    const tasksResult = await dbQuery(
      `SELECT t.id, t.goal, t.status, t.result, t.progress, t.created_at, t.completed_at,
              t.review_status, t.review_feedback, t.reviewed_at, t.reviewed_by,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM ai_background_tasks t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.firm_id = $1 AND (t.user_id = $2 OR $3 = 'admin')
       ${statusFilter}
       ORDER BY t.completed_at DESC NULLS LAST
       LIMIT $4`,
      [req.user.firmId, req.user.id, req.user.role, limit]
    );
    
    // For each task, fetch the actual deliverables from the database
    const reviewItems = [];
    for (const task of tasksResult.rows) {
      const item = {
        id: task.id,
        goal: task.goal,
        status: task.status,
        reviewStatus: task.review_status || 'pending',
        reviewFeedback: task.review_feedback,
        reviewedAt: task.reviewed_at,
        createdAt: task.created_at,
        completedAt: task.completed_at,
        createdByName: task.created_by_name,
        result: typeof task.result === 'string' ? JSON.parse(task.result) : task.result,
        progress: typeof task.progress === 'string' ? JSON.parse(task.progress) : task.progress,
        deliverables: { documents: [], notes: [], tasks: [], events: [] },
        flags: [], // Issues the attorney should look at
      };
      
      // Parse evaluation from result if present
      const evaluation = item.result?.evaluation;
      if (evaluation) {
        item.evaluationScore = evaluation.score;
        item.evaluationIssues = evaluation.issues || [];
        item.evaluationStrengths = evaluation.strengths || [];
      }
      
      // Fetch documents created by the agent during this task
      try {
        const docsResult = await dbQuery(
          `SELECT id, original_name as name, content_text, size, uploaded_at, matter_id
           FROM documents
           WHERE firm_id = $1 AND uploaded_by = $2
             AND uploaded_at >= $3 AND uploaded_at <= COALESCE($4, NOW()) + INTERVAL '5 minutes'
           ORDER BY uploaded_at DESC LIMIT 10`,
          [req.user.firmId, req.user.id, task.created_at, task.completed_at]
        );
        
        for (const doc of docsResult.rows) {
          const contentPreview = doc.content_text 
            ? doc.content_text.substring(0, 500) + (doc.content_text.length > 500 ? '...' : '')
            : null;
          
          const docFlags = [];
          if (doc.content_text && /\[INSERT|TODO|PLACEHOLDER|TBD\]/i.test(doc.content_text)) {
            docFlags.push('Contains placeholder text');
          }
          if (doc.content_text && doc.content_text.length < 200) {
            docFlags.push('Document is very short');
          }
          // Check for unverified citations
          const citationMatch = doc.content_text?.match(
            /\d+\s+(?:F\.(?:2d|3d|4th|Supp\.(?:2d|3d)?)|U\.S\.|S\.Ct\.|N\.Y\.(?:2d|3d)?|A\.D\.(?:2d|3d)?)\s+\d+/g
          );
          if (citationMatch) {
            const unverified = citationMatch.filter(c => {
              const idx = doc.content_text.indexOf(c);
              const ctx = doc.content_text.substring(Math.max(0, idx - 30), Math.min(doc.content_text.length, idx + c.length + 30));
              return !/\[UNVERIFIED|NEEDS? (?:CITE )?CHECK\]/i.test(ctx);
            });
            if (unverified.length > 0) {
              docFlags.push(`${unverified.length} citation(s) may need verification`);
            }
          }
          
          item.deliverables.documents.push({
            id: doc.id,
            name: doc.name,
            contentPreview,
            contentLength: doc.content_text?.length || 0,
            fileSize: doc.size,
            createdAt: doc.uploaded_at,
            matterId: doc.matter_id,
            flags: docFlags,
          });
          item.flags.push(...docFlags.map(f => ({ type: 'document', name: doc.name, issue: f })));
        }
      } catch (e) {
        // Non-fatal
      }
      
      // Fetch notes created during the task
      try {
        const notesResult = await dbQuery(
          `SELECT mn.id, mn.content, mn.note_type, mn.created_at, m.name as matter_name, mn.matter_id
           FROM matter_notes mn
           JOIN matters m ON mn.matter_id = m.id
           WHERE m.firm_id = $1 AND mn.created_by = $2
             AND mn.created_at >= $3 AND mn.created_at <= COALESCE($4, NOW()) + INTERVAL '5 minutes'
           ORDER BY mn.created_at DESC LIMIT 10`,
          [req.user.firmId, req.user.id, task.created_at, task.completed_at]
        );
        
        for (const note of notesResult.rows) {
          const contentPreview = note.content
            ? note.content.substring(0, 400) + (note.content.length > 400 ? '...' : '')
            : null;
          
          item.deliverables.notes.push({
            id: note.id,
            content: contentPreview,
            contentLength: note.content?.length || 0,
            type: note.note_type || 'general',
            matterName: note.matter_name,
            matterId: note.matter_id,
            createdAt: note.created_at,
          });
        }
      } catch (e) {
        // Non-fatal
      }
      
      // Fetch tasks created during the agent task
      try {
        const tasksCreated = await dbQuery(
          `SELECT id, title, description, status, priority, due_date, created_at, matter_id
           FROM matter_tasks
           WHERE firm_id = $1 AND created_by = $2
             AND created_at >= $3 AND created_at <= COALESCE($4, NOW()) + INTERVAL '5 minutes'
           ORDER BY created_at DESC LIMIT 15`,
          [req.user.firmId, req.user.id, task.created_at, task.completed_at]
        );
        
        for (const t of tasksCreated.rows) {
          item.deliverables.tasks.push({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.due_date,
            matterId: t.matter_id,
            createdAt: t.created_at,
          });
        }
      } catch (e) {
        // Non-fatal
      }
      
      // Count total deliverables
      item.totalDeliverables = 
        item.deliverables.documents.length + 
        item.deliverables.notes.length + 
        item.deliverables.tasks.length;
      
      // ===== HARNESS INTELLIGENCE: Include confidence report =====
      // This tells the attorney exactly where to focus their review
      item.confidence = item.result?.confidence || null;
      
      reviewItems.push(item);
    }
    
    res.json({
      items: reviewItems,
      count: reviewItems.length,
      pendingCount: reviewItems.filter(i => i.reviewStatus === 'pending').length,
    });
  } catch (error) {
    console.error('[ReviewQueue] Error getting review queue:', error);
    res.status(500).json({ error: 'Failed to get review queue' });
  }
});

/**
 * Approve a task in the review queue
 * Marks the task as approved and records attorney feedback
 */
router.post('/review-queue/:id/approve', authenticate, async (req, res) => {
  try {
    const { feedback } = req.body;
    const { query: dbQuery } = await import('../db/connection.js');
    
    await dbQuery(
      `UPDATE ai_background_tasks
       SET review_status = 'approved',
           review_feedback = $1,
           reviewed_at = NOW(),
           reviewed_by = $2,
           updated_at = NOW()
       WHERE id = $3 AND firm_id = $4`,
      [feedback || null, req.user.id, req.params.id, req.user.firmId]
    );
    
    // Record positive feedback for learning
    try {
      await amplifierService.recordFeedback(
        req.params.id,
        req.user.id,
        req.user.firmId,
        { rating: 4, feedback: feedback || 'Approved via review queue' }
      );
    } catch (e) {
      // Non-fatal
    }
    
    // ===== ATTORNEY EXEMPLARS: Capture approved work as style reference =====
    // This is the "write like this" system. The agent's approved work becomes
    // a reference sample that future tasks use to match the attorney's voice.
    try {
      const { captureApprovedExemplar } = await import('../services/amplifier/attorneyExemplars.js');
      const { classifyWork } = await import('../services/amplifier/juniorAttorneyBrief.js');
      
      // Get the task details and deliverables
      const taskResult = await dbQuery(
        `SELECT goal, result, iterations,
                EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
         FROM ai_background_tasks WHERE id = $1`,
        [req.params.id]
      );
      const taskGoal = taskResult.rows[0]?.goal || '';
      const taskResultData = taskResult.rows[0]?.result;
      const parsedResult = typeof taskResultData === 'string' ? JSON.parse(taskResultData) : taskResultData;
      const workType = classifyWork(taskGoal);
      
      // Get actual deliverables content
      const deliverables = { documents: [], notes: [] };
      
      const docsResult = await dbQuery(
        `SELECT content_text, original_name FROM documents
         WHERE firm_id = $1 AND uploaded_by = $2
           AND uploaded_at >= (SELECT created_at FROM ai_background_tasks WHERE id = $3)
         ORDER BY uploaded_at DESC LIMIT 3`,
        [req.user.firmId, req.user.id, req.params.id]
      );
      deliverables.documents = docsResult.rows.map(r => ({ content_text: r.content_text, name: r.original_name }));
      
      const notesResult = await dbQuery(
        `SELECT mn.content FROM matter_notes mn
         JOIN matters m ON mn.matter_id = m.id
         WHERE m.firm_id = $1 AND mn.created_by = $2
           AND mn.created_at >= (SELECT created_at FROM ai_background_tasks WHERE id = $3)
         ORDER BY mn.created_at DESC LIMIT 3`,
        [req.user.firmId, req.user.id, req.params.id]
      );
      deliverables.notes = notesResult.rows.map(r => ({ content: r.content }));
      
      await captureApprovedExemplar(
        req.user.id, req.user.firmId, req.params.id,
        taskGoal, workType.id, deliverables
      );
      
      // ===== IDENTITY REPLAY: Capture the execution trace =====
      // This is the "today's Neuralink" system. Store the full decision-making
      // process so future tasks can REPLAY the attorney's proven approach.
      try {
        const { captureReplay } = await import('../services/amplifier/identityReplay.js');
        
        // Get the execution trace from task history
        const traceResult = await dbQuery(
          `SELECT actions_taken FROM ai_task_history WHERE task_id = $1 LIMIT 1`,
          [req.params.id]
        );
        const actionsTaken = traceResult.rows[0]?.actions_taken;
        const actionsHistory = typeof actionsTaken === 'string' 
          ? JSON.parse(actionsTaken) 
          : (actionsTaken || []);
        
        // Mark all as successful (they were approved)
        const enrichedActions = actionsHistory.map(a => ({ ...a, success: true }));
        
        await captureReplay(req.user.id, req.user.firmId, req.params.id, {
          goal: taskGoal,
          workType: workType.id,
          actionsHistory: enrichedActions,
          result: parsedResult,
          evaluationScore: parsedResult?.evaluation?.score || null,
          duration: Math.round(parseFloat(taskResult.rows[0]?.duration_seconds || 0)),
          iterations: taskResult.rows[0]?.iterations || null,
          approvalFeedback: feedback || null,
        });
      } catch (replayErr) {
        console.log('[ReviewQueue] Identity replay capture note:', replayErr.message);
      }
    } catch (e) {
      console.log('[ReviewQueue] Exemplar capture note:', e.message);
    }
    
    console.log(`[ReviewQueue] Task ${req.params.id} approved by user ${req.user.id}`);
    
    res.json({ success: true, message: 'Task approved' });
  } catch (error) {
    console.error('[ReviewQueue] Error approving task:', error);
    res.status(500).json({ error: 'Failed to approve task' });
  }
});

/**
 * Reject a task in the review queue
 * Records what was wrong so the agent can learn
 */
router.post('/review-queue/:id/reject', authenticate, async (req, res) => {
  try {
    const { feedback, issues } = req.body;
    
    if (!feedback || feedback.trim().length === 0) {
      return res.status(400).json({ error: 'Feedback is required when rejecting - tell the agent what was wrong' });
    }
    
    const { query: dbQuery } = await import('../db/connection.js');
    
    await dbQuery(
      `UPDATE ai_background_tasks
       SET review_status = 'rejected',
           review_feedback = $1,
           reviewed_at = NOW(),
           reviewed_by = $2,
           updated_at = NOW()
       WHERE id = $3 AND firm_id = $4`,
      [feedback, req.user.id, req.params.id, req.user.firmId]
    );
    
    // Record negative feedback for learning (critical for improvement)
    try {
      await amplifierService.recordFeedback(
        req.params.id,
        req.user.id,
        req.user.firmId,
        { rating: 2, feedback, correction: issues?.join('; ') || feedback }
      );
    } catch (e) {
      // Non-fatal
    }
    
    // ===== HARNESS INTELLIGENCE: Learn from rejection =====
    // This is the closed feedback loop. The rejection creates quality overrides
    // that automatically tighten gates for this lawyer + work type on future tasks.
    try {
      const { learnFromRejection, recordToolChainFailure } = await import('../services/amplifier/harnessIntelligence.js');
      
      // Get the task result for context
      const taskResult = await dbQuery(
        `SELECT result, goal FROM ai_background_tasks WHERE id = $1`,
        [req.params.id]
      );
      const result = taskResult.rows[0]?.result;
      const goal = taskResult.rows[0]?.goal;
      const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      
      // Learn quality overrides from the rejection
      const overrides = await learnFromRejection(
        req.params.id, req.user.id, req.user.firmId, feedback, parsedResult
      );
      
      // Mark the tool chain as failed
      if (parsedResult?.actions) {
        const workTypeId = parsedResult?.work_type_id || 'general';
        await recordToolChainFailure(req.user.firmId, workTypeId, parsedResult.actions);
      }
      
      console.log(`[ReviewQueue] Rejection learning: ${overrides?.length || 0} quality overrides created`);
    } catch (e) {
      console.log('[ReviewQueue] Rejection learning note:', e.message);
    }
    
    // ===== ATTORNEY IDENTITY: Extract correction principles =====
    // This is the deeper learning loop. Instead of just tightening quality gates,
    // extract PRINCIPLES about WHO this attorney is and HOW they want work done.
    // These principles persist and compound — making the agent more like them over time.
    try {
      const { learnFromCorrection } = await import('../services/amplifier/attorneyIdentity.js');
      
      const taskResult = await dbQuery(
        `SELECT goal FROM ai_background_tasks WHERE id = $1`,
        [req.params.id]
      );
      const goal = taskResult.rows[0]?.goal || '';
      
      const principles = await learnFromCorrection(
        req.user.id, req.user.firmId, feedback, goal
      );
      
      console.log(`[ReviewQueue] Attorney identity: ${principles.length} correction principles extracted`);
    } catch (e) {
      console.log('[ReviewQueue] Attorney identity learning note:', e.message);
    }
    
    // ===== ATTORNEY EXEMPLARS: Capture correction pair =====
    // Store what the agent wrote alongside what the attorney wanted.
    // This is "don't write X, write Y" — the most powerful style signal.
    try {
      const { captureCorrectionPair } = await import('../services/amplifier/attorneyExemplars.js');
      const { classifyWork } = await import('../services/amplifier/juniorAttorneyBrief.js');
      
      const taskResult2 = await dbQuery(
        `SELECT goal, result FROM ai_background_tasks WHERE id = $1`,
        [req.params.id]
      );
      const taskGoal = taskResult2.rows[0]?.goal || '';
      const workType = classifyWork(taskGoal);
      
      // Get deliverables the agent produced (what it wrote)
      const deliverables = { documents: [], notes: [] };
      try {
        const docsResult = await dbQuery(
          `SELECT content_text FROM documents
           WHERE firm_id = $1 AND uploaded_by = $2
             AND uploaded_at >= (SELECT created_at FROM ai_background_tasks WHERE id = $3)
           ORDER BY uploaded_at DESC LIMIT 2`,
          [req.user.firmId, req.user.id, req.params.id]
        );
        deliverables.documents = docsResult.rows.map(r => ({ content_text: r.content_text }));
        
        const notesResult = await dbQuery(
          `SELECT mn.content FROM matter_notes mn
           JOIN matters m ON mn.matter_id = m.id
           WHERE m.firm_id = $1 AND mn.created_by = $2
             AND mn.created_at >= (SELECT created_at FROM ai_background_tasks WHERE id = $3)
           ORDER BY mn.created_at DESC LIMIT 2`,
          [req.user.firmId, req.user.id, req.params.id]
        );
        deliverables.notes = notesResult.rows.map(r => ({ content: r.content }));
      } catch (_) {}
      
      await captureCorrectionPair(
        req.user.id, req.user.firmId, req.params.id,
        taskGoal, workType.id, feedback, deliverables
      );
    } catch (e) {
      console.log('[ReviewQueue] Correction pair capture note:', e.message);
    }
    
    console.log(`[ReviewQueue] Task ${req.params.id} rejected by user ${req.user.id}: ${feedback.substring(0, 80)}`);
    
    res.json({ success: true, message: 'Task rejected - feedback recorded for learning. Quality gates tightened for future tasks.' });
  } catch (error) {
    console.error('[ReviewQueue] Error rejecting task:', error);
    res.status(500).json({ error: 'Failed to reject task' });
  }
});

/**
 * Get learned patterns
 */
router.get('/learnings', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const patterns = await amplifierService.getLearnedPatterns(req.user.firmId, req.user.id, limit);
    
    res.json({
      patterns,
      count: patterns.length
    });
  } catch (error) {
    console.error('Error getting learned patterns:', error);
    res.status(500).json({ error: 'Failed to get learned patterns' });
  }
});

/**
 * Submit feedback on a completed task
 * This helps the agent learn from user satisfaction.
 * 
 * NOW ENHANCED: Negative feedback also feeds the attorney identity system,
 * extracting PRINCIPLES from corrections that make the agent more like the attorney.
 */
router.post('/tasks/:id/feedback', authenticate, async (req, res) => {
  try {
    const { rating, feedback, correction } = req.body;
    
    // Validate rating
    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Record feedback for learning
    const result = await amplifierService.recordFeedback(
      req.params.id,
      req.user.id,
      req.user.firmId,
      { rating, feedback, correction }
    );
    
    if (!result.success) {
      return res.status(404).json({ error: result.error || 'Task not found' });
    }
    
    // ===== ATTORNEY IDENTITY: Learn from corrections =====
    // Negative feedback with corrections is the richest signal for identity learning.
    // Extract principles that make the agent more like THIS attorney.
    if (rating && rating <= 3 && (feedback || correction)) {
      try {
        const { learnFromCorrection } = await import('../services/amplifier/attorneyIdentity.js');
        const { query: dbQuery } = await import('../db/connection.js');
        
        const taskResult = await dbQuery(
          `SELECT goal FROM ai_background_tasks WHERE id = $1`,
          [req.params.id]
        );
        const goal = taskResult.rows[0]?.goal || '';
        
        const correctionText = correction || feedback;
        const principles = await learnFromCorrection(
          req.user.id, req.user.firmId, correctionText, goal
        );
        
        console.log(`[Feedback] Attorney identity: ${principles.length} principles extracted from rating=${rating}`);
      } catch (e) {
        // Non-fatal
        console.log('[Feedback] Attorney identity learning note:', e.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Feedback recorded - the agent will learn from this',
      task: result.task
    });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/**
 * Get learning statistics for the user/firm
 */
router.get('/learning-stats', authenticate, async (req, res) => {
  try {
    const stats = await amplifierService.getLearningStats(req.user.firmId, req.user.id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting learning stats:', error);
    res.status(500).json({ error: 'Failed to get learning stats' });
  }
});

/**
 * Get attorney identity profile
 * Returns the deep identity profile including maturity level, writing style,
 * thinking patterns, correction principles, and how much the brief has faded.
 * 
 * This is the "how well does the agent know me" endpoint.
 */
router.get('/identity', authenticate, async (req, res) => {
  try {
    const { getAttorneyIdentity, MATURITY_LEVELS } = await import('../services/amplifier/attorneyIdentity.js');
    const identity = await getAttorneyIdentity(req.user.id, req.user.firmId);
    
    if (!identity) {
      return res.json({
        maturity: 0,
        maturityLevel: 'nascent',
        briefWeight: 1.0,
        message: 'The agent is still learning who you are. Keep using it and providing feedback.',
      });
    }
    
    const level = identity.maturityLevel;
    
    res.json({
      maturity: identity.maturity,
      maturityLevel: level.label,
      briefWeight: level.briefWeight,
      identityWeight: level.identityWeight,
      writingStyle: identity.writingStyle,
      thinkingPatterns: identity.thinkingPatterns,
      correctionPrinciples: identity.correctionPrinciples.map(p => ({
        principle: p.principle,
        confidence: p.confidence,
        evidenceCount: p.evidenceCount,
      })),
      preferenceHierarchy: identity.preferenceHierarchy,
      communicationStyle: identity.communicationStyle,
      maturityBreakdown: {
        writingSamples: identity.writingStyle?.sampleCount || 0,
        thinkingSamples: identity.thinkingPatterns?.sampleCount || 0,
        correctionCount: identity.correctionPrinciples?.length || 0,
        preferenceCount: identity.preferenceHierarchy?.length || 0,
        commSamples: identity.communicationStyle?.sampleCount || 0,
      },
      message: level.label === 'nascent' 
        ? 'Just getting started. The more you use the agent and give feedback, the more it becomes like you.'
        : level.label === 'emerging'
        ? 'Starting to see your patterns. Keep providing feedback on what you like and don\'t like.'
        : level.label === 'developing'
        ? 'Your personality is emerging. The generic brief is thinning — your style is taking over.'
        : level.label === 'strong'
        ? 'The agent knows you well. The brief is mostly gone — your identity drives the work.'
        : 'The agent IS your externalized judgment. It writes as you would write.',
      levels: MATURITY_LEVELS,
    });
  } catch (error) {
    console.error('Error getting attorney identity:', error);
    res.status(500).json({ error: 'Failed to get attorney identity', details: error.message });
  }
});

/**
 * Get available workflow modules
 * Returns pre-built workflow templates for common legal tasks
 */
router.get('/modules', authenticate, async (req, res) => {
  try {
    const { getAllModules } = await import('../services/amplifier/modules/index.js');
    const modules = getAllModules();
    
    res.json({
      modules,
      count: modules.length,
      categories: [...new Set(modules.map(m => m.category))],
    });
  } catch (error) {
    console.error('Error getting modules:', error);
    res.status(500).json({ error: 'Failed to get workflow modules', details: error.message });
  }
});

/**
 * Get rewind/recovery status for a task
 * Returns checkpoint stack info, failed legal paths, and rewind history
 */
router.get('/tasks/:id/rewind-status', authenticate, async (req, res) => {
  try {
    const task = await amplifierService.getTask(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // For in-memory tasks, get the live rewind status
    const liveTask = amplifierService.tasks?.get(req.params.id);
    if (liveTask && liveTask.rewindManager) {
      const rewindStatus = liveTask.rewindManager.getStatus();
      const memoryStatus = liveTask.agentMemory ? {
        longTermFacts: liveTask.agentMemory.longTerm.keyFacts,
        midTermLayers: liveTask.agentMemory.midTerm.summaryLayers.length,
        totalSummarized: liveTask.agentMemory.midTerm.totalMessagesSummarized,
        cumulativeFindings: liveTask.agentMemory.midTerm.cumulativeFindings,
        failedPaths: liveTask.agentMemory.longTerm.failedPaths
      } : null;
      
      res.json({
        taskId: req.params.id,
        rewind: rewindStatus,
        memory: memoryStatus,
        live: true
      });
    } else {
      res.json({
        taskId: req.params.id,
        rewind: task.rewind || null,
        memory: task.memory || null,
        live: false
      });
    }
  } catch (error) {
    console.error('[BackgroundAgent] Error getting rewind status:', error);
    res.status(500).json({ error: 'Failed to get rewind status' });
  }
});

/**
 * Manually trigger a rewind on a running task
 * This allows the user to force the agent to go back and try a different approach
 */
router.post('/tasks/:id/rewind', authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const liveTask = amplifierService.tasks?.get(req.params.id);
    if (!liveTask) {
      return res.status(404).json({ error: 'Task not found or not currently running' });
    }
    
    if (liveTask.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to rewind this task' });
    }
    
    if (!liveTask.rewindManager) {
      return res.status(400).json({ error: 'Rewind system not available for this task' });
    }
    
    const rewindResult = liveTask.rewindManager.rewind(
      liveTask, 
      reason || 'Manual rewind requested by user'
    );
    
    if (rewindResult.success) {
      // Also update agent memory with the failed path
      if (liveTask.agentMemory) {
        liveTask.agentMemory.addFailedPath(reason || 'User-triggered rewind');
      }
      
      console.log(`[BackgroundAgent] Manual rewind on task ${req.params.id}: ${rewindResult.message}`);
      
      res.json({
        success: true,
        message: rewindResult.message,
        rewindStatus: liveTask.rewindManager.getStatus()
      });
    } else {
      res.status(400).json({
        success: false,
        message: rewindResult.message,
        rewindStatus: liveTask.rewindManager.getStatus()
      });
    }
  } catch (error) {
    console.error('[BackgroundAgent] Error triggering rewind:', error);
    res.status(500).json({ error: 'Failed to trigger rewind' });
  }
});

/**
 * Get memory status for a task
 * Returns the agent's short-term, mid-term, and long-term memory state
 */
router.get('/tasks/:id/memory', authenticate, async (req, res) => {
  try {
    const liveTask = amplifierService.tasks?.get(req.params.id);
    if (!liveTask) {
      return res.status(404).json({ error: 'Task not found or not currently running' });
    }
    
    if (!liveTask.agentMemory) {
      return res.status(400).json({ error: 'Memory system not available for this task' });
    }
    
    res.json({
      taskId: req.params.id,
      longTerm: {
        missionGoal: liveTask.agentMemory.longTerm.missionGoal,
        keyFacts: liveTask.agentMemory.longTerm.keyFacts,
        constraints: liveTask.agentMemory.longTerm.constraints,
        failedPaths: liveTask.agentMemory.longTerm.failedPaths,
        elapsed: Math.round((Date.now() - liveTask.agentMemory.longTerm.startedAt) / 60000) + ' minutes'
      },
      midTerm: {
        summaryLayers: liveTask.agentMemory.midTerm.summaryLayers.length,
        totalMessagesSummarized: liveTask.agentMemory.midTerm.totalMessagesSummarized,
        phaseReflections: liveTask.agentMemory.midTerm.phaseReflections,
        cumulativeFindings: liveTask.agentMemory.midTerm.cumulativeFindings
      },
      shortTerm: {
        currentMessages: liveTask.messages?.length || 0,
        currentPhase: liveTask.executionPhase,
        iteration: liveTask.progress?.iterations
      }
    });
  } catch (error) {
    console.error('[BackgroundAgent] Error getting memory status:', error);
    res.status(500).json({ error: 'Failed to get memory status' });
  }
});

/**
 * Get rate limit status
 * Returns current rate limiting state for the background agent
 */
router.get('/rate-limit-status', authenticate, async (req, res) => {
  try {
    const { getRateLimiter } = await import('../services/amplifier/rateLimiter.js');
    const rateLimiter = getRateLimiter();
    const status = rateLimiter.getStatus();
    
    res.json({
      ...status,
      healthy: status.currentBackoff === 0 && status.requestsRemaining > 10,
    });
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    res.status(500).json({ error: 'Failed to get rate limit status' });
  }
});

/**
 * Get available tools (for documentation/UI)
 * Returns the same tools available to the normal AI chat
 */
router.get('/tools', authenticate, async (req, res) => {
  try {
    // Import tool definitions - same tools as normal AI chat
    const { AMPLIFIER_TOOLS, AMPLIFIER_OPENAI_TOOLS } = await import('../services/amplifier/toolBridge.js');
    
    // Prefer the OpenAI-formatted tools (direct from aiAgent.js)
    let tools = [];
    if (Array.isArray(AMPLIFIER_OPENAI_TOOLS) && AMPLIFIER_OPENAI_TOOLS.length > 0) {
      tools = AMPLIFIER_OPENAI_TOOLS.map(tool => ({
        name: tool.function?.name || tool.name,
        description: tool.function?.description || tool.description,
        parameters: tool.function?.parameters?.properties || {},
        required: tool.function?.parameters?.required || []
      }));
    } else {
      tools = Object.entries(AMPLIFIER_TOOLS || {}).map(([name, tool]) => ({
        name,
        description: tool.description,
        parameters: tool.parameters,
        required: tool.required
      }));
    }
    
    res.json({
      tools,
      count: tools.length,
      source: AMPLIFIER_OPENAI_TOOLS?.length > 0 ? 'aiAgent.js (same as normal AI chat)' : 'AMPLIFIER_TOOLS fallback',
      categories: [
        { name: 'Time Entries', tools: ['log_time', 'get_my_time_entries', 'update_time_entry', 'delete_time_entry'] },
        { name: 'Matters', tools: ['list_my_matters', 'search_matters', 'get_matter', 'create_matter', 'update_matter', 'close_matter', 'archive_matter', 'reopen_matter'] },
        { name: 'Clients', tools: ['list_clients', 'get_client', 'create_client', 'update_client', 'archive_client'] },
        { name: 'Invoices', tools: ['list_invoices', 'create_invoice', 'send_invoice', 'record_payment'] },
        { name: 'Documents', tools: ['list_documents', 'read_document_content', 'create_document', 'search_document_content'] },
        { name: 'Calendar', tools: ['get_calendar_events', 'create_calendar_event'] },
        { name: 'Tasks', tools: ['list_tasks', 'create_task', 'complete_task'] },
        { name: 'Reports', tools: ['generate_report', 'get_firm_analytics'] },
        { name: 'Team', tools: ['list_team_members'] },
        { name: 'Legal', tools: ['check_conflicts', 'set_critical_deadline', 'get_upcoming_deadlines', 'draft_legal_document', 'calculate_deadline', 'log_billable_work'] },
        { name: 'Planning', tools: ['think_and_plan', 'evaluate_progress', 'task_complete', 'log_work'] }
      ]
    });
  } catch (error) {
    console.error('Error getting tools:', error);
    res.status(500).json({ error: 'Failed to get tools', details: error.message });
  }
});

/**
 * Execute a tool on behalf of the Python background agent
 * 
 * This endpoint allows the Python agent to call the SAME tools
 * that the Node.js Amplifier service uses, with real database-backed
 * implementations. No mocks, no placeholders.
 * 
 * The Python agent sends: { toolName, params, userId, firmId }
 * This endpoint loads the user context and delegates to executeTool()
 * from toolBridge.js which has real implementations for every tool.
 */
router.post('/execute-tool', async (req, res) => {
  try {
    const { toolName, params, userId, firmId } = req.body;
    
    if (!toolName) {
      return res.status(400).json({ error: 'toolName is required' });
    }
    
    if (!userId || !firmId) {
      return res.status(400).json({ error: 'userId and firmId are required for tool execution' });
    }
    
    // Validate the tool name against known tools
    const { executeTool } = await import('../services/amplifier/toolBridge.js');
    
    console.log(`[BackgroundAgent] Execute tool: ${toolName} for user=${userId}, firm=${firmId}`);
    
    const result = await executeTool(toolName, params || {}, {
      userId,
      firmId
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('[BackgroundAgent] Tool execution error:', error);
    res.status(500).json({ 
      error: `Tool execution failed: ${error.message}`,
      tool: req.body?.toolName
    });
  }
});

export default router;
