/**
 * Unified Learning Context Builder
 * 
 * The single source of truth for what learned context gets injected into
 * the agent's system prompt. Replaces the scattered approach where each
 * module independently appended its own section.
 * 
 * Design principles:
 * 1. SELECTIVE: Only inject learnings relevant to the current task
 * 2. BUDGETED: Hard token budget (~800 tokens max) to avoid prompt bloat
 * 3. RANKED: Most impactful learnings first, cut from the bottom
 * 4. DECAYED: Old learnings get lower priority via recency weighting
 * 5. CONSISTENT: All confidence scores 0.0-1.0, all decay uses same formula
 * 
 * Pulls from:
 * - LawyerProfile (practice areas, feedback, task patterns)
 * - InteractionProfile (pages, features, workflows)
 * - ActivityLearning (recent matters, docs, time entries)
 * - QualityOverrides (rejection-learned prompt modifiers)
 * - ProvenToolChains (deterministic workflows)
 * - MatterMemory (per-matter institutional knowledge)
 * - DocumentProfile (document style preferences)
 * - DecisionReinforcer (tool success rates)
 */

import { query } from '../../db/connection.js';

const MAX_LEARNING_CHARS = 3000; // ~800 tokens - hard budget
const DECAY_HALF_LIFE_DAYS = 14;

/**
 * Calculate recency weight (shared formula across all modules).
 * Returns 0.0-1.0 where 1.0 = just now, 0.5 = half-life days ago.
 */
export function recencyWeight(dateOrTimestamp) {
  if (!dateOrTimestamp) return 0.5;
  const daysAgo = (Date.now() - new Date(dateOrTimestamp).getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, daysAgo / DECAY_HALF_LIFE_DAYS);
}

/**
 * Build the unified learning context for a background task.
 * 
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.firmId
 * @param {string} params.goal - The task goal (for relevance filtering)
 * @param {string} params.workTypeId - Classified work type
 * @param {string|null} params.matterId - Pre-loaded matter ID (if any)
 * @param {object|null} params.lawyerProfile - From getLawyerProfile()
 * @param {object|null} params.interactionProfile - From getUserInteractionProfile()
 * @param {object|null} params.qualityOverrides - From getQualityOverrides()
 * @param {object|null} params.provenToolChain - From getProvenToolChain()
 * @param {string|null} params.matterMemory - From getMatterMemory()
 * @param {string|null} params.activityContext - From getRecentActivityContext()
 * @param {object|null} params.documentProfile - From getUserDocumentProfile()
 * @returns {string} Formatted learning context for system prompt
 */
export function buildUnifiedLearningContext(params) {
  const {
    goal, workTypeId, matterId,
    lawyerProfile, interactionProfile, qualityOverrides,
    provenToolChain, matterMemory, activityContext,
    documentProfile, attorneyIdentity,
  } = params;

  // Collect all learning entries with priority scores
  const entries = [];

  // --- Attorney identity correction principles ---
  // NOTE: These are now injected directly via formatIdentityForPrompt() in the 
  // system prompt, NOT here. This avoids double-injection that wastes tokens.
  // The identity system owns correction principles. The unified context handles
  // quality overrides, activity, and other learning sources.

  // --- CRITICAL: Rejection-learned quality requirements (always include) ---
  if (qualityOverrides?.promptModifiers?.length > 0) {
    for (const modifier of qualityOverrides.promptModifiers.slice(0, 3)) {
      entries.push({
        priority: 100, // Highest priority - learned from actual rejection
        section: 'QUALITY REQUIREMENTS (learned from previous feedback)',
        content: modifier,
      });
    }
  }

  // --- HIGH: Per-matter memory (very relevant when working on same matter) ---
  if (matterMemory && matterId) {
    // matterMemory is already formatted - extract a condensed version
    const lines = matterMemory.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('**'));
    const condensed = lines.slice(0, 8).join('\n');
    if (condensed.length > 50) {
      entries.push({
        priority: 90,
        section: 'MATTER MEMORY (from previous tasks on this matter)',
        content: condensed + '\nUse this knowledge. Don\'t re-discover known facts.',
      });
    }
  }

  // --- HIGH: Proven tool chain ---
  if (provenToolChain) {
    const isDeterministic = provenToolChain.deterministic;
    const sequence = provenToolChain.tools.join(' → ');
    entries.push({
      priority: isDeterministic ? 85 : 70,
      section: isDeterministic ? 'PROVEN WORKFLOW (follow exact sequence)' : 'SUGGESTED WORKFLOW',
      content: `${sequence}\n(${(provenToolChain.confidence * 100).toFixed(0)}% confidence, ${provenToolChain.successCount} successful runs)`,
    });
  }

  // --- MEDIUM: Recent lawyer activity (context for what they're focused on) ---
  if (activityContext) {
    // Extract only the most relevant sections based on task type
    const relevantLines = _filterActivityByRelevance(activityContext, goal, workTypeId);
    if (relevantLines.length > 0) {
      entries.push({
        priority: 60,
        section: 'LAWYER\'S RECENT ACTIVITY',
        content: relevantLines.join('\n'),
      });
    }
  }

  // --- MEDIUM: Lawyer profile feedback (if they've given feedback before) ---
  if (lawyerProfile?.recentFeedback?.length > 0) {
    const feedbackLines = lawyerProfile.recentFeedback
      .slice(0, 3)
      .map(fb => `- "${fb.feedback}" (${fb.rating ? fb.rating + '/5' : 'no rating'}) on: ${fb.goal}`);
    entries.push({
      priority: 55,
      section: 'PREVIOUS FEEDBACK FROM THIS LAWYER',
      content: feedbackLines.join('\n'),
    });
  }

  // --- MEDIUM: Lawyer practice areas (if relevant to task) ---
  if (lawyerProfile?.practiceAreas?.length > 0) {
    entries.push({
      priority: 40,
      section: 'LAWYER PROFILE',
      content: `Practice areas: ${lawyerProfile.practiceAreas.join(', ')}` +
        (lawyerProfile.avgRating ? ` | Avg rating: ${lawyerProfile.avgRating.toFixed(1)}/5` : '') +
        (lawyerProfile.totalTasks ? ` | ${lawyerProfile.completedTasks}/${lawyerProfile.totalTasks} tasks completed` : ''),
    });
  }

  // --- LOW: Interaction patterns (how they use the software) ---
  if (interactionProfile?.mostUsedPages?.length > 0) {
    const topPages = interactionProfile.mostUsedPages.slice(0, 3).map(p => p.page).join(', ');
    const topFeatures = interactionProfile.mostUsedFeatures?.slice(0, 3).map(f => f.feature).join(', ') || '';
    entries.push({
      priority: 25,
      section: 'HOW THIS LAWYER WORKS',
      content: `Primary areas: ${topPages}` + (topFeatures ? ` | Frequent features: ${topFeatures}` : ''),
    });
  }

  // --- LOW: Document style preferences ---
  if (documentProfile) {
    // Only include if actually relevant (document drafting tasks)
    const isDocTask = /draft|write|create.*doc|memo|letter|brief/i.test(goal);
    if (isDocTask && typeof documentProfile === 'object') {
      entries.push({
        priority: 35,
        section: 'DOCUMENT STYLE PREFERENCES',
        content: typeof documentProfile.summary === 'string'
          ? documentProfile.summary.substring(0, 200)
          : 'Follow this lawyer\'s established document style.',
      });
    }
  }

  // Sort by priority (highest first) and build the output
  entries.sort((a, b) => b.priority - a.priority);

  let output = '';
  let charCount = 0;

  for (const entry of entries) {
    const section = `\n## ${entry.section}\n${entry.content}\n`;
    if (charCount + section.length > MAX_LEARNING_CHARS) {
      // Budget exhausted - stop adding
      break;
    }
    output += section;
    charCount += section.length;
  }

  return output;
}

/**
 * Filter activity context to only include lines relevant to the current task.
 */
function _filterActivityByRelevance(activityContext, goal, workTypeId) {
  if (!activityContext) return [];

  const lines = activityContext.split('\n').filter(l => l.trim().length > 0);
  const goalLower = goal.toLowerCase();
  const relevant = [];

  // Determine what sections are relevant based on work type
  const sectionRelevance = {
    'matter_review': ['Recently Active Matters', 'Open Tasks', 'Upcoming Events'],
    'document_drafting': ['Recently Active Matters', 'Recently Uploaded Documents'],
    'billing_review': ['Recent Time Entries', 'Work Volume'],
    'deadline_management': ['Upcoming Events', 'Recently Active Matters'],
    'client_communication': ['Recently Active Matters', 'Recent Notes'],
    'intake_setup': ['Recently Active Matters'],
  };

  const relevantSections = sectionRelevance[workTypeId] || ['Recently Active Matters'];
  let currentSection = '';

  for (const line of lines) {
    // Detect section headers
    if (line.startsWith('**') && line.endsWith('**')) {
      currentSection = line.replace(/\*\*/g, '').replace(/:$/, '');
    }

    // Include if section is relevant
    if (relevantSections.some(s => currentSection.includes(s))) {
      relevant.push(line);
    }

    // Also include if the line directly mentions something from the goal
    const goalWords = goalLower.split(/\s+/).filter(w => w.length > 4);
    if (goalWords.some(w => line.toLowerCase().includes(w))) {
      if (!relevant.includes(line)) relevant.push(line);
    }
  }

  return relevant.slice(0, 12); // Cap at 12 lines
}

/**
 * Standardized confidence score calculation.
 * Use this instead of ad-hoc formulas across modules.
 * 
 * @param {number} successes - Number of successful observations
 * @param {number} attempts - Total observations
 * @param {Date|string|null} lastUsed - When last observed (for decay)
 * @returns {number} Confidence 0.0-1.0
 */
export function calculateConfidence(successes, attempts, lastUsed = null) {
  if (attempts === 0) return 0.0;

  const successRate = successes / attempts;
  const sampleConfidence = Math.min(1.0, attempts / 10); // Need 10+ samples for full confidence
  const recency = lastUsed ? recencyWeight(lastUsed) : 0.8;

  return Math.min(0.99, successRate * sampleConfidence * (0.5 + 0.5 * recency));
}
