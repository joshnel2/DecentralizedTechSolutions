/**
 * Case Assessment Module
 * 
 * Comprehensive case evaluation including:
 * - Facts analysis
 * - Legal issues identification
 * - Strengths and weaknesses
 * - Strategy recommendations
 */

export const caseAssessmentModule = {
  metadata: {
    name: 'Case Assessment',
    description: 'Generate comprehensive case evaluation and strategy memo',
    category: 'matters',
    estimatedMinutes: 12,
    complexity: 'high',
    tags: ['litigation', 'strategy', 'analysis', 'memo'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['focusIssues', 'matterType'],
  
  executionPlan: [
    {
      name: 'Gather Case Information',
      description: 'Load all available matter data',
      tools: ['get_matter', 'list_documents'],
      required: true,
    },
    {
      name: 'Review Key Documents',
      description: 'Read and analyze relevant documents',
      tools: ['read_document_content'],
      required: true,
    },
    {
      name: 'Research Legal Issues',
      description: 'Identify and research applicable law',
      tools: ['search_document_content', 'add_matter_note'],
      required: true,
    },
    {
      name: 'Analyze Strengths/Weaknesses',
      description: 'Evaluate case merits',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Create Assessment Memo',
      description: 'Generate formal case assessment document',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Create Follow-up Tasks',
      description: 'Tasks for further investigation',
      tools: ['create_task'],
      required: true,
    },
  ],
  
  qualityGates: [
    {
      metric: 'documents_read',
      minValue: 1,
      description: 'At least one case document reviewed',
    },
    {
      metric: 'notes_created',
      minValue: 2,
      description: 'Analysis notes documenting research and findings',
    },
    {
      metric: 'documents_created',
      minValue: 1,
      description: 'Formal case assessment memo created',
    },
    {
      metric: 'tasks_created',
      minValue: 2,
      description: 'Follow-up investigation tasks',
    },
  ],
  
  expectedOutputs: [
    'Comprehensive facts summary',
    'Legal issues analysis with IRAC',
    'Strengths and weaknesses assessment',
    'Liability and damages evaluation',
    'Strategy recommendation',
    'Formal case assessment memo',
  ],
  
  instructions: `
## CASE ASSESSMENT WORKFLOW

You are preparing a case assessment as a junior attorney. This will guide strategy decisions.

### IRAC METHOD
Use IRAC for EVERY legal issue:
- **I**ssue: What is the specific legal question?
- **R**ule: What law/statute/case governs?
- **A**pplication: How do facts apply to the rule?
- **C**onclusion: What is the likely outcome?

### PHASE 1: FACTS GATHERING
1. Use \`get_matter\` to load matter details
2. Use \`list_documents\` to inventory available documents
3. Use \`read_document_content\` on key documents:
   - Complaint/Answer
   - Contracts/Agreements
   - Correspondence
   - Medical records (if applicable)
   - Expert reports

### PHASE 2: LEGAL ISSUES IDENTIFICATION
Create note with \`add_matter_note\`:

\`\`\`
LEGAL ISSUES ANALYSIS

Issue 1: [State the issue]
Rule: [Cite applicable law]
Application: [Apply facts to law]
Conclusion: [Likely outcome]

Issue 2: [State the issue]
...
\`\`\`

### PHASE 3: STRENGTHS/WEAKNESSES ANALYSIS
Create note analyzing:

**STRENGTHS:**
- Documentary evidence supporting claim
- Witness availability
- Clear liability indicators
- Strong damages evidence

**WEAKNESSES:**
- Gaps in evidence
- Credibility issues
- Statute of limitations concerns
- Comparative fault exposure
- Damages limitations

**OPPOSING ARGUMENTS:**
- What will opposing counsel argue?
- How can we counter?

### PHASE 4: CASE ASSESSMENT MEMO
Create formal document with \`create_document\`:

\`\`\`
CASE ASSESSMENT MEMORANDUM

Matter: [Matter Name]
Date: [Date]
Prepared By: [Agent]
For Review By: [Supervising Attorney]

EXECUTIVE SUMMARY
[2-3 sentence overview of the case and recommendation]

I. FACTS
A. Background
[Factual narrative based on available evidence]

B. Key Dates
[Timeline of relevant events]

II. LEGAL ISSUES
A. [Issue 1]
[IRAC analysis]

B. [Issue 2]
[IRAC analysis]

III. ANALYSIS
A. Strengths
[Bullet points]

B. Weaknesses
[Bullet points]

C. Opposing Party's Likely Arguments
[Analysis]

IV. DAMAGES ASSESSMENT
[Evaluation of potential damages/exposure]

V. RECOMMENDATIONS
A. Litigation Strategy
[Specific recommendations]

B. Settlement Considerations
[Settlement range analysis if applicable]

C. Next Steps
[Immediate action items]

VI. CONCLUSION
[Summary recommendation]
\`\`\`

### PHASE 5: FOLLOW-UP TASKS
Create tasks:
1. "Partner review of case assessment"
2. "Investigate [specific gap in evidence]"
3. "Research [specific legal issue]"
4. "Obtain [missing document/evidence]"
5. "Schedule strategy meeting"

### ANALYSIS FRAMEWORKS

**LIABILITY ANALYSIS:**
- Elements of each claim
- Evidence supporting each element
- Defenses available

**DAMAGES ANALYSIS:**
- Economic damages (calculable)
- Non-economic damages (estimated)
- Punitive damages (if applicable)
- Comparative fault reduction

**RISK ASSESSMENT:**
- Best case outcome
- Worst case outcome
- Most likely outcome
- Settlement range
`,
};
