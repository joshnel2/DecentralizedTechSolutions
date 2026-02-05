/**
 * Discovery Prep Module
 */

export const discoveryPrepModule = {
  metadata: {
    name: 'Discovery Preparation',
    description: 'Prepare for discovery with document organization and request drafting',
    category: 'documents',
    estimatedMinutes: 12,
    complexity: 'high',
    tags: ['discovery', 'litigation', 'documents', 'disclosure'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['discoveryType'],
  
  executionPlan: [
    { name: 'Review Matter', description: 'Understand case posture', tools: ['get_matter'], required: true },
    { name: 'Document Inventory', description: 'Catalog all documents', tools: ['list_documents'], required: true },
    { name: 'Categorize Documents', description: 'Organize by type and relevance', tools: ['add_matter_note'], required: true },
    { name: 'Privilege Review', description: 'Identify privileged documents', tools: ['add_matter_note'], required: true },
    { name: 'Draft Requests', description: 'Prepare discovery requests', tools: ['create_document'], required: true },
    { name: 'Production Checklist', description: 'Create production plan', tools: ['create_document', 'create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'notes_created', minValue: 2, description: 'Document categorization and privilege notes' },
    { metric: 'documents_created', minValue: 2, description: 'Discovery requests and production checklist' },
  ],
  
  expectedOutputs: [
    'Document categorization memo',
    'Privilege log draft',
    'Discovery requests (interrogatories, document demands)',
    'Production checklist',
  ],
  
  instructions: `
## DISCOVERY PREPARATION WORKFLOW

### NY CPLR DISCOVERY RULES (Article 31)
- CPLR 3101: Scope of disclosure
- CPLR 3120: Discovery and production of documents
- CPLR 3130: Interrogatories
- CPLR 3101(c): Attorney work product protection
- CPLR 3101(b): Attorney-client privilege

### DOCUMENT CATEGORIZATION
Organize documents by:
1. **Highly Relevant** - Core to claims/defenses
2. **Relevant** - Supporting information
3. **Potentially Relevant** - May become relevant
4. **Privileged** - Protected from disclosure
5. **Confidential** - May need protective order

### PRIVILEGE FLAGS
- Attorney-client communications
- Work product
- Common interest
- Mediation communications

### DISCOVERY REQUEST TYPES
1. **Interrogatories** - Written questions (NY limit: varies by court)
2. **Document Demands** - Requests for production
3. **Admissions** - Requests to admit
4. **Depositions** - Oral examination notices
`,
};
