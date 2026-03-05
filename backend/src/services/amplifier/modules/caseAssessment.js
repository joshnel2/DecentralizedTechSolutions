/**
 * Case Assessment Module
 * 
 * Comprehensive case evaluation following the methodology a supervising
 * partner would expect from a junior attorney assigned to assess a case:
 * 
 * 1. Thorough facts gathering from all available sources
 * 2. IRAC analysis of every legal issue
 * 3. Honest strengths/weaknesses assessment (not advocacy)
 * 4. Liability and damages exposure analysis
 * 5. Strategy recommendation with settlement range
 * 6. Formal assessment memo for the file
 * 
 * The key insight: a case assessment is NOT advocacy. It is an honest,
 * internal evaluation of where the case stands. The attorney needs to
 * know the weaknesses as much as the strengths.
 */

export const caseAssessmentModule = {
  metadata: {
    name: 'Case Assessment & Strategy',
    description: 'Comprehensive litigation case evaluation with IRAC analysis, risk scoring, and strategy recommendations',
    category: 'matters',
    estimatedMinutes: 15,
    complexity: 'high',
    tags: ['litigation', 'strategy', 'analysis', 'memo', 'assessment', 'damages'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['focusIssues', 'matterType', 'ourSide'],
  
  executionPlan: [
    {
      name: 'Gather Case Information',
      description: 'Load matter details, parties, status, and case posture',
      tools: ['get_matter'],
      required: true,
    },
    {
      name: 'Document Inventory & Review',
      description: 'Catalog and read all key documents (pleadings, contracts, correspondence)',
      tools: ['list_documents', 'read_document_content'],
      required: true,
    },
    {
      name: 'Timeline Construction',
      description: 'Build chronological timeline of events from documents and notes',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Legal Issues Analysis (IRAC)',
      description: 'Identify and analyze each legal issue using IRAC method',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Strengths & Weaknesses',
      description: 'Honest assessment of case merits from both sides',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Damages & Exposure Analysis',
      description: 'Evaluate financial exposure and settlement range',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Case Assessment Memo',
      description: 'Create formal assessment document for the file',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Strategic Action Items',
      description: 'Tasks for investigation, discovery, and strategy execution',
      tools: ['create_task'],
      required: true,
    },
  ],
  
  qualityGates: [
    { metric: 'documents_read', minValue: 1, description: 'At least one case document reviewed' },
    { metric: 'notes_created', minValue: 3, description: 'Timeline, IRAC analysis, and strengths/weaknesses notes' },
    { metric: 'documents_created', minValue: 1, description: 'Formal case assessment memo' },
    { metric: 'tasks_created', minValue: 2, description: 'Follow-up investigation and strategy tasks' },
  ],
  
  expectedOutputs: [
    'Chronological case timeline',
    'IRAC analysis for each legal issue',
    'Honest strengths and weaknesses assessment',
    'Liability and damages exposure analysis',
    'Settlement range recommendation',
    'Litigation strategy recommendation',
    'Formal case assessment memorandum',
  ],
  
  instructions: `
## CASE ASSESSMENT WORKFLOW

You are preparing a case assessment as a junior attorney. This will guide strategy decisions by the supervising attorney. Be HONEST — this is an internal document, not advocacy.

**Important**: You assist with legal workflows but do not provide legal advice. Case assessments should be reviewed by the supervising attorney before any decisions are made.

---

### PHASE 1: FACTS GATHERING

Thoroughly review all available information:

1. **Matter details**: Use \`get_matter\` to load matter type, status, parties, and key dates
2. **Document inventory**: Use \`list_documents\` to catalog everything available
3. **Key documents to prioritize reading:**
   - Complaint / Petition / Answer / Counterclaims
   - Contracts / Agreements at issue
   - Key correspondence (demand letters, settlement discussions)
   - Medical records (personal injury)
   - Expert reports
   - Prior court orders / decisions
   - Discovery responses received
   - Deposition transcripts or summaries

4. **Build a chronological timeline** of key events with dates. Document this as a matter note.

---

### PHASE 2: LEGAL ISSUES ANALYSIS (IRAC)

For EVERY legal issue identified, apply the IRAC method:

**I - Issue**: State the specific legal question precisely.
  Example: "Whether defendant's failure to deliver goods by the contract deadline constitutes a material breach entitling plaintiff to damages."

**R - Rule**: Identify the governing law.
  - Applicable statute(s) with citations
  - Controlling case law (if available in documents)
  - Standard of proof
  - Elements of the claim or defense

**A - Application**: Apply the facts to the rule.
  - Which facts support each element?
  - Which facts are disputed?
  - Which facts cut against the claim/defense?
  - What evidence exists (or is missing) for each element?

**C - Conclusion**: State the likely outcome for this issue.
  - Likely outcome on the merits
  - Confidence level (strong/moderate/weak)
  - Key variables that could change the outcome

---

### PHASE 3: STRENGTHS & WEAKNESSES

This is the most important part of a case assessment. Be brutally honest.

**STRENGTHS (Our Side):**
- Strong documentary evidence supporting claims
- Witness availability and credibility
- Clear liability indicators (undisputed breach, clear causation)
- Strong damages evidence (economic losses, medical bills)
- Favorable jurisdiction or venue
- Applicable favorable precedent
- Statute of limitations is clearly satisfied
- Opposing party's prior admissions

**WEAKNESSES (Our Side):**
- Gaps in evidence chain
- Credibility issues with key witnesses
- Statute of limitations concerns
- Comparative fault or contributory negligence exposure
- Damages limitations (speculative, consequential exclusion in contract)
- Unfavorable contract provisions
- Jurisdiction or standing challenges
- Adverse precedent

**OPPOSING PARTY'S LIKELY ARGUMENTS:**
- What will opposing counsel argue on each issue?
- What affirmative defenses are available?
- What counterclaims might be asserted?
- How can we counter each argument?

**WILD CARDS:**
- Key depositions not yet taken
- Expert opinions not yet obtained
- Discovery likely to reveal new facts
- Pending motions or appeals that could change the landscape

---

### PHASE 4: DAMAGES & EXPOSURE ANALYSIS

**For Plaintiff (Assessing Recovery):**

| Damages Category | Amount/Range | Basis | Confidence |
|---|---|---|---|
| Economic (past) | $ | [calculation basis] | [High/Med/Low] |
| Economic (future) | $ | [projection basis] | [High/Med/Low] |
| Non-economic | $ | [comparable cases] | [High/Med/Low] |
| Punitive (if applicable) | $ | [statutory basis] | [High/Med/Low] |
| Attorneys' fees | $ | [statutory/contractual] | [High/Med/Low] |

**For Defendant (Assessing Exposure):**

| Scenario | Probability | Exposure | Expected Value |
|---|---|---|---|
| Best case | [%] | $ | $ |
| Most likely | [%] | $ | $ |
| Worst case | [%] | $ | $ |

**Comparative Fault Reduction**: If applicable, estimate the percentage allocation and reduce accordingly.

**Settlement Range Analysis:**
- Floor: [minimum plaintiff would likely accept / minimum defendant should offer]
- Target: [reasonable settlement given the risk analysis]
- Ceiling: [maximum reasonable settlement / maximum exposure at trial]
- Recommendation: [specific range]

---

### PHASE 5: STRATEGY RECOMMENDATION

Based on the assessment, recommend:

1. **Litigation posture**: Aggressive prosecution / Active defense / Settlement-oriented
2. **Key discovery targets**: What information will most impact the case
3. **Dispositive motions**: Is there a basis for summary judgment or dismissal?
4. **Expert needs**: What experts are needed and for what purpose
5. **Settlement strategy**: When and how to approach settlement
6. **Timeline**: Expected phases and milestones
7. **Budget estimate**: Anticipated legal costs through resolution

---

### CASE ASSESSMENT MEMO FORMAT

\`\`\`
CASE ASSESSMENT MEMORANDUM
PRIVILEGED AND CONFIDENTIAL — ATTORNEY WORK PRODUCT

Matter: [Matter Name / Number]
Date: [Date]
Prepared By: [Agent / Junior Attorney]
For Review By: [Supervising Attorney]

I. EXECUTIVE SUMMARY
[2-3 sentence overview: what the case is about, overall assessment, and primary recommendation]

II. PROCEDURAL POSTURE
[Current status of the case: pre-suit, pleading stage, discovery, motion practice, trial prep, etc.]

III. FACTS
A. Background
[Factual narrative based on available evidence]

B. Key Timeline
| Date | Event |
|---|---|
| [date] | [event] |

C. Disputed Facts
[Facts that are contested between the parties]

IV. LEGAL ISSUES

A. [Issue 1 — e.g., "Breach of Contract"]
Issue: [precise legal question]
Rule: [governing statute/case law]
Application: [facts applied to rule]
Conclusion: [likely outcome and confidence]

B. [Issue 2]
[Same IRAC structure]

C. [Additional issues as needed]

V. STRENGTHS AND WEAKNESSES

A. Strengths
- [strength 1 with supporting evidence]
- [strength 2]

B. Weaknesses
- [weakness 1 with honest assessment]
- [weakness 2]

C. Opposing Party's Likely Arguments
- [argument 1 and our counter]
- [argument 2 and our counter]

VI. DAMAGES / EXPOSURE ANALYSIS
[Best/likely/worst case scenarios with dollar ranges]

Settlement Range: $[floor] - $[ceiling]
Recommended Target: $[amount]

VII. STRATEGIC RECOMMENDATIONS

A. Recommended Litigation Strategy
[Specific approach with rationale]

B. Immediate Next Steps
1. [specific action]
2. [specific action]
3. [specific action]

C. Discovery Plan
[Key targets and priorities]

D. Settlement Considerations
[When to pursue, opening position, walk-away point]

VIII. RISK ASSESSMENT
Overall Risk Level: [GREEN/YELLOW/ORANGE/RED]
Severity: [1-5]
Likelihood of adverse outcome: [1-5]

IX. BUDGET ESTIMATE
[Estimated fees through next phase and through resolution]

X. CONCLUSION
[Summary recommendation: pursue / settle / further investigation needed]
\`\`\`

---

### FOLLOW-UP TASKS TO CREATE

1. "Partner review of case assessment memo"
2. "Investigate [specific gap in evidence]"
3. "Research [specific unsettled legal issue]"
4. "Obtain [missing document or evidence]"
5. "Identify and retain [type of expert]"
6. "Schedule case strategy meeting"
7. "Calendar [upcoming deadline or statute of limitations]"
`,
};
