/**
 * Server-Sent Events (SSE) endpoint for real-time updates
 * 
 * Clients connect to GET /api/events/stream and receive events as they happen.
 * Each user gets their own stream, scoped to their firm.
 * 
 * Event types:
 * - notification.new       - New notification for the user
 * - document.updated       - A document was modified
 * - document.uploaded      - A new document was uploaded
 * - matter.updated         - A matter was modified
 * - matter.created         - A new matter was created
 * - time_entry.created     - A time entry was logged
 * - invoice.created        - An invoice was created
 * - invoice.paid           - An invoice was paid
 * - calendar.updated       - A calendar event changed
 * - user.joined            - A new team member joined
 * - heartbeat              - Keep-alive ping (every 30s)
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { registerConnection, getConnectionStats } from '../services/eventBus.js';

const router = Router();

// SSE stream endpoint
router.get('/stream', authenticate, (req, res) => {
  const { firmId, id: userId } = req.user;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL || 'http://localhost:5173',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ 
    message: 'Connected to event stream',
    userId,
    firmId,
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Register this connection in the event bus
  const cleanup = registerConnection(firmId, userId, res);

  // Heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ 
        timestamp: new Date().toISOString() 
      })}\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });

  req.on('error', () => {
    clearInterval(heartbeat);
    cleanup();
  });
});

// Connection stats (admin only)
router.get('/stats', authenticate, (req, res) => {
  if (!['owner', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  res.json(getConnectionStats());
});

export default router;
