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

// Connection tracking for resilience
const connectionRetries = new Map(); // taskId -> retry count
const MAX_CONNECTION_RETRIES = 5;
const RETRY_BACKOFF_BASE_MS = 1000;

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
    
    // Get user from database with retry for transient failures
    let result;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        result = await query(
          `SELECT id, email, first_name, last_name, role, firm_id, is_active
           FROM users WHERE id = $1`,
          [decoded.userId]
        );
        break;
      } catch (dbError) {
        attempts++;
        if (attempts === maxAttempts) throw dbError;
        await new Promise(r => setTimeout(r, 100 * attempts));
      }
    }
    
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
const taskMetadata = new Map();  // taskId -> { startTime, lastEventTime, status }

const MAX_HISTORY = 500;
const HEARTBEAT_INTERVAL = 15000; // 15 seconds for more responsive connections
const STALE_HISTORY_MS = 3600000; // Clean up history after 1 hour

// Periodic cleanup of stale event history to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [taskId, metadata] of taskMetadata.entries()) {
    if (metadata.status === 'completed' || metadata.status === 'failed') {
      if (now - metadata.lastEventTime > STALE_HISTORY_MS) {
        eventHistory.delete(taskId);
        progressState.delete(taskId);
        taskMetadata.delete(taskId);
        console.log(`[AgentStream] Cleaned up stale history for task ${taskId}`);
      }
    }
  }
}, 300000); // Run every 5 minutes

/**
 * SSE endpoint for streaming agent events
 * Clients connect here to receive real-time updates
 */
router.get('/:taskId', authenticateSSE, (req, res) => {
  const { taskId } = req.params;
  const reconnectId = req.query.reconnectId; // Optional reconnection tracking
  
  console.log(`[AgentStream] Client connected for task ${taskId} (user: ${req.user.id})${reconnectId ? ` [reconnect: ${reconnectId}]` : ''}`);
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Prevent timeout
  req.setTimeout(0);
  res.setTimeout(0);
  
  // Flush headers immediately
  res.flushHeaders();
  
  // Add to active streams
  if (!activeStreams.has(taskId)) {
    activeStreams.set(taskId, new Set());
  }
  activeStreams.get(taskId).add(res);
  
  // Track connection count for this task
  const connectionCount = activeStreams.get(taskId).size;
  
  // Send initial connection event with metadata
  sendSSE(res, 'connected', {
    taskId,
    timestamp: new Date().toISOString(),
    message: 'Connected to agent stream',
    connectionId: `${taskId}-${Date.now()}`,
    connectionCount,
    serverTime: Date.now()
  });
  
  // Send current progress if available
  const progress = progressState.get(taskId);
  if (progress) {
    sendSSE(res, 'progress', progress);
  }
  
  // Send recent history for reconnection - more events if reconnecting
  const history = eventHistory.get(taskId) || [];
  const historyLimit = reconnectId ? 100 : 50;
  if (history.length > 0) {
    sendSSE(res, 'history', { 
      events: history.slice(-historyLimit),
      totalEvents: history.length,
      isReconnection: !!reconnectId
    });
  }
  
  // Heartbeat to keep connection alive with progress check
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      try {
        const currentProgress = progressState.get(taskId);
        sendSSE(res, 'heartbeat', { 
          timestamp: new Date().toISOString(),
          serverTime: Date.now(),
          hasProgress: !!currentProgress,
          status: currentProgress?.status || 'unknown'
        });
      } catch (e) {
        console.error(`[AgentStream] Heartbeat error for ${taskId}:`, e.message);
        clearInterval(heartbeat);
      }
    } else {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_INTERVAL);
  
  // Handle errors
  res.on('error', (err) => {
    console.error(`[AgentStream] Response error for task ${taskId}:`, err.message);
    clearInterval(heartbeat);
    cleanupConnection(taskId, res);
  });
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`[AgentStream] Client disconnected from task ${taskId}`);
    clearInterval(heartbeat);
    cleanupConnection(taskId, res);
  });
  
  req.on('error', (err) => {
    console.error(`[AgentStream] Request error for task ${taskId}:`, err.message);
    clearInterval(heartbeat);
    cleanupConnection(taskId, res);
  });
});

/**
 * Clean up a connection
 */
function cleanupConnection(taskId, res) {
  const streams = activeStreams.get(taskId);
  if (streams) {
    streams.delete(res);
    if (streams.size === 0) {
      activeStreams.delete(taskId);
    }
  }
}

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
 * Send an SSE event to a client with error handling
 */
function sendSSE(res, eventType, data) {
  if (res.writableEnded || res.destroyed) return false;
  
  try {
    const payload = JSON.stringify(data);
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${payload}\n\n`);
    return true;
  } catch (e) {
    console.error('[AgentStream] Error sending SSE:', e.message);
    return false;
  }
}

/**
 * Broadcast an event to all connected clients for a task
 * Returns the number of successful sends
 */
function broadcastEvent(taskId, eventType, data) {
  const streams = activeStreams.get(taskId);
  if (!streams || streams.size === 0) return 0;
  
  let successCount = 0;
  const failedStreams = [];
  
  for (const res of streams) {
    if (sendSSE(res, eventType, data)) {
      successCount++;
    } else {
      failedStreams.push(res);
    }
  }
  
  // Clean up failed streams
  for (const res of failedStreams) {
    streams.delete(res);
  }
  
  if (streams.size === 0) {
    activeStreams.delete(taskId);
  }
  
  return successCount;
}

/**
 * Manually push an event (for use from other routes)
 * Thread-safe and handles edge cases
 */
export function pushAgentEvent(taskId, eventType, data) {
  if (!taskId) return;
  
  const timestamp = new Date().toISOString();
  const eventData = {
    type: eventType,
    ...data,
    timestamp
  };
  
  // Store in history
  if (!eventHistory.has(taskId)) {
    eventHistory.set(taskId, []);
  }
  const history = eventHistory.get(taskId);
  history.push(eventData);
  
  // Trim history if too large
  if (history.length > MAX_HISTORY) {
    eventHistory.set(taskId, history.slice(-MAX_HISTORY));
  }
  
  // Update metadata
  taskMetadata.set(taskId, {
    ...taskMetadata.get(taskId),
    lastEventTime: Date.now()
  });
  
  // Broadcast
  broadcastEvent(taskId, 'event', eventData);
}

/**
 * Update progress for a task
 * Includes status tracking for cleanup
 */
export function updateAgentProgress(taskId, progress) {
  if (!taskId) return;
  
  const progressWithTimestamp = {
    ...progress,
    lastUpdate: Date.now()
  };
  
  progressState.set(taskId, progressWithTimestamp);
  
  // Update metadata with status
  taskMetadata.set(taskId, {
    ...taskMetadata.get(taskId),
    lastEventTime: Date.now(),
    status: progress.status
  });
  
  broadcastEvent(taskId, 'progress', progressWithTimestamp);
}

/**
 * Mark a task as complete (for cleanup tracking)
 */
export function markTaskComplete(taskId, status = 'completed') {
  if (!taskId) return;
  
  taskMetadata.set(taskId, {
    ...taskMetadata.get(taskId),
    lastEventTime: Date.now(),
    status
  });
  
  // Broadcast completion event
  broadcastEvent(taskId, 'task_complete', {
    taskId,
    status,
    timestamp: new Date().toISOString()
  });
}

export default router;
