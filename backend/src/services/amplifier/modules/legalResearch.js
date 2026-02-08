/**
 * Legal Research Module
 * 
 * This module plugs the background agent into AI's legal research mastery.
 * Instead of competing with AI's knowledge, we orchestrate it through
 * structured research tools that produce attorney-ready output.
 */

export const legalResearchModule = {
  metadata: {
    name: 'Legal Issue Research',
    description: 'AI-powered legal research with structured findings, citations, and IRAC memos. Plugs into AI legal mastery.',
    category: 'research',
    estimatedMinutes: 10,
    complexity: 'high',
    tags: ['research', 'caselaw', 'statute', 'memo', 'irac', 'citation'],
  },
  
  requiredContext: ['legalIssue'],
  optionalContext: ['jurisdiction', 'matterId', 'practiceArea', 'researchType'],
  
  executionPlan: [
    { name: 'Start Research Session', description: 'Initialize structured research session with conduct_legal_research', tools: ['conduct_legal_research'], required: true },
    { name: 'Search Authority', description: 'Search for controlling legal authority', tools: ['search_legal_authority'], required: true },
    { name: 'Statutory Research', description: 'Identify governing statutes and record findings', tools: ['add_research_finding', 'add_research_citation'], required: true },
    { name: 'Case Law Research', description: 'Find and analyze controlling case law', tools: ['add_research_finding', 'add_research_citation'], required: true },
    { name: 'IRAC Analysis', description: 'Apply IRAC methodology to each issue', tools: ['analyze_legal_issue', 'add_research_finding'], required: true },
    { name: 'Generate Memo', description: 'Produce formal research memorandum', tools: ['generate_research_memo'], required: true },
    { name: 'Matter Notes', description: 'Add summary notes to the matter', tools: ['add_matter_note'], required: false },
    { name: 'Follow-up Tasks', description: 'Create tasks for further research', tools: ['create_task'], required: false },
  ],
  
  qualityGates: [
    { metric: 'research_findings', minValue: 3, description: 'At least 3 substantive research findings' },
    { metric: 'citations_added', minValue: 5, description: 'At least 5 legal citations recorded' },
    { metric: 'memo_generated', minValue: 1, description: 'Formal research memo generated' },
  ],
  
  expectedOutputs: [
    'Structured research session with findings and citations',
    'Statutory analysis with pinpoint citations',
    'Key case summaries with holdings and relevance',
    'IRAC analysis for each legal issue',
    'Adverse authority identification',
    'Formal IRAC research memorandum',
    'Quality score and citation count',
  ],
  
  instructions: `
## LEGAL RESEARCH WORKFLOW - PLUG INTO AI MASTERY

You have access to powerful legal research tools. USE THEM to produce structured, attorney-ready research.

### STEP-BY-STEP PROCESS

1. **START SESSION**: Call \`conduct_legal_research\` with the research question, type, jurisdiction, and practice area.
   This creates a structured research session that tracks all your findings and citations.

2. **SEARCH AUTHORITY**: Call \`search_legal_authority\` to get context on what to look for.
   Focus on binding authority first, then persuasive authority.

3. **RECORD FINDINGS**: For each substantive finding, call \`add_research_finding\` with:
   - title: Brief description
   - content: Detailed analysis
   - issue: The legal issue addressed
   - rule: The legal rule identified
   - application: How the rule applies
   - conclusion: Your analytical conclusion
   - citations: Supporting citations

4. **RECORD CITATIONS**: For each authority, call \`add_research_citation\` with:
   - citation: Full legal citation (Bluebook format)
   - source_type: case/statute/regulation/treatise/law_review
   - relevance: Why this citation matters
   - holding: For cases, the key holding
   - is_adverse: Whether this supports opposing position

5. **ANALYZE ISSUES**: Call \`analyze_legal_issue\` for complex issues requiring IRAC treatment.

6. **GENERATE MEMO**: Call \`generate_research_memo\` with:
   - brief_answer: 1-2 sentence answer to the research question
   - conclusion: Overall conclusion and recommendation
   - recommendations: Practical next steps

### CITATION STANDARDS
- Use proper Bluebook citation format
- Include pinpoint citations (specific pages/paragraphs)
- Distinguish binding vs. persuasive authority
- Note procedural posture of cited cases
- Flag adverse authority and explain how to distinguish it

### QUALITY REQUIREMENTS
- Minimum 3 substantive findings
- Minimum 5 legal citations
- Must generate formal research memo
- Must address counter-arguments
- Must identify any unsettled areas of law

### SPECIAL TOOLS AVAILABLE
- \`check_statute_of_limitations\` - For SOL questions
- \`compare_jurisdictions\` - For multi-state analysis
- \`lookup_cplr\` - For NY procedural questions
- \`calculate_cplr_deadline\` - For NY deadline calculations
`,
};
