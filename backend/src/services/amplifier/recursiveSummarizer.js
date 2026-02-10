/**
 * Recursive Summarization Engine for Background Agent Memory
 * 
 * Implements a hierarchical memory model inspired by how humans process
 * information over extended work sessions:
 * 
 * ## Architecture
 * 
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    CONTEXT WINDOW                            │
 * │                                                              │
 * │  ┌──────────────────────────────────────────────────────┐   │
 * │  │ LONG-TERM MEMORY (Mission Header)                     │   │
 * │  │ - 30-minute mission goal                              │   │
 * │  │ - Key facts & constraints (never dropped)             │   │
 * │  │ - Failed approaches (from rewind system)              │   │
 * │  └──────────────────────────────────────────────────────┘   │
 * │                                                              │
 * │  ┌──────────────────────────────────────────────────────┐   │
 * │  │ MID-TERM MEMORY (Recursive Summaries)                 │   │
 * │  │ - Summary of summaries (compressed history)           │   │
 * │  │ - Phase transition reflections                        │   │
 * │  │ - Cumulative findings                                 │   │
 * │  └──────────────────────────────────────────────────────┘   │
 * │                                                              │
 * │  ┌──────────────────────────────────────────────────────┐   │
 * │  │ SHORT-TERM MEMORY (Working Context)                   │   │
 * │  │ - Current sub-task messages (last 8-10 messages)      │   │
 * │  │ - Active tool calls and results                       │   │
 * │  │ - Immediate next-step instructions                    │   │
 * │  └──────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 * 
 * ## Key Insight
 * 
 * Traditional compaction drops old messages entirely. Recursive summarization
 * instead FOLDS them into increasingly compressed summaries, so the agent
 * never truly "forgets" what it did -- it just has a more compressed version.
 * 
 * Each summarization pass:
 * 1. Takes the oldest N messages beyond the working window
 * 2. Extracts key facts, decisions, and outcomes
 * 3. Compresses them into a structured summary paragraph
 * 4. Folds that summary into the existing mid-term memory
 * 5. Discards the original messages
 * 
 * The result: a 30-minute task can run hundreds of iterations while the
 * context window stays lean (focused on the current sub-task) but aware
 * of everything that happened before (via compressed summaries).
 */

// Configuration
const SHORT_TERM_WINDOW = 10;       // Keep last 10 messages as working context
const SUMMARIZE_BATCH_SIZE = 8;     // Summarize in batches of 8 messages
const MAX_SUMMARY_LAYERS = 5;       // Max depth of recursive summaries
const MAX_SUMMARY_CHARS = 2000;     // Max chars per summary layer
const MAX_LONG_TERM_CHARS = 1500;   // Max chars for long-term mission header
const MAX_MID_TERM_CHARS = 2500;    // Max chars for mid-term recursive summaries

/**
 * Represents the agent's layered memory
 */
export class AgentMemory {
  constructor(missionGoal) {
    // Long-Term Memory: the 30-minute mission goal + key constraints
    // This NEVER gets dropped from the context window
    this.longTerm = {
      missionGoal: missionGoal,
      keyFacts: [],        // Critical facts that must persist (matter names, IDs, etc.)
      constraints: [],     // Things the agent must not do
      failedPaths: [],     // From rewind system - approaches that didn't work
      startedAt: Date.now()
    };
    
    // Mid-Term Memory: recursive summaries of completed work
    // This is the "compressed history" -- old messages folded into summaries
    this.midTerm = {
      summaryLayers: [],   // Array of summary strings, from oldest (most compressed) to newest
      phaseReflections: [], // Reflections from phase transitions
      cumulativeFindings: [], // Key findings accumulated over time
      totalMessagesSummarized: 0
    };
    
    // Short-Term Memory: the current working context
    // This is just the recent messages -- managed by the main loop
    // (We don't store messages here; they stay in task.messages)
  }

  // ===== LONG-TERM MEMORY =====

  /**
   * Add a key fact that should persist for the entire mission
   */
  addKeyFact(fact) {
    // Deduplicate
    if (!this.longTerm.keyFacts.includes(fact)) {
      this.longTerm.keyFacts.push(fact);
    }
    // Keep bounded
    if (this.longTerm.keyFacts.length > 15) {
      this.longTerm.keyFacts = this.longTerm.keyFacts.slice(-15);
    }
  }

  /**
   * Add a constraint (something the agent should NOT do)
   */
  addConstraint(constraint) {
    if (!this.longTerm.constraints.includes(constraint)) {
      this.longTerm.constraints.push(constraint);
    }
    if (this.longTerm.constraints.length > 10) {
      this.longTerm.constraints = this.longTerm.constraints.slice(-10);
    }
  }

  /**
   * Record a failed path from the rewind system
   */
  addFailedPath(pathDescription) {
    this.longTerm.failedPaths.push(pathDescription);
    if (this.longTerm.failedPaths.length > 5) {
      this.longTerm.failedPaths = this.longTerm.failedPaths.slice(-5);
    }
  }

  /**
   * Build the long-term memory header for injection into the context window.
   * This is always placed right after the system prompt.
   */
  buildLongTermHeader() {
    const elapsed = Math.round((Date.now() - this.longTerm.startedAt) / 60000);
    
    let header = `## LONG-TERM MISSION MEMORY\n`;
    header += `**⭐ YOUR ASSIGNED TASK:** ${this.longTerm.missionGoal}\n`;
    header += `**Elapsed:** ${elapsed} minutes | Stay focused on the task above.\n`;
    
    if (this.longTerm.keyFacts.length > 0) {
      header += `\n**Key Facts (persistent):**\n`;
      for (const fact of this.longTerm.keyFacts) {
        header += `- ${fact}\n`;
      }
    }
    
    if (this.longTerm.constraints.length > 0) {
      header += `\n**Constraints:**\n`;
      for (const c of this.longTerm.constraints) {
        header += `- DO NOT: ${c}\n`;
      }
    }
    
    if (this.longTerm.failedPaths.length > 0) {
      header += `\n**Failed Approaches (from recovery):**\n`;
      for (const p of this.longTerm.failedPaths) {
        header += `- ${p}\n`;
      }
    }
    
    // Truncate if too long
    if (header.length > MAX_LONG_TERM_CHARS) {
      header = header.substring(0, MAX_LONG_TERM_CHARS - 50) + '\n...(truncated)\n';
    }
    
    return header;
  }

  // ===== MID-TERM MEMORY (Recursive Summarization) =====

  /**
   * Summarize a batch of messages and fold into mid-term memory.
   * This is the core of recursive summarization.
   * 
   * @param {Array} messages - Messages to summarize (the ones being dropped from working context)
   * @param {Object} taskContext - Current task state for context
   * @returns {string} The summary that was created
   */
  summarizeAndFold(messages, taskContext = {}) {
    if (!messages || messages.length === 0) return '';
    
    // Extract key information from the messages being compressed
    const summary = this._extractSummary(messages, taskContext);
    
    // Fold into the summary stack
    this.midTerm.summaryLayers.push(summary);
    this.midTerm.totalMessagesSummarized += messages.length;
    
    // If we have too many summary layers, compress the oldest ones together
    if (this.midTerm.summaryLayers.length > MAX_SUMMARY_LAYERS) {
      this._compressSummaryLayers();
    }
    
    return summary;
  }

  /**
   * Add a phase reflection (from the phase transition system)
   */
  addPhaseReflection(phase, reflection) {
    this.midTerm.phaseReflections.push({
      phase,
      reflection: reflection.substring(0, 300),
      timestamp: Date.now()
    });
    // Keep only last 4 phase reflections
    if (this.midTerm.phaseReflections.length > 4) {
      this.midTerm.phaseReflections = this.midTerm.phaseReflections.slice(-4);
    }
  }

  /**
   * Add a cumulative finding
   */
  addFinding(finding) {
    this.midTerm.cumulativeFindings.push(finding);
    if (this.midTerm.cumulativeFindings.length > 12) {
      this.midTerm.cumulativeFindings = this.midTerm.cumulativeFindings.slice(-12);
    }
  }

  /**
   * Build the mid-term memory block for injection into the context window.
   * This goes between the long-term header and the short-term working messages.
   */
  buildMidTermSummary() {
    if (this.midTerm.summaryLayers.length === 0 && 
        this.midTerm.cumulativeFindings.length === 0 &&
        this.midTerm.phaseReflections.length === 0) {
      return '';
    }
    
    let summary = `## SESSION HISTORY (compressed)\n`;
    summary += `*${this.midTerm.totalMessagesSummarized} messages summarized into ${this.midTerm.summaryLayers.length} layers*\n\n`;
    
    // Include recursive summaries (most compressed first, newest last)
    if (this.midTerm.summaryLayers.length > 0) {
      for (let i = 0; i < this.midTerm.summaryLayers.length; i++) {
        const layer = this.midTerm.summaryLayers[i];
        const label = i === 0 && this.midTerm.summaryLayers.length > 1 
          ? 'Earlier work' 
          : `Recent work (batch ${i + 1})`;
        summary += `**${label}:** ${layer}\n\n`;
      }
    }
    
    // Include cumulative findings
    if (this.midTerm.cumulativeFindings.length > 0) {
      summary += `**Cumulative Findings:**\n`;
      for (const finding of this.midTerm.cumulativeFindings.slice(-8)) {
        summary += `- ${finding}\n`;
      }
      summary += '\n';
    }
    
    // Include phase reflections
    if (this.midTerm.phaseReflections.length > 0) {
      const lastReflection = this.midTerm.phaseReflections[this.midTerm.phaseReflections.length - 1];
      summary += `**Last Phase Reflection (${lastReflection.phase}):** ${lastReflection.reflection}\n`;
    }
    
    // Truncate if too long
    if (summary.length > MAX_MID_TERM_CHARS) {
      summary = summary.substring(0, MAX_MID_TERM_CHARS - 50) + '\n...(history truncated)\n';
    }
    
    return summary;
  }

  // ===== FULL CONTEXT BUILDER =====

  /**
   * Build the complete memory context for injection into the message array.
   * Returns two system messages: long-term header and mid-term summary.
   */
  buildMemoryMessages() {
    const messages = [];
    
    const longTermContent = this.buildLongTermHeader();
    if (longTermContent) {
      messages.push({
        role: 'system',
        content: longTermContent
      });
    }
    
    const midTermContent = this.buildMidTermSummary();
    if (midTermContent) {
      messages.push({
        role: 'system', 
        content: midTermContent
      });
    }
    
    return messages;
  }

  // ===== SERIALIZATION =====

  /**
   * Serialize for checkpoint persistence
   */
  serialize() {
    return {
      longTerm: this.longTerm,
      midTerm: {
        summaryLayers: this.midTerm.summaryLayers,
        phaseReflections: this.midTerm.phaseReflections,
        cumulativeFindings: this.midTerm.cumulativeFindings,
        totalMessagesSummarized: this.midTerm.totalMessagesSummarized
      }
    };
  }

  /**
   * Restore from serialized state
   */
  static deserialize(data, missionGoal) {
    const memory = new AgentMemory(missionGoal);
    if (data?.longTerm) {
      memory.longTerm = { ...memory.longTerm, ...data.longTerm };
    }
    if (data?.midTerm) {
      memory.midTerm = { ...memory.midTerm, ...data.midTerm };
    }
    return memory;
  }

  // ===== INTERNAL METHODS =====

  /**
   * Extract a structured summary from a batch of messages.
   * This is done locally (no LLM call) to keep it fast and cheap.
   * 
   * We extract:
   * - Tool calls and their outcomes
   * - Key decisions made
   * - Important data discovered
   * - Errors encountered
   */
  _extractSummary(messages, taskContext = {}) {
    const toolActions = [];
    const decisions = [];
    const errors = [];
    const keyData = [];
    
    for (const msg of messages) {
      if (!msg) continue;
      
      // Extract from assistant messages (tool calls)
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const toolName = tc.function?.name || 'unknown';
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
          toolActions.push(this._describeToolCall(toolName, args));
        }
        
        // Extract any thinking/reasoning from assistant text
        if (msg.content && msg.content.length > 0) {
          const firstSentence = msg.content.split(/[.!?\n]/)[0];
          if (firstSentence && firstSentence.length > 10 && firstSentence.length < 200) {
            decisions.push(firstSentence.trim());
          }
        }
      }
      
      // Extract from tool results
      if (msg.role === 'tool' && msg.content) {
        try {
          const result = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
          if (result.error) {
            errors.push(result.error.substring(0, 100));
          }
          // Extract key identifiers (matter names, doc names, etc.)
          if (result.matter?.name) keyData.push(`Matter: ${result.matter.name}`);
          if (result.name) keyData.push(`Document: ${result.name}`);
          if (result.success && result.message) keyData.push(result.message.substring(0, 80));
        } catch {
          // Non-JSON tool result, skip
        }
      }
      
      // Extract from user/system directives
      if (msg.role === 'user' && msg.content) {
        // Capture phase transition notes or recovery directives
        if (msg.content.includes('SELF-CRITIQUE') || msg.content.includes('REWIND')) {
          const firstLine = msg.content.split('\n')[0];
          decisions.push(firstLine.substring(0, 150));
        }
        // Capture follow-up instructions from the user (these are critical guidance)
        if (msg.content.includes('FOLLOW-UP INSTRUCTION FROM USER')) {
          // Extract the actual instruction (strip the prefix tag)
          const match = msg.content.match(/\[FOLLOW-UP INSTRUCTION FROM USER\]:\s*(.+?)(?:\n|$)/);
          if (match) {
            decisions.push(`User follow-up: ${match[1].substring(0, 150)}`);
          }
        }
      }
    }
    
    // Build the summary
    const parts = [];
    
    if (toolActions.length > 0) {
      // Deduplicate and limit
      const uniqueActions = [...new Set(toolActions)].slice(0, 6);
      parts.push(`Actions: ${uniqueActions.join('; ')}`);
    }
    
    if (keyData.length > 0) {
      const uniqueData = [...new Set(keyData)].slice(0, 4);
      parts.push(`Data: ${uniqueData.join('; ')}`);
    }
    
    if (decisions.length > 0) {
      parts.push(`Decisions: ${decisions.slice(0, 2).join('; ')}`);
    }
    
    if (errors.length > 0) {
      parts.push(`Errors: ${errors.slice(0, 2).join('; ')}`);
    }
    
    const summary = parts.join('. ');
    
    // Cap at max chars
    return summary.length > MAX_SUMMARY_CHARS 
      ? summary.substring(0, MAX_SUMMARY_CHARS - 3) + '...' 
      : summary;
  }

  /**
   * Create a human-readable description of a tool call
   */
  _describeToolCall(toolName, args) {
    switch (toolName) {
      case 'get_matter': return `reviewed matter ${args.matter_id || ''}`.trim();
      case 'read_document_content': return `read document ${args.document_id || ''}`.trim();
      case 'search_document_content': return `searched docs for "${args.search_term || ''}"`;
      case 'list_my_matters': return 'listed matters';
      case 'list_documents': return `listed documents${args.matter_id ? ` for matter` : ''}`;
      case 'add_matter_note': return `added note to matter`;
      case 'create_document': return `created document: ${args.name || 'untitled'}`;
      case 'create_task': return `created task: ${args.title || 'untitled'}`;
      case 'create_calendar_event': return `scheduled: ${args.title || 'event'}`;
      case 'think_and_plan': return 'created execution plan';
      case 'evaluate_progress': return 'evaluated progress';
      case 'task_complete': return 'marked task complete';
      default: return `${toolName.replace(/_/g, ' ')}`;
    }
  }

  /**
   * Compress the oldest summary layers together when we exceed MAX_SUMMARY_LAYERS.
   * This is the "recursive" part -- summaries of summaries.
   */
  _compressSummaryLayers() {
    if (this.midTerm.summaryLayers.length <= MAX_SUMMARY_LAYERS) return;
    
    // Take the oldest half of summaries and merge them into one
    const halfPoint = Math.ceil(this.midTerm.summaryLayers.length / 2);
    const oldLayers = this.midTerm.summaryLayers.slice(0, halfPoint);
    const newLayers = this.midTerm.summaryLayers.slice(halfPoint);
    
    // Merge old layers into a single compressed summary
    const merged = oldLayers.join(' | ');
    const compressed = merged.length > MAX_SUMMARY_CHARS 
      ? merged.substring(0, MAX_SUMMARY_CHARS - 30) + '... (earlier work compressed)'
      : merged;
    
    this.midTerm.summaryLayers = [compressed, ...newLayers];
    
    console.log(`[RecursiveSummarizer] Compressed ${oldLayers.length} summary layers into 1. Now ${this.midTerm.summaryLayers.length} layers.`);
  }
}

/**
 * Perform recursive summarization on a task's message array.
 * 
 * This is the main entry point called from the agent's execution loop.
 * It replaces the simple "drop old messages" approach with a hierarchical
 * summarization that preserves information at decreasing fidelity.
 * 
 * @param {BackgroundTask} task - The task whose messages need compaction
 * @param {AgentMemory} memory - The agent's memory instance
 * @returns {Array} The new, compacted message array
 */
export function recursiveCompact(task, memory) {
  const messages = task.messages || [];
  
  // Find the system prompt (always first, always preserved)
  const systemMessage = messages.find(m => 
    m.role === 'system' && 
    !m.content?.startsWith('## LONG-TERM') && 
    !m.content?.startsWith('## SESSION HISTORY') &&
    !m.content?.startsWith('## TASK MEMORY') &&
    !m.content?.startsWith('## EXECUTION PLAN')
  );
  
  // Separate memory-injected messages from conversation messages
  const conversationMessages = messages.filter(m => 
    m !== systemMessage &&
    !m.content?.startsWith('## LONG-TERM') &&
    !m.content?.startsWith('## SESSION HISTORY') &&
    !m.content?.startsWith('## TASK MEMORY') &&
    !m.content?.startsWith('## EXECUTION PLAN')
  );
  
  // If we're within the short-term window, nothing to do
  if (conversationMessages.length <= SHORT_TERM_WINDOW + SUMMARIZE_BATCH_SIZE) {
    return messages; // No compaction needed
  }
  
  // Split into: messages to summarize (old) and messages to keep (recent)
  const keepCount = SHORT_TERM_WINDOW;
  const toSummarize = conversationMessages.slice(0, -keepCount);
  const toKeep = conversationMessages.slice(-keepCount);
  
  // Rescue any follow-up instructions from the messages being summarized.
  // Follow-ups contain critical user guidance that should survive compaction.
  // They're already persisted in long-term memory via addKeyFact(), but we
  // also move recent follow-ups to the keep list so the model sees them
  // in full fidelity for at least one more cycle.
  const rescuedFollowUps = [];
  const remainingToSummarize = [];
  for (const msg of toSummarize) {
    if (msg?.role === 'user' && msg?.content?.includes('FOLLOW-UP INSTRUCTION FROM USER')) {
      rescuedFollowUps.push(msg);
    } else {
      remainingToSummarize.push(msg);
    }
  }
  
  console.log(`[RecursiveSummarizer] Summarizing ${remainingToSummarize.length} old messages, keeping ${toKeep.length} recent + ${rescuedFollowUps.length} rescued follow-ups`);
  
  // Extract key facts from messages being summarized (for long-term memory)
  _extractKeyFacts(remainingToSummarize, memory);
  
  // Summarize the old messages and fold into mid-term memory
  memory.summarizeAndFold(remainingToSummarize, {
    phase: task.executionPhase,
    iteration: task.progress?.iterations,
    substantiveActions: task.substantiveActions
  });
  
  // Build the new message array with layered memory
  const planMessage = task.buildPlanMessage ? task.buildPlanMessage() : null;
  const memoryMessages = memory.buildMemoryMessages();
  
  const newMessages = [
    systemMessage,           // System prompt (always first)
    ...memoryMessages,       // Long-term + mid-term memory
    planMessage,             // Execution plan (if exists)
    ...rescuedFollowUps,    // Rescued follow-up instructions (survive compaction)
    ...toKeep               // Short-term working context
  ].filter(Boolean);
  
  console.log(`[RecursiveSummarizer] Compacted: ${messages.length} -> ${newMessages.length} messages. ` +
    `Memory: ${memory.midTerm.summaryLayers.length} layers, ${memory.midTerm.totalMessagesSummarized} total summarized.`);
  
  return newMessages;
}

/**
 * Extract key facts from messages being dropped, to persist in long-term memory
 */
function _extractKeyFacts(messages, memory) {
  for (const msg of messages) {
    if (!msg) continue;
    
    // Extract matter/client/document identifiers from tool results
    if (msg.role === 'tool' && msg.content) {
      try {
        const result = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        
        if (result.matter?.name && result.matter?.id) {
          memory.addKeyFact(`Matter "${result.matter.name}" (ID: ${result.matter.id})`);
        }
        if (result.client?.name && result.client?.id) {
          memory.addKeyFact(`Client "${result.client.name}" (ID: ${result.client.id})`);
        }
        if (result.name && result.id && !result.matter) {
          memory.addKeyFact(`Document "${result.name}" (ID: ${result.id})`);
        }
      } catch {
        // Skip non-JSON results
      }
    }
  }
}

/**
 * Create a new AgentMemory instance for a task
 */
export function createAgentMemory(missionGoal) {
  return new AgentMemory(missionGoal);
}
