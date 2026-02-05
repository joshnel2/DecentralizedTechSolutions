/**
 * Billing Review Module
 * 
 * Comprehensive billing analysis including:
 * - Time entry review
 * - Description improvements
 * - Invoice preparation
 * - Budget tracking
 */

export const billingReviewModule = {
  metadata: {
    name: 'Monthly Billing Review',
    description: 'Analyze time entries, prepare invoices, and identify billing issues',
    category: 'billing',
    estimatedMinutes: 10,
    complexity: 'high',
    tags: ['billing', 'invoices', 'time', 'financial'],
  },
  
  requiredContext: [],
  optionalContext: ['clientId', 'matterId', 'dateRange'],
  
  executionPlan: [
    {
      name: 'Gather Time Entries',
      description: 'Get all unbilled time entries for review',
      tools: ['get_my_time_entries', 'list_matters'],
      required: true,
    },
    {
      name: 'Analyze Descriptions',
      description: 'Review time entry descriptions for clarity and detail',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Check Budget Status',
      description: 'Compare billed vs budgeted amounts',
      tools: ['get_matter', 'list_invoices'],
      required: true,
    },
    {
      name: 'Identify Issues',
      description: 'Flag entries for write-off or revision',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Create Billing Summary',
      description: 'Generate billing-ready summary document',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Create Follow-up Tasks',
      description: 'Tasks for billing coordinator',
      tools: ['create_task'],
      required: true,
    },
  ],
  
  qualityGates: [
    {
      metric: 'notes_created',
      minValue: 1,
      description: 'Billing analysis note created',
    },
    {
      metric: 'documents_created',
      minValue: 1,
      description: 'Billing summary document created',
    },
    {
      metric: 'tasks_created',
      minValue: 2,
      description: 'Follow-up tasks for billing team',
    },
  ],
  
  expectedOutputs: [
    'Analysis of unbilled time entries',
    'List of entries needing description improvements',
    'Write-off recommendations with justification',
    'Budget vs actual comparison',
    'Billing-ready summary grouped by matter',
    'Tasks for billing coordinator',
  ],
  
  instructions: `
## BILLING REVIEW WORKFLOW

You are assisting with monthly billing as a junior attorney. Be accurate and detail-oriented.

### IMPORTANT: TIME ENTRY RULES
- NEVER use \`log_time\` - time entries are for humans to create
- Your role is to REVIEW and ANALYZE existing entries
- Flag issues but don't modify time entries directly

### PHASE 1: GATHER DATA
1. Use \`get_my_time_entries\` to get unbilled time
2. Use \`list_matters\` to see active matters
3. Use \`list_invoices\` to see existing invoices

### PHASE 2: DESCRIPTION ANALYSIS
Review each time entry for:
- Clarity: Does it explain what was done?
- Detail: Is it specific enough to justify the time?
- Format: Follows billing guidelines?

Common issues:
- "Research" → Too vague, should specify topic
- "Call with client" → Add purpose/outcome
- "Document review" → Specify which documents
- Block billing → Break into discrete tasks

### PHASE 3: BUDGET ANALYSIS
For each matter:
1. Get matter details including budget info
2. Calculate total billed vs budget
3. Flag matters approaching or exceeding budget
4. Note matters with significant unbilled time

### PHASE 4: BILLING ANALYSIS NOTE
Create a note with \`add_matter_note\` for each relevant matter:

\`\`\`
BILLING REVIEW - [Month/Year]

UNBILLED TIME SUMMARY:
- Total unbilled hours: X.X
- Total unbilled value: $X,XXX

ENTRIES NEEDING REVISION:
- [Date] [Hours] "[Description]" 
  → Suggestion: [Improved description]

WRITE-OFF RECOMMENDATIONS:
- [Entry] - Reason: [Explanation]
- Estimated write-off: $XXX

BUDGET STATUS:
- Budget: $X,XXX
- Billed to date: $X,XXX
- Remaining: $X,XXX
- Status: [On track / At risk / Over budget]

NOTES:
- [Any other observations]
\`\`\`

### PHASE 5: BILLING SUMMARY DOCUMENT
Create formal document with \`create_document\`:
- Title: "Billing Summary - [Month Year]"
- Group by client/matter
- Include totals and recommendations
- Professional table format

### PHASE 6: FOLLOW-UP TASKS
Create tasks:
1. "Review and revise flagged time entry descriptions"
2. "Process recommended write-offs for approval"
3. "Generate invoices for billing-ready matters"
4. "Discuss budget status with [client] before invoicing" (if over budget)

### BILLING BEST PRACTICES
- All entries should have task codes if used
- Descriptions should be specific and verifiable
- Review for excessive time on routine tasks
- Flag duplicate or overlapping entries
- Note any courtesy adjustments needed
`,
};
