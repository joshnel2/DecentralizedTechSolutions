/**
 * Background Task Scheduler
 *
 * Replaces raw setTimeout calls with a structured system that provides:
 * - Named tasks with logging
 * - Error isolation (one failing task doesn't affect others)
 * - Retry with backoff on failure
 * - Graceful shutdown support
 * - Status reporting via /health or admin endpoints
 *
 * Usage:
 *   import { scheduler } from '../utils/backgroundTasks.js';
 *   scheduler.schedule('extract-documents', extractTextForExistingDocuments, { delayMs: 5000 });
 *   scheduler.schedule('resume-ai-tasks', resumeIncompleteTasks, { delayMs: 10000, retries: 2 });
 *
 *   // On shutdown:
 *   scheduler.shutdown();
 */

class BackgroundTaskScheduler {
  constructor() {
    /** @type {Map<string, { status: string, lastRun?: Date, lastError?: string, timer?: any }>} */
    this.tasks = new Map();
    this._shuttingDown = false;
  }

  /**
   * Schedule a background task to run after a delay.
   * @param {string} name - Human-readable task name for logging
   * @param {() => Promise<void>} fn - Async function to execute
   * @param {object} options
   * @param {number} options.delayMs - Initial delay before first execution (default 5000)
   * @param {number} options.retries - Number of retries on failure (default 1)
   * @param {number} options.retryDelayMs - Delay between retries, doubles each time (default 10000)
   */
  schedule(name, fn, { delayMs = 5000, retries = 1, retryDelayMs = 10000 } = {}) {
    if (this._shuttingDown) return;

    const taskInfo = { status: 'scheduled', lastRun: null, lastError: null, timer: null };
    this.tasks.set(name, taskInfo);

    taskInfo.timer = setTimeout(async () => {
      await this._execute(name, fn, retries, retryDelayMs);
    }, delayMs);

    console.log(`[TASKS] Scheduled "${name}" to run in ${delayMs}ms`);
  }

  /** @private */
  async _execute(name, fn, retriesLeft, retryDelayMs) {
    if (this._shuttingDown) return;

    const taskInfo = this.tasks.get(name);
    if (!taskInfo) return;

    taskInfo.status = 'running';
    const startTime = Date.now();

    try {
      await fn();
      taskInfo.status = 'completed';
      taskInfo.lastRun = new Date();
      taskInfo.lastError = null;
      console.log(`[TASKS] "${name}" completed in ${Date.now() - startTime}ms`);
    } catch (err) {
      taskInfo.lastError = err.message;
      console.error(`[TASKS] "${name}" failed:`, err.message);

      if (retriesLeft > 0 && !this._shuttingDown) {
        taskInfo.status = 'retrying';
        console.log(`[TASKS] "${name}" will retry in ${retryDelayMs}ms (${retriesLeft} retries left)`);
        taskInfo.timer = setTimeout(async () => {
          await this._execute(name, fn, retriesLeft - 1, retryDelayMs * 2);
        }, retryDelayMs);
      } else {
        taskInfo.status = 'failed';
        console.error(`[TASKS] "${name}" exhausted all retries`);
      }
    }
  }

  /**
   * Get status of all tasks (for health check / admin endpoints).
   */
  getStatus() {
    const result = {};
    for (const [name, info] of this.tasks) {
      result[name] = {
        status: info.status,
        lastRun: info.lastRun,
        lastError: info.lastError,
      };
    }
    return result;
  }

  /**
   * Cancel all pending tasks and prevent new ones from being scheduled.
   * Call this on SIGTERM/SIGINT for graceful shutdown.
   */
  shutdown() {
    this._shuttingDown = true;
    for (const [name, info] of this.tasks) {
      if (info.timer) {
        clearTimeout(info.timer);
        info.timer = null;
        if (info.status === 'scheduled' || info.status === 'retrying') {
          info.status = 'cancelled';
        }
      }
    }
    console.log('[TASKS] Scheduler shut down');
  }
}

// Singleton instance
export const scheduler = new BackgroundTaskScheduler();
