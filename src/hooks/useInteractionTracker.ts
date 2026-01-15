/**
 * Hook for tracking user interactions with the site
 * 
 * This sends interaction data to the background agent for learning.
 * All tracking is done asynchronously and failures are silent.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface InteractionData {
  action: string;
  page?: string;
  feature?: string;
  data?: Record<string, unknown>;
}

/**
 * Track an interaction with the backend
 * Silent failures - don't disrupt user experience
 */
async function trackInteraction(interaction: InteractionData): Promise<void> {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    await fetch(`${API_BASE}/api/v1/background-agent/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(interaction)
    });
  } catch {
    // Silent failure - tracking should never disrupt the user
  }
}

/**
 * Hook for tracking user interactions
 * 
 * Usage:
 * ```tsx
 * const { trackFeatureUsage, trackWorkflowStep } = useInteractionTracker();
 * 
 * // Track when user uses a feature
 * trackFeatureUsage('createMatter', { matterType: 'litigation' });
 * 
 * // Track workflow progression
 * trackWorkflowStep('newClientIntake', 'collectRetainer', 3);
 * ```
 */
export function useInteractionTracker() {
  const location = useLocation();
  const lastPage = useRef<string>('');

  // Track page navigation
  useEffect(() => {
    const currentPage = location.pathname;
    
    if (lastPage.current && lastPage.current !== currentPage) {
      trackInteraction({
        action: 'navigate',
        page: currentPage,
        data: { from: lastPage.current }
      });
    }
    
    lastPage.current = currentPage;
  }, [location.pathname]);

  // Track feature usage
  const trackFeatureUsage = useCallback((feature: string, data?: Record<string, unknown>) => {
    trackInteraction({
      action: 'use_feature',
      page: location.pathname,
      feature,
      data
    });
  }, [location.pathname]);

  // Track workflow steps
  const trackWorkflowStep = useCallback((workflow: string, step: string, stepOrder?: number) => {
    trackInteraction({
      action: 'workflow_step',
      page: location.pathname,
      data: { workflow, step, stepOrder }
    });
  }, [location.pathname]);

  // Track document interactions
  const trackDocumentAction = useCallback((action: string, documentId: string, documentType?: string) => {
    trackInteraction({
      action: 'document_action',
      page: location.pathname,
      feature: 'documents',
      data: { action, documentId, documentType }
    });
  }, [location.pathname]);

  // Track AI interactions
  const trackAIInteraction = useCallback((action: string, data?: Record<string, unknown>) => {
    trackInteraction({
      action: 'ai_interaction',
      page: location.pathname,
      feature: 'ai_chat',
      data: { action, ...data }
    });
  }, [location.pathname]);

  return {
    trackFeatureUsage,
    trackWorkflowStep,
    trackDocumentAction,
    trackAIInteraction
  };
}

export default useInteractionTracker;
