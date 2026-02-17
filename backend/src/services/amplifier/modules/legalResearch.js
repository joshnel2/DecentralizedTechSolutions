/**
 * Legal Research Module
 */

export const legalResearchModule = {
  metadata: {
    name: 'Legal Issue Research',
    description: 'Research specific legal issue with case law and statute analysis',
    category: 'research',
    estimatedMinutes: 10,
    complexity: 'high',
    tags: ['research', 'caselaw', 'statute', 'memo'],
  },
  
  requiredContext: ['legalIssue'],
  optionalContext: ['jurisdiction', 'matterId'],
  
  executionPlan: [
    { name: 'Define Issue', description: 'Clarify the legal question', tools: ['think_and_plan'], required: true },
    { name: 'Statutory Research', description: 'Identify governing statutes', tools: ['run_legal_research_plugin', 'add_matter_note'], required: true },
    { name: 'Case Law Research', description: 'Find controlling cases', tools: ['run_legal_research_plugin', 'add_matter_note'], required: true },
    { name: 'Analysis', description: 'Apply law to facts', tools: ['add_matter_note'], required: true },
    { name: 'Research Memo', description: 'Create formal memo', tools: ['create_document'], required: true },
    { name: 'Follow-up', description: 'Tasks for further research', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'notes_created', minValue: 2, description: 'Research notes documenting findings' },
    { metric: 'documents_created', minValue: 1, description: 'Formal research memo' },
  ],
  
  expectedOutputs: [
    'Statutory analysis',
    'Key case summaries',
    'Application to facts',
    'Formal research memorandum',
  ],
  
  instructions: `
## LEGAL RESEARCH WORKFLOW

### TOOL STRATEGY
- Use \`run_legal_research_plugin\` to gather broad statutory/case authority.
- Use \`lookup_cplr\` for New York procedural rule specifics.
- Capture findings incrementally with \`add_matter_note\` before drafting the memo.

### RESEARCH MEMO FORMAT

\`\`\`
LEGAL RESEARCH MEMORANDUM

TO: [Supervising Attorney]
FROM: [Agent]
DATE: [Date]
RE: [Issue]

QUESTION PRESENTED
[Precise statement of the legal question]

BRIEF ANSWER
[1-2 sentence answer]

STATEMENT OF FACTS
[Relevant facts]

DISCUSSION

I. [First Issue/Sub-issue]
A. Applicable Law
[Statutes, regulations]

B. Case Law
[Key cases with holdings]

C. Analysis
[Application to facts]

II. [Second Issue if applicable]
...

CONCLUSION
[Summary recommendation]
\`\`\`

### NY CPLR RESEARCH
For NY procedure questions, reference:
- CPLR Article 2: Limitations
- CPLR Article 3: Jurisdiction
- CPLR Article 31: Disclosure
- CPLR Article 32: Accelerated Judgment
`,
};
