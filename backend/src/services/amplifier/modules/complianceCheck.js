/**
 * Compliance Check Module
 * 
 * Comprehensive compliance review covering:
 * 1. Professional ethics (conflicts, trust accounts, engagement letters)
 * 2. Privacy regulation compliance (GDPR, CCPA/CPRA, and others)
 * 3. DPA review for vendor data processing
 * 4. Data subject request handling
 * 
 * Combines the traditional law firm ethics compliance with modern
 * data privacy obligations that every firm now faces.
 */

export const complianceCheckModule = {
  metadata: {
    name: 'Compliance & Privacy Review',
    description: 'Ethics compliance, privacy regulation review, DPA analysis, and data subject request handling',
    category: 'compliance',
    estimatedMinutes: 10,
    complexity: 'high',
    tags: ['compliance', 'ethics', 'trust', 'conflicts', 'gdpr', 'ccpa', 'privacy', 'dpa'],
  },
  
  requiredContext: [],
  optionalContext: ['matterId', 'clientId', 'complianceType', 'jurisdiction'],
  
  executionPlan: [
    { name: 'Matter Review', description: 'Load matter and client information', tools: ['get_matter', 'list_my_matters'], required: true },
    { name: 'Conflict Analysis', description: 'Check for potential conflicts of interest', tools: ['check_conflicts', 'list_clients', 'add_matter_note'], required: true },
    { name: 'Engagement Review', description: 'Verify engagement documentation', tools: ['list_documents', 'add_matter_note'], required: true },
    { name: 'Trust Account Compliance', description: 'Check trust account and IOLA rules', tools: ['add_matter_note'], required: true },
    { name: 'Privacy & Data Protection', description: 'Assess data protection obligations and DPA requirements', tools: ['add_matter_note'], required: true },
    { name: 'Compliance Report', description: 'Create comprehensive compliance report', tools: ['create_document'], required: true },
    { name: 'Follow-up Tasks', description: 'Tasks for any compliance issues found', tools: ['create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'notes_created', minValue: 3, description: 'Compliance analysis notes (conflicts, engagement, privacy)' },
    { metric: 'documents_created', minValue: 1, description: 'Comprehensive compliance report' },
    { metric: 'tasks_created', minValue: 1, description: 'Follow-up tasks for issues found' },
  ],
  
  expectedOutputs: [
    'Conflict check results with analysis',
    'Engagement letter status and gaps',
    'Trust account compliance assessment',
    'Privacy regulation applicability assessment',
    'DPA review findings (if applicable)',
    'Comprehensive compliance report',
    'Remediation tasks for any issues',
  ],
  
  instructions: `
## COMPLIANCE & PRIVACY REVIEW WORKFLOW

**Important**: You assist with legal workflows but do not provide legal advice. Compliance determinations should be reviewed by qualified legal professionals. Regulatory requirements change frequently; always verify current requirements with authoritative sources.

---

## PART 1: PROFESSIONAL ETHICS COMPLIANCE

### NY RULES OF PROFESSIONAL CONDUCT

#### Rule 1.7: Conflict of Interest -- Current Clients
A lawyer shall not represent a client if a reasonable lawyer would conclude that:
- The representation will involve the lawyer in representing differing interests, OR
- There is a significant risk that the representation will be materially limited by the lawyer's responsibilities to another client, a former client, a third person, or the lawyer's own interests.

**Conflict Check Process:**
1. Search client database for adverse parties and related entities
2. Check former clients with similar matters (Rule 1.9)
3. Document any potential conflicts found
4. Assess if the conflict is waivable (informed consent, confirmed in writing)
5. Check for imputed conflicts across the firm (Rule 1.10)

#### Rule 1.9: Duties to Former Clients
A lawyer who formerly represented a client shall not:
- Represent another person in the same or substantially related matter adverse to that client
- Use information relating to the representation to the disadvantage of the former client

#### Rule 1.10: Imputed Conflicts
When a lawyer is disqualified under Rules 1.7 or 1.9, no lawyer associated in the same firm may represent the client unless the conflict is based on a personal interest and does not present a significant risk.

#### Rule 1.5: Fees and Engagement Letters
- Fee arrangement must be communicated to the client before or within a reasonable time after commencing representation
- Written engagement letter required for contingency fees
- Fee must be reasonable considering: time, novelty, skill required, likelihood of precluding other work, customary fee, amount involved, results obtained, experience/reputation, time limitations, nature of professional relationship

**Engagement Letter Checklist:**
- [ ] Signed engagement letter on file
- [ ] Scope of representation clearly defined
- [ ] Fee arrangement documented (hourly, flat, contingency, hybrid)
- [ ] Billing rates specified (if hourly)
- [ ] Retainer requirements met and funds deposited
- [ ] Termination provisions included
- [ ] Client obligations stated (cooperation, document production, truthfulness)
- [ ] Limitation of scope (if not full representation)

#### Rule 1.15: Safekeeping Property -- Trust Accounts (IOLA)

**Trust Account Compliance:**
- [ ] Client funds properly deposited in IOLA or interest-bearing trust account
- [ ] No commingling with firm operating funds
- [ ] Proper documentation of all transactions (receipts, disbursements)
- [ ] Regular reconciliation (monthly recommended)
- [ ] Interest properly designated (IOLA for nominal amounts)
- [ ] Records maintained for 7 years after matter closes
- [ ] Separate ledger for each client matter

**Red Flags:**
- 🔴 Client funds in operating account (commingling)
- 🔴 Missing trust account records
- 🔴 Failure to promptly distribute funds owed to client
- 🔴 Using one client's funds for another client's matter
- 🟡 Reconciliation not current
- 🟡 Interest allocation not properly designated

---

## PART 2: PRIVACY REGULATION COMPLIANCE

### GDPR (General Data Protection Regulation)

**Scope**: Processing of personal data of individuals in the EU/EEA, regardless of where the processing organization is located.

**Key Obligations:**
- **Lawful basis**: Identify and document lawful basis for each processing activity (consent, contract, legitimate interest, legal obligation, vital interest, public task)
- **Data subject rights**: Respond to access, rectification, erasure, portability, restriction, and objection requests within **30 days** (extendable by 60 days for complex requests)
- **DPIAs**: Required for processing likely to result in high risk
- **Breach notification**: Notify supervisory authority within **72 hours**; notify individuals without undue delay if high risk
- **Records of processing**: Maintain Article 30 records
- **International transfers**: Ensure appropriate safeguards (SCCs, adequacy decisions, BCRs)
- **DPO requirement**: Appoint DPO if required (public authority, large-scale special categories, large-scale systematic monitoring)

### CCPA / CPRA (California)

**Scope**: Businesses collecting personal information of California residents meeting revenue, data volume, or data sale thresholds.

**Key Obligations:**
- **Right to know**: Consumers can request disclosure of PI collected, used, and shared
- **Right to delete**: Consumers can request deletion of PI
- **Right to opt-out**: Opt out of sale or sharing of PI
- **Right to correct**: Request correction of inaccurate PI (CPRA addition)
- **Right to limit sensitive PI**: Limit use of sensitive PI to specific purposes (CPRA)
- **Non-discrimination**: Cannot discriminate for exercising rights
- **Privacy notice**: Required at or before collection

**Response Timelines:**
- Acknowledge receipt within **10 business days**
- Respond substantively within **45 calendar days** (extendable by 45 days with notice)

### Other Key Regulations

| Regulation | Jurisdiction | Key Differentiators |
|---|---|---|
| **LGPD** | Brazil | Similar to GDPR; requires DPO; National Data Protection Authority (ANPD) |
| **POPIA** | South Africa | Information Regulator oversight; required registration |
| **PIPEDA** | Canada (federal) | Consent-based framework; OPC oversight |
| **PDPA** | Singapore | Do Not Call registry; mandatory breach notification |
| **Privacy Act** | Australia | Australian Privacy Principles (APPs); notifiable data breaches |
| **PIPL** | China | Strict cross-border transfer rules; data localization; CAC oversight |
| **UK GDPR** | United Kingdom | Post-Brexit UK version; ICO oversight; similar to EU GDPR |

---

## PART 3: DPA REVIEW CHECKLIST

When reviewing a Data Processing Agreement (DPA), verify:

### Required Elements (GDPR Article 28)
- [ ] Subject matter and duration clearly defined
- [ ] Nature and purpose of processing specified
- [ ] Types of personal data being processed listed
- [ ] Categories of data subjects identified
- [ ] Controller obligations and rights stated

### Processor Obligations
- [ ] Process only on documented controller instructions
- [ ] Personnel committed to confidentiality
- [ ] Appropriate technical and organizational security measures (Article 32)
- [ ] **Sub-processor requirements:**
  - [ ] Written authorization requirement (general or specific)
  - [ ] If general: notification of changes with opportunity to object
  - [ ] Sub-processors bound by same obligations via written agreement
  - [ ] Processor remains liable for sub-processor performance
- [ ] Assistance with data subject rights requests
- [ ] Assistance with security, breach notification, DPIAs
- [ ] Deletion or return of all personal data on termination
- [ ] Audit rights (or acceptance of third-party audit reports)
- [ ] Breach notification without undue delay (ideally within **24-48 hours** to enable controller's 72-hour deadline)

### International Transfers
- [ ] Transfer mechanism identified (SCCs, adequacy, BCRs)
- [ ] Current EU SCCs (June 2021 version) if applicable
- [ ] Correct SCC module selected (C2P, C2C, P2P, P2C)
- [ ] Transfer impact assessment completed if needed
- [ ] Supplementary measures if transferring to countries without adequacy
- [ ] UK International Data Transfer Addendum if UK data in scope

### Common DPA Issues

| Issue | Risk | Standard Position |
|---|---|---|
| Blanket sub-processor authorization | Loss of control | Require notification with right to object |
| Breach notification > 72 hours | Regulatory risk | Require 24-48 hour notification |
| No audit rights | Cannot verify compliance | Accept SOC 2 Type II + right to audit on cause |
| No deletion timeline | Indefinite retention | Require deletion within 30-90 days |
| No processing locations | Data anywhere | Require disclosure of locations |
| Outdated SCCs | Invalid transfer mechanism | Require current 2021 EU SCCs |

---

## PART 4: DATA SUBJECT REQUEST HANDLING

### Request Intake Process
1. **Identify request type**: Access, rectification, erasure, restriction, portability, objection, opt-out, limit sensitive PI
2. **Identify applicable regulation(s)**: Where is the data subject? Which laws apply?
3. **Verify identity**: Reasonable verification proportionate to data sensitivity
4. **Log the request**: Date, type, requester, regulation, deadline, handler

### Response Timelines

| Regulation | Acknowledgment | Substantive Response | Extension |
|---|---|---|---|
| GDPR | Promptly (best practice) | 30 days | +60 days with notice |
| CCPA/CPRA | 10 business days | 45 calendar days | +45 days with notice |
| UK GDPR | Promptly (best practice) | 30 days | +60 days with notice |
| LGPD | Not specified | 15 days | Limited |

### Exemptions to Check
- Legal claims defense or establishment
- Legal obligations requiring retention
- Litigation hold (data subject to legal hold cannot be deleted)
- Regulatory retention (financial records, employment records)
- Third-party rights (fulfilling request might adversely affect others)
- Freedom of expression (for erasure requests)

---

## COMPLIANCE REPORT FORMAT

\`\`\`
COMPLIANCE REVIEW REPORT

Matter: [Name]
Client: [Name]
Reviewer: [Agent]
Date: [Date]
Scope: [Ethics / Privacy / Both]

EXECUTIVE SUMMARY
[2-3 sentence overview of compliance posture and any critical issues]

PART 1: PROFESSIONAL ETHICS

CONFLICT CHECK
Status: [Clear / Issue Found / Waiver Obtained / Waiver Needed]
Parties checked: [list]
Potential conflicts: [details or "None identified"]
Recommended action: [proceed / obtain waiver / decline representation]

ENGAGEMENT DOCUMENTATION
Status: [Complete / Missing Items]
Items present: [list checked items]
Items missing: [list gaps]
Recommended action: [specific steps]

TRUST ACCOUNT
Status: [Compliant / Issue Found / N/A]
Balance: [if applicable]
Last reconciliation: [date]
Issues: [details or "None"]

PART 2: DATA PROTECTION

APPLICABLE REGULATIONS
[List which regulations apply based on matter jurisdiction and data types]

DPA STATUS (if vendor data processing involved)
Status: [DPA in place / DPA needed / N/A]
Key findings: [sub-processor notification, breach timeline, transfer mechanism]

DATA SUBJECT REQUESTS
Open requests: [count and status]
Overdue requests: [count and details]

PART 3: ISSUES REQUIRING ATTENTION

| # | Issue | Severity | Regulation/Rule | Recommended Action | Deadline |
|---|---|---|---|---|---|
| 1 | [issue] | [HIGH/MED/LOW] | [rule] | [action] | [date] |

PART 4: RECOMMENDATIONS
1. [Most urgent action]
2. [Second priority]
3. [Ongoing monitoring items]
\`\`\`
`,
};
