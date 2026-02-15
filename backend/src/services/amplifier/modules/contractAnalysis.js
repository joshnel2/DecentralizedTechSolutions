/**
 * Contract Analysis Module
 * 
 * Comprehensive playbook-based contract review with clause-by-clause
 * analysis, deviation classification, redline generation, and
 * negotiation strategy.
 * 
 * Modeled after how experienced in-house counsel actually review contracts:
 * 1. Determine contract type and your side
 * 2. Load or reference the firm's negotiation playbook
 * 3. Read the entire contract before flagging issues
 * 4. Analyze each material clause against standard positions
 * 5. Classify deviations (GREEN / YELLOW / RED)
 * 6. Generate specific redline language
 * 7. Provide a negotiation strategy with tiered priorities
 */

export const contractAnalysisModule = {
  metadata: {
    name: 'Contract Review Against Playbook',
    description: 'Clause-by-clause contract analysis with deviation flagging, redline generation, and negotiation strategy',
    category: 'documents',
    estimatedMinutes: 12,
    complexity: 'high',
    tags: ['contracts', 'analysis', 'negotiation', 'due-diligence', 'redline', 'playbook'],
  },
  
  requiredContext: ['documentId'],
  optionalContext: ['matterId', 'contractType', 'ourSide', 'focusAreas', 'deadline'],
  
  executionPlan: [
    { name: 'Load Contract', description: 'Read the full contract text', tools: ['read_document_content'], required: true },
    { name: 'Identify Context', description: 'Determine contract type, parties, and our side', tools: ['get_matter', 'add_matter_note'], required: true },
    { name: 'Limitation of Liability Analysis', description: 'Analyze caps, carveouts, consequential damages', tools: ['add_matter_note'], required: true },
    { name: 'Indemnification Analysis', description: 'Scope, mutuality, cap, procedure', tools: ['add_matter_note'], required: true },
    { name: 'IP and Data Protection Analysis', description: 'Ownership, licenses, DPA, transfers', tools: ['add_matter_note'], required: true },
    { name: 'Term, Termination, and Remaining Clauses', description: 'Renewal, governing law, dispute resolution', tools: ['add_matter_note'], required: true },
    { name: 'Contract Review Memo', description: 'Formal memo with deviations, redlines, and strategy', tools: ['create_document'], required: true },
    { name: 'Follow-up Tasks', description: 'Negotiation tasks and escalation items', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'documents_read', minValue: 1, description: 'Contract document read in full' },
    { metric: 'notes_created', minValue: 3, description: 'Clause analysis notes (liability, indemnification, IP/data)' },
    { metric: 'documents_created', minValue: 1, description: 'Formal contract review memo with redlines' },
    { metric: 'tasks_created', minValue: 1, description: 'Negotiation follow-up tasks' },
  ],
  
  expectedOutputs: [
    'Contract type and parties identification',
    'Clause-by-clause deviation analysis (GREEN/YELLOW/RED)',
    'Specific redline language for YELLOW and RED items',
    'Negotiation priority framework (Tier 1/2/3)',
    'Business impact assessment',
    'Formal contract review memorandum',
  ],
  
  instructions: `
## CONTRACT REVIEW WORKFLOW

**Important**: You assist with legal workflows but do not provide legal advice. All analysis should be reviewed by qualified legal professionals before being relied upon.

### STEP 1: DETERMINE CONTEXT

Before reviewing any clause, establish:
1. **Contract type**: SaaS agreement, professional services, license, partnership, procurement, lease, NDA, etc. The contract type affects which clauses are most material.
2. **Our side**: Vendor, customer, licensor, licensee, partner. This fundamentally changes the analysis (e.g., limitation of liability protections favor different parties).
3. **Deadline**: When does this need to be finalized? Affects whether we negotiate aggressively or concede strategically.
4. **Focus areas**: Any specific concerns flagged by the attorney.

### STEP 2: READ THE ENTIRE CONTRACT FIRST

Read the full document before flagging ANY issues. Clauses interact with each other:
- An uncapped indemnity may be partially mitigated by a broad limitation of liability
- A broad IP assignment may be limited by a narrow scope-of-work definition
- Auto-renewal may be acceptable if there is a short-notice termination for convenience

### STEP 3: CLAUSE-BY-CLAUSE ANALYSIS

Analyze each of the following clause categories. For each, compare against standard commercial positions.

---

#### LIMITATION OF LIABILITY

**Key elements to review:**
- Cap amount (fixed dollar, multiple of fees, or uncapped)
- Whether the cap is mutual or applies differently to each party
- Carveouts from the cap (what liabilities are uncapped)
- Whether consequential, indirect, special, or punitive damages are excluded
- Whether the exclusion is mutual
- Carveouts from the consequential damages exclusion
- Whether the cap applies per-claim, per-year, or aggregate

**Standard positions:**
- Mutual cap at 12 months of fees paid/payable
- Acceptable range: 6-24 months of fees
- Mutual exclusion of consequential and indirect damages
- Reasonable carveouts for IP infringement, data breach, and confidentiality breach

**Common issues to flag:**
- 🔴 Cap set at a fraction of fees (e.g., "fees paid in the prior 3 months" on a low-value contract)
- 🔴 Asymmetric carveouts favoring the drafter
- 🔴 No consequential damages exclusion for one party
- 🔴 Broad carveouts that effectively eliminate the cap (e.g., "any breach of Section X" where Section X covers most obligations)
- 🟡 Cap below standard but within market range (6 months instead of 12)
- 🟡 Per-claim cap instead of aggregate

---

#### INDEMNIFICATION

**Key elements to review:**
- Whether indemnification is mutual or unilateral
- Scope: what triggers the obligation (IP infringement, data breach, bodily injury, breach of reps/warranties)
- Whether indemnification is capped (often subject to overall liability cap, or sometimes uncapped)
- Procedure: notice requirements, right to control defense, right to settle
- Whether the indemnitee must mitigate
- Relationship between indemnification and the limitation of liability clause

**Standard positions:**
- Mutual indemnification for IP infringement and data breach
- Indemnification limited to third-party claims only
- Subject to the overall liability cap
- Reasonable notice and defense control provisions

**Common issues to flag:**
- 🔴 Unilateral indemnification for IP infringement when both parties contribute IP
- 🔴 Indemnification for "any breach" (too broad; converts the liability cap to uncapped)
- 🔴 No right to control defense of claims
- 🔴 Indemnification obligations that survive termination indefinitely
- 🟡 Unilateral IP indemnification (common market position but not preferred)
- 🟡 No express mitigation obligation

---

#### INTELLECTUAL PROPERTY

**Key elements to review:**
- Ownership of pre-existing IP (each party should retain their own)
- Ownership of IP developed during the engagement
- Work-for-hire provisions and their scope
- License grants: scope, exclusivity, territory, sublicensing rights
- Open source considerations
- Feedback clauses (grants on suggestions or improvements)

**Standard positions:**
- Each party retains pre-existing IP
- Customer owns customer data
- Vendor retains platform/tool IP
- License grants limited to scope needed for the business relationship

**Common issues to flag:**
- 🔴 Broad IP assignment that could capture pre-existing IP
- 🔴 Work-for-hire provisions extending beyond the deliverables
- 🔴 Unrestricted feedback clauses granting perpetual, irrevocable licenses
- 🟡 License scope broader than needed for the business relationship
- 🟡 No explicit open source disclosure obligations

---

#### DATA PROTECTION

**Key elements to review:**
- Whether a Data Processing Agreement/Addendum (DPA) is required
- Data controller vs. data processor classification
- Sub-processor rights and notification obligations
- Data breach notification timeline (72 hours for GDPR)
- Cross-border data transfer mechanisms (SCCs, adequacy decisions, BCRs)
- Data deletion or return obligations on termination
- Data security requirements and audit rights
- Purpose limitation for data processing

**Standard positions:**
- Require DPA for any personal data processing
- Sub-processor notification with right to object
- Breach notification within 72 hours
- Data deletion within 30-90 days of termination
- Current EU SCCs (June 2021 version) for cross-border transfers

**Common issues to flag:**
- 🔴 No DPA offered when personal data is being processed
- 🔴 Blanket authorization for sub-processors without notification
- 🔴 Breach notification timeline longer than 72 hours (regulatory risk)
- 🔴 No cross-border transfer protections when data moves internationally
- 🟡 Audit rights limited to third-party reports only (SOC 2 acceptable if supplemented)
- 🟡 Data deletion timeline not specified (should be 30-90 days)

---

#### TERM AND TERMINATION

**Key elements to review:**
- Initial term and renewal terms
- Auto-renewal provisions and notice periods
- Termination for convenience: available? notice period? early termination fees?
- Termination for cause: cure period? what constitutes cause?
- Effects of termination: data return, transition assistance, survival clauses
- Wind-down period and obligations

**Standard positions:**
- Annual term with 30-day termination for convenience
- Multi-year acceptable with termination for convenience after initial term
- 30-day cure period for termination for cause
- Reasonable transition assistance provisions

**Common issues to flag:**
- 🔴 Long initial term with no termination for convenience
- 🔴 Auto-renewal with short notice windows (e.g., 30-day notice for annual renewal)
- 🔴 No cure period for termination for cause
- 🟡 Auto-renewal with 60-day notice (standard is 90 days)
- 🟡 Inadequate transition assistance provisions
- 🟡 Survival clauses that effectively extend the agreement indefinitely

---

#### GOVERNING LAW AND DISPUTE RESOLUTION

**Key elements to review:**
- Choice of law (governing jurisdiction)
- Dispute resolution mechanism (litigation, arbitration, mediation first)
- Venue and jurisdiction for litigation
- Arbitration rules and seat (if arbitration)
- Jury waiver and class action waiver
- Prevailing party attorney's fees

**Standard positions:**
- Governing law: your jurisdiction preferred; major commercial jurisdictions acceptable (NY, DE, CA, England & Wales)
- Litigation preferred over arbitration for most commercial disputes
- Escalation process before formal dispute resolution

**Common issues to flag:**
- 🔴 Highly unfavorable or unusual jurisdiction
- 🔴 Mandatory arbitration with rules favorable to the drafter
- 🟡 Non-preferred but acceptable jurisdiction
- 🟡 No escalation process before formal dispute resolution

---

#### REPRESENTATIONS AND WARRANTIES

**Key elements to review:**
- Scope of representations (authority, non-infringement, compliance with laws)
- Warranty disclaimers (AS-IS, no implied warranties)
- Survival period after termination
- Remedy for breach of warranty

#### CONFIDENTIALITY

**Key elements to review:**
- Definition scope (marked vs. all information)
- Standard carveouts (public knowledge, prior possession, independent development, third-party receipt, legal compulsion)
- Term of confidentiality obligations (2-5 years standard)
- Permitted disclosures (employees, contractors, advisors, affiliates)
- Return/destruction obligations

#### INSURANCE

**Key elements to review:**
- Coverage types required (CGL, professional liability, cyber, workers comp)
- Minimum coverage amounts
- Additional insured requirements
- Evidence of coverage (certificate timing)

#### ASSIGNMENT

**Key elements to review:**
- Consent requirements for assignment
- Change of control provisions
- Exceptions (affiliates, restructuring)

---

### STEP 4: DEVIATION CLASSIFICATION

For every material clause, classify the deviation:

**GREEN -- Acceptable**: Aligns with or is better than standard position. Minor variations that are commercially reasonable.
→ Action: Note for awareness. No negotiation needed.

**YELLOW -- Negotiate**: Outside standard position but within negotiable range. Common in the market.
→ Action: Generate specific redline language. Provide fallback position. Estimate business impact.

**RED -- Escalate**: Outside acceptable range or triggers an escalation criterion. Material risk.
→ Action: Explain specific risk. Provide market-standard alternative. Estimate exposure. Recommend escalation path.

---

### STEP 5: REDLINE GENERATION

For each YELLOW and RED deviation, provide:

\`\`\`
**Clause**: [Section reference and clause name]
**Current language**: "[exact quote from the contract]"
**Proposed redline**: "[specific alternative language]"
**Rationale**: [1-2 sentences explaining why, suitable for sharing with counterparty]
**Priority**: [Must-have / Should-have / Nice-to-have]
**Fallback**: [Alternative position if primary redline is rejected]
\`\`\`

Redline best practices:
- Be SPECIFIC: provide exact language ready to insert, not vague guidance
- Be BALANCED: firm on critical points but commercially reasonable
- PRIORITIZE: indicate which redlines are must-haves vs. nice-to-haves
- Consider the RELATIONSHIP: adjust tone based on strategic vs. commodity vendor

---

### STEP 6: NEGOTIATION PRIORITY FRAMEWORK

Organize all redlines by negotiation priority:

**Tier 1 -- Must-Haves (Deal Breakers)**
Issues where the firm cannot proceed without resolution:
- Uncapped or materially insufficient liability protections
- Missing data protection requirements for regulated data
- IP provisions that could jeopardize core assets
- Terms conflicting with regulatory obligations

**Tier 2 -- Should-Haves (Strong Preferences)**
Issues that materially affect risk but have negotiation room:
- Liability cap adjustments within range
- Indemnification scope and mutuality
- Termination flexibility
- Audit and compliance rights

**Tier 3 -- Nice-to-Haves (Concession Candidates)**
Issues that improve position but can be conceded strategically:
- Preferred governing law (if alternative is acceptable)
- Notice period preferences
- Minor definitional improvements

**Negotiation strategy**: Lead with Tier 1 items. Trade Tier 3 concessions to secure Tier 2 wins. Never concede on Tier 1 without escalation.

---

### CONTRACT REVIEW MEMO FORMAT

\`\`\`
CONTRACT REVIEW MEMORANDUM

Document: [contract name/identifier]
Parties: [party names and roles]
Our Side: [vendor/customer/etc.]
Contract Type: [SaaS/services/license/etc.]
Review Basis: [Firm Playbook / General Commercial Standards]
Date: [review date]

EXECUTIVE SUMMARY
[2-3 sentence overview: overall risk profile, top issues, recommendation]

KEY FINDINGS
[Top 3-5 issues with severity flags (RED/YELLOW/GREEN)]

CLAUSE-BY-CLAUSE ANALYSIS

1. Limitation of Liability -- [GREEN/YELLOW/RED]
   Contract says: [summary]
   Standard position: [our standard]
   Deviation: [description of gap]
   Business impact: [what this means practically]
   Redline: [specific language if YELLOW/RED]

2. Indemnification -- [GREEN/YELLOW/RED]
   [Same structure]

3. Intellectual Property -- [GREEN/YELLOW/RED]
   [Same structure]

4. Data Protection -- [GREEN/YELLOW/RED]
   [Same structure]

5. Term & Termination -- [GREEN/YELLOW/RED]
   [Same structure]

6. Governing Law -- [GREEN/YELLOW/RED]
   [Same structure]

[Continue for all material clauses]

NEGOTIATION STRATEGY
- Tier 1 (Must-Haves): [list]
- Tier 2 (Should-Haves): [list]
- Tier 3 (Concession Candidates): [list]
- Recommended approach: [which issues to lead with, what to concede]

OVERALL RISK ASSESSMENT
[High-level risk rating with rationale]

NEXT STEPS
1. [Most urgent action]
2. [Second priority]
3. [etc.]
\`\`\`
`,
};
