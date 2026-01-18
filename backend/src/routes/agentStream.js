/**
 * Agent Stream - Server-Sent Events for Real-time Agent Updates
 * 
 * This provides a "Glass Cockpit" view of agent activity, similar to
 * the Cursor IDE Agent pane. Clients connect via SSE and receive
 * real-time updates as the agent works.
 * 
 * Endpoints:
 * - GET /api/v1/agent-stream/:taskId - SSE stream for a task
 * - POST /api/v1/background-agent/stream/:taskId/events - Receive events from Python agent
 * - GET /api/v1/agent-stream/:taskId/history - Get event history for reconnection
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { verifyAccessToken } from '../utils/auth.js';
import { query } from '../db/connection.js';

const router = Router();

/**
 * Middleware for SSE that supports token in query param
 * (SSE doesn't allow setting headers, so we accept token in URL)
 */
async function authenticateSSE(req, res, next) {
  try {
    // Try header first, then query param
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Get user from database
    const result = await query(
      `SELECT id, email, first_name, last_name, role, firm_id, is_active
       FROM users WHERE id = $1`,
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      firmId: user.firm_id
    };
    
    next();
  } catch (error) {
    console.error('[AgentStream] Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// In-memory storage for active streams and events
// In production, use Redis for multi-instance support
const activeStreams = new Map(); // taskId -> Set of response objects
const eventHistory = new Map();  // taskId -> Array of events
const progressState = new Map(); // taskId -> current progress

const MAX_HISTORY = 500;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

/**
 * SSE endpoint for streaming agent events
 * Clients connect here to receive real-time updates
 */
router.get('/:taskId', authenticateSSE, (req, res) => {
  const { taskId } = req.params;
  
  console.log(`[AgentStream] Client connected for task ${taskId} (user: ${req.user.id})`);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Prevent timeout
  req.setTimeout(0);
  
  // Add to active streams
  if (!activeStreams.has(taskId)) {
    activeStreams.set(taskId, new Set());
  }
  activeStreams.get(taskId).add(res);
  
  // Send initial connection event
  sendSSE(res, 'connected', {
    taskId,
    timestamp: new Date().toISOString(),
    message: 'Connected to agent stream'
  });
  
  // Send current progress if available
  const progress = progressState.get(taskId);
  if (progress) {
    sendSSE(res, 'progress', progress);
  }
  
  // Send recent history for reconnection
  const history = eventHistory.get(taskId) || [];
  if (history.length > 0) {
    sendSSE(res, 'history', { events: history.slice(-50) });
  }
  
  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      sendSSE(res, 'heartbeat', { timestamp: new Date().toISOString() });
    }
  }, HEARTBEAT_INTERVAL);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`[AgentStream] Client disconnected from task ${taskId}`);
    clearInterval(heartbeat);
    
    const streams = activeStreams.get(taskId);
    if (streams) {
      streams.delete(res);
      if (streams.size === 0) {
        activeStreams.delete(taskId);
      }
    }
  });
});

/**
 * Receive events from the Python agent
 * The Python EventEmitter POSTs events here
 */
router.post('/:taskId/events', (req, res) => {
  const { taskId } = req.params;
  const { events, progress } = req.body;
  
  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Events array required' });
  }
  
  // Store events in history
  if (!eventHistory.has(taskId)) {
    eventHistory.set(taskId, []);
  }
  const history = eventHistory.get(taskId);
  
  for (const event of events) {
    history.push(event);
    
    // Broadcast to connected clients
    broadcastEvent(taskId, 'event', event);
  }
  
  // Trim history
  if (history.length > MAX_HISTORY) {
    eventHistory.set(taskId, history.slice(-MAX_HISTORY));
  }
  
  // Update progress state
  if (progress) {
    progressState.set(taskId, progress);
    broadcastEvent(taskId, 'progress', progress);
  }
  
  res.json({ 
    success: true, 
    received: events.length,
    listeners: activeStreams.get(taskId)?.size || 0
  });
});

/**
 * Get event history for a task
 * Useful for reconnection or loading past events
 */
router.get('/:taskId/history', authenticate, (req, res) => {
  const { taskId } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  
  const history = eventHistory.get(taskId) || [];
  const progress = progressState.get(taskId);
  
  res.json({
    taskId,
    events: history.slice(-limit),
    progress,
    total: history.length
  });
});

/**
 * Clear history for a task (cleanup)
 */
router.delete('/:taskId/history', authenticate, (req, res) => {
  const { taskId } = req.params;
  
  eventHistory.delete(taskId);
  progressState.delete(taskId);
  
  res.json({ success: true, message: 'History cleared' });
});

/**
 * Get list of active streams (for debugging)
 */
router.get('/debug/active', authenticate, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  
  const active = {};
  for (const [taskId, streams] of activeStreams.entries()) {
    active[taskId] = streams.size;
  }
  
  res.json({
    activeStreams: active,
    totalTasks: activeStreams.size,
    totalConnections: Object.values(active).reduce((a, b) => a + b, 0)
  });
});

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Send an SSE event to a client
 */
function sendSSE(res, eventType, data) {
  if (res.writableEnded) return;
  
  try {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    console.error('[AgentStream] Error sending SSE:', e.message);
  }
}

/**
 * Broadcast an event to all connected clients for a task
 */
function broadcastEvent(taskId, eventType, data) {
  const streams = activeStreams.get(taskId);
  if (!streams || streams.size === 0) return;
  
  for (const res of streams) {
    sendSSE(res, eventType, data);
  }
}

/**
 * Manually push an event (for use from other routes)
 */
export function pushAgentEvent(taskId, eventType, data) {
  // Store in history
  if (!eventHistory.has(taskId)) {
    eventHistory.set(taskId, []);
  }
  eventHistory.get(taskId).push({
    type: eventType,
    ...data,
    timestamp: new Date().toISOString()
  });
  
  // Broadcast
  broadcastEvent(taskId, 'event', { type: eventType, ...data });
}

/**
 * Update progress for a task
 */
export function updateAgentProgress(taskId, progress) {
  progressState.set(taskId, progress);
  broadcastEvent(taskId, 'progress', progress);
}

export default router;
