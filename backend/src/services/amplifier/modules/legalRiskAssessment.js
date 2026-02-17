/**
 * Legal Risk Assessment Module
 * 
 * Structured risk assessment framework using a severity-by-likelihood
 * matrix with escalation criteria. Produces color-coded risk ratings
 * with specific recommended actions at each level.
 * 
 * Used when evaluating contract risk, assessing deal exposure,
 * classifying legal issues by severity, or determining whether a
 * matter needs senior counsel or outside legal review.
 */

export const legalRiskAssessmentModule = {
  metadata: {
    name: 'Legal Risk Assessment',
    description: 'Structured risk evaluation using severity-by-likelihood matrix with escalation criteria and outside counsel triggers',
    category: 'compliance',
    estimatedMinutes: 8,
    complexity: 'high',
    tags: ['risk', 'assessment', 'escalation', 'compliance', 'governance'],
  },
  
  requiredContext: [],
  optionalContext: ['matterId', 'riskDescription', 'contractId', 'dealValue'],
  
  executionPlan: [
    { name: 'Gather Context', description: 'Load matter, documents, and background information', tools: ['get_matter', 'list_documents', 'read_document_content'], required: true },
    { name: 'Identify Risks', description: 'Catalog all legal risks from the matter/contract/situation', tools: ['add_matter_note'], required: true },
    { name: 'Score Risks', description: 'Rate each risk on severity and likelihood with rationale', tools: ['add_matter_note'], required: true },
    { name: 'Mitigation Analysis', description: 'Identify mitigation options and residual risk', tools: ['add_matter_note'], required: true },
    { name: 'Risk Assessment Memo', description: 'Create formal risk assessment document', tools: ['create_document'], required: true },
    { name: 'Action Items', description: 'Tasks for mitigation, monitoring, and escalation', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'documents_read', minValue: 1, description: 'Background documents reviewed' },
    { metric: 'notes_created', minValue: 2, description: 'Risk identification and scoring notes' },
    { metric: 'documents_created', minValue: 1, description: 'Formal risk assessment memo' },
    { metric: 'tasks_created', minValue: 1, description: 'Mitigation and monitoring tasks' },
  ],
  
  expectedOutputs: [
    'Risk inventory with categorization',
    'Severity and likelihood scores with rationale',
    'Risk matrix visualization',
    'Mitigation options analysis',
    'Escalation recommendations',
    'Formal risk assessment memorandum',
    'Risk register entries',
  ],
  
  instructions: `
## LEGAL RISK ASSESSMENT WORKFLOW

**Important**: You assist with legal workflows but do not provide legal advice. Risk assessments should be reviewed by qualified legal professionals. This framework is a starting point that firms should customize to their specific risk appetite.

---

### SEVERITY x LIKELIHOOD MATRIX

Legal risks are assessed on two dimensions:

**Severity** (impact if the risk materializes):

| Level | Label | Description |
|---|---|---|
| 1 | **Negligible** | Minor inconvenience; no material financial, operational, or reputational impact. Handled within normal operations. |
| 2 | **Low** | Limited impact; minor financial exposure (< 1% of contract/deal value); minor operational disruption; no public attention. |
| 3 | **Moderate** | Meaningful impact; material financial exposure (1-5% of value); noticeable disruption; potential for limited public attention. |
| 4 | **High** | Significant impact; substantial financial exposure (5-25% of value); significant disruption; likely public attention; potential regulatory scrutiny. |
| 5 | **Critical** | Severe impact; major financial exposure (> 25% of value); fundamental business disruption; significant reputational damage; regulatory action likely; potential personal liability for officers/directors. |

**Likelihood** (probability the risk materializes):

| Level | Label | Description |
|---|---|---|
| 1 | **Remote** | Highly unlikely; no known precedent; would require exceptional circumstances. |
| 2 | **Unlikely** | Could occur but not expected; limited precedent; would require specific triggers. |
| 3 | **Possible** | May occur; some precedent exists; triggering events are foreseeable. |
| 4 | **Likely** | Probably will occur; clear precedent; triggering events are common. |
| 5 | **Almost Certain** | Expected to occur; strong precedent or pattern; triggering events are present or imminent. |

**Risk Score = Severity x Likelihood**

| Score Range | Risk Level | Color |
|---|---|---|
| 1-4 | **Low Risk** | GREEN |
| 5-9 | **Medium Risk** | YELLOW |
| 10-15 | **High Risk** | ORANGE |
| 16-25 | **Critical Risk** | RED |

---

### RISK CLASSIFICATION WITH RECOMMENDED ACTIONS

#### GREEN -- Low Risk (Score 1-4)

**Characteristics:**
- Minor issues unlikely to materialize
- Standard business risks within normal operating parameters
- Well-understood risks with established mitigations

**Recommended Actions:**
- **Accept**: Acknowledge and proceed with standard controls
- **Document**: Record in risk register
- **Monitor**: Periodic review (quarterly or annually)
- **No escalation required**

**Examples:**
- Vendor contract with minor deviation in a non-critical area
- Routine NDA with a well-known counterparty
- Minor administrative compliance task with clear deadline

#### YELLOW -- Medium Risk (Score 5-9)

**Characteristics:**
- Moderate issues that could materialize under foreseeable circumstances
- Warrant attention but do not require immediate action
- Established precedent for management

**Recommended Actions:**
- **Mitigate**: Implement specific controls or negotiate to reduce exposure
- **Monitor actively**: Monthly review or as triggers occur
- **Document thoroughly**: Risk, mitigations, and rationale in register
- **Assign owner**: Specific person responsible for monitoring
- **Brief stakeholders**: Inform relevant business stakeholders
- **Define escalation triggers**: Conditions that would elevate the risk

**Examples:**
- Contract with liability cap below standard but within negotiable range
- Vendor processing personal data without clear adequacy determination
- Regulatory development that may affect business in medium term

#### ORANGE -- High Risk (Score 10-15)

**Characteristics:**
- Significant issues with meaningful probability of materializing
- Could result in substantial financial, operational, or reputational impact
- Requires senior attention and dedicated mitigation

**Recommended Actions:**
- **Escalate to senior counsel**: Brief the head of legal or designated senior counsel
- **Develop mitigation plan**: Specific, actionable plan to reduce risk
- **Brief leadership**: Inform relevant business leaders
- **Weekly review cadence**: Review at defined milestones
- **Consider outside counsel**: Engage for specialized advice if needed
- **Full risk memo**: Detailed analysis with options and recommendations
- **Contingency plan**: What to do if the risk materializes

**Examples:**
- Contract with uncapped indemnification in a material area
- Data processing that may violate a regulation if not restructured
- Threatened litigation from a significant counterparty
- IP infringement allegation with colorable basis

#### RED -- Critical Risk (Score 16-25)

**Characteristics:**
- Severe issues that are likely or certain to materialize
- Could fundamentally impact the business, its officers, or stakeholders
- Requires immediate executive attention

**Recommended Actions:**
- **Immediate escalation**: Brief General Counsel, C-suite, and/or Board
- **Engage outside counsel immediately**
- **Establish response team**: Dedicated team with clear roles
- **Consider insurance notification**: Notify insurers if applicable
- **Crisis management**: Activate protocols if reputational risk involved
- **Preserve evidence**: Implement litigation hold if legal proceedings possible
- **Daily or more frequent review**: Active management until resolved
- **Board reporting**: Include in board risk reporting as appropriate
- **Regulatory notifications**: Make any required notifications

**Examples:**
- Active litigation with significant exposure
- Data breach affecting regulated personal data
- Regulatory enforcement action
- Material contract breach
- Government investigation

---

### WHEN TO ENGAGE OUTSIDE COUNSEL

#### Mandatory Engagement
- Active litigation (any lawsuit filed against or by the firm)
- Government investigation or inquiry from any agency
- Criminal exposure for the firm or its personnel
- Securities issues affecting disclosures or filings
- Board-level matters requiring board notification or approval

#### Strongly Recommended
- Novel legal issues or unsettled law where position could set precedent
- Jurisdictional complexity (unfamiliar or conflicting requirements)
- Material financial exposure exceeding firm risk tolerance
- Specialized expertise not available in-house (antitrust, FCPA, patent, etc.)
- New regulations materially affecting the business
- M&A transactions

#### Consider Engagement
- Complex contract disputes with material counterparties
- Employment matters (discrimination, harassment, wrongful termination, whistleblower)
- Potential data breaches triggering notification obligations
- IP disputes involving material products or services
- Insurance coverage disputes

---

### RISK ASSESSMENT MEMO FORMAT

\`\`\`
LEGAL RISK ASSESSMENT

Date: [date]
Assessor: [name/role]
Matter: [description]
Privileged: [Yes/No - mark as attorney-client privileged if applicable]

1. RISK DESCRIPTION
[Clear, concise description of the legal risk]

2. BACKGROUND AND CONTEXT
[Relevant facts, history, and business context]

3. RISK ANALYSIS

Severity Assessment: [1-5] - [Label]
[Rationale: potential financial exposure, operational impact, reputational considerations]

Likelihood Assessment: [1-5] - [Label]
[Rationale: precedent, triggering events, current conditions]

Risk Score: [Score] - [GREEN/YELLOW/ORANGE/RED]

4. CONTRIBUTING FACTORS
[What increases the risk]

5. MITIGATING FACTORS
[What decreases the risk or limits exposure]

6. MITIGATION OPTIONS

| Option | Effectiveness | Cost/Effort | Recommended? |
|---|---|---|---|
| [Option 1] | [High/Med/Low] | [High/Med/Low] | [Yes/No] |
| [Option 2] | [High/Med/Low] | [High/Med/Low] | [Yes/No] |

7. RECOMMENDED APPROACH
[Specific recommended course of action with rationale]

8. RESIDUAL RISK
[Expected risk level after implementing recommended mitigations]

9. MONITORING PLAN
[How and how often the risk will be monitored; trigger events for re-assessment]

10. NEXT STEPS
1. [Action - Owner - Deadline]
2. [Action - Owner - Deadline]
\`\`\`

### RISK REGISTER ENTRY FORMAT

| Field | Content |
|---|---|
| Risk ID | Unique identifier |
| Date Identified | When first identified |
| Description | Brief description |
| Category | Contract / Regulatory / Litigation / IP / Privacy / Employment / Corporate / Other |
| Severity | 1-5 with label |
| Likelihood | 1-5 with label |
| Risk Score | Calculated score |
| Risk Level | GREEN / YELLOW / ORANGE / RED |
| Owner | Person responsible |
| Mitigations | Current controls |
| Status | Open / Mitigated / Accepted / Closed |
| Review Date | Next scheduled review |
| Notes | Additional context |
`,
};
