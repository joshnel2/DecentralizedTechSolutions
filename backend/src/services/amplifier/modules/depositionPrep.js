/**
 * Deposition Preparation Module
 * 
 * Guides the junior attorney agent through comprehensive
 * deposition preparation including:
 * - Witness background research
 * - Examination outline with specific questions
 * - Key document identification for exhibits
 * - Chronological timeline construction
 * - Objection reference preparation
 * 
 * Supports both taking and defending depositions.
 */

export const depositionPrepModule = {
  metadata: {
    name: 'Deposition Preparation',
    description: 'Prepare comprehensive deposition outline with key documents and examination topics',
    category: 'litigation',
    estimatedMinutes: 12,
    complexity: 'high',
    tags: ['litigation', 'deposition', 'discovery', 'witness', 'examination', 'junior-attorney'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['witnessName', 'depositionType', 'depositionDate'],
  
  executionPlan: [
    {
      name: 'Review Matter Background',
      description: 'Load matter details and understand the case posture',
      tools: ['get_matter', 'list_documents'],
      required: true,
    },
    {
      name: 'Review Key Documents',
      description: 'Read relevant documents to identify examination topics',
      tools: ['read_document_content', 'search_document_content'],
      required: true,
    },
    {
      name: 'Build Chronological Timeline',
      description: 'Create a timeline of key events for reference during deposition',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Draft Examination Outline',
      description: 'Create detailed examination outline organized by topic',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Prepare Exhibit List',
      description: 'Identify and organize documents to use as deposition exhibits',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Prepare Objection Reference',
      description: 'Create quick-reference guide for deposition objections',
      tools: ['add_matter_note'],
      required: false,
    },
    {
      name: 'Create Follow-up Tasks',
      description: 'Tasks for deposition notice, witness prep, and logistics',
      tools: ['create_task', 'create_calendar_event'],
      required: true,
    },
  ],
  
  qualityGates: [
    {
      metric: 'documents_read',
      minValue: 2,
      description: 'At least two matter documents reviewed for deposition topics',
    },
    {
      metric: 'notes_created',
      minValue: 2,
      description: 'Timeline note and exhibit list note created',
    },
    {
      metric: 'documents_created',
      minValue: 1,
      description: 'Examination outline document created',
    },
    {
      metric: 'tasks_created',
      minValue: 2,
      description: 'Deposition preparation tasks created',
    },
  ],
  
  expectedOutputs: [
    'Examination outline organized by topic with specific questions',
    'Chronological timeline of key events',
    'Exhibit list with document references',
    'Objection quick-reference guide',
    'Deposition preparation checklist',
    'Follow-up discovery recommendations',
  ],
  
  instructions: `
## DEPOSITION PREPARATION WORKFLOW — JUNIOR ATTORNEY

You are preparing for a deposition as a junior associate attorney. Thorough preparation
is the most important factor in a successful deposition. The partner will rely on your
outline during examination.

### PHASE 1: CASE REVIEW (Discovery Phase)

1. Use \`get_matter\` to understand:
   - Case type and claims/defenses
   - Parties involved
   - Current case posture
   - Key legal issues

2. Use \`list_documents\` and \`read_document_content\` to review:
   - **Pleadings:** Complaint, Answer, Counterclaims
   - **Discovery:** Interrogatory responses, document productions
   - **Contracts/Agreements:** Any referenced in pleadings
   - **Correspondence:** Key emails, letters between parties
   - **Prior Testimony:** Earlier depositions, affidavits
   - **Expert Reports:** If available

3. Take notes on:
   - Key facts and dates
   - Contradictions or gaps in the record
   - Documents the witness authored, received, or is referenced in
   - Areas where witness's account differs from documents

### PHASE 2: TIMELINE AND ANALYSIS (Analysis Phase)

Create a chronological timeline with \`add_matter_note\`:

\`\`\`
DEPOSITION PREPARATION — CHRONOLOGICAL TIMELINE

Matter: [Matter Name]
Witness: [Witness Name, if known]
Date: [Preparation Date]

TIMELINE OF KEY EVENTS:
[Date] — [Event] (Source: [Document/Testimony])
[Date] — [Event] (Source: [Document/Testimony])
[Date] — [Event] (Source: [Document/Testimony])
...

KEY CONTRADICTIONS / GAPS:
1. [Description of contradiction] (Compare: [Doc A] vs. [Doc B])
2. [Description of gap] (Missing: [What information is needed])
...

DOCUMENTS WITNESS SHOULD BE QUESTIONED ABOUT:
1. [Document name and description] — [Why it matters]
2. [Document name and description] — [Why it matters]
...
\`\`\`

### PHASE 3: EXAMINATION OUTLINE (Action Phase)

Create the examination outline with \`create_document\` (MINIMUM 600 words):

\`\`\`
DEPOSITION EXAMINATION OUTLINE

Matter: [Matter Name]
Witness: [Witness Name]
Deposition Type: [Taking / Defending]
Prepared By: [Agent — Draft for Partner Review]
Date Prepared: [Date]

═══════════════════════════════════════════════

TOPIC 1: BACKGROUND & FOUNDATION
Goals: Establish witness identity, role, and basis of knowledge

Q: Please state your full name for the record.
Q: What is your current position and title?
Q: How long have you been in this role?
Q: Describe your responsibilities relevant to [subject matter].
Q: What is your educational background?
Q: What documents did you review in preparation for this deposition?

KEY DOCUMENTS: [List relevant docs for this topic]
NOTES: [What to listen for, potential follow-ups]

───────────────────────────────────────────────

TOPIC 2: [CORE FACTUAL ISSUE 1]
Goals: [What you need to establish]

Q: [Specific question tied to a document or fact]
   → Follow-up if yes: [Question]
   → Follow-up if no: [Question]
Q: [Question about specific communication/event]
   → Exhibit: [Reference document to be marked]
Q: [Question about witness's knowledge/involvement]

KEY DOCUMENTS: [Exhibits for this topic]
NOTES: [Expected testimony, contradictions to probe]

───────────────────────────────────────────────

TOPIC 3: [CORE FACTUAL ISSUE 2]
Goals: [What you need to establish]

Q: [Questions...]

KEY DOCUMENTS: [Exhibits for this topic]
NOTES: [Expected testimony, contradictions to probe]

───────────────────────────────────────────────

[ADDITIONAL TOPICS AS NEEDED]

───────────────────────────────────────────────

TOPIC [N]: DAMAGES / CLOSING
Goals: Establish knowledge of harm, quantification, mitigation

Q: [Questions about damages, losses, or impact]
Q: [Questions about mitigation efforts]
Q: Is there anything else you would like to add?

═══════════════════════════════════════════════

OBJECTION QUICK REFERENCE
- FORM: Compound, leading, vague, assumes facts not in evidence
- PRIVILEGE: Attorney-client, work product — INSTRUCT NOT TO ANSWER
- HARASSMENT: Argumentative, asked and answered
- SCOPE: Beyond scope of notice (Rule 30(b)(6) designations)
- NOTE: Object concisely and non-argumentatively (FRCP 30(c))
- NOTE: Only instruct not to answer for PRIVILEGE, court order, or to seek protective order

EXHIBITS TO MARK
1. [Document name] — Use with Topic [X], Question [Y]
2. [Document name] — Use with Topic [X], Question [Y]
...

POST-DEPOSITION FOLLOW-UP
1. [Additional discovery needed based on testimony]
2. [Witnesses to depose based on testimony]
3. [Documents to request based on testimony]
\`\`\`

### PHASE 4: PREPARATION CHECKLIST (Review Phase)

Create exhibit list note with \`add_matter_note\`:
- List all documents to be used as exhibits, numbered
- Note which topic each exhibit relates to
- Flag any documents not yet in the record

Create tasks with \`create_task\`:
1. "Partner review: Deposition outline for [Witness]"
2. "Prepare deposition exhibit binders (copies for all parties)"
3. "Serve deposition notice on all parties" (if taking)
4. "Prepare witness for deposition" (if defending)
5. "Book court reporter and conference room"
6. "Order deposition transcript after completion"

Create calendar events with \`create_calendar_event\`:
- Deposition date and time
- Preparation meeting with partner (2-3 days before)
- Deadline for deposition notice service
- Transcript review deadline

### DEFENDING A DEPOSITION (If defending our client/witness)

If this is a DEFENDING deposition, also:
1. Identify likely examination topics from opposing party's claims
2. Prepare the witness on key documents they will be asked about
3. Practice difficult questions and appropriate responses
4. Review instruction to not guess, not volunteer, and answer only what is asked
5. Prepare for potential privilege situations and instructions not to answer
6. Create note with witness preparation topics and practice areas

### IMPORTANT REMINDERS
- All preparation documents are WORK PRODUCT — privileged
- The examination outline is a GUIDE, not a script — adapt during deposition
- Listen to answers carefully — follow up on unexpected testimony
- Mark exhibits sequentially during the deposition
- Reserve the right to recall the witness if needed
`,
};
