/**
 * Checkpoint & Rewind System for Background Agent
 * 
 * Implements two critical resilience patterns:
 * 
 * 1. **Checkpoint Stack** - Maintains a stack of "known-good" snapshots taken
 *    after every successful tool execution. Unlike the periodic checkpoint
 *    (which saves to DB for crash recovery), these are in-memory snapshots
 *    that capture the agent's state at moments when things were working.
 * 
 * 2. **rewind()** - When the agent detects a loop (same tool+args failing
 *    repeatedly) or hits a wall of consecutive errors, rewind() rolls back
 *    to the last successful checkpoint and injects a "tried paths" directive
 *    so the model knows what already failed and must choose a different
 *    "Legal Path" forward.
 * 
 * 3. **Loop Detection** - Identifies three types of loops:
 *    - Tool loops: same tool + same args called N times with failures
 *    - Response loops: agent keeps producing near-identical text responses
 *    - Phase stalls: agent stuck in one phase without making progress
 * 
 * 4. **Legal Path Registry** - Tracks which approaches (tool sequences)
 *    have been tried and failed, so the agent can be explicitly told
 *    "don't try X again, try Y instead."
 */

const MAX_CHECKPOINT_STACK_SIZE = 10;
const LOOP_DETECTION_WINDOW = 8; // Look at last N actions for loops
const TOOL_REPEAT_THRESHOLD = 3; // Same tool+args 3 times = loop
const RESPONSE_SIMILARITY_THRESHOLD = 0.85; // 85% similar text = loop
const MAX_REWINDS_PER_TASK = 5; // Don't rewind forever

/**
 * Represents a single checkpoint snapshot
 */
class CheckpointSnapshot {
  constructor(task, reason = 'success') {
    this.id = `snap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.timestamp = Date.now();
    this.reason = reason;
    this.iteration = task.progress?.iterations || 0;
    this.phase = task.executionPhase;
    
    // Deep-clone the essential state
    this.messages = JSON.parse(JSON.stringify(task.messages || []));
    this.actionsHistory = JSON.parse(JSON.stringify((task.actionsHistory || []).slice(-50)));
    this.progress = JSON.parse(JSON.stringify(task.progress || {}));
    this.structuredPlan = task.structuredPlan 
      ? JSON.parse(JSON.stringify(task.structuredPlan)) 
      : null;
    this.executionPhase = task.executionPhase;
    this.phaseIterationCounts = { ...(task.phaseIterationCounts || {}) };
    this.substantiveActions = { ...(task.substantiveActions || {}) };
    this.textOnlyStreak = task.textOnlyStreak || 0;
    
    // Track what the last successful action was
    const lastSuccess = (task.actionsHistory || [])
      .filter(a => a.success !== false)
      .slice(-1)[0];
    this.lastSuccessfulAction = lastSuccess 
      ? { tool: lastSuccess.tool, args: lastSuccess.args } 
      : null;
  }
}

/**
 * A "Legal Path" represents a sequence of tool calls the agent tried.
 * When a path fails, it's recorded so the agent doesn't repeat it.
 */
class LegalPath {
  constructor(toolSequence, failureReason) {
    this.id = `path-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    this.toolSequence = toolSequence; // Array of {tool, args_hash}
    this.failureReason = failureReason;
    this.timestamp = Date.now();
    this.failedAt = toolSequence.length > 0 
      ? toolSequence[toolSequence.length - 1] 
      : null;
  }

  /**
   * Format this path for inclusion in the agent's prompt
   */
  toPromptString() {
    const steps = this.toolSequence.map(s => s.tool).join(' -> ');
    return `  - Path: ${steps} | Failed because: ${this.failureReason}`;
  }
}

/**
 * Loop detection result
 */
class LoopDetection {
  constructor(type, details) {
    this.detected = true;
    this.type = type; // 'tool_loop' | 'response_loop' | 'phase_stall'
    this.details = details;
    this.timestamp = Date.now();
  }
}

/**
 * Main CheckpointRewind manager
 * Attach one instance to each BackgroundTask
 */
export class CheckpointRewindManager {
  constructor() {
    // Stack of successful checkpoints (most recent on top)
    this.checkpointStack = [];
    
    // Registry of failed legal paths
    this.failedPaths = [];
    
    // Rewind tracking
    this.rewindCount = 0;
    this.lastRewindAt = null;
    this.rewindHistory = [];
    
    // Loop detection state
    this.recentToolCalls = []; // Sliding window for loop detection
    this.recentResponses = []; // Sliding window for response similarity
  }

  // ===== CHECKPOINT MANAGEMENT =====

  /**
   * Take a checkpoint snapshot after a successful tool execution.
   * This is called from the main loop after each successful tool result.
   */
  takeCheckpoint(task, reason = 'successful_tool') {
    const snapshot = new CheckpointSnapshot(task, reason);
    this.checkpointStack.push(snapshot);
    
    // Keep stack bounded
    if (this.checkpointStack.length > MAX_CHECKPOINT_STACK_SIZE) {
      this.checkpointStack.shift(); // Remove oldest
    }
    
    return snapshot;
  }

  /**
   * Get the last successful checkpoint
   */
  getLastCheckpoint() {
    return this.checkpointStack.length > 0 
      ? this.checkpointStack[this.checkpointStack.length - 1] 
      : null;
  }

  /**
   * Get a checkpoint N steps back (for deeper rewinds)
   */
  getCheckpointAt(stepsBack = 1) {
    const idx = this.checkpointStack.length - stepsBack;
    return idx >= 0 ? this.checkpointStack[idx] : null;
  }

  // ===== LOOP DETECTION =====

  /**
   * Record a tool call for loop detection
   */
  recordToolCall(toolName, args, success) {
    const argsHash = this._hashArgs(args);
    this.recentToolCalls.push({
      tool: toolName,
      argsHash,
      success,
      timestamp: Date.now()
    });
    
    // Keep window bounded
    if (this.recentToolCalls.length > LOOP_DETECTION_WINDOW * 2) {
      this.recentToolCalls = this.recentToolCalls.slice(-LOOP_DETECTION_WINDOW * 2);
    }
  }

  /**
   * Record a text response for response-loop detection
   */
  recordTextResponse(text) {
    this.recentResponses.push({
      text: (text || '').substring(0, 200), // Only compare first 200 chars
      timestamp: Date.now()
    });
    
    if (this.recentResponses.length > 6) {
      this.recentResponses = this.recentResponses.slice(-6);
    }
  }

  /**
   * Detect if the agent is in a loop.
   * Returns null if no loop, or a LoopDetection object if found.
   */
  detectLoop(task) {
    // 1. Tool loop: same tool+args called repeatedly with failures
    const toolLoop = this._detectToolLoop();
    if (toolLoop) return toolLoop;
    
    // 2. Response loop: agent keeps saying the same thing
    const responseLoop = this._detectResponseLoop();
    if (responseLoop) return responseLoop;
    
    // 3. Phase stall: stuck in one phase too long without progress
    const phaseStall = this._detectPhaseStall(task);
    if (phaseStall) return phaseStall;
    
    return null;
  }

  _detectToolLoop() {
    const recent = this.recentToolCalls.slice(-LOOP_DETECTION_WINDOW);
    if (recent.length < TOOL_REPEAT_THRESHOLD) return null;
    
    // Count occurrences of each tool+args combo
    const counts = new Map();
    for (const call of recent) {
      const key = `${call.tool}:${call.argsHash}`;
      const entry = counts.get(key) || { count: 0, failures: 0, tool: call.tool };
      entry.count++;
      if (!call.success) entry.failures++;
      counts.set(key, entry);
    }
    
    // Check for loops: same tool+args called N times with mostly failures
    for (const [key, entry] of counts) {
      if (entry.count >= TOOL_REPEAT_THRESHOLD && entry.failures >= Math.ceil(entry.count * 0.6)) {
        return new LoopDetection('tool_loop', {
          tool: entry.tool,
          callCount: entry.count,
          failureCount: entry.failures,
          message: `Tool "${entry.tool}" called ${entry.count} times with ${entry.failures} failures`
        });
      }
    }
    
    // Also detect: different tools but same pattern repeating
    if (recent.length >= 6) {
      const pattern1 = recent.slice(-6, -3).map(c => c.tool).join(',');
      const pattern2 = recent.slice(-3).map(c => c.tool).join(',');
      if (pattern1 === pattern2) {
        return new LoopDetection('tool_loop', {
          tool: 'pattern',
          pattern: pattern2,
          message: `Repeating tool pattern detected: ${pattern2}`
        });
      }
    }
    
    return null;
  }

  _detectResponseLoop() {
    if (this.recentResponses.length < 3) return null;
    
    const recent = this.recentResponses.slice(-4);
    let similarCount = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const similarity = this._textSimilarity(recent[i - 1].text, recent[i].text);
      if (similarity >= RESPONSE_SIMILARITY_THRESHOLD) {
        similarCount++;
      }
    }
    
    if (similarCount >= 2) {
      return new LoopDetection('response_loop', {
        similarResponses: similarCount + 1,
        message: `Agent produced ${similarCount + 1} near-identical text responses`
      });
    }
    
    return null;
  }

  _detectPhaseStall(task) {
    if (!task.phaseIterationCounts || !task.executionPhase) return null;
    
    const currentPhaseIters = task.phaseIterationCounts[task.executionPhase] || 0;
    const maxForPhase = Math.ceil((task.maxIterations || 200) * 0.30); // 30% is too much for any single phase
    
    // Check if we've been in this phase too long with no substantive progress
    if (currentPhaseIters >= maxForPhase) {
      const actions = task.substantiveActions || {};
      const totalSubstantive = (actions.notes || 0) + (actions.documents || 0) + 
                                (actions.tasks || 0) + (actions.events || 0);
      
      // If lots of iterations but very few substantive actions, it's a stall
      if (totalSubstantive < Math.ceil(currentPhaseIters * 0.1)) {
        return new LoopDetection('phase_stall', {
          phase: task.executionPhase,
          iterations: currentPhaseIters,
          substantiveActions: totalSubstantive,
          message: `Stalled in ${task.executionPhase} phase: ${currentPhaseIters} iterations, only ${totalSubstantive} substantive actions`
        });
      }
    }
    
    return null;
  }

  // ===== REWIND =====

  /**
   * Rewind the task to the last successful checkpoint.
   * 
   * This is the core recovery mechanism:
   * 1. Records the current failed path in the Legal Path registry
   * 2. Restores the task state from the last successful checkpoint
   * 3. Injects a "tried paths" directive so the model avoids the same approach
   * 4. Returns the recovery message to inject into the conversation
   * 
   * @param {BackgroundTask} task - The task to rewind
   * @param {LoopDetection|string} reason - Why we're rewinding
   * @returns {{ success: boolean, message: string, checkpoint: CheckpointSnapshot|null }}
   */
  rewind(task, reason) {
    // Guard: don't rewind too many times
    if (this.rewindCount >= MAX_REWINDS_PER_TASK) {
      console.warn(`[CheckpointRewind] Max rewinds (${MAX_REWINDS_PER_TASK}) reached for task ${task.id}`);
      return {
        success: false,
        message: `Cannot rewind: max rewind limit (${MAX_REWINDS_PER_TASK}) reached`,
        checkpoint: null
      };
    }
    
    // Guard: need at least one checkpoint to rewind to
    const checkpoint = this.getLastCheckpoint();
    if (!checkpoint) {
      console.warn(`[CheckpointRewind] No checkpoint available for task ${task.id}`);
      return {
        success: false,
        message: 'Cannot rewind: no checkpoint available',
        checkpoint: null
      };
    }
    
    // Step 1: Record the failed path
    const failedSequence = this.recentToolCalls
      .slice(-LOOP_DETECTION_WINDOW)
      .map(tc => ({ tool: tc.tool, args_hash: tc.argsHash }));
    
    const failureReason = reason instanceof LoopDetection 
      ? reason.details.message 
      : String(reason);
    
    const failedPath = new LegalPath(failedSequence, failureReason);
    this.failedPaths.push(failedPath);
    
    // Step 2: Restore state from checkpoint
    console.log(`[CheckpointRewind] Rewinding task ${task.id} to checkpoint ${checkpoint.id} (iteration ${checkpoint.iteration})`);
    
    task.messages = JSON.parse(JSON.stringify(checkpoint.messages));
    task.actionsHistory = JSON.parse(JSON.stringify(checkpoint.actionsHistory));
    task.progress = JSON.parse(JSON.stringify(checkpoint.progress));
    task.structuredPlan = checkpoint.structuredPlan 
      ? JSON.parse(JSON.stringify(checkpoint.structuredPlan)) 
      : task.structuredPlan;
    task.executionPhase = checkpoint.executionPhase;
    task.phaseIterationCounts = { ...checkpoint.phaseIterationCounts };
    task.substantiveActions = { ...checkpoint.substantiveActions };
    task.textOnlyStreak = 0; // Reset streaks on rewind
    
    // Step 3: Remove the used checkpoint from the stack
    // (so next rewind goes further back)
    this.checkpointStack.pop();
    
    // Step 4: Clear the loop detection window
    this.recentToolCalls = [];
    this.recentResponses = [];
    
    // Step 5: Track the rewind
    this.rewindCount++;
    this.lastRewindAt = Date.now();
    this.rewindHistory.push({
      rewindNumber: this.rewindCount,
      from: task.progress?.iterations,
      to: checkpoint.iteration,
      reason: failureReason,
      timestamp: Date.now()
    });
    
    // Step 6: Build the recovery directive
    const recoveryMessage = this._buildRecoveryDirective(failureReason, checkpoint);
    
    // Step 7: Inject the recovery message into the conversation
    task.messages.push({
      role: 'user',
      content: recoveryMessage
    });
    
    console.log(`[CheckpointRewind] Rewind #${this.rewindCount} complete. Restored to iteration ${checkpoint.iteration}. ${this.failedPaths.length} failed paths recorded.`);
    
    return {
      success: true,
      message: `Rewound to checkpoint at iteration ${checkpoint.iteration}`,
      checkpoint
    };
  }

  /**
   * Build the recovery directive that tells the agent what failed
   * and instructs it to take a different Legal Path.
   */
  _buildRecoveryDirective(failureReason, checkpoint) {
    let directive = `== REWIND RECOVERY (Attempt ${this.rewindCount}/${MAX_REWINDS_PER_TASK}) ==\n\n`;
    directive += `The agent was rewound to a previous successful state because: **${failureReason}**\n\n`;
    
    // List all failed paths so the agent knows what NOT to do
    if (this.failedPaths.length > 0) {
      directive += `### Failed Legal Paths (DO NOT REPEAT THESE)\n`;
      for (const path of this.failedPaths.slice(-5)) { // Show last 5 failed paths
        directive += path.toPromptString() + '\n';
      }
      directive += '\n';
    }
    
    // Give explicit guidance on what to try instead
    directive += `### Recovery Instructions\n`;
    directive += `You MUST take a DIFFERENT approach from the failed paths above.\n`;
    directive += `Strategies to consider:\n`;
    directive += `1. If a specific tool keeps failing, try a different tool that achieves the same goal\n`;
    directive += `2. If a matter/document ID is invalid, use search tools to find the correct ID first\n`;
    directive += `3. If you're stuck gathering info, skip to creating deliverables with what you have\n`;
    directive += `4. If document creation fails, try add_matter_note as a simpler alternative\n`;
    directive += `5. If you've been going in circles, call think_and_plan to create a fresh strategy\n\n`;
    
    // Remind of the goal
    directive += `Your goal remains: "${checkpoint.structuredPlan?.goal || 'Complete the assigned task'}"\n`;
    directive += `Current phase: ${checkpoint.executionPhase?.toUpperCase() || 'UNKNOWN'}\n`;
    directive += `\nCall think_and_plan NOW to create a new approach, then execute it with different tools/arguments.`;
    
    return directive;
  }

  // ===== LEGAL PATH REGISTRY =====

  /**
   * Get all failed paths formatted for prompt injection
   */
  getFailedPathsSummary() {
    if (this.failedPaths.length === 0) return '';
    
    let summary = '\n### Previously Failed Approaches\n';
    summary += 'These approaches were tried and failed. Do NOT repeat them:\n';
    for (const path of this.failedPaths.slice(-5)) {
      summary += path.toPromptString() + '\n';
    }
    return summary;
  }

  /**
   * Check if a proposed tool call matches a known failed path
   */
  isKnownFailedPath(toolName, args) {
    const argsHash = this._hashArgs(args);
    
    for (const path of this.failedPaths) {
      if (path.failedAt && 
          path.failedAt.tool === toolName && 
          path.failedAt.args_hash === argsHash) {
        return true;
      }
    }
    return false;
  }

  // ===== STATUS & REPORTING =====

  /**
   * Get current rewind system status
   */
  getStatus() {
    return {
      checkpointCount: this.checkpointStack.length,
      failedPathCount: this.failedPaths.length,
      rewindCount: this.rewindCount,
      maxRewinds: MAX_REWINDS_PER_TASK,
      rewindsRemaining: MAX_REWINDS_PER_TASK - this.rewindCount,
      lastRewindAt: this.lastRewindAt,
      rewindHistory: this.rewindHistory,
      canRewind: this.rewindCount < MAX_REWINDS_PER_TASK && this.checkpointStack.length > 0
    };
  }

  /**
   * Get data for inclusion in checkpoint payload (for DB persistence)
   */
  getSerializableState() {
    return {
      failedPaths: this.failedPaths.map(p => ({
        toolSequence: p.toolSequence,
        failureReason: p.failureReason,
        timestamp: p.timestamp
      })),
      rewindCount: this.rewindCount,
      rewindHistory: this.rewindHistory
    };
  }

  /**
   * Restore from serialized state (e.g., after loading from DB checkpoint)
   */
  loadSerializableState(state) {
    if (!state) return;
    
    if (Array.isArray(state.failedPaths)) {
      this.failedPaths = state.failedPaths.map(p => 
        new LegalPath(p.toolSequence || [], p.failureReason || 'unknown')
      );
    }
    this.rewindCount = state.rewindCount || 0;
    this.rewindHistory = state.rewindHistory || [];
  }

  // ===== UTILITIES =====

  /**
   * Create a stable hash of tool arguments for comparison
   */
  _hashArgs(args) {
    if (!args || typeof args !== 'object') return 'empty';
    try {
      const sorted = Object.keys(args).sort().map(k => `${k}=${JSON.stringify(args[k])}`);
      return sorted.join('&');
    } catch {
      return 'unhashable';
    }
  }

  /**
   * Simple text similarity using Jaccard index on word sets
   * Returns a value between 0 (completely different) and 1 (identical)
   */
  _textSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;
    
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;
    
    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) intersection++;
    }
    
    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? intersection / union : 0;
  }
}

/**
 * Factory function to create a new CheckpointRewindManager
 */
export function createCheckpointRewindManager() {
  return new CheckpointRewindManager();
}

export { CheckpointSnapshot, LegalPath, LoopDetection };
