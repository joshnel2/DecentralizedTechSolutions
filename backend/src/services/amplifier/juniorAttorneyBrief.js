/**
 * Junior Attorney Brief - Pre-Execution Reasoning Layer
 * 
 * The missing piece between "user gives a task" and "agent starts calling tools."
 * 
 * A real junior attorney, when handed an assignment by a partner, doesn't
 * immediately start typing. They:
 * 
 * 1. READ THE ASSIGNMENT carefully - what exactly is being asked?
 * 2. CLASSIFY THE WORK - is this research? drafting? review? intake?
 * 3. THINK ABOUT THE AUDIENCE - who will read this? partner? client? court?
 * 4. IDENTIFY WHAT "GOOD" LOOKS LIKE - what would a competent deliverable contain?
 * 5. SPOT THE TRAPS - what are the common mistakes for this type of work?
 * 6. PLAN THE APPROACH - what do I need to read/find before I start writing?
 * 7. SET A TIME BUDGET - how long should each phase take?
 * 
 * This module generates a structured "brief" that gets injected into the
 * agent's initial messages, BEFORE it starts the agentic loop. The brief
 * acts like a supervising partner's instructions: clear, specific, and
 * setting the quality bar.
 * 
 * Without this, the agent just gets "do X" and makes a shallow plan.
 * With this, the agent gets "here's what type of work this is, here's
 * what a good junior attorney would produce, here are the pitfalls,
 * here's your time budget per phase, go."
 */

// ===== WORK TYPE CLASSIFICATIONS =====
// Each type maps to how a junior attorney would approach it

const WORK_TYPES = {
  MATTER_REVIEW: {
    id: 'matter_review',
    name: 'Matter Review & Assessment',
    triggers: [
      'review', 'assess', 'evaluate', 'status', 'check on', 'look at',
      'what.*status', 'how.*going', 'update on', 'review all', 'audit'
    ],
    description: 'Reviewing a matter to understand its current state and identify issues',
    
    whatGoodLooksLike: `A good matter review produces:
- A clear STATUS SUMMARY: where the matter stands right now
- An ISSUE IDENTIFICATION: what problems, risks, or gaps exist
- A DEADLINE CHECK: what's coming up and are we prepared
- SPECIFIC RECOMMENDATIONS: concrete next steps, not vague suggestions
- A NOTE documenting the review so there's a paper trail`,
    
    commonMistakes: [
      'Writing a generic summary without reading the actual documents',
      'Missing upcoming deadlines because you did not check the calendar',
      'Saying "everything looks fine" without actually verifying',
      'Not reading existing notes to understand what has already been done',
      'Forgetting to check if discovery responses are due'
    ],
    
    expectedDeliverables: [
      'Matter note with detailed findings (add_matter_note)',
      'Follow-up tasks for any issues found (create_task)',
      'Calendar events for upcoming deadlines (create_calendar_event)',
      'Formal memo if significant issues found (create_document)'
    ],
    
    approachOrder: [
      'FIRST: Read the matter details (get_matter) - understand the type, status, parties',
      'SECOND: Read ALL existing notes - understand what has been done already',
      'THIRD: Read key documents - especially recent filings, correspondence',
      'FOURTH: Check calendar for deadlines - anything coming up in 30/60/90 days?',
      'FIFTH: Check tasks - anything overdue or unassigned?',
      'SIXTH: Write your analysis note with specific findings',
      'SEVENTH: Create follow-up tasks for anything that needs attention',
      'EIGHTH: Flag any critical deadlines or risks'
    ],
    
    timeBudget: {
      discovery: '30% - Reading matter, documents, notes, calendar',
      analysis: '25% - Identifying issues, checking deadlines, spotting gaps',
      action: '35% - Writing review note, creating tasks, flagging deadlines',
      review: '10% - Verify completeness, make sure nothing was missed'
    }
  },

  DOCUMENT_DRAFTING: {
    id: 'document_drafting',
    name: 'Document Drafting',
    triggers: [
      'draft', 'write', 'prepare', 'create.*memo', 'create.*letter',
      'create.*brief', 'create.*motion', 'create.*agreement', 'create.*contract',
      'compose', 'author', 'put together', 'draw up'
    ],
    description: 'Creating a new legal document from scratch',
    
    whatGoodLooksLike: `A good draft document has:
- PROPER STRUCTURE: heading, parties, body sections, conclusion, signature block
- REAL CONTENT: actual analysis and arguments, not placeholders or filler
- SPECIFIC FACTS: references to actual dates, names, amounts from the matter
- CORRECT LEGAL STANDARDS: proper citations, correct legal tests, right jurisdiction
- PROFESSIONAL TONE: formal but clear, no colloquialisms, no first-person unless appropriate
- COMPLETENESS: all required sections present, nothing marked [TODO] or [INSERT]`,
    
    commonMistakes: [
      'Starting to write before reading the matter file',
      'Using placeholder text like [INSERT CLIENT NAME HERE]',
      'Writing generic legal analysis that could apply to any case',
      'Forgetting a signature block or date line',
      'Not checking what type of matter this is before choosing document format',
      'Writing a 2-paragraph memo when the matter needs a 2-page analysis',
      'Not including a recommended next-steps section'
    ],
    
    expectedDeliverables: [
      'The document itself (create_document) - minimum 500 words for memos/briefs',
      'Matter note summarizing what was drafted and why (add_matter_note)',
      'Follow-up task for partner review (create_task)'
    ],
    
    approachOrder: [
      'FIRST: Read the matter thoroughly - you cannot draft without knowing the facts',
      'SECOND: Read existing documents - understand tone, format, what exists already',
      'THIRD: Read notes - understand the attorney\'s strategy and preferences',
      'FOURTH: Plan the document structure before writing (think_and_plan)',
      'FIFTH: Draft the document with REAL content based on actual matter facts',
      'SIXTH: Add a note documenting what you drafted and decisions made',
      'SEVENTH: Create a task for the supervising attorney to review the draft'
    ],
    
    timeBudget: {
      discovery: '35% - Reading matter, existing docs, notes (the most important phase)',
      analysis: '15% - Planning document structure and key arguments',
      action: '40% - Writing the actual document with real content',
      review: '10% - Verify quality, add review task'
    }
  },

  LEGAL_RESEARCH: {
    id: 'legal_research',
    name: 'Legal Research',
    triggers: [
      'research', 'find.*case', 'case law', 'statute', 'precedent',
      'legal issue', 'legal question', 'what.*law', 'analyze.*legal',
      'investigate', 'look up.*law', 'find.*authority'
    ],
    description: 'Researching legal issues, statutes, case law, or precedent',
    
    whatGoodLooksLike: `Good legal research produces:
- A CLEAR STATEMENT of the legal issue being researched
- APPLICABLE STATUTES identified with proper citations
- KEY CASES summarized with holdings relevant to our facts
- AN ANALYSIS applying the law to our specific facts (IRAC method)
- A CONCLUSION with the attorney's likely options
- A RESEARCH MEMO documenting everything found`,
    
    commonMistakes: [
      'Giving a general overview of the law without applying it to the matter',
      'Not identifying the correct jurisdiction',
      'Missing the statute of limitations analysis',
      'Not checking if the law has been recently amended',
      'Writing conclusions without supporting authority',
      'Forgetting to check if there are any pending legislative changes'
    ],
    
    expectedDeliverables: [
      'Research memo document (create_document) - IRAC format, minimum 800 words',
      'Matter note with research summary and key findings (add_matter_note)',
      'Tasks for any follow-up research needed (create_task)',
      'Deadline events if SOL or filing deadlines discovered (create_calendar_event)'
    ],
    
    approachOrder: [
      'FIRST: Read the matter to understand the facts and legal issues',
      'SECOND: Identify the jurisdiction and applicable area of law',
      'THIRD: Look up relevant CPLR sections (if NY) using lookup_cplr',
      'FOURTH: Search existing documents for relevant precedent or prior research',
      'FIFTH: Write a research memo using IRAC: Issue, Rule, Application, Conclusion',
      'SIXTH: Add a note with key findings and practical implications',
      'SEVENTH: Create tasks for any additional research or action items'
    ],
    
    timeBudget: {
      discovery: '40% - Reading matter, searching documents, looking up law',
      analysis: '25% - Applying law to facts, identifying arguments',
      action: '25% - Writing research memo and notes',
      review: '10% - Verify citations, check completeness'
    }
  },

  CLIENT_COMMUNICATION: {
    id: 'client_communication',
    name: 'Client Communication',
    triggers: [
      'email.*client', 'letter.*client', 'update.*client', 'notify',
      'client.*update', 'status.*update', 'write.*client', 'inform',
      'client.*letter', 'engagement.*letter', 'retainer'
    ],
    description: 'Preparing communications to send to a client',
    
    whatGoodLooksLike: `Good client communication is:
- CLEAR AND PLAIN LANGUAGE: clients are not lawyers, avoid jargon
- SPECIFIC: references actual dates, events, next steps - not vague
- PROFESSIONAL BUT WARM: formal enough for a law firm, human enough to not sound robotic
- ACTIONABLE: tells the client exactly what they need to do, by when
- COMPLETE: covers all pending items the client needs to know about
- APPROPRIATELY DETAILED: enough info for the client, not so much it overwhelms`,
    
    commonMistakes: [
      'Using legal jargon the client will not understand',
      'Being vague about next steps or deadlines',
      'Not checking what communications were already sent',
      'Sending an update without reviewing the matter first',
      'Forgetting to include billing or fee information when relevant',
      'Not including a call-to-action (what does the client need to do?)'
    ],
    
    expectedDeliverables: [
      'Draft communication document (create_document)',
      'Note documenting what was communicated and why (add_matter_note)',
      'Follow-up task to actually send the communication (create_task)',
      'Calendar event for client follow-up if needed (create_calendar_event)'
    ],
    
    approachOrder: [
      'FIRST: Read the matter to understand current status',
      'SECOND: Read recent notes to see what has happened since last update',
      'THIRD: Check if there are any prior client communications to maintain tone',
      'FOURTH: Draft the communication with specific facts and clear next steps',
      'FIFTH: Add a note documenting the communication',
      'SIXTH: Create a task to review and send the communication'
    ],
    
    timeBudget: {
      discovery: '30% - Reading matter, notes, prior communications',
      analysis: '15% - Identifying what the client needs to know',
      action: '40% - Drafting the communication',
      review: '15% - Verify tone, accuracy, completeness'
    }
  },

  INTAKE_SETUP: {
    id: 'intake_setup',
    name: 'New Matter Intake & Setup',
    triggers: [
      'new.*matter', 'intake', 'onboard', 'set up', 'setup',
      'open.*matter', 'new.*case', 'new.*client', 'create.*matter',
      'initial.*review', 'first.*review'
    ],
    description: 'Setting up a new matter or performing initial intake work',
    
    whatGoodLooksLike: `Good matter intake produces:
- An INITIAL ASSESSMENT NOTE with first impressions and key issues
- A TASK CHECKLIST of everything needed to move the matter forward
- DEADLINE IDENTIFICATION: any statute of limitations or filing deadlines
- CONFLICT CHECK documentation
- A DOCUMENT ORGANIZATION plan
- CLEAR NEXT STEPS for the supervising attorney`,
    
    commonMistakes: [
      'Not checking for conflicts of interest',
      'Missing statute of limitations deadlines',
      'Not identifying the matter type correctly',
      'Creating generic tasks instead of matter-specific ones',
      'Not noting what documents are still needed from the client',
      'Forgetting to create an engagement letter task'
    ],
    
    expectedDeliverables: [
      'Initial assessment note (add_matter_note)',
      'Intake checklist tasks (create_task - multiple)',
      'SOL/deadline calendar events (create_calendar_event)',
      'Conflict check note (add_matter_note)',
      'Initial assessment memo if complex (create_document)'
    ],
    
    approachOrder: [
      'FIRST: Read the matter details to understand what we have',
      'SECOND: Run a conflict check (check_conflicts) if parties are known',
      'THIRD: Identify the matter type and applicable law',
      'FOURTH: Calculate any statute of limitations deadlines',
      'FIFTH: Write an initial assessment note',
      'SIXTH: Create an intake task checklist (5-10 specific tasks)',
      'SEVENTH: Create calendar events for critical deadlines',
      'EIGHTH: Create a document outlining the initial case strategy if warranted'
    ],
    
    timeBudget: {
      discovery: '25% - Reading what exists, identifying matter type',
      analysis: '20% - Conflicts, deadlines, jurisdiction, issues',
      action: '45% - Writing notes, creating tasks, setting deadlines',
      review: '10% - Verify all intake items are addressed'
    }
  },

  BILLING_REVIEW: {
    id: 'billing_review',
    name: 'Billing & Time Review',
    triggers: [
      'bill', 'invoice', 'time.*review', 'unbilled', 'receivable',
      'ar.*aging', 'collection', 'write.*off', 'fee.*review',
      'billing.*audit', 'pre-bill'
    ],
    description: 'Reviewing billing, time entries, invoices, or accounts receivable',
    
    whatGoodLooksLike: `Good billing review produces:
- A CLEAR SUMMARY of the financial picture
- SPECIFIC NUMBERS: hours, amounts, aging categories
- IDENTIFIED ISSUES: unbilled time, overdue invoices, write-off candidates
- ACTIONABLE RECOMMENDATIONS: specific invoices to send, clients to contact
- A FOLLOW-UP PLAN with tasks assigned`,
    
    commonMistakes: [
      'Giving vague summaries without actual numbers',
      'Not checking all active matters for unbilled time',
      'Missing overdue invoices that need collection attention',
      'Not comparing actual time against budgets',
      'Forgetting to check for time entries with insufficient descriptions'
    ],
    
    expectedDeliverables: [
      'Billing review note with specific findings (add_matter_note)',
      'Follow-up tasks for billing actions needed (create_task)',
      'Billing summary memo if comprehensive review (create_document)'
    ],
    
    approachOrder: [
      'FIRST: Pull time entries and invoices data',
      'SECOND: Identify unbilled time, overdue invoices, aging buckets',
      'THIRD: Analyze against budgets and expected billing',
      'FOURTH: Write a detailed findings note with specific numbers',
      'FIFTH: Create tasks for each billing action needed',
      'SIXTH: Create a formal billing report if this is a comprehensive review'
    ],
    
    timeBudget: {
      discovery: '35% - Gathering billing data across matters',
      analysis: '25% - Identifying issues, comparing against budgets',
      action: '30% - Writing findings, creating action tasks',
      review: '10% - Verify numbers, completeness'
    }
  },

  DEADLINE_MANAGEMENT: {
    id: 'deadline_management',
    name: 'Deadline Audit & Management',
    triggers: [
      'deadline', 'calendar', 'upcoming', 'overdue', 'sol',
      'statute.*limitation', 'due.*date', 'schedule', 'docket',
      'filing.*deadline', 'discovery.*deadline'
    ],
    description: 'Reviewing, setting, or managing legal deadlines',
    
    whatGoodLooksLike: `Good deadline management produces:
- A COMPLETE INVENTORY of all upcoming deadlines across matters
- RISK ASSESSMENT for each: are we on track to meet it?
- GAPS IDENTIFIED: matters that should have deadlines but don't
- CALENDAR EVENTS created or updated for all critical dates
- TASK ASSIGNMENTS for preparation needed before each deadline`,
    
    commonMistakes: [
      'Only checking one matter when the task asks about all matters',
      'Not calculating backwards from deadlines to figure out when prep must start',
      'Missing court-ordered deadlines buried in documents',
      'Not accounting for service time extensions (CPLR mail service adds 5 days)',
      'Setting reminders too close to the deadline'
    ],
    
    expectedDeliverables: [
      'Deadline audit note with findings (add_matter_note)',
      'Calendar events for all critical deadlines (create_calendar_event)',
      'Preparation tasks for upcoming deadlines (create_task)',
      'Deadline summary document if comprehensive audit (create_document)'
    ],
    
    approachOrder: [
      'FIRST: List all active matters',
      'SECOND: Check calendar events for each matter',
      'THIRD: Read matter documents for any court-ordered deadlines',
      'FOURTH: Calculate any SOL deadlines using calculate_cplr_deadline',
      'FIFTH: Write a comprehensive deadline audit note',
      'SIXTH: Create calendar events for any missing deadlines',
      'SEVENTH: Create preparation tasks for deadlines within 60 days'
    ],
    
    timeBudget: {
      discovery: '40% - Reviewing all matters and existing deadlines',
      analysis: '20% - Identifying gaps, calculating dates',
      action: '30% - Creating calendar events and preparation tasks',
      review: '10% - Verify all matters covered'
    }
  }
};

// Fallback for unrecognized tasks
const GENERAL_WORK = {
  id: 'general',
  name: 'General Legal Work',
  triggers: [],
  description: 'General legal task',
  
  whatGoodLooksLike: `Good legal work, regardless of type:
- Shows you READ the matter before acting
- Is SPECIFIC to this matter, not generic boilerplate
- Creates TANGIBLE deliverables: notes, documents, tasks
- Documents REASONING, not just conclusions
- Includes NEXT STEPS so the supervising attorney knows what to do`,
  
  commonMistakes: [
    'Acting before reading the matter',
    'Producing generic output not specific to the facts',
    'Not creating follow-up tasks',
    'Finishing too quickly with shallow work product'
  ],
  
  expectedDeliverables: [
    'At least one matter note with findings (add_matter_note)',
    'At least one follow-up task (create_task)',
    'A document if the work warrants it (create_document)'
  ],
  
  approachOrder: [
    'FIRST: Read the matter to understand the context',
    'SECOND: Plan your approach (think_and_plan)',
    'THIRD: Gather any additional information needed',
    'FOURTH: Produce your deliverables',
    'FIFTH: Create follow-up tasks',
    'SIXTH: Review and complete'
  ],
  
  timeBudget: {
    discovery: '30% - Understanding the matter and task',
    analysis: '20% - Planning approach',
    action: '40% - Creating deliverables',
    review: '10% - Verification'
  }
};


// ===== MAIN FUNCTIONS =====

/**
 * Classify the type of legal work from the goal text.
 * Returns the matching work type configuration.
 */
export function classifyWork(goal) {
  const goalLower = goal.toLowerCase();
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const [key, workType] of Object.entries(WORK_TYPES)) {
    let score = 0;
    for (const trigger of workType.triggers) {
      // Support regex-style triggers
      try {
        const regex = new RegExp(trigger, 'i');
        if (regex.test(goalLower)) {
          score += 2; // Regex match is worth more
        }
      } catch {
        // Plain string match
        if (goalLower.includes(trigger)) {
          score += 1;
        }
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = workType;
    }
  }
  
  return bestMatch || GENERAL_WORK;
}

/**
 * Generate the Junior Attorney Brief.
 * 
 * This is the core function. It takes the user's goal and produces a
 * structured brief that tells the agent exactly how a competent junior
 * attorney would approach this work.
 * 
 * @param {string} goal - The user's task description
 * @param {object} matterContext - Pre-loaded matter context (if available)
 * @param {object} options - Additional options (timebudget, complexity, etc.)
 * @returns {string} The brief text to inject into the agent's messages
 */
export function generateBrief(goal, matterContext = null, options = {}) {
  const workType = classifyWork(goal);
  const totalMinutes = options.totalMinutes || 30;
  
  let brief = `== JUNIOR ATTORNEY BRIEF ==\n`;
  brief += `(Read this carefully before you start working. This is your supervising partner's guidance.)\n\n`;
  
  // 1. What type of work this is
  brief += `### Assignment Classification\n`;
  brief += `**Work Type:** ${workType.name}\n`;
  brief += `**Your Task:** ${goal}\n`;
  if (matterContext) {
    brief += `**Matter Context:** You have pre-loaded matter data available. USE IT.\n`;
  }
  brief += `\n`;
  
  // 2. What "good" looks like -- this is the quality bar
  brief += `### What a Good Job Looks Like\n`;
  brief += workType.whatGoodLooksLike + '\n\n';
  
  // 3. Common mistakes to avoid -- this is the trap-spotting
  brief += `### Mistakes to Avoid\n`;
  brief += `These are the most common ways junior attorneys mess up this type of work:\n`;
  for (const mistake of workType.commonMistakes) {
    brief += `- DO NOT: ${mistake}\n`;
  }
  brief += `\n`;
  
  // 4. Expected deliverables -- concrete outputs
  brief += `### Expected Deliverables\n`;
  brief += `When you are done, you MUST have produced:\n`;
  for (const deliverable of workType.expectedDeliverables) {
    brief += `- ${deliverable}\n`;
  }
  brief += `\n`;
  
  // 5. Step-by-step approach -- the order of operations
  brief += `### Approach (Follow This Order)\n`;
  for (const step of workType.approachOrder) {
    brief += `${step}\n`;
  }
  brief += `\n`;
  
  // 6. Time budget -- how long each phase should take
  brief += `### Time Budget (~${totalMinutes} minutes total)\n`;
  for (const [phase, allocation] of Object.entries(workType.timeBudget)) {
    const minutes = Math.round(totalMinutes * parseInt(allocation) / 100);
    brief += `- **${phase.toUpperCase()}** (${allocation}): ~${minutes} minutes\n`;
  }
  brief += `\n`;
  
  // 7. The "partner check" -- what the partner will look for
  brief += `### Partner Review Criteria\n`;
  brief += `Before you call task_complete, ask yourself:\n`;
  brief += `1. Did I actually READ the matter before acting? (not just skim)\n`;
  brief += `2. Is my work SPECIFIC to this matter? (would it make sense to someone unfamiliar with it?)\n`;
  brief += `3. Did I produce REAL content? (no placeholders, no generic boilerplate)\n`;
  brief += `4. Are there CLEAR NEXT STEPS? (tasks created, deadlines set)\n`;
  brief += `5. Would I be comfortable putting my name on this work product?\n`;
  brief += `\n`;
  
  brief += `== END BRIEF - NOW BEGIN WORK ==\n`;
  brief += `Call think_and_plan to create your execution plan based on the approach above, then start executing.\n`;
  
  return brief;
}

/**
 * Get just the work type classification (lightweight, for logging)
 */
export function getWorkType(goal) {
  return classifyWork(goal);
}

/**
 * Get the expected deliverables for a goal (for quality gates)
 */
export function getExpectedDeliverables(goal) {
  const workType = classifyWork(goal);
  return workType.expectedDeliverables;
}

/**
 * Get the approach order for a goal (for plan validation)
 */
export function getApproachOrder(goal) {
  const workType = classifyWork(goal);
  return workType.approachOrder;
}

/**
 * Get time budget allocations for a goal
 */
export function getTimeBudget(goal) {
  const workType = classifyWork(goal);
  return workType.timeBudget;
}

export { WORK_TYPES, GENERAL_WORK };
