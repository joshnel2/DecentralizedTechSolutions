/**
 * Deadline Audit Module
 * 
 * Comprehensive deadline review including:
 * - Statute of limitations tracking
 * - Court filing deadlines
 * - Discovery deadlines
 * - Critical date identification
 */

export const deadlineAuditModule = {
  metadata: {
    name: 'Deadline Audit',
    description: 'Check all matters for upcoming deadlines and statute of limitations',
    category: 'calendar',
    estimatedMinutes: 6,
    complexity: 'medium',
    tags: ['calendar', 'deadlines', 'compliance', 'sol'],
  },
  
  requiredContext: [],
  optionalContext: ['matterId', 'daysAhead'],
  
  executionPlan: [
    {
      name: 'Review Calendar',
      description: 'Get upcoming calendar events and deadlines',
      tools: ['get_calendar_events'],
      required: true,
    },
    {
      name: 'Review Active Matters',
      description: 'Check all active matters for deadline info',
      tools: ['list_my_matters', 'get_matter'],
      required: true,
    },
    {
      name: 'Identify Missing Deadlines',
      description: 'Flag matters without SOL or critical dates',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Create Deadline Report',
      description: 'Generate prioritized deadline document',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Create Reminder Events',
      description: 'Add calendar reminders for critical deadlines',
      tools: ['create_calendar_event'],
      required: true,
    },
    {
      name: 'Create Follow-up Tasks',
      description: 'Tasks for deadline verification',
      tools: ['create_task'],
      required: true,
    },
  ],
  
  qualityGates: [
    {
      metric: 'matters_reviewed',
      minValue: 3,
      description: 'Review at least 3 matters (or all if fewer)',
    },
    {
      metric: 'notes_created',
      minValue: 1,
      description: 'Deadline analysis note created',
    },
    {
      metric: 'documents_created',
      minValue: 1,
      description: 'Deadline report document created',
    },
    {
      metric: 'calendar_events',
      minValue: 1,
      description: 'At least one reminder created',
    },
  ],
  
  expectedOutputs: [
    'List of all upcoming deadlines (30 days)',
    'Matters with missing SOL information flagged',
    'Prioritized deadline report document',
    'Calendar reminders for critical dates',
    'Tasks for deadline verification',
  ],
  
  instructions: `
## DEADLINE AUDIT WORKFLOW

You are conducting a deadline audit as a junior attorney. Missing a deadline is MALPRACTICE.

### CRITICAL IMPORTANCE
Deadline management is the #1 source of legal malpractice claims. Be THOROUGH.

### NY CPLR STATUTE OF LIMITATIONS REFERENCE
- Personal Injury: 3 years (CPLR 214(5))
- Medical Malpractice: 2.5 years (CPLR 214-a)
- Legal Malpractice: 3 years (CPLR 214(6))
- Breach of Contract: 6 years (CPLR 213(2))
- Property Damage: 3 years (CPLR 214(4))
- Fraud: 6 years from commission, 2 years from discovery (CPLR 213(8))
- Products Liability: 3 years (CPLR 214(5))
- Wrongful Death: 2 years (EPTL 5-4.1)
- UCC Sales: 4 years (UCC 2-725)

### PHASE 1: CALENDAR REVIEW
1. Use \`get_calendar_events\` with days_ahead: 30
2. Categorize events by type:
   - Court dates (CRITICAL)
   - Filing deadlines (CRITICAL)
   - Discovery deadlines (HIGH)
   - Client meetings (NORMAL)
   - Internal reminders (LOW)

### PHASE 2: MATTER-BY-MATTER REVIEW
For each active matter:
1. Use \`get_matter\` to check matter details
2. Identify:
   - Date of incident/claim accrual
   - Applicable SOL period
   - SOL expiration date
   - Any tolling factors
   - Key litigation deadlines

### PHASE 3: GAP ANALYSIS
Flag matters that are MISSING:
- SOL date
- Key filing deadlines
- Response deadlines
- Discovery deadlines

### PHASE 4: DEADLINE ANALYSIS NOTE
Create note with \`add_matter_note\`:

\`\`\`
DEADLINE AUDIT - [Date]

CRITICAL DEADLINES (Next 30 Days):
⚠️ [Date]: [Matter] - [Deadline] - [Days remaining]
⚠️ [Date]: [Matter] - [Deadline] - [Days remaining]

HIGH PRIORITY:
- [Date]: [Matter] - [Deadline]

MATTERS MISSING SOL INFORMATION:
❌ [Matter Name] - No SOL date recorded
❌ [Matter Name] - Incident date unclear

STATUTE OF LIMITATIONS STATUS:
- [Matter]: SOL expires [Date] ([X days/months remaining])

RECOMMENDATIONS:
1. [Action needed]
2. [Action needed]
\`\`\`

### PHASE 5: DEADLINE REPORT DOCUMENT
Create document with \`create_document\`:
- Title: "Deadline Report - [Month Year]"
- Format as prioritized table
- Include: Matter, Deadline Type, Date, Days Remaining, Status
- Color-code by urgency

### PHASE 6: CALENDAR REMINDERS
Create calendar events for:
1. SOL warning (30 days before)
2. SOL warning (7 days before)
3. Any critical deadlines without existing reminders

### PHASE 7: FOLLOW-UP TASKS
Create tasks:
1. "Verify SOL dates for flagged matters"
2. "Calendar critical deadline: [specific deadline]"
3. "Review deadline report with supervising partner"

### DEADLINE PRIORITY LEVELS
- 🔴 CRITICAL: SOL, court appearances, filing deadlines
- 🟠 HIGH: Discovery deadlines, response deadlines
- 🟡 MEDIUM: Internal deadlines, client meetings
- 🟢 LOW: Administrative, optional
`,
};
