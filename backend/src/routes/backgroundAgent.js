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
    
    // If not available, try to configure
    let configured = amplifierService.configured;
    if (available && !configured) {
      configured = await amplifierService.configure();
    }
    
    console.log(`[BackgroundAgent] Status check: available=${available}, configured=${configured}, user=${req.user.id}`);
    
    // Get tool count for debugging
    let toolCount = 0;
    try {
      const { AMPLIFIER_OPENAI_TOOLS } = await import('../services/amplifier/toolBridge.js');
      toolCount = AMPLIFIER_OPENAI_TOOLS?.length || 0;
    } catch (e) {
      console.error('[BackgroundAgent] Failed to get tool count:', e.message);
    }
    
    res.json({
      available,
      configured,
      provider: 'amplifier',
      aiProvider: 'azure-openai',
      toolCount,
      // More descriptive message for debugging
      message: available && configured
        ? `Background agent is ready - ${toolCount} tools available for autonomous task execution`
        : !available
        ? 'Background agent unavailable - Azure OpenAI credentials not configured (check AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT)'
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
 * Start a new background task
 * This begins AUTONOMOUS execution of the task without human intervention
 */
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { goal, options = {} } = req.body;
    
    console.log(`[BackgroundAgent] Task start request from user ${req.user.id}: ${goal?.substring(0, 100)}`);
    
    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Goal is required and must be a non-empty string' 
      });
    }
    
    // Check if service is available (Azure OpenAI credentials are set)
    const available = await amplifierService.checkAvailability();
    if (!available) {
      console.error('[BackgroundAgent] Service not available - Azure OpenAI not configured');
      return res.status(503).json({ 
        error: 'Background agent is not available',
        details: 'Azure OpenAI credentials are not configured. Please set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT environment variables.'
      });
    }
    
    // Configure service if not already done
    if (!amplifierService.configured) {
      console.log('[BackgroundAgent] Configuring service...');
      const configured = await amplifierService.configure();
      if (!configured) {
        console.error('[BackgroundAgent] Failed to configure service');
        return res.status(503).json({ 
          error: 'Background agent could not be configured',
          details: 'Failed to initialize Azure OpenAI connection. Check your credentials.'
        });
      }
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
    console.log(`[BackgroundAgent] Starting autonomous task for user ${req.user.id}`);
    const task = await amplifierService.startTask(
      req.user.id,
      req.user.firmId,
      goal.trim(),
      options
    );
    
    console.log(`[BackgroundAgent] Task ${task.id} started successfully`);
    
    res.status(201).json({
      success: true,
      task,
      message: 'Background task started - working autonomously'
    });
    
  } catch (error) {
    console.error('[BackgroundAgent] Error starting task:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start background task',
      details: 'An unexpected error occurred while starting the background task'
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
 * This helps the agent learn from user satisfaction
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

export default router;
