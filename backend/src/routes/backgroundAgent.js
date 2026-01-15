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
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const available = await amplifierService.checkAvailability();
    const configured = amplifierService.configured;
    
    res.json({
      available,
      configured,
      provider: 'amplifier',
      aiProvider: 'azure-openai',
      message: available 
        ? 'Background agent is ready' 
        : 'Background agent is not available - Amplifier CLI may not be installed'
    });
  } catch (error) {
    console.error('Error checking background agent status:', error);
    res.status(500).json({ error: 'Failed to check background agent status' });
  }
});

/**
 * Start a new background task
 */
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { goal, options = {} } = req.body;
    
    if (!goal || typeof goal !== 'string' || goal.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Goal is required and must be a non-empty string' 
      });
    }
    
    // Check if service is available
    const available = await amplifierService.checkAvailability();
    if (!available) {
      return res.status(503).json({ 
        error: 'Background agent is not available',
        details: 'Amplifier CLI is not installed or configured'
      });
    }
    
    // Configure if not already done
    if (!amplifierService.configured) {
      const configured = await amplifierService.configure();
      if (!configured) {
        return res.status(503).json({ 
          error: 'Background agent could not be configured',
          details: 'Check Azure OpenAI credentials'
        });
      }
    }
    
    // Check for existing active task
    const existingTask = amplifierService.getActiveTask(req.user.id);
    if (existingTask) {
      return res.status(409).json({ 
        error: 'You already have an active background task',
        activeTask: existingTask
      });
    }
    
    // Start the task
    const task = await amplifierService.startTask(
      req.user.id,
      req.user.firmId,
      goal.trim(),
      options
    );
    
    res.status(201).json({
      success: true,
      task,
      message: 'Background task started'
    });
    
  } catch (error) {
    console.error('Error starting background task:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to start background task' 
    });
  }
});

/**
 * Get all tasks for current user
 */
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const tasks = amplifierService.getUserTasks(req.user.id, limit);
    
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
    const task = amplifierService.getActiveTask(req.user.id);
    
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
    const task = amplifierService.getTask(req.params.id);
    
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
    
    const task = amplifierService.getTask(req.params.id);
    
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
 */
router.get('/tools', authenticate, async (req, res) => {
  try {
    // Import tool definitions
    const { AMPLIFIER_TOOLS } = await import('../services/amplifier/toolBridge.js');
    
    const tools = Object.entries(AMPLIFIER_TOOLS).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
      required: tool.required
    }));
    
    res.json({
      tools,
      count: tools.length,
      categories: [
        { name: 'Time Entries', tools: ['log_time', 'get_my_time_entries'] },
        { name: 'Matters', tools: ['list_my_matters', 'search_matters', 'get_matter', 'create_matter', 'update_matter', 'close_matter'] },
        { name: 'Clients', tools: ['list_clients', 'get_client', 'create_client', 'update_client'] },
        { name: 'Invoices', tools: ['list_invoices', 'create_invoice', 'send_invoice', 'record_payment'] },
        { name: 'Documents', tools: ['list_documents', 'read_document_content', 'create_document', 'search_document_content'] },
        { name: 'Calendar', tools: ['get_calendar_events', 'create_calendar_event'] },
        { name: 'Tasks', tools: ['list_tasks', 'create_task', 'complete_task'] },
        { name: 'Reports', tools: ['generate_report', 'get_firm_analytics'] },
        { name: 'Team', tools: ['list_team_members'] },
        { name: 'Planning', tools: ['think_and_plan', 'evaluate_progress', 'task_complete', 'log_work'] }
      ]
    });
  } catch (error) {
    console.error('Error getting tools:', error);
    res.status(500).json({ error: 'Failed to get tools' });
  }
});

export default router;
