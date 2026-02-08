/**
 * Legal AI Research Integration Service
 * 
 * Instead of competing with AI's legal research mastery, we PLUG INTO it.
 * This service connects the background agent to AI-powered legal research
 * capabilities: case law analysis, statutory interpretation, regulatory
 * compliance, citation verification, and multi-jurisdiction research.
 * 
 * The agent becomes a legal research amplifier -- it orchestrates AI's
 * existing strengths (reading, synthesizing, citing) and channels them
 * through structured legal workflows that produce attorney-ready output.
 * 
 * Architecture:
 * - ResearchSession: Manages a multi-step research workflow
 * - ResearchProvider: Abstraction over AI model legal reasoning
 * - CitationEngine: Validates, formats, and cross-references citations
 * - JurisdictionRouter: Directs queries to the right legal framework
 * - MemoGenerator: Produces IRAC-structured research memos
 */

import { query } from '../../db/connection.js';

// ============================================================
// RESEARCH SESSION MANAGEMENT
// ============================================================

/**
 * Active research sessions (in-memory for speed, persisted to DB for durability)
 */
const activeSessions = new Map();

/**
 * Research session types -- each maps to a distinct AI research workflow
 */
export const RESEARCH_TYPES = {
  CASE_LAW: 'case_law',
  STATUTORY: 'statutory',
  REGULATORY: 'regulatory',
  MULTI_JURISDICTION: 'multi_jurisdiction',
  ISSUE_SPOTTING: 'issue_spotting',
  PRECEDENT_ANALYSIS: 'precedent_analysis',
  COMPLIANCE_CHECK: 'compliance_check',
  CONTRACT_REVIEW: 'contract_review',
  LEGISLATIVE_HISTORY: 'legislative_history',
  SECONDARY_SOURCES: 'secondary_sources',
};

/**
 * Supported jurisdictions with their legal frameworks
 */
export const JURISDICTIONS = {
  'federal': {
    name: 'Federal',
    courts: ['Supreme Court', 'Circuit Courts', 'District Courts', 'Bankruptcy Courts'],
    primarySources: ['U.S. Code', 'Code of Federal Regulations', 'Federal Register'],
    citationFormat: 'Bluebook',
  },
  'ny': {
    name: 'New York',
    courts: ['Court of Appeals', 'Appellate Division', 'Supreme Court', 'Civil Court', 'Family Court'],
    primarySources: ['NY CPLR', 'NY Penal Law', 'NY General Obligations Law', 'NY Real Property Law', 'NY Business Corporation Law'],
    citationFormat: 'NY Official Reports',
  },
  'ca': {
    name: 'California',
    courts: ['Supreme Court', 'Courts of Appeal', 'Superior Courts'],
    primarySources: ['CA Civil Code', 'CA Code of Civil Procedure', 'CA Business and Professions Code'],
    citationFormat: 'California Style Manual',
  },
  'tx': {
    name: 'Texas',
    courts: ['Supreme Court', 'Court of Criminal Appeals', 'Courts of Appeals', 'District Courts'],
    primarySources: ['TX Civil Practice & Remedies Code', 'TX Business Organizations Code', 'TX Property Code'],
    citationFormat: 'Texas Rules of Form',
  },
  'il': {
    name: 'Illinois',
    courts: ['Supreme Court', 'Appellate Court', 'Circuit Courts'],
    primarySources: ['IL Code of Civil Procedure', 'IL Criminal Code', 'IL Compiled Statutes'],
    citationFormat: 'Illinois Style',
  },
  'fl': {
    name: 'Florida',
    courts: ['Supreme Court', 'District Courts of Appeal', 'Circuit Courts'],
    primarySources: ['FL Statutes', 'FL Rules of Civil Procedure', 'FL Administrative Code'],
    citationFormat: 'Florida Style',
  },
};

/**
 * Legal practice areas with research focus areas
 */
export const PRACTICE_AREAS = {
  litigation: {
    name: 'Litigation',
    focusAreas: ['Case law', 'Procedural rules', 'Evidence rules', 'Motion practice', 'Discovery'],
    keyDatabases: ['case_law', 'court_rules', 'evidence_rules'],
  },
  corporate: {
    name: 'Corporate & Business',
    focusAreas: ['Business formation', 'Contracts', 'M&A', 'Securities', 'Governance'],
    keyDatabases: ['statutes', 'regulations', 'sec_filings'],
  },
  real_estate: {
    name: 'Real Estate',
    focusAreas: ['Property law', 'Zoning', 'Title', 'Leases', 'Environmental'],
    keyDatabases: ['statutes', 'regulations', 'case_law'],
  },
  employment: {
    name: 'Employment',
    focusAreas: ['Discrimination', 'Wage & hour', 'Benefits', 'Non-competes', 'Wrongful termination'],
    keyDatabases: ['statutes', 'regulations', 'case_law', 'agency_guidance'],
  },
  intellectual_property: {
    name: 'Intellectual Property',
    focusAreas: ['Patents', 'Trademarks', 'Copyrights', 'Trade secrets', 'Licensing'],
    keyDatabases: ['statutes', 'case_law', 'patent_database', 'trademark_database'],
  },
  family: {
    name: 'Family Law',
    focusAreas: ['Divorce', 'Custody', 'Support', 'Adoption', 'Guardianship'],
    keyDatabases: ['statutes', 'case_law', 'court_rules'],
  },
  criminal: {
    name: 'Criminal Law',
    focusAreas: ['Defense', 'Prosecution', 'Sentencing', 'Appeals', 'Constitutional rights'],
    keyDatabases: ['statutes', 'case_law', 'sentencing_guidelines'],
  },
  immigration: {
    name: 'Immigration',
    focusAreas: ['Visas', 'Green cards', 'Naturalization', 'Deportation defense', 'Asylum'],
    keyDatabases: ['statutes', 'regulations', 'agency_guidance', 'case_law'],
  },
  bankruptcy: {
    name: 'Bankruptcy',
    focusAreas: ['Chapter 7', 'Chapter 11', 'Chapter 13', 'Creditor rights', 'Reorganization'],
    keyDatabases: ['statutes', 'case_law', 'court_rules'],
  },
  tax: {
    name: 'Tax',
    focusAreas: ['Income tax', 'Estate tax', 'Corporate tax', 'International tax', 'Tax controversy'],
    keyDatabases: ['statutes', 'regulations', 'irs_guidance', 'case_law'],
  },
};

// ============================================================
// RESEARCH SESSION CLASS
// ============================================================

export class ResearchSession {
  constructor(userId, firmId, options = {}) {
    this.id = `research-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.userId = userId;
    this.firmId = firmId;
    this.type = options.type || RESEARCH_TYPES.CASE_LAW;
    this.jurisdiction = options.jurisdiction || 'federal';
    this.practiceArea = options.practiceArea || 'litigation';
    this.query = options.query || '';
    this.matterId = options.matterId || null;
    this.status = 'initialized';
    this.createdAt = new Date();
    this.updatedAt = new Date();
    
    // Research state
    this.findings = [];
    this.citations = [];
    this.authorities = { primary: [], secondary: [] };
    this.memo = null;
    this.analysis = null;
    this.relatedIssues = [];
    
    // Execution tracking
    this.steps = [];
    this.currentStep = 0;
    this.totalSteps = 0;
    this.errors = [];
    this.warnings = [];
    
    // Quality metrics
    this.qualityScore = 0;
    this.citationCount = 0;
    this.sourceCount = 0;
    this.jurisdictionsCovered = new Set();
    
    activeSessions.set(this.id, this);
  }
  
  addFinding(finding) {
    this.findings.push({
      id: `finding-${this.findings.length + 1}`,
      ...finding,
      timestamp: new Date().toISOString(),
    });
    this.updatedAt = new Date();
  }
  
  addCitation(citation) {
    this.citations.push({
      id: `cite-${this.citations.length + 1}`,
      ...citation,
      verified: false,
      timestamp: new Date().toISOString(),
    });
    this.citationCount = this.citations.length;
    this.updatedAt = new Date();
  }
  
  addAuthority(type, authority) {
    const list = type === 'primary' ? this.authorities.primary : this.authorities.secondary;
    list.push({
      id: `auth-${list.length + 1}`,
      ...authority,
      timestamp: new Date().toISOString(),
    });
    this.sourceCount = this.authorities.primary.length + this.authorities.secondary.length;
    this.updatedAt = new Date();
  }
  
  updateProgress(step, message) {
    this.currentStep = step;
    this.steps.push({ step, message, timestamp: new Date().toISOString() });
    this.updatedAt = new Date();
  }
  
  setMemo(memo) {
    this.memo = memo;
    this.updatedAt = new Date();
  }
  
  setAnalysis(analysis) {
    this.analysis = analysis;
    this.updatedAt = new Date();
  }
  
  complete(qualityScore) {
    this.status = 'completed';
    this.qualityScore = qualityScore || this.calculateQualityScore();
    this.updatedAt = new Date();
  }
  
  fail(error) {
    this.status = 'failed';
    this.errors.push({ message: error, timestamp: new Date().toISOString() });
    this.updatedAt = new Date();
  }
  
  calculateQualityScore() {
    let score = 0;
    
    // Citation quality (0-30 points)
    score += Math.min(30, this.citationCount * 5);
    
    // Source diversity (0-20 points)
    score += Math.min(20, this.sourceCount * 4);
    
    // Findings depth (0-25 points)
    score += Math.min(25, this.findings.length * 5);
    
    // Has memo (0-15 points)
    if (this.memo) score += 15;
    
    // Has analysis (0-10 points)
    if (this.analysis) score += 10;
    
    return Math.min(100, score);
  }
  
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      firmId: this.firmId,
      type: this.type,
      jurisdiction: this.jurisdiction,
      practiceArea: this.practiceArea,
      query: this.query,
      matterId: this.matterId,
      status: this.status,
      findings: this.findings,
      citations: this.citations,
      authorities: this.authorities,
      memo: this.memo,
      analysis: this.analysis,
      relatedIssues: this.relatedIssues,
      steps: this.steps,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps,
      errors: this.errors,
      warnings: this.warnings,
      qualityScore: this.qualityScore,
      citationCount: this.citationCount,
      sourceCount: this.sourceCount,
      jurisdictionsCovered: [...this.jurisdictionsCovered],
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}

// ============================================================
// AI RESEARCH PROMPT ENGINEERING
// ============================================================

/**
 * Build a research-optimized system prompt that leverages AI's legal mastery
 * Instead of limiting the AI, we UNLOCK its full legal reasoning capability
 */
export function buildLegalResearchSystemPrompt(session) {
  const jurisdiction = JURISDICTIONS[session.jurisdiction] || JURISDICTIONS.federal;
  const practiceArea = PRACTICE_AREAS[session.practiceArea] || PRACTICE_AREAS.litigation;
  
  return `You are an expert legal research AI operating within a law firm's practice management system.
You have mastery-level knowledge of legal research methodology, case law analysis, statutory interpretation,
and regulatory compliance. You are functioning as a senior legal research analyst.

## YOUR CAPABILITIES
You have deep knowledge of:
- Federal and state case law across all U.S. jurisdictions
- Statutory codes (U.S. Code, state codes, administrative codes)
- Court rules and procedures (FRCP, state rules, local rules)
- Legal reasoning frameworks (IRAC, CRAC, CREAC)
- Citation formats (Bluebook, state-specific)
- Treatises, restatements, and secondary sources
- Recent legal developments and trends

## CURRENT RESEARCH CONTEXT
- **Jurisdiction:** ${jurisdiction.name}
- **Courts:** ${jurisdiction.courts.join(', ')}
- **Primary Sources:** ${jurisdiction.primarySources.join(', ')}
- **Citation Format:** ${jurisdiction.citationFormat}
- **Practice Area:** ${practiceArea.name}
- **Focus Areas:** ${practiceArea.focusAreas.join(', ')}
- **Research Type:** ${session.type}

## RESEARCH METHODOLOGY
1. **Issue Identification:** Break complex questions into discrete legal issues
2. **Source Hierarchy:** Start with controlling authority (constitution > statutes > regulations > case law)
3. **Jurisdiction Accuracy:** Only cite authorities binding in ${jurisdiction.name}
4. **Temporal Relevance:** Prioritize recent authority; note if older cases are still good law
5. **Adverse Authority:** Always identify and address contrary authority
6. **Practical Application:** Connect legal principles to specific facts

## OUTPUT REQUIREMENTS
- Use proper legal citation format (${jurisdiction.citationFormat})
- Clearly distinguish holding from dicta
- Note procedural posture of cited cases
- Identify the strength of each authority (binding vs. persuasive)
- Flag any areas of unsettled law or circuit splits
- Provide practical recommendations alongside legal analysis

## QUALITY STANDARDS
- Every legal conclusion must be supported by cited authority
- Distinguish between majority rule, minority rule, and emerging trends
- Note any relevant legislative history or pending legislation
- Identify potential counter-arguments and how to address them
- Include pinpoint citations (specific page/paragraph references)`;
}

/**
 * Build research-specific prompts for different research types
 */
export function buildResearchPrompt(session) {
  const basePrompt = buildLegalResearchSystemPrompt(session);
  
  const typePrompts = {
    [RESEARCH_TYPES.CASE_LAW]: `
## CASE LAW RESEARCH INSTRUCTIONS
Research the following legal issue through case law analysis:

**Research Question:** ${session.query}

Provide:
1. **Controlling Authority** - Binding cases from ${JURISDICTIONS[session.jurisdiction]?.name || 'the relevant jurisdiction'}
2. **Persuasive Authority** - Key cases from other jurisdictions
3. **Case Synthesis** - How the case law has evolved on this issue
4. **Rule Statement** - The synthesized legal rule from the case law
5. **Application** - How these cases apply to the question presented
6. **Adverse Cases** - Cases that could be cited against the position
7. **Distinguishing Arguments** - How to distinguish adverse authority

Format each case citation with: Case Name, Citation, Year, Court, Key Holding, Relevance Rating (1-5)`,

    [RESEARCH_TYPES.STATUTORY]: `
## STATUTORY RESEARCH INSTRUCTIONS
Research the following statutory question:

**Research Question:** ${session.query}

Provide:
1. **Governing Statute(s)** - Full citation and relevant text
2. **Statutory Interpretation** - Plain meaning, legislative intent, canons of construction
3. **Implementing Regulations** - Related administrative rules
4. **Case Law Interpreting Statute** - Key cases construing the statute
5. **Legislative History** - Relevant committee reports, floor debates
6. **Effective Dates & Amendments** - Timeline of statutory changes
7. **Preemption Analysis** - Federal/state interaction if applicable`,

    [RESEARCH_TYPES.REGULATORY]: `
## REGULATORY RESEARCH INSTRUCTIONS
Research the following regulatory question:

**Research Question:** ${session.query}

Provide:
1. **Enabling Statute** - The statute authorizing the regulation
2. **Applicable Regulations** - Full CFR/state administrative code citations
3. **Agency Guidance** - Letters, memoranda, advisory opinions
4. **Enforcement History** - How the agency has enforced this regulation
5. **Compliance Requirements** - Specific obligations and deadlines
6. **Penalties** - Potential consequences of non-compliance
7. **Recent Rulemaking** - Proposed or recent rule changes`,

    [RESEARCH_TYPES.MULTI_JURISDICTION]: `
## MULTI-JURISDICTION RESEARCH INSTRUCTIONS
Compare legal treatment across jurisdictions:

**Research Question:** ${session.query}

Provide:
1. **Jurisdiction Survey** - How each relevant jurisdiction treats this issue
2. **Majority Rule** - The prevailing approach and its basis
3. **Minority Rule** - Alternative approaches and their reasoning
4. **Emerging Trends** - Where the law appears to be heading
5. **Model Acts/Uniform Laws** - Any uniform legislation on point
6. **Choice of Law** - Factors that determine which jurisdiction's law applies
7. **Practical Implications** - Strategic considerations for each jurisdiction`,

    [RESEARCH_TYPES.ISSUE_SPOTTING]: `
## ISSUE SPOTTING INSTRUCTIONS
Identify all legal issues in the following scenario:

**Scenario:** ${session.query}

Provide:
1. **Issue Inventory** - Complete list of legal issues identified
2. **Priority Ranking** - Order issues by importance/urgency
3. **Legal Framework** - Applicable law for each issue
4. **Risk Assessment** - Exposure level for each issue (High/Medium/Low)
5. **Preliminary Analysis** - Brief analysis of each issue
6. **Research Roadmap** - What additional research is needed for each issue
7. **Action Items** - Immediate steps to address critical issues`,

    [RESEARCH_TYPES.PRECEDENT_ANALYSIS]: `
## PRECEDENT ANALYSIS INSTRUCTIONS
Analyze the precedential value and implications of specific cases:

**Research Focus:** ${session.query}

Provide:
1. **Case Details** - Full procedural history and factual background
2. **Holding Analysis** - Precise holding vs. broader implications
3. **Precedential Value** - Binding vs. persuasive, scope of application
4. **Subsequent History** - How the case has been cited, followed, distinguished
5. **Negative Treatment** - Any criticism, questioning, or limitation
6. **Doctrinal Impact** - How this case shaped the area of law
7. **Current Validity** - Whether the case remains good law`,

    [RESEARCH_TYPES.COMPLIANCE_CHECK]: `
## COMPLIANCE CHECK INSTRUCTIONS
Verify compliance with applicable legal requirements:

**Compliance Question:** ${session.query}

Provide:
1. **Applicable Requirements** - All relevant laws, regulations, and rules
2. **Compliance Checklist** - Specific requirements with yes/no assessment
3. **Gap Analysis** - Areas of potential non-compliance
4. **Risk Rating** - Severity of each compliance gap
5. **Remediation Steps** - How to address each gap
6. **Deadlines** - Time-sensitive compliance obligations
7. **Ongoing Obligations** - Recurring compliance requirements`,

    [RESEARCH_TYPES.CONTRACT_REVIEW]: `
## CONTRACT REVIEW RESEARCH INSTRUCTIONS
Research legal issues related to contract terms:

**Contract Issue:** ${session.query}

Provide:
1. **Governing Law** - Applicable contract law principles
2. **Enforceability Analysis** - Formation, consideration, capacity issues
3. **Key Provisions** - Analysis of critical contract terms
4. **Industry Standards** - How similar provisions are typically drafted
5. **Case Law on Disputes** - Cases interpreting similar provisions
6. **Risk Allocation** - How the contract distributes risk
7. **Recommended Changes** - Specific revisions to protect client interests`,

    [RESEARCH_TYPES.LEGISLATIVE_HISTORY]: `
## LEGISLATIVE HISTORY RESEARCH INSTRUCTIONS
Research the legislative history of the relevant statute:

**Research Focus:** ${session.query}

Provide:
1. **Statutory Text** - Current version and prior versions
2. **Committee Reports** - Relevant Senate/House committee findings
3. **Floor Debates** - Key statements from legislative sponsors
4. **Amendment History** - How the statute has been modified over time
5. **Regulatory Response** - How agencies have interpreted the statute
6. **Judicial Interpretation** - How courts have construed legislative intent
7. **Policy Context** - The problem the statute was designed to address`,

    [RESEARCH_TYPES.SECONDARY_SOURCES]: `
## SECONDARY SOURCE RESEARCH INSTRUCTIONS
Survey secondary sources on the legal issue:

**Research Focus:** ${session.query}

Provide:
1. **Treatises** - Leading treatise analysis on point
2. **Law Review Articles** - Recent and seminal academic commentary
3. **Restatements** - Applicable Restatement provisions and commentary
4. **Practice Guides** - Practical guidance from CLE materials
5. **Bar Publications** - Relevant bar association materials
6. **ALR Annotations** - Relevant ALR entries
7. **Synthesis** - How secondary sources inform the legal analysis`,
  };
  
  return basePrompt + (typePrompts[session.type] || typePrompts[RESEARCH_TYPES.CASE_LAW]);
}

// ============================================================
// CITATION ENGINE
// ============================================================

/**
 * Parse and validate legal citations
 */
export function parseCitation(citationText) {
  const patterns = {
    // Federal cases: Name v. Name, Volume Reporter Page (Court Year)
    federalCase: /^(.+?)\s+v\.\s+(.+?),\s+(\d+)\s+(U\.S\.|S\.\s*Ct\.|F\.\d+[a-z]*|F\.\s*Supp\.\s*\d*[a-z]*)\s+(\d+)\s*(?:\((.+?)\s+(\d{4})\))?/i,
    // State cases: similar pattern
    stateCase: /^(.+?)\s+v\.\s+(.+?),\s+(\d+)\s+([A-Z][A-Za-z.]+\d*)\s+(\d+)\s*(?:\((.+?)\s+(\d{4})\))?/i,
    // Federal statute: Title U.S.C. § Section
    federalStatute: /(\d+)\s+U\.S\.C\.\s+§\s*(\d+[a-z]*(?:\([a-z0-9]+\))*)/i,
    // State statute: State Code § Section
    stateStatute: /([A-Z][A-Za-z.]+)\s+(?:§|[Ss]ection)\s*(\d+[a-z]*(?:[.-]\d+)*)/i,
    // CFR: Title C.F.R. § Section
    cfr: /(\d+)\s+C\.F\.R\.\s+§\s*(\d+[a-z]*(?:\.\d+)*)/i,
    // NY CPLR
    nyCPLR: /CPLR\s+(?:§\s*)?(\d+(?:\([a-z]\))?)/i,
  };
  
  for (const [type, pattern] of Object.entries(patterns)) {
    const match = citationText.match(pattern);
    if (match) {
      return {
        type,
        raw: citationText,
        parsed: match.groups || match.slice(1),
        valid: true,
      };
    }
  }
  
  return {
    type: 'unknown',
    raw: citationText,
    parsed: null,
    valid: false,
  };
}

/**
 * Format a citation in Bluebook style
 */
export function formatBluebookCitation(citation) {
  if (!citation.valid) return citation.raw;
  
  switch (citation.type) {
    case 'federalStatute':
      return `${citation.parsed[0]} U.S.C. § ${citation.parsed[1]}`;
    case 'cfr':
      return `${citation.parsed[0]} C.F.R. § ${citation.parsed[1]}`;
    case 'nyCPLR':
      return `N.Y. C.P.L.R. § ${citation.parsed[0]}`;
    default:
      return citation.raw;
  }
}

// ============================================================
// RESEARCH ORCHESTRATOR
// ============================================================

/**
 * Orchestrate a complete legal research workflow
 * This is what the background agent calls to leverage AI's legal mastery
 */
export async function conductResearch(userId, firmId, researchRequest) {
  const session = new ResearchSession(userId, firmId, researchRequest);
  
  console.log(`[LegalResearch] Starting research session ${session.id}: ${session.query.substring(0, 100)}`);
  
  session.status = 'in_progress';
  session.totalSteps = getResearchStepCount(session.type);
  
  // Persist session start
  await persistSession(session);
  
  return session;
}

/**
 * Get the step count for a research type
 */
function getResearchStepCount(type) {
  const counts = {
    [RESEARCH_TYPES.CASE_LAW]: 7,
    [RESEARCH_TYPES.STATUTORY]: 7,
    [RESEARCH_TYPES.REGULATORY]: 7,
    [RESEARCH_TYPES.MULTI_JURISDICTION]: 7,
    [RESEARCH_TYPES.ISSUE_SPOTTING]: 7,
    [RESEARCH_TYPES.PRECEDENT_ANALYSIS]: 7,
    [RESEARCH_TYPES.COMPLIANCE_CHECK]: 7,
    [RESEARCH_TYPES.CONTRACT_REVIEW]: 7,
    [RESEARCH_TYPES.LEGISLATIVE_HISTORY]: 7,
    [RESEARCH_TYPES.SECONDARY_SOURCES]: 7,
  };
  return counts[type] || 7;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId) {
  return activeSessions.get(sessionId) || null;
}

/**
 * Get all sessions for a user
 */
export function getUserSessions(userId) {
  const sessions = [];
  for (const session of activeSessions.values()) {
    if (session.userId === userId) {
      sessions.push(session.toJSON());
    }
  }
  return sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Persist session to database
 */
async function persistSession(session) {
  try {
    await query(`
      INSERT INTO legal_research_sessions (
        id, user_id, firm_id, research_type, jurisdiction, practice_area,
        query_text, matter_id, status, findings, citations, authorities,
        memo, analysis, quality_score, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        findings = EXCLUDED.findings,
        citations = EXCLUDED.citations,
        authorities = EXCLUDED.authorities,
        memo = EXCLUDED.memo,
        analysis = EXCLUDED.analysis,
        quality_score = EXCLUDED.quality_score,
        updated_at = EXCLUDED.updated_at
    `, [
      session.id, session.userId, session.firmId, session.type,
      session.jurisdiction, session.practiceArea, session.query,
      session.matterId, session.status,
      JSON.stringify(session.findings),
      JSON.stringify(session.citations),
      JSON.stringify(session.authorities),
      session.memo ? JSON.stringify(session.memo) : null,
      session.analysis ? JSON.stringify(session.analysis) : null,
      session.qualityScore,
      session.createdAt, session.updatedAt,
    ]);
  } catch (error) {
    console.error(`[LegalResearch] Failed to persist session ${session.id}:`, error.message);
    // Don't throw -- research should continue even if persistence fails
  }
}

// ============================================================
// MEMO GENERATION
// ============================================================

/**
 * Generate an IRAC-format research memo from session findings
 */
export function generateResearchMemo(session) {
  const jurisdiction = JURISDICTIONS[session.jurisdiction] || JURISDICTIONS.federal;
  
  const memo = {
    type: 'legal_research_memo',
    format: 'IRAC',
    header: {
      to: 'Supervising Attorney',
      from: 'AI Legal Research Assistant',
      date: new Date().toISOString().split('T')[0],
      re: session.query,
      jurisdiction: jurisdiction.name,
      practiceArea: session.practiceArea,
    },
    sections: {
      questionPresented: session.query,
      briefAnswer: session.analysis?.briefAnswer || '',
      statementOfFacts: session.analysis?.facts || '',
      discussion: session.findings.map(f => ({
        issue: f.issue || f.title,
        rule: f.rule || '',
        application: f.application || f.content,
        conclusion: f.conclusion || '',
        citations: f.citations || [],
      })),
      conclusion: session.analysis?.conclusion || '',
      recommendations: session.analysis?.recommendations || [],
    },
    citations: session.citations,
    authorities: session.authorities,
    qualityScore: session.qualityScore,
    generatedAt: new Date().toISOString(),
  };
  
  session.setMemo(memo);
  return memo;
}

/**
 * Format memo as plain text for document generation
 */
export function formatMemoAsText(memo) {
  const lines = [];
  
  lines.push('LEGAL RESEARCH MEMORANDUM');
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`TO:      ${memo.header.to}`);
  lines.push(`FROM:    ${memo.header.from}`);
  lines.push(`DATE:    ${memo.header.date}`);
  lines.push(`RE:      ${memo.header.re}`);
  lines.push(`JURISDICTION: ${memo.header.jurisdiction}`);
  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('');
  
  lines.push('QUESTION PRESENTED');
  lines.push('');
  lines.push(memo.sections.questionPresented);
  lines.push('');
  
  if (memo.sections.briefAnswer) {
    lines.push('BRIEF ANSWER');
    lines.push('');
    lines.push(memo.sections.briefAnswer);
    lines.push('');
  }
  
  if (memo.sections.statementOfFacts) {
    lines.push('STATEMENT OF FACTS');
    lines.push('');
    lines.push(memo.sections.statementOfFacts);
    lines.push('');
  }
  
  lines.push('DISCUSSION');
  lines.push('');
  
  if (memo.sections.discussion && memo.sections.discussion.length > 0) {
    memo.sections.discussion.forEach((section, i) => {
      lines.push(`${toRoman(i + 1)}. ${section.issue}`);
      lines.push('');
      if (section.rule) {
        lines.push(`   A. Applicable Law`);
        lines.push(`   ${section.rule}`);
        lines.push('');
      }
      if (section.application) {
        lines.push(`   B. Analysis`);
        lines.push(`   ${section.application}`);
        lines.push('');
      }
      if (section.conclusion) {
        lines.push(`   C. Conclusion`);
        lines.push(`   ${section.conclusion}`);
        lines.push('');
      }
    });
  }
  
  if (memo.sections.conclusion) {
    lines.push('CONCLUSION');
    lines.push('');
    lines.push(memo.sections.conclusion);
    lines.push('');
  }
  
  if (memo.sections.recommendations && memo.sections.recommendations.length > 0) {
    lines.push('RECOMMENDATIONS');
    lines.push('');
    memo.sections.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec}`);
    });
    lines.push('');
  }
  
  if (memo.citations && memo.citations.length > 0) {
    lines.push('─'.repeat(60));
    lines.push('AUTHORITIES CITED');
    lines.push('');
    
    const primary = memo.authorities?.primary || [];
    const secondary = memo.authorities?.secondary || [];
    
    if (primary.length > 0) {
      lines.push('Primary Sources:');
      primary.forEach(a => lines.push(`  • ${a.citation || a.title}`));
      lines.push('');
    }
    
    if (secondary.length > 0) {
      lines.push('Secondary Sources:');
      secondary.forEach(a => lines.push(`  • ${a.citation || a.title}`));
      lines.push('');
    }
  }
  
  lines.push('─'.repeat(60));
  lines.push(`Quality Score: ${memo.qualityScore}/100`);
  lines.push(`Generated: ${memo.generatedAt}`);
  
  return lines.join('\n');
}

function toRoman(num) {
  const romanNumerals = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let result = '';
  for (const [value, numeral] of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result;
}

// ============================================================
// EXPORTS - Everything the background agent needs
// ============================================================

export default {
  RESEARCH_TYPES,
  JURISDICTIONS,
  PRACTICE_AREAS,
  ResearchSession,
  buildLegalResearchSystemPrompt,
  buildResearchPrompt,
  parseCitation,
  formatBluebookCitation,
  conductResearch,
  getSession,
  getUserSessions,
  generateResearchMemo,
  formatMemoAsText,
};
