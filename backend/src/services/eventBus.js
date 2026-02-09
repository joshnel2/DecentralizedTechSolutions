/**
 * In-Memory Event Bus for Real-Time SSE Broadcasting
 * 
 * Enables backend routes to emit events that get pushed to connected 
 * frontend clients via Server-Sent Events (SSE).
 * 
 * Usage in routes:
 *   import { emitEvent } from '../services/eventBus.js';
 *   emitEvent(firmId, userId, 'document.updated', { documentId, name });
 *   emitEvent(firmId, null, 'matter.created', { matterId, name }); // firm-wide
 * 
 * Privacy model:
 * - Events with userId are sent only to that specific user
 * - Events with firmId but no userId are sent to all firm members
 * - Events are never sent across firms
 */

// Map of firmId -> Map of userId -> Set of SSE response objects
const connections = new Map();

/**
 * Register an SSE connection for a user
 * @param {string} firmId 
 * @param {string} userId 
 * @param {object} res - Express response object (kept open for SSE)
 * @returns {function} cleanup function to call on disconnect
 */
export function registerConnection(firmId, userId, res) {
  if (!connections.has(firmId)) {
    connections.set(firmId, new Map());
  }
  const firmConnections = connections.get(firmId);
  
  if (!firmConnections.has(userId)) {
    firmConnections.set(userId, new Set());
  }
  firmConnections.get(userId).add(res);

  // Return cleanup function
  return () => {
    const firm = connections.get(firmId);
    if (firm) {
      const userConns = firm.get(userId);
      if (userConns) {
        userConns.delete(res);
        if (userConns.size === 0) {
          firm.delete(userId);
        }
      }
      if (firm.size === 0) {
        connections.delete(firmId);
      }
    }
  };
}

/**
 * Emit an event to connected clients
 * @param {string} firmId - Target firm
 * @param {string|null} userId - Target user (null = broadcast to whole firm)
 * @param {string} eventType - Event type (e.g., 'document.updated')
 * @param {object} data - Event payload
 */
export function emitEvent(firmId, userId, eventType, data = {}) {
  const firmConnections = connections.get(firmId);
  if (!firmConnections) return;

  const event = JSON.stringify({
    type: eventType,
    data,
    timestamp: new Date().toISOString(),
  });

  const ssePayload = `event: ${eventType}\ndata: ${event}\n\n`;

  if (userId) {
    // Send to specific user only
    const userConns = firmConnections.get(userId);
    if (userConns) {
      for (const res of userConns) {
        try { res.write(ssePayload); } catch (e) { /* connection closed */ }
      }
    }
  } else {
    // Broadcast to all users in the firm
    for (const [, userConns] of firmConnections) {
      for (const res of userConns) {
        try { res.write(ssePayload); } catch (e) { /* connection closed */ }
      }
    }
  }
}

/**
 * Get count of active connections (for health/monitoring)
 */
export function getConnectionStats() {
  let totalFirms = 0;
  let totalUsers = 0;
  let totalConnections = 0;

  for (const [, firmConns] of connections) {
    totalFirms++;
    for (const [, userConns] of firmConns) {
      totalUsers++;
      totalConnections += userConns.size;
    }
  }

  return { totalFirms, totalUsers, totalConnections };
}

export default { registerConnection, emitEvent, getConnectionStats };
