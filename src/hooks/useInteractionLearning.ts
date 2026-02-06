/**
 * useInteractionLearning - Frontend hook for tracking UI interaction patterns
 * 
 * This hook enables the agent to learn from how the user interacts with the
 * software itself (not just the AI). It tracks:
 * 
 * - Page navigation (which sections they work in most)
 * - Feature usage (which buttons/actions they use)
 * - Search patterns (categories of searches, not raw text)
 * - Sort/filter preferences
 * - Time-of-day work patterns
 * 
 * PRIVACY:
 * - Raw text (search queries, names) is NEVER sent to the server
 * - Only categorized patterns are transmitted
 * - All data is scoped to the individual user
 * - Events are batched and debounced to minimize network traffic
 * 
 * MEMORY MANAGEMENT:
 * - Events are buffered in memory and flushed periodically
 * - Maximum buffer size prevents unbounded growth
 * - Server-side deduplication prevents duplicate patterns
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { aiApi } from '../services/api';

interface InteractionEvent {
  type: 'page_view' | 'feature_use' | 'search' | 'filter' | 'sort';
  category?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

// Module-level buffer (shared across hook instances, survives re-renders)
let eventBuffer: InteractionEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isAuthenticated = false;

const MAX_BUFFER_SIZE = 30;
const FLUSH_INTERVAL_MS = 60000; // Flush every 60 seconds
const MIN_FLUSH_SIZE = 3; // Don't flush for fewer than 3 events

/**
 * Flush buffered events to the server
 */
async function flushEvents() {
  if (eventBuffer.length < MIN_FLUSH_SIZE || !isAuthenticated) return;

  const eventsToSend = [...eventBuffer];
  eventBuffer = [];

  try {
    await aiApi.trackInteractions(eventsToSend);
  } catch {
    // Non-critical - silently fail
    // Put events back if we want to retry (optional, skip for simplicity)
  }
}

/**
 * Schedule a flush
 */
function scheduleFlush() {
  if (flushTimer) return; // Already scheduled

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Add an event to the buffer
 */
function bufferEvent(event: InteractionEvent) {
  eventBuffer.push(event);

  // Force flush if buffer is full
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushEvents();
  } else {
    scheduleFlush();
  }
}

/**
 * Map route paths to human-readable page names
 */
function getPageName(pathname: string): string {
  // Strip IDs from paths for privacy
  const cleanPath = pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '/:id')
    .replace(/\/\d+/g, '/:id');

  const pageMap: Record<string, string> = {
    '/': 'dashboard',
    '/dashboard': 'dashboard',
    '/matters': 'matters_list',
    '/matters/:id': 'matter_detail',
    '/clients': 'clients_list',
    '/clients/:id': 'client_detail',
    '/time-entries': 'time_entries',
    '/invoices': 'invoices',
    '/calendar': 'calendar',
    '/documents': 'documents',
    '/drive': 'drive',
    '/drive/browse': 'drive_browser',
    '/ai': 'ai_assistant',
    '/ai/background': 'background_agent',
    '/reports': 'reports',
    '/analytics': 'analytics',
    '/settings': 'settings',
    '/team': 'team',
    '/admin': 'admin',
  };

  return pageMap[cleanPath] || cleanPath.split('/').filter(Boolean)[0] || 'unknown';
}

/**
 * Main hook - call this in your Layout component
 */
export function useInteractionLearning(authenticated: boolean = false) {
  const location = useLocation();
  const lastPage = useRef<string>('');

  // Track auth state
  useEffect(() => {
    isAuthenticated = authenticated;
  }, [authenticated]);

  // Track page views on route change
  useEffect(() => {
    if (!authenticated) return;

    const pageName = getPageName(location.pathname);

    // Don't track duplicate sequential page views
    if (pageName === lastPage.current) return;
    lastPage.current = pageName;

    bufferEvent({
      type: 'page_view',
      category: 'navigation',
      detail: pageName,
    });
  }, [location.pathname, authenticated]);

  // Flush on unmount / page unload
  useEffect(() => {
    const handleUnload = () => {
      if (eventBuffer.length > 0 && isAuthenticated) {
        // Use sendBeacon for reliable delivery on page close
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/ai/interactions`;
        const token = localStorage.getItem('apex-access-token');
        const body = JSON.stringify({ events: eventBuffer });

        try {
          const blob = new Blob([body], { type: 'application/json' });
          // sendBeacon doesn't support auth headers, so we'll just skip this
          // and rely on the periodic flush instead
          navigator.sendBeacon(url, blob);
        } catch {
          // Best effort
        }
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // Flush on cleanup
      flushEvents();
    };
  }, []);

  /**
   * Track a feature usage event
   * Call this when the user clicks important buttons/actions
   */
  const trackFeature = useCallback((feature: string, category?: string) => {
    if (!authenticated) return;
    bufferEvent({
      type: 'feature_use',
      category: category || 'general',
      detail: feature,
    });
  }, [authenticated]);

  /**
   * Track a search event
   * Only the search CATEGORY is sent, not the raw query text
   */
  const trackSearch = useCallback((searchCategory: string) => {
    if (!authenticated) return;
    bufferEvent({
      type: 'search',
      category: 'search',
      detail: searchCategory,
    });
  }, [authenticated]);

  /**
   * Track a filter change
   */
  const trackFilter = useCallback((filterCategory: string, filterValue: string) => {
    if (!authenticated) return;
    bufferEvent({
      type: 'filter',
      category: filterCategory,
      detail: filterValue,
    });
  }, [authenticated]);

  /**
   * Track a sort change
   */
  const trackSort = useCallback((sortCategory: string, sortValue: string) => {
    if (!authenticated) return;
    bufferEvent({
      type: 'sort',
      category: sortCategory,
      detail: sortValue,
    });
  }, [authenticated]);

  return {
    trackFeature,
    trackSearch,
    trackFilter,
    trackSort,
  };
}

export default useInteractionLearning;
