/**
 * Feature Flags Configuration
 * 
 * Use this file to enable/disable features across the application.
 * This allows for easy toggling of features during development or
 * when features need to be temporarily disabled for users.
 */

export const featureFlags = {
  /**
   * Background Agent Feature
   * 
   * When enabled, users can use the background agent to run complex,
   * long-running tasks in the background with progress tracking.
   * 
   * Set to false to disable:
   * - The background agent toggle in AIChat
   * - The BackgroundTaskBar progress indicator
   * - Polling for active tasks
   * 
   * NOTE: When re-enabling, ensure any stuck tasks in the database
   * have been cleaned up (status changed from 'running' to 'timeout').
   */
  BACKGROUND_AGENT_ENABLED: false,
} as const;

export type FeatureFlags = typeof featureFlags;
