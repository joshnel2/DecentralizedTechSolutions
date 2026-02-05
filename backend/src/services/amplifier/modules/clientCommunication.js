/**
 * Client Communication Module
 */

export const clientCommunicationModule = {
  metadata: {
    name: 'Client Update Prep',
    description: 'Prepare client status updates and communication drafts',
    category: 'clients',
    estimatedMinutes: 5,
    complexity: 'low',
    tags: ['clients', 'communication', 'emails', 'status'],
  },
  
  requiredContext: [],
  optionalContext: ['clientId', 'matterId'],
  
  executionPlan: [
    { name: 'Gather Matter Status', description: 'Review recent activity', tools: ['get_matter', 'list_my_matters'], required: true },
    { name: 'Review Recent Activity', description: 'Check documents, notes, events', tools: ['list_documents', 'get_calendar_events'], required: true },
    { name: 'Draft Status Update', description: 'Create client communication', tools: ['add_matter_note', 'create_document'], required: true },
    { name: 'Schedule Follow-up', description: 'Set reminder for client contact', tools: ['create_task', 'create_calendar_event'], required: true },
  ],
  
  qualityGates: [
    { metric: 'notes_created', minValue: 1, description: 'Communication notes created' },
    { metric: 'documents_created', minValue: 1, description: 'Status update draft created' },
  ],
  
  expectedOutputs: [
    'Summary of recent matter activity',
    'Draft client status update email/letter',
    'Call preparation notes',
    'Follow-up task scheduled',
  ],
  
  instructions: `
## CLIENT COMMUNICATION WORKFLOW

### PHASE 1: ACTIVITY REVIEW
- Get matter details and recent activity
- Check documents for anything to report
- Review upcoming calendar items

### PHASE 2: DRAFT COMMUNICATION
Create a professional client status update including:
- Recent work performed
- Current status summary
- Next steps and timeline
- Any action items for client
- Upcoming events/deadlines

### PHASE 3: PREPARATION NOTES
Create internal notes:
- Topics to discuss
- Questions for client
- Sensitive issues to address carefully

### PHASE 4: FOLLOW-UP
- Schedule client call or meeting
- Create task: "Follow up with [client]"
`,
};
