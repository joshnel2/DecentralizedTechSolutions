/**
 * NDA Triage Module
 * 
 * Rapid screening of incoming NDAs against standard criteria.
 * Classifies as GREEN (standard approval), YELLOW (counsel review),
 * or RED (significant issues requiring full legal review).
 * 
 * This is one of the highest-volume legal workflows -- sales and
 * business development teams send NDAs daily. The goal is to let
 * routine NDAs flow through quickly while catching the ones that
 * need real attorney attention.
 */

export const ndaTriageModule = {
  metadata: {
    name: 'NDA Triage & Pre-Screening',
    description: 'Rapid NDA evaluation with GREEN/YELLOW/RED classification, issue flagging, and routing recommendations',
    category: 'documents',
    estimatedMinutes: 6,
    complexity: 'medium',
    tags: ['nda', 'triage', 'contracts', 'screening', 'confidentiality'],
  },
  
  requiredContext: ['documentId'],
  optionalContext: ['matterId', 'counterpartyName', 'businessContext'],
  
  executionPlan: [
    { name: 'Read NDA', description: 'Load and read the full NDA text', tools: ['read_document_content'], required: true },
    { name: 'Structure Check', description: 'Identify NDA type, parties, and agreement structure', tools: ['add_matter_note'], required: true },
    { name: 'Screening Checklist', description: 'Evaluate all 10 screening criteria systematically', tools: ['add_matter_note'], required: true },
    { name: 'Classification & Routing', description: 'Classify GREEN/YELLOW/RED with specific findings', tools: ['add_matter_note'], required: true },
    { name: 'Triage Report', description: 'Formal triage report with redlines if needed', tools: ['create_document'], required: true },
    { name: 'Follow-up Tasks', description: 'Route for signature or flag for counsel review', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'documents_read', minValue: 1, description: 'NDA document read in full' },
    { metric: 'notes_created', minValue: 2, description: 'Screening analysis notes' },
    { metric: 'documents_created', minValue: 1, description: 'Formal triage report' },
    { metric: 'tasks_created', minValue: 1, description: 'Routing task (approve or review)' },
  ],
  
  expectedOutputs: [
    'NDA type and structure identification',
    'Systematic screening against 10 criteria',
    'GREEN/YELLOW/RED classification with rationale',
    'Specific issues flagged with redline suggestions',
    'Routing recommendation with timeline',
    'Formal NDA triage report',
  ],
  
  instructions: `
## NDA TRIAGE WORKFLOW

**Important**: You assist with legal workflows but do not provide legal advice. All NDA analysis should be reviewed by qualified legal professionals before being relied upon.

### STEP 1: READ THE FULL NDA

Read the entire document before evaluating. Confirm it is actually an NDA and not a broader commercial agreement with a confidentiality section embedded in it.

### STEP 2: SCREENING CHECKLIST

Evaluate each of the following 10 criteria systematically:

---

#### 1. AGREEMENT STRUCTURE
- [ ] **Type identified**: Mutual NDA, Unilateral (disclosing), or Unilateral (receiving)
- [ ] **Appropriate for context**: Is the NDA type appropriate for the business relationship? (Mutual for exploratory discussions, unilateral for one-way disclosures)
- [ ] **Standalone agreement**: Confirm it is a standalone NDA, not a confidentiality section in a larger commercial agreement

#### 2. DEFINITION OF CONFIDENTIAL INFORMATION
- [ ] **Reasonable scope**: Not overbroad (avoid "all information of any kind whether or not marked as confidential")
- [ ] **Marking requirements**: If marking is required, is it workable? (Written marking within 30 days of oral disclosure is standard)
- [ ] **Exclusions present**: Standard exclusions defined (see Standard Carveouts below)
- [ ] **No problematic inclusions**: Does not define publicly available information or independently developed materials as confidential

#### 3. OBLIGATIONS OF RECEIVING PARTY
- [ ] **Standard of care**: Reasonable care or at least the same care as for own confidential information
- [ ] **Use restriction**: Limited to the stated purpose
- [ ] **Disclosure restriction**: Limited to those with need to know who are bound by similar obligations
- [ ] **No onerous obligations**: No impractical requirements (encrypting all communications, physical logs, etc.)

#### 4. STANDARD CARVEOUTS (ALL must be present)
- [ ] **Public knowledge**: Information that is or becomes publicly available through no fault of the receiving party
- [ ] **Prior possession**: Information already known before disclosure
- [ ] **Independent development**: Independently developed without use of or reference to confidential information
- [ ] **Third-party receipt**: Rightfully received from a third party without restriction
- [ ] **Legal compulsion**: Right to disclose when required by law or legal process (with notice to disclosing party where legally permitted)

#### 5. PERMITTED DISCLOSURES
- [ ] **Employees**: Can share with employees who need to know
- [ ] **Contractors/advisors**: Can share with contractors and professional consultants under similar obligations
- [ ] **Affiliates**: Can share with affiliates (if needed for the business purpose)
- [ ] **Legal/regulatory**: Can disclose as required by law or regulation

#### 6. TERM AND DURATION
- [ ] **Agreement term**: Reasonable period (1-3 years is standard)
- [ ] **Confidentiality survival**: Obligations survive for a reasonable period after termination (2-5 years standard; trade secrets may be longer)
- [ ] **Not perpetual**: Avoid indefinite or perpetual obligations (exception: trade secrets)

#### 7. RETURN AND DESTRUCTION
- [ ] **Obligation triggered**: On termination or upon request
- [ ] **Reasonable scope**: Return or destroy confidential information and all copies
- [ ] **Retention exception**: Allows retention of copies required by law, regulation, or internal compliance/backup policies
- [ ] **Certification**: Certification of destruction is reasonable; sworn affidavit is onerous

#### 8. REMEDIES
- [ ] **Injunctive relief**: Acknowledgment that breach may cause irreparable harm is standard
- [ ] **No pre-determined damages**: Avoid liquidated damages clauses in NDAs
- [ ] **Not one-sided**: Remedies apply equally to both parties (in mutual NDAs)

#### 9. PROBLEMATIC PROVISIONS TO FLAG
- [ ] **No non-solicitation**: NDA should NOT contain employee non-solicitation
- [ ] **No non-compete**: NDA should NOT contain non-compete provisions
- [ ] **No exclusivity**: Should not restrict either party from entering similar discussions with others
- [ ] **No standstill**: Should not contain standstill provisions (unless M&A context)
- [ ] **No broad residuals clause**: If present, must be limited to unaided memory and exclude trade secrets
- [ ] **No IP assignment or license**: NDA should not grant any IP rights
- [ ] **No audit rights**: Unusual in standard NDAs

#### 10. GOVERNING LAW AND JURISDICTION
- [ ] **Reasonable jurisdiction**: A well-established commercial jurisdiction
- [ ] **Consistent**: Governing law and jurisdiction should be in the same or related jurisdictions
- [ ] **No mandatory arbitration**: Litigation generally preferred for NDA disputes

---

### STEP 3: CLASSIFICATION RULES

#### GREEN -- Standard Approval

**ALL** of the following must be true:
- NDA is mutual (or unilateral in the appropriate direction)
- All 5 standard carveouts are present
- Term is within standard range (1-3 years, survival 2-5 years)
- No non-solicitation, non-compete, or exclusivity provisions
- No residuals clause, or residuals clause is narrowly scoped
- Reasonable governing law jurisdiction
- Standard remedies (no liquidated damages)
- Permitted disclosures include employees, contractors, and advisors
- Return/destruction provisions include retention exception
- Definition of confidential information is reasonably scoped

**Routing**: Approve via standard delegation. No counsel review needed.
**Timeline**: Same day.

#### YELLOW -- Counsel Review Needed

**One or more** of the following are present, but the NDA is not fundamentally problematic:
- Definition of confidential information is broader than preferred but not unreasonable
- Term is longer than standard but within market range (e.g., 5 years for agreement, 7 years for survival)
- Missing one standard carveout that could be added without difficulty
- Residuals clause present but narrowly scoped to unaided memory
- Governing law in an acceptable but non-preferred jurisdiction
- Minor asymmetry in a mutual NDA
- Marking requirements present but workable
- Return/destruction lacks explicit retention exception
- Unusual but non-harmful provisions

**Routing**: Flag specific issues for counsel. Counsel can likely resolve with minor redlines in a single pass.
**Timeline**: 1-2 business days.

#### RED -- Significant Issues

**One or more** of the following are present:
- 🔴 Unilateral when mutual is required (or wrong direction)
- 🔴 Missing critical carveouts (especially independent development or legal compulsion)
- 🔴 Non-solicitation or non-compete provisions embedded
- 🔴 Exclusivity or standstill provisions without appropriate context
- 🔴 Unreasonable term (10+ years, or perpetual without trade secret justification)
- 🔴 Overbroad definition that could capture public information or independently developed materials
- 🔴 Broad residuals clause that effectively creates a license to use confidential information
- 🔴 IP assignment or license grant hidden in the NDA
- 🔴 Liquidated damages or penalty provisions
- 🔴 Audit rights without reasonable scope
- 🔴 Highly unfavorable jurisdiction with mandatory arbitration
- 🔴 The document is NOT actually an NDA (contains substantive commercial terms)

**Routing**: Full legal review required. Do not sign. Requires negotiation or counterproposal with the firm's standard NDA form.
**Timeline**: 3-5 business days.

---

### STEP 4: COMMON ISSUES AND STANDARD POSITIONS

**Overbroad Definition of Confidential Information**
Standard position: Limited to non-public information disclosed in connection with the stated purpose, with clear exclusions.
Redline approach: Narrow to information that is marked or identified as confidential, or that a reasonable person would understand to be confidential.

**Missing Independent Development Carveout**
Standard position: Must include carveout for information independently developed without reference to confidential information.
Risk if missing: Could create claims that internally-developed products were derived from the counterparty's confidential information.
Redline: Add standard independent development carveout.

**Non-Solicitation of Employees**
Standard position: Non-solicitation does NOT belong in NDAs. Appropriate only in employment or M&A agreements.
Redline: Delete entirely. If counterparty insists, limit to targeted solicitation (not general recruitment) and set a 12-month term.

**Broad Residuals Clause**
Standard position: Resist residuals clauses. If required, limit to: (a) general ideas retained in unaided memory of authorized individuals; (b) explicitly exclude trade secrets and patentable information; (c) does not grant any IP license.
Risk if too broad: Effectively grants a license to use confidential information for any purpose.

**Perpetual Confidentiality Obligation**
Standard position: 2-5 years from disclosure or termination, whichever is later. Trade secrets may warrant protection for as long as they remain trade secrets.
Redline: Replace perpetual obligation with a defined term. Offer a trade secret carveout.

---

### NDA TRIAGE REPORT FORMAT

\`\`\`
NDA TRIAGE REPORT

Document: [NDA name/identifier]
Counterparty: [name]
NDA Type: [Mutual / Unilateral (disclosing) / Unilateral (receiving)]
Date Received: [date]

CLASSIFICATION: [GREEN / YELLOW / RED]

SCREENING SUMMARY
[One-paragraph overview of the NDA's key terms and overall quality]

CHECKLIST RESULTS
1. Agreement Structure: [✅ / ⚠️ / ❌] [brief note]
2. Definition Scope: [✅ / ⚠️ / ❌] [brief note]
3. Obligations: [✅ / ⚠️ / ❌] [brief note]
4. Standard Carveouts: [✅ / ⚠️ / ❌] [brief note]
5. Permitted Disclosures: [✅ / ⚠️ / ❌] [brief note]
6. Term & Duration: [✅ / ⚠️ / ❌] [brief note]
7. Return/Destruction: [✅ / ⚠️ / ❌] [brief note]
8. Remedies: [✅ / ⚠️ / ❌] [brief note]
9. Problematic Provisions: [✅ / ⚠️ / ❌] [brief note]
10. Governing Law: [✅ / ⚠️ / ❌] [brief note]

ISSUES FOUND
[For YELLOW/RED items, list each issue with:]
- Issue: [description]
- Risk: [what could go wrong]
- Redline: [specific alternative language]
- Priority: [Must-fix / Should-fix / Nice-to-fix]

ROUTING RECOMMENDATION
[Approve / Send to counsel with flagged issues / Full legal review required]
Expected timeline: [Same day / 1-2 days / 3-5 days]

NEXT STEPS
1. [Most urgent action]
2. [Second priority]
\`\`\`
`,
};
