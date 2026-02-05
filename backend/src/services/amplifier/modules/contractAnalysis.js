/**
 * Contract Analysis Module
 */

export const contractAnalysisModule = {
  metadata: {
    name: 'Contract Analysis',
    description: 'Detailed analysis of contract terms, risks, and negotiation points',
    category: 'documents',
    estimatedMinutes: 8,
    complexity: 'high',
    tags: ['contracts', 'analysis', 'negotiation', 'due-diligence'],
  },
  
  requiredContext: ['documentId'],
  optionalContext: ['matterId', 'contractType'],
  
  executionPlan: [
    { name: 'Read Contract', description: 'Load and analyze contract text', tools: ['read_document_content'], required: true },
    { name: 'Identify Parties', description: 'Extract parties and roles', tools: ['add_matter_note'], required: true },
    { name: 'Key Terms Analysis', description: 'Review critical provisions', tools: ['add_matter_note'], required: true },
    { name: 'Risk Assessment', description: 'Identify risks and concerns', tools: ['add_matter_note'], required: true },
    { name: 'Analysis Memo', description: 'Create formal contract review', tools: ['create_document'], required: true },
    { name: 'Follow-up', description: 'Tasks for negotiation', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'documents_read', minValue: 1, description: 'Contract document read' },
    { metric: 'notes_created', minValue: 2, description: 'Analysis notes' },
    { metric: 'documents_created', minValue: 1, description: 'Contract analysis memo' },
  ],
  
  expectedOutputs: [
    'Parties and obligations summary',
    'Key terms extracted',
    'Payment/pricing analysis',
    'Risk assessment',
    'Negotiation recommendations',
    'Formal contract analysis memo',
  ],
  
  instructions: `
## CONTRACT ANALYSIS WORKFLOW

### KEY PROVISIONS TO ANALYZE
1. **Parties & Recitals** - Who and why
2. **Definitions** - Key defined terms
3. **Obligations** - What each party must do
4. **Payment Terms** - Price, timing, conditions
5. **Term & Termination** - Duration, renewal, exit rights
6. **Representations & Warranties** - Promises made
7. **Indemnification** - Who bears what risks
8. **Limitation of Liability** - Caps and exclusions
9. **Confidentiality** - Information protection
10. **Dispute Resolution** - Governing law, venue, arbitration
11. **Boilerplate** - Assignment, amendments, notices

### RISK FLAGS
- 🔴 One-sided indemnification
- 🔴 Unlimited liability exposure
- 🔴 Unfavorable termination rights
- 🔴 Automatic renewal without notice
- 🟡 Broad IP assignment
- 🟡 Non-compete/non-solicit
- 🟡 Audit rights
- 🟢 Standard market terms

### CONTRACT REVIEW MEMO FORMAT
\`\`\`
CONTRACT REVIEW MEMORANDUM

Contract: [Name]
Parties: [List]
Type: [Agreement type]
Date: [Effective date]

EXECUTIVE SUMMARY
[2-3 sentence overview]

KEY TERMS
- Term: [Duration]
- Value: [Price/consideration]
- Termination: [Rights]

CRITICAL PROVISIONS
[Analysis of important terms]

RISK ASSESSMENT
[Identified risks and concerns]

NEGOTIATION RECOMMENDATIONS
1. [Priority change]
2. [Secondary change]
...

CONCLUSION
[Overall recommendation: Accept / Negotiate / Reject]
\`\`\`
`,
};
