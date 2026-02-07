/**
 * Lawyer Resources Knowledge Base
 * 
 * Reference resources that a junior attorney needs day-to-day.
 * This is the knowledge layer that supports the junior attorney persona.
 * 
 * Resources include:
 * - Legal writing guides and standards
 * - Common legal standards of review
 * - Professional conduct rule summaries
 * - Research methodology guides
 * - Billing and time entry best practices
 * - Deadline calculation rules
 * - Common objection frameworks
 * - Letter and communication templates patterns
 * 
 * USAGE:
 * - Queried by the agent during task execution for reference
 * - Injected into prompts when relevant to the task
 * - Used by the knowledge manager for unified search
 */

// ===== STANDARDS OF REVIEW =====
// The legal standards courts apply — a junior attorney must know these

export const STANDARDS_OF_REVIEW = {
  summary_judgment: {
    name: 'Summary Judgment',
    standard: 'No genuine dispute as to any material fact; movant entitled to judgment as a matter of law',
    federalRule: 'Fed. R. Civ. P. 56(a)',
    nyRule: 'CPLR § 3212',
    burden: 'Moving party bears initial burden of establishing entitlement; non-moving party must then show triable issue of fact',
    keyPrinciples: [
      'All inferences drawn in favor of non-moving party',
      'Court does not weigh credibility or resolve factual disputes',
      'Mere conclusory allegations insufficient to defeat motion',
      'Cross-motions analyzed independently',
    ],
    commonMistakes: [
      'Failing to submit admissible evidence (hearsay in affidavits)',
      'Not addressing each element of the claim/defense',
      'Raising new arguments not in the pleadings',
    ],
  },

  motion_to_dismiss: {
    name: 'Motion to Dismiss (12(b)(6) / CPLR 3211)',
    standard: 'Assuming all facts alleged as true, complaint fails to state a claim upon which relief can be granted',
    federalRule: 'Fed. R. Civ. P. 12(b)(6)',
    nyRule: 'CPLR § 3211(a)(7)',
    burden: 'Movant must show legal insufficiency of the pleading',
    keyPrinciples: [
      'All factual allegations accepted as true',
      'Complaint construed liberally in plaintiff\'s favor',
      'Court looks to the four corners of the complaint',
      'Conclusory statements and legal conclusions not accepted as true (Iqbal/Twombly in federal)',
    ],
    commonMistakes: [
      'Arguing factual insufficiency rather than legal insufficiency',
      'Failing to address each cause of action separately',
      'Not preserving other defenses when filing under 12(b)(6)',
    ],
  },

  preliminary_injunction: {
    name: 'Preliminary Injunction',
    standard: 'Likelihood of success on merits, irreparable harm absent injunction, balance of equities, public interest',
    federalRule: 'Fed. R. Civ. P. 65',
    nyRule: 'CPLR § 6301',
    burden: 'Moving party must demonstrate all four factors (or three-factor test in some circuits)',
    keyPrinciples: [
      'Irreparable harm must be imminent, not speculative',
      'Monetary damages alone usually insufficient for irreparable harm',
      'Bond may be required under Rule 65(c)',
      'TRO may be granted ex parte in emergency (14-day limit)',
    ],
    commonMistakes: [
      'Failing to demonstrate irreparable harm with specificity',
      'Not addressing the bond requirement',
      'Delay in seeking injunction undermines urgency argument',
    ],
  },

  de_novo: {
    name: 'De Novo Review',
    standard: 'Reviewing court gives no deference to lower court\'s determination; reviews issue fresh',
    application: 'Questions of law, constitutional issues, statutory interpretation',
    keyPrinciples: [
      'Most favorable standard for appellant',
      'Trial court\'s conclusions of law reviewed without deference',
      'Mixed questions of law and fact may receive de novo review',
    ],
  },

  abuse_of_discretion: {
    name: 'Abuse of Discretion',
    standard: 'Lower court\'s decision stands unless no reasonable person would agree; arbitrary, capricious, or unreasonable',
    application: 'Discovery rulings, evidentiary decisions, sanctions, case management',
    keyPrinciples: [
      'High bar for reversal — substantial deference to trial court',
      'Must show decision was outside range of permissible options',
      'Procedural errors may constitute abuse of discretion',
    ],
  },

  clearly_erroneous: {
    name: 'Clearly Erroneous',
    standard: 'Reviewing court has definite and firm conviction that a mistake has been committed',
    application: 'Factual findings by trial court in bench trials',
    keyPrinciples: [
      'Not enough that reviewing court would have decided differently',
      'Applies to findings of fact, not conclusions of law',
      'Witness credibility determinations given special deference',
    ],
  },
};

// ===== COMMON OBJECTION FRAMEWORKS =====
// What a junior attorney needs for depositions and discovery

export const OBJECTION_FRAMEWORKS = {
  deposition: {
    name: 'Deposition Objections',
    preservationRule: 'Most objections must be stated on the record to be preserved; objections as to form waived if not stated',
    commonObjections: [
      { objection: 'Form', basis: 'Question is leading, compound, vague, ambiguous, or assumes facts not in evidence', when: 'State at deposition to preserve' },
      { objection: 'Relevance', basis: 'Question seeks information not reasonably calculated to lead to admissible evidence', when: 'Typically preserved without objection, but state for the record' },
      { objection: 'Privilege', basis: 'Answer would reveal attorney-client privileged or work product information', when: 'State at deposition; instruct witness not to answer' },
      { objection: 'Harassment', basis: 'Question is asked solely to annoy, embarrass, or oppress the witness', when: 'State at deposition; may seek protective order' },
      { objection: 'Asked and Answered', basis: 'Same question has been asked and answered', when: 'State at deposition' },
      { objection: 'Calls for Speculation', basis: 'Witness has no basis for knowledge to answer', when: 'State at deposition' },
      { objection: 'Calls for Legal Conclusion', basis: 'Question asks lay witness for legal opinion', when: 'State at deposition' },
    ],
    importantRules: [
      'Objections must be stated concisely and non-argumentatively (Fed. R. Civ. P. 30(c))',
      'Only instruct witness not to answer for privilege, court order, or to present motion to terminate',
      'Speaking objections are improper and may result in sanctions',
    ],
  },

  discovery: {
    name: 'Discovery Objections',
    commonObjections: [
      { objection: 'Overly Broad', basis: 'Request seeks information beyond scope of claims/defenses' },
      { objection: 'Unduly Burdensome', basis: 'Cost of production substantially outweighs likely benefit' },
      { objection: 'Vague and Ambiguous', basis: 'Request is unclear and susceptible to multiple interpretations' },
      { objection: 'Not Reasonably Calculated', basis: 'Request not proportional to needs of the case' },
      { objection: 'Attorney-Client Privilege', basis: 'Confidential communication between attorney and client for legal advice' },
      { objection: 'Work Product', basis: 'Documents prepared in anticipation of litigation (Hickman v. Taylor)' },
      { objection: 'Trade Secret / Proprietary', basis: 'Disclosure would reveal protected business information' },
    ],
    bestPractices: [
      'Always respond within statutory deadline (30 days federal, varies by state)',
      'State specific basis for each objection — boilerplate objections are disfavored',
      'Produce responsive documents even when objecting (produce subject to objection)',
      'Prepare privilege log for all withheld documents',
      'Meet and confer before filing motion to compel',
    ],
  },

  trial: {
    name: 'Trial Objections',
    commonObjections: [
      { objection: 'Hearsay', basis: 'Out-of-court statement offered for truth of the matter asserted (FRE 801-807)' },
      { objection: 'Relevance', basis: 'Evidence does not make a fact of consequence more or less probable (FRE 401-403)' },
      { objection: 'Foundation', basis: 'Insufficient foundation laid for admissibility of evidence' },
      { objection: 'Best Evidence', basis: 'Original document required to prove its contents (FRE 1002)' },
      { objection: 'Prejudicial', basis: 'Probative value substantially outweighed by prejudice (FRE 403)' },
      { objection: 'Leading', basis: 'Question suggests the answer on direct examination (FRE 611(c))' },
      { objection: 'Lack of Personal Knowledge', basis: 'Witness has no firsthand knowledge of the facts (FRE 602)' },
      { objection: 'Expert Opinion without Basis', basis: 'Expert testimony lacks sufficient foundation (FRE 702, Daubert)' },
    ],
  },
};

// ===== BILLING & TIME ENTRY BEST PRACTICES =====

export const BILLING_RESOURCES = {
  timeEntryGuidance: {
    name: 'Time Entry Best Practices',
    principles: [
      'Record time contemporaneously — never reconstruct from memory',
      'Be specific and descriptive — auditors and clients read these',
      'Separate distinct activities into individual entries',
      'Use active verbs: "Drafted," "Reviewed," "Analyzed," "Researched"',
      'Include the "what," "why," and outcome when possible',
      'Minimum increments: typically 0.1 hours (6 minutes) or 0.25 hours (15 minutes)',
    ],

    goodExamples: [
      'Drafted motion to compel production of financial records pursuant to CPLR 3124; identified 14 outstanding document categories (1.5 hrs)',
      'Telephone conference with opposing counsel re: discovery dispute; negotiated 14-day extension for interrogatory responses (0.3 hrs)',
      'Reviewed and analyzed 47-page commercial lease agreement; prepared summary of key terms and identified 3 areas of concern for client review (2.0 hrs)',
      'Legal research re: statute of limitations for breach of fiduciary duty claims under NY law; analyzed Kaufman v. Cohen and progeny (1.8 hrs)',
      'Prepared witness for deposition; reviewed key documents and conducted mock examination on liability issues (3.0 hrs)',
    ],

    badExamples: [
      'Legal work (too vague — what work?)',
      'Phone call (who? about what?)',
      'Review documents (which documents? what was found?)',
      'Research (what issue? what was the conclusion?)',
      'Emails (how many? about what topic?)',
    ],

    activityCodes: {
      'A101': 'Plan and prepare for case/matter',
      'A102': 'Review/analyze',
      'A103': 'Draft/revise',
      'A104': 'Communicate with client',
      'A105': 'Communicate with opposing counsel',
      'A106': 'Court appearance',
      'A107': 'Negotiate',
      'A108': 'Legal research',
      'A109': 'Factual investigation',
      'A110': 'Deposition',
      'A111': 'Expert consultation',
      'A112': 'Travel',
    },
  },
};

// ===== DEADLINE CALCULATION RESOURCES =====

export const DEADLINE_RESOURCES = {
  calculationRules: {
    name: 'Deadline Calculation Rules',
    federal: {
      dayCount: 'Calendar days unless specified as "business days" (Fed. R. Civ. P. 6(a))',
      lastDayRule: 'If last day falls on Saturday, Sunday, or legal holiday, deadline extends to next business day',
      threeExtraDays: 'Service by mail adds 3 calendar days (Fed. R. Civ. P. 6(d))',
      computationStart: 'Exclude day of event, include last day of period',
      shortPeriods: 'Periods under 11 days: exclude intermediate Saturdays, Sundays, and legal holidays',
    },
    newYork: {
      dayCount: 'Calendar days unless otherwise specified (CPLR § 2103)',
      lastDayRule: 'Same as federal — extends to next business day',
      mailService: 'Service by mail adds 5 days (CPLR § 2103(b)(2))',
      overnightDelivery: 'Service by overnight delivery adds 1 day',
      electronicService: 'Service by electronic means adds no additional days in NY',
      computationStart: 'Exclude day of event; include last day (General Construction Law § 20)',
    },
    commonDeadlines: [
      { event: 'Answer to Complaint', federal: '21 days from service', ny: '20 days (personal service) or 30 days (other service)' },
      { event: 'Discovery Responses', federal: '30 days from service', ny: '20 days (interrogatories), varies for others' },
      { event: 'Motion to Dismiss', federal: 'Before answer or within 21 days of service', ny: 'Before or in the answer, or by motion' },
      { event: 'Summary Judgment', federal: '30 days after close of discovery (varies by local rule)', ny: '120 days after note of issue filed' },
      { event: 'Notice of Appeal', federal: '30 days from judgment (60 days if government)', ny: '30 days from service of judgment with notice of entry' },
      { event: 'Statute of Limitations (Contract)', federal: 'Varies by state', ny: '6 years (CPLR § 213(2))' },
      { event: 'Statute of Limitations (Tort)', federal: 'Varies by state', ny: '3 years (CPLR § 214)' },
      { event: 'Statute of Limitations (Medical Malpractice)', federal: 'Varies by state', ny: '2 years 6 months (CPLR § 214-a)' },
    ],
  },
};

// ===== RESEARCH METHODOLOGY =====

export const RESEARCH_METHODOLOGY = {
  name: 'Legal Research Methodology',
  steps: [
    {
      step: 1,
      name: 'Frame the Issue',
      description: 'Precisely identify the legal question. Who is the client? What do they want? What is the jurisdiction?',
      tips: [
        'Write out the question in plain English first',
        'Identify the area of law (contract, tort, statutory, constitutional)',
        'Determine the relevant jurisdiction(s)',
        'Note any time constraints (SOL, filing deadlines)',
      ],
    },
    {
      step: 2,
      name: 'Find the Statute',
      description: 'Start with statutory law — it\'s the foundation. What does the legislature say?',
      tips: [
        'Check the annotated code for the relevant statute',
        'Read the full text, not just the section you think applies',
        'Check for recent amendments and effective dates',
        'Look at the statutory definitions section',
        'Note cross-references to other statutes',
      ],
    },
    {
      step: 3,
      name: 'Find Controlling Case Law',
      description: 'How have courts interpreted the statute in relevant circumstances?',
      tips: [
        'Start with the highest court in the jurisdiction',
        'Look for recent decisions (last 5 years) first',
        'Read the full opinion, not just the headnote',
        'Check for concurrences and dissents that signal instability',
        'Note the standard of review applied',
      ],
    },
    {
      step: 4,
      name: 'Check for Currency',
      description: 'Is the law still good? Has anything changed?',
      tips: [
        'Shepardize/KeyCite every case you plan to cite',
        'Check for pending legislation that could change the law',
        'Look for recent regulatory changes',
        'Check if your jurisdiction has adopted a different rule',
      ],
    },
    {
      step: 5,
      name: 'Analyze and Apply',
      description: 'Apply the law to your facts using IRAC methodology',
      tips: [
        'Identify elements of each claim/defense',
        'Map your facts to each element',
        'Address counterarguments and distinguish unfavorable authority',
        'Note any unsettled areas or circuit splits',
        'Provide a clear conclusion with confidence level',
      ],
    },
    {
      step: 6,
      name: 'Document and Cite',
      description: 'Write up your findings with proper citations',
      tips: [
        'Use IRAC structure for the memo',
        'Cite to primary authority (statutes, cases) first',
        'Include pinpoint citations (specific pages)',
        'Note parenthetically the relevance of each citation',
        'Flag any unverified citations with [UNVERIFIED]',
      ],
    },
  ],
};

// ===== LETTER WRITING FRAMEWORKS =====

export const LETTER_FRAMEWORKS = {
  demandLetter: {
    name: 'Demand Letter Framework',
    sections: [
      'Identity of client and purpose of letter',
      'Factual background (concise, chronological)',
      'Legal basis for the claim with citations',
      'Specific demand (amount, action, deadline)',
      'Consequences of non-compliance',
      'Willingness to negotiate/discuss',
      'Deadline for response',
    ],
    tips: [
      'Tone: firm but professional — avoid threats or emotional language',
      'Be specific about the amount demanded and how it was calculated',
      'Include a reasonable response deadline (typically 10-30 days)',
      'Reference specific contract provisions or statutory authority',
      'Keep it concise — 2-3 pages maximum',
    ],
  },

  clientStatusUpdate: {
    name: 'Client Status Update Framework',
    sections: [
      'Greeting and matter reference',
      'Summary of recent developments',
      'Current status of the matter',
      'Upcoming deadlines and events',
      'Action items for the client',
      'Next steps from the firm',
      'Estimated timeline and costs (if appropriate)',
    ],
    tips: [
      'Plain language — no legal jargon without explanation',
      'Lead with the most important information',
      'Be honest about challenges and risks',
      'Include clear action items with deadlines',
      'End with how to reach you for questions',
    ],
  },

  engagementLetter: {
    name: 'Engagement Letter Framework',
    sections: [
      'Scope of representation (specific and bounded)',
      'Fee arrangement (hourly, flat, contingency, retainer)',
      'Billing practices (increment, invoicing frequency)',
      'Retainer amount and replenishment terms',
      'Client responsibilities (information, cooperation)',
      'Withdrawal and termination provisions',
      'File retention and destruction policy',
      'Conflict waiver (if applicable)',
    ],
    tips: [
      'Be as specific as possible about what IS and IS NOT included',
      'Clearly state the fee arrangement in plain language',
      'Include estimated total cost range when possible',
      'Address electronic communication and data security',
      'Get signature from the actual client (not just a representative)',
    ],
  },

  closingLetter: {
    name: 'Matter Closing Letter Framework',
    sections: [
      'Summary of the representation',
      'Outcome achieved',
      'Final billing and outstanding amounts',
      'Return of client documents and property',
      'File retention policy and destruction date',
      'Post-matter obligations (if any)',
      'Thank the client and invite future contact',
    ],
    tips: [
      'Professional and appreciative tone',
      'Clear about what happens to the file',
      'Include any ongoing obligations or deadlines',
      'Request permission to use as reference (if appropriate)',
    ],
  },
};

// ===== RESOURCE LOOKUP FUNCTIONS =====

/**
 * Get the standard of review for a specific motion or context.
 * 
 * @param {string} type - Standard type key
 * @returns {object|null} Standard of review details
 */
export function getStandardOfReview(type) {
  return STANDARDS_OF_REVIEW[type] || null;
}

/**
 * Search across all standards of review for a keyword.
 * 
 * @param {string} query - Search term
 * @returns {object[]} Matching standards
 */
export function searchStandards(query) {
  const queryLower = query.toLowerCase();
  return Object.values(STANDARDS_OF_REVIEW).filter(s =>
    s.name.toLowerCase().includes(queryLower) ||
    s.standard.toLowerCase().includes(queryLower) ||
    (s.application && s.application.toLowerCase().includes(queryLower))
  );
}

/**
 * Get objection framework for a specific context.
 * 
 * @param {string} context - 'deposition', 'discovery', or 'trial'
 * @returns {object|null} Objection framework
 */
export function getObjectionFramework(context) {
  return OBJECTION_FRAMEWORKS[context] || null;
}

/**
 * Get deadline calculation rules for a jurisdiction.
 * 
 * @param {string} jurisdiction - 'federal' or 'newYork'
 * @returns {object|null} Deadline rules
 */
export function getDeadlineRules(jurisdiction) {
  return DEADLINE_RESOURCES.calculationRules[jurisdiction] || null;
}

/**
 * Get common deadlines comparison.
 * @returns {object[]} Array of deadline comparisons
 */
export function getCommonDeadlines() {
  return DEADLINE_RESOURCES.calculationRules.commonDeadlines;
}

/**
 * Get letter writing framework.
 * 
 * @param {string} type - Letter type key
 * @returns {object|null} Letter framework
 */
export function getLetterFramework(type) {
  return LETTER_FRAMEWORKS[type] || null;
}

/**
 * List all available letter frameworks.
 * @returns {object[]} Array of available frameworks
 */
export function listLetterFrameworks() {
  return Object.entries(LETTER_FRAMEWORKS).map(([key, value]) => ({
    key,
    name: value.name,
    sectionCount: value.sections.length,
  }));
}

/**
 * Get research methodology steps.
 * @returns {object[]} Research steps
 */
export function getResearchMethodology() {
  return RESEARCH_METHODOLOGY.steps;
}

/**
 * Get billing best practices.
 * @returns {object} Billing guidance
 */
export function getBillingGuidance() {
  return BILLING_RESOURCES.timeEntryGuidance;
}

/**
 * Get time entry examples (good and bad).
 * @returns {object} Examples
 */
export function getTimeEntryExamples() {
  return {
    good: BILLING_RESOURCES.timeEntryGuidance.goodExamples,
    bad: BILLING_RESOURCES.timeEntryGuidance.badExamples,
  };
}

/**
 * Search all lawyer resources for a keyword.
 * Unified search across standards, objections, deadlines, letters, and billing.
 * 
 * @param {string} query - Search term
 * @returns {object} Search results grouped by category
 */
export function searchLawyerResources(query) {
  const queryLower = query.toLowerCase();
  const results = {
    standards: [],
    objections: [],
    deadlines: [],
    letters: [],
    billing: [],
    research: [],
  };

  // Search standards of review
  results.standards = Object.entries(STANDARDS_OF_REVIEW)
    .filter(([_, s]) =>
      s.name.toLowerCase().includes(queryLower) ||
      s.standard.toLowerCase().includes(queryLower)
    )
    .map(([key, s]) => ({ key, name: s.name, description: s.standard }));

  // Search objection frameworks
  results.objections = Object.entries(OBJECTION_FRAMEWORKS)
    .filter(([_, framework]) => {
      const allText = JSON.stringify(framework).toLowerCase();
      return allText.includes(queryLower);
    })
    .map(([key, f]) => ({ key, name: f.name }));

  // Search deadline info
  const deadlineText = JSON.stringify(DEADLINE_RESOURCES).toLowerCase();
  if (deadlineText.includes(queryLower)) {
    results.deadlines = DEADLINE_RESOURCES.calculationRules.commonDeadlines
      .filter(d => d.event.toLowerCase().includes(queryLower) ||
        d.federal.toLowerCase().includes(queryLower) ||
        d.ny.toLowerCase().includes(queryLower))
      .map(d => ({ event: d.event, federal: d.federal, ny: d.ny }));
  }

  // Search letter frameworks
  results.letters = Object.entries(LETTER_FRAMEWORKS)
    .filter(([_, f]) => f.name.toLowerCase().includes(queryLower))
    .map(([key, f]) => ({ key, name: f.name }));

  // Search billing resources
  const billingText = JSON.stringify(BILLING_RESOURCES).toLowerCase();
  if (billingText.includes(queryLower)) {
    results.billing.push({ name: 'Time Entry Best Practices', match: true });
  }

  // Search research methodology
  results.research = RESEARCH_METHODOLOGY.steps
    .filter(s => s.name.toLowerCase().includes(queryLower) ||
      s.description.toLowerCase().includes(queryLower))
    .map(s => ({ step: s.step, name: s.name, description: s.description }));

  return results;
}

/**
 * Build a task-specific resource bundle.
 * Automatically selects the most relevant resources for a given task type.
 * 
 * @param {string} taskType - Type of legal work
 * @param {object} context - Additional context
 * @returns {object} Resource bundle
 */
export function getTaskResourceBundle(taskType, context = {}) {
  const bundle = {
    taskType,
    resources: [],
  };

  const taskLower = (taskType || '').toLowerCase();

  // Standards of review for motion-related tasks
  if (/motion|summary|dismiss|injunction|brief/.test(taskLower)) {
    if (/summary/.test(taskLower)) {
      bundle.resources.push({ type: 'standard', data: STANDARDS_OF_REVIEW.summary_judgment });
    }
    if (/dismiss/.test(taskLower)) {
      bundle.resources.push({ type: 'standard', data: STANDARDS_OF_REVIEW.motion_to_dismiss });
    }
    if (/injunction|tro|restraining/.test(taskLower)) {
      bundle.resources.push({ type: 'standard', data: STANDARDS_OF_REVIEW.preliminary_injunction });
    }
  }

  // Objection frameworks for deposition/discovery tasks
  if (/deposition/.test(taskLower)) {
    bundle.resources.push({ type: 'objections', data: OBJECTION_FRAMEWORKS.deposition });
  }
  if (/discovery|interrogator|document.*request|production/.test(taskLower)) {
    bundle.resources.push({ type: 'objections', data: OBJECTION_FRAMEWORKS.discovery });
  }
  if (/trial|hearing|eviden/.test(taskLower)) {
    bundle.resources.push({ type: 'objections', data: OBJECTION_FRAMEWORKS.trial });
  }

  // Letter frameworks for communication tasks
  if (/demand|collection/.test(taskLower)) {
    bundle.resources.push({ type: 'letter', data: LETTER_FRAMEWORKS.demandLetter });
  }
  if (/status.*update|client.*update|update.*client/.test(taskLower)) {
    bundle.resources.push({ type: 'letter', data: LETTER_FRAMEWORKS.clientStatusUpdate });
  }
  if (/engagement|retainer|fee.*agreement/.test(taskLower)) {
    bundle.resources.push({ type: 'letter', data: LETTER_FRAMEWORKS.engagementLetter });
  }
  if (/closing|close.*matter|archive/.test(taskLower)) {
    bundle.resources.push({ type: 'letter', data: LETTER_FRAMEWORKS.closingLetter });
  }

  // Billing guidance for billing-related tasks
  if (/bill|invoice|time.*entry|time.*review|unbilled/.test(taskLower)) {
    bundle.resources.push({ type: 'billing', data: BILLING_RESOURCES.timeEntryGuidance });
  }

  // Research methodology for research tasks
  if (/research|legal.*issue|statute|case.*law|precedent/.test(taskLower)) {
    bundle.resources.push({ type: 'research', data: RESEARCH_METHODOLOGY });
  }

  // Deadline resources for deadline/calendar tasks
  if (/deadline|calendar|sol|statute.*limitation|filing|due.*date/.test(taskLower)) {
    bundle.resources.push({ type: 'deadlines', data: DEADLINE_RESOURCES.calculationRules });
  }

  return bundle;
}

/**
 * Format a resource bundle into a prompt-injectable string.
 * 
 * @param {object} bundle - Resource bundle from getTaskResourceBundle
 * @returns {string} Formatted prompt text
 */
export function formatResourceBundleForPrompt(bundle) {
  if (!bundle || !bundle.resources || bundle.resources.length === 0) {
    return '';
  }

  let prompt = `\n## LAWYER RESOURCES (for this task)\n\n`;

  for (const resource of bundle.resources.slice(0, 3)) { // Cap at 3 resources for token efficiency
    switch (resource.type) {
      case 'standard':
        prompt += `### Standard: ${resource.data.name}\n`;
        prompt += `**Standard:** ${resource.data.standard}\n`;
        if (resource.data.federalRule) prompt += `**Federal Rule:** ${resource.data.federalRule}\n`;
        if (resource.data.nyRule) prompt += `**NY Rule:** ${resource.data.nyRule}\n`;
        prompt += `**Key Principles:**\n`;
        for (const p of resource.data.keyPrinciples.slice(0, 3)) {
          prompt += `- ${p}\n`;
        }
        if (resource.data.commonMistakes) {
          prompt += `**Avoid:**\n`;
          for (const m of resource.data.commonMistakes.slice(0, 2)) {
            prompt += `- ${m}\n`;
          }
        }
        prompt += '\n';
        break;

      case 'objections':
        prompt += `### ${resource.data.name}\n`;
        for (const obj of resource.data.commonObjections.slice(0, 5)) {
          prompt += `- **${obj.objection}:** ${obj.basis}\n`;
        }
        prompt += '\n';
        break;

      case 'letter':
        prompt += `### ${resource.data.name}\n`;
        prompt += `**Structure:** ${resource.data.sections.join(' → ')}\n`;
        prompt += `**Tips:** ${resource.data.tips.slice(0, 3).join('; ')}\n\n`;
        break;

      case 'billing':
        prompt += `### Billing Best Practices\n`;
        for (const p of resource.data.principles.slice(0, 4)) {
          prompt += `- ${p}\n`;
        }
        prompt += '\n';
        break;

      case 'research':
        prompt += `### Research Methodology\n`;
        for (const step of resource.data.steps.slice(0, 4)) {
          prompt += `- **Step ${step.step} (${step.name}):** ${step.description}\n`;
        }
        prompt += '\n';
        break;

      case 'deadlines':
        prompt += `### Deadline Rules\n`;
        if (resource.data.newYork) {
          prompt += `**NY:** Mail adds ${resource.data.newYork.mailService}. ${resource.data.newYork.lastDayRule}\n`;
        }
        if (resource.data.federal) {
          prompt += `**Federal:** Mail adds ${resource.data.federal.threeExtraDays}. ${resource.data.federal.lastDayRule}\n`;
        }
        prompt += '\n';
        break;
    }
  }

  return prompt;
}

export default {
  STANDARDS_OF_REVIEW,
  OBJECTION_FRAMEWORKS,
  BILLING_RESOURCES,
  DEADLINE_RESOURCES,
  RESEARCH_METHODOLOGY,
  LETTER_FRAMEWORKS,
  getStandardOfReview,
  searchStandards,
  getObjectionFramework,
  getDeadlineRules,
  getCommonDeadlines,
  getLetterFramework,
  listLetterFrameworks,
  getResearchMethodology,
  getBillingGuidance,
  getTimeEntryExamples,
  searchLawyerResources,
  getTaskResourceBundle,
  formatResourceBundleForPrompt,
};
