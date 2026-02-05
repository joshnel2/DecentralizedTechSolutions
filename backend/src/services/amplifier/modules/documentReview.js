/**
 * Document Review Module
 * 
 * Comprehensive document analysis including:
 * - Reading and summarizing documents
 * - Extracting key terms and dates
 * - Identifying gaps and issues
 * - Creating document index
 */

export const documentReviewModule = {
  metadata: {
    name: 'Document Analysis',
    description: 'Review and summarize all documents for a matter with key term extraction',
    category: 'documents',
    estimatedMinutes: 5,
    complexity: 'medium',
    tags: ['documents', 'analysis', 'review', 'summary'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['focusArea', 'documentTypes'],
  
  executionPlan: [
    {
      name: 'List Documents',
      description: 'Get inventory of all documents in the matter',
      tools: ['list_documents', 'get_matter'],
      required: true,
    },
    {
      name: 'Read Key Documents',
      description: 'Read and analyze the most important documents',
      tools: ['read_document_content'],
      required: true,
    },
    {
      name: 'Search for Patterns',
      description: 'Search documents for key terms and provisions',
      tools: ['search_document_content'],
      required: false,
    },
    {
      name: 'Document Findings',
      description: 'Create comprehensive analysis note',
      tools: ['add_matter_note'],
      required: true,
    },
    {
      name: 'Create Document Index',
      description: 'Generate formal document index/summary',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Flag Follow-ups',
      description: 'Create tasks for any issues found',
      tools: ['create_task'],
      required: false,
    },
  ],
  
  qualityGates: [
    {
      metric: 'documents_read',
      minValue: 2,
      description: 'Read at least 2 documents (or all if fewer)',
    },
    {
      metric: 'notes_created',
      minValue: 1,
      description: 'Analysis note documenting findings',
    },
    {
      metric: 'documents_created',
      minValue: 1,
      description: 'Document index/summary created',
    },
  ],
  
  expectedOutputs: [
    'Document inventory with categorization',
    'Summary of each reviewed document',
    'Key terms, dates, and provisions extracted',
    'Gap analysis - missing documents identified',
    'Issue flags for attorney review',
    'Formal document index in Documents section',
  ],
  
  instructions: `
## DOCUMENT REVIEW WORKFLOW

You are conducting a document review as a junior attorney. Be thorough and detail-oriented.

### PHASE 1: INVENTORY
1. Use \`list_documents\` to get all documents in the matter
2. Note: document types, file sizes, dates
3. Prioritize: contracts, agreements, correspondence, court filings

### PHASE 2: SYSTEMATIC REVIEW
For each document (prioritize key documents):
1. Use \`read_document_content\` to access the text
2. If read fails (scanned PDF, image), note as "Unable to read - manual review needed"
3. Extract:
   - Document date and parties
   - Key terms and definitions
   - Obligations and deadlines
   - Amounts/financial terms
   - Unusual or concerning provisions

### PHASE 3: SEARCH ANALYSIS
Use \`search_document_content\` to find:
- Key party names
- Important dates
- Dollar amounts
- Legal terms relevant to the matter type

### PHASE 4: ANALYSIS NOTE
Create a comprehensive note with \`add_matter_note\`:

\`\`\`
DOCUMENT REVIEW SUMMARY
Date: [Today's date]
Reviewer: [Agent]

DOCUMENTS REVIEWED:
1. [Document name] - [Date] - [Summary]
2. [Document name] - [Date] - [Summary]
...

KEY FINDINGS:
- [Important finding 1]
- [Important finding 2]
...

KEY DATES:
- [Date]: [Event/deadline]
...

ISSUES/CONCERNS:
- [Issue 1]
- [Issue 2]
...

MISSING DOCUMENTS:
- [Document that should exist but doesn't]
...

RECOMMENDATIONS:
- [Action item 1]
...
\`\`\`

### PHASE 5: DOCUMENT INDEX
Create a formal document using \`create_document\`:
- Title: "Document Index - [Matter Name]"
- Table format with: Name, Date, Type, Summary, Notes
- Professional formatting

### PHASE 6: FOLLOW-UP TASKS
Create tasks for:
- "Review flagged document issues"
- "Obtain missing documents"
- Any specific issues requiring attention

### IMPORTANT NOTES
- If documents are unreadable, note this limitation
- Don't make up content - report what's actually in the documents
- Flag privileged documents for attorney review
- Be specific about page numbers and sections when referencing
`,
};
