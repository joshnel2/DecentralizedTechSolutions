/**
 * Compliance Check Module
 */

export const complianceCheckModule = {
  metadata: {
    name: 'Compliance Check',
    description: 'Verify ethical compliance including trust accounts and conflict checks',
    category: 'compliance',
    estimatedMinutes: 6,
    complexity: 'medium',
    tags: ['compliance', 'ethics', 'trust', 'conflicts'],
  },
  
  requiredContext: [],
  optionalContext: ['matterId', 'clientId'],
  
  executionPlan: [
    { name: 'Matter Review', description: 'Load matter information', tools: ['get_matter', 'list_my_matters'], required: true },
    { name: 'Conflict Analysis', description: 'Check for potential conflicts', tools: ['list_clients', 'add_matter_note'], required: true },
    { name: 'Engagement Review', description: 'Verify engagement documentation', tools: ['list_documents', 'add_matter_note'], required: true },
    { name: 'Trust Compliance', description: 'Check trust account rules', tools: ['add_matter_note'], required: true },
    { name: 'Compliance Report', description: 'Create compliance summary', tools: ['create_document'], required: true },
    { name: 'Follow-up Tasks', description: 'Tasks for compliance issues', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'notes_created', minValue: 2, description: 'Compliance analysis notes' },
    { metric: 'documents_created', minValue: 1, description: 'Compliance report' },
    { metric: 'tasks_created', minValue: 1, description: 'Follow-up tasks for issues' },
  ],
  
  expectedOutputs: [
    'Conflict check results',
    'Engagement letter status',
    'Trust account compliance status',
    'Formal compliance report',
    'Tasks for any issues found',
  ],
  
  instructions: `
## COMPLIANCE CHECK WORKFLOW

### NY RULES OF PROFESSIONAL CONDUCT
- Rule 1.7: Conflict of Interest (Current Clients)
- Rule 1.8: Specific Conflict Rules
- Rule 1.9: Duties to Former Clients
- Rule 1.10: Imputed Conflicts
- Rule 1.15: Safekeeping Property (Trust Accounts)
- Rule 1.5: Fees and Engagement Letters

### CONFLICT CHECK PROCESS
1. Search client database for:
   - Adverse parties
   - Related entities
   - Former clients with similar matters
2. Document any potential conflicts
3. Assess if conflict is waivable
4. Note if informed consent obtained

### ENGAGEMENT LETTER CHECKLIST
- [ ] Signed engagement letter on file
- [ ] Scope of representation defined
- [ ] Fee arrangement documented
- [ ] Billing rates specified
- [ ] Retainer requirements met
- [ ] Termination provisions included

### TRUST ACCOUNT COMPLIANCE (IOLA)
- Client funds properly deposited
- No commingling with operating funds
- Proper documentation of all transactions
- Regular reconciliation
- Interest properly designated

### COMPLIANCE REPORT FORMAT
\`\`\`
MATTER COMPLIANCE REVIEW

Matter: [Name]
Client: [Name]
Date: [Date]

CONFLICT CHECK
Status: [Clear / Issue Found / Waiver Obtained]
[Details]

ENGAGEMENT DOCUMENTATION
Status: [Complete / Missing Items]
[Details]

TRUST ACCOUNT STATUS
Status: [Compliant / Issue Found / N/A]
[Details]

ISSUES REQUIRING ATTENTION
1. [Issue]
2. [Issue]

RECOMMENDATIONS
[Actions needed]
\`\`\`
`,
};
