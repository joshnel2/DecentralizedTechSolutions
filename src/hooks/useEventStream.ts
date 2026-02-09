/**
 * Real-Time Event Stream Hook
 * 
 * Connects to the backend SSE endpoint and dispatches events to subscribers.
 * Automatically reconnects on disconnect with exponential backoff.
 * 
 * Usage:
 *   const { lastEvent, subscribe, isConnected } = useEventStream();
 *   
 *   useEffect(() => {
 *     const unsub = subscribe('document.uploaded', (data) => {
 *       console.log('New document:', data.name);
 *       // Refresh document list, show toast, etc.
 *     });
 *     return unsub;
 *   }, [subscribe]);
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '../services/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface EventStreamMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type EventHandler = (data: Record<string, unknown>) => void;

export function useEventStream() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<EventStreamMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const subscribersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const mountedRef = useRef(true);

  // Subscribe to a specific event type
  const subscribe = useCallback((eventType: string, handler: EventHandler) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, new Set());
    }
    subscribersRef.current.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = subscribersRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          subscribersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  // Dispatch event to all subscribers of that type
  const dispatchEvent = useCallback((eventType: string, data: Record<string, unknown>) => {
    const handlers = subscribersRef.current.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          console.error(`[EventStream] Handler error for ${eventType}:`, e);
        }
      }
    }

    // Also dispatch to wildcard subscribers
    const wildcardHandlers = subscribersRef.current.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler({ type: eventType, ...data });
        } catch (e) {
          console.error(`[EventStream] Wildcard handler error:`, e);
        }
      }
    }
  }, []);

  // Connect to the SSE stream
  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // EventSource doesn't support custom headers, so pass token as query param
    // The backend authenticate middleware checks Authorization header first, 
    // then falls back to cookie. For SSE we need to use a different approach.
    // We use a short-lived URL with the token.
    const url = `${API_URL}/events/stream?token=${encodeURIComponent(token)}`;
    
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      if (mountedRef.current) {
        setIsConnected(true);
        reconnectAttemptRef.current = 0;
      }
    });

    es.addEventListener('heartbeat', () => {
      // Keep-alive, no action needed
    });

    // Listen for all event types we care about
    const eventTypes = [
      'document.uploaded', 'document.updated',
      'matter.created', 'matter.updated',
      'time_entry.created',
      'invoice.created', 'invoice.paid',
      'notification.new',
      'calendar.updated',
      'user.joined',
    ];

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data);
          const msg: EventStreamMessage = {
            type: parsed.type || eventType,
            data: parsed.data || parsed,
            timestamp: parsed.timestamp || new Date().toISOString(),
          };

          if (mountedRef.current) {
            setLastEvent(msg);
            dispatchEvent(eventType, msg.data);
          }
        } catch (e) {
          console.error(`[EventStream] Parse error for ${eventType}:`, e);
        }
      });
    }

    es.onerror = () => {
      if (mountedRef.current) {
        setIsConnected(false);
        es.close();
        eventSourceRef.current = null;

        // Exponential backoff reconnect: 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(2000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectAttemptRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      }
    };
  }, [dispatchEvent]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    // Only connect if we have a token (user is authenticated)
    const token = getAccessToken();
    if (token) {
      // Small delay to let the app settle after login
      const timeout = setTimeout(connect, 1000);
      return () => {
        clearTimeout(timeout);
        mountedRef.current = false;
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };
    }

    return () => {
      mountedRef.current = false;
    };
  }, [connect]);

  return { isConnected, lastEvent, subscribe };
}

export default useEventStream;
