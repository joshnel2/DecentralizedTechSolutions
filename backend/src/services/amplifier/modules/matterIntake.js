/**
 * Matter Intake Module
 * 
 * Handles complete new matter setup including:
 * - Initial case assessment
 * - Task checklist creation
 * - Deadline identification
 * - Document folder structure
 * - Client communication templates
 */

export const matterIntakeModule = {
  metadata: {
    name: 'New Matter Intake',
    description: 'Complete setup for a new legal matter with tasks, deadlines, and initial documentation',
    category: 'matters',
    estimatedMinutes: 8,
    complexity: 'medium',
    tags: ['matters', 'intake', 'tasks', 'deadlines'],
  },
  
  requiredContext: [],
  optionalContext: ['clientName', 'matterType', 'practiceArea', 'jurisdiction'],
  
  executionPlan: [
    {
      name: 'Gather Information',
      description: 'Search for or create the matter and understand context',
      tools: ['search_matters', 'get_matter', 'list_clients'],
      required: true,
    },
    {
      name: 'Create Initial Assessment',
      description: 'Document initial observations and case overview',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Identify Key Deadlines',
      description: 'Research and document applicable deadlines and SOL',
      tools: ['add_matter_note', 'create_calendar_event'],
      required: true,
    },
    {
      name: 'Create Task Checklist',
      description: 'Generate standard intake tasks for the matter type',
      tools: ['create_task'],
      required: true,
    },
    {
      name: 'Prepare Initial Document',
      description: 'Create matter overview document for the file',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Schedule Follow-up',
      description: 'Set reminders for matter review',
      tools: ['create_calendar_event', 'create_task'],
      required: false,
    },
  ],
  
  qualityGates: [
    {
      metric: 'notes_created',
      minValue: 1,
      description: 'At least one case note documenting initial assessment',
    },
    {
      metric: 'tasks_created',
      minValue: 3,
      description: 'At least 3 intake tasks created',
    },
    {
      metric: 'calendar_events',
      minValue: 1,
      description: 'At least one deadline or reminder scheduled',
    },
    {
      metric: 'documents_created',
      minValue: 1,
      description: 'Matter overview document created',
    },
  ],
  
  expectedOutputs: [
    'Initial case assessment note in matter Notes tab',
    'Intake task checklist (minimum 3 tasks)',
    'Key deadlines identified and calendared',
    'Matter overview document in Documents section',
    'Follow-up review scheduled',
  ],
  
  instructions: `
## MATTER INTAKE WORKFLOW

You are setting up a new matter for a junior attorney. Follow these guidelines:

### PHASE 1: DISCOVERY
1. Use \`search_matters\` or \`get_matter\` to find the matter
2. Note the matter type, client, and any existing information
3. If matter is empty, that's OK - you're building the foundation

### PHASE 2: INITIAL ASSESSMENT NOTE
Create a comprehensive note using \`add_matter_note\` including:
- Matter overview (what we know)
- Initial observations
- Potential legal issues
- Key facts to investigate
- Information needed from client

### PHASE 3: DEADLINE IDENTIFICATION
Research and document applicable deadlines:
- Statute of limitations (based on claim type)
- Filing deadlines
- Discovery deadlines (if litigation)
- Response deadlines

For NY matters, check CPLR deadlines:
- Personal injury: 3 years (CPLR 214)
- Contract: 6 years (CPLR 213)
- Professional malpractice: 3 years (CPLR 214)
- Property damage: 3 years (CPLR 214)

Create calendar events for CRITICAL deadlines.

### PHASE 4: TASK CHECKLIST
Create intake tasks using \`create_task\`:
1. "Obtain signed engagement letter"
2. "Collect documents from client"
3. "Complete conflict check"
4. "Open file and create folder structure"
5. "Initial client interview"
6. "Research applicable law"
7. "Prepare initial case strategy memo" (if complex)

### PHASE 5: MATTER OVERVIEW DOCUMENT
Create a formal document using \`create_document\`:
- Title: "Matter Overview - [Matter Name]"
- Include: Parties, claims, key dates, status, next steps
- Format professionally with headers

### PHASE 6: FOLLOW-UP
- Schedule 30-day review: "Review matter status - [Matter Name]"
- Create task: "Partner review of new matter setup"

### IMPORTANT
- Do NOT use placeholder text like "[INSERT]"
- Use ACTUAL information from the matter
- If information is missing, note "TBD" or "To be obtained"
- Be thorough - you're building the foundation for the entire case
`,
};
