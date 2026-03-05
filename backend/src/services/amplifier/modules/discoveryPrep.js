/**
 * Discovery Prep Module
 * 
 * Comprehensive discovery preparation including:
 * - Document inventory and categorization by relevance
 * - Privilege review with specific privilege types
 * - Discovery request drafting (interrogatories, document demands, admissions)
 * - Production checklist and protective order assessment
 * - Preservation / litigation hold guidance
 * 
 * Covers both NY CPLR Article 31 and federal discovery rules.
 */

export const discoveryPrepModule = {
  metadata: {
    name: 'Discovery Preparation',
    description: 'Document organization, privilege review, discovery request drafting, and production planning',
    category: 'documents',
    estimatedMinutes: 15,
    complexity: 'high',
    tags: ['discovery', 'litigation', 'documents', 'disclosure', 'privilege', 'production'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['discoveryType', 'jurisdiction', 'phase'],
  
  executionPlan: [
    { name: 'Review Matter & Posture', description: 'Understand case posture and discovery needs', tools: ['get_matter'], required: true },
    { name: 'Document Inventory', description: 'Catalog all available documents', tools: ['list_documents'], required: true },
    { name: 'Document Review & Categorization', description: 'Read and categorize documents by relevance and privilege', tools: ['read_document_content', 'add_matter_note'], required: true },
    { name: 'Privilege Log', description: 'Identify and log privileged documents', tools: ['add_matter_note'], required: true },
    { name: 'Discovery Requests', description: 'Draft interrogatories, document demands, or admissions', tools: ['create_document'], required: true },
    { name: 'Production Plan', description: 'Create production checklist and protective order analysis', tools: ['create_document', 'create_task'], required: true },
  ],
  
  qualityGates: [
    { metric: 'documents_read', minValue: 2, description: 'Key case documents reviewed' },
    { metric: 'notes_created', minValue: 2, description: 'Document categorization and privilege log notes' },
    { metric: 'documents_created', minValue: 2, description: 'Discovery requests and production checklist' },
    { metric: 'tasks_created', minValue: 2, description: 'Production and follow-up tasks' },
  ],
  
  expectedOutputs: [
    'Document inventory with relevance categorization',
    'Privilege log with specific privilege assertions',
    'Draft discovery requests (interrogatories, document demands, admissions)',
    'Production plan and checklist',
    'Protective order assessment (if needed)',
    'Preservation / litigation hold recommendations',
  ],
  
  instructions: `
## DISCOVERY PREPARATION WORKFLOW

**Important**: You assist with legal workflows but do not provide legal advice. Discovery strategy should be approved by the supervising attorney before any filings are made.

---

### APPLICABLE RULES

#### NY CPLR Article 31 (State Court)
- **CPLR 3101**: Scope of disclosure — "full disclosure of all matter material and necessary in the prosecution or defense of an action"
- **CPLR 3101(b)**: Attorney-client privilege — privileged matter shall not be obtainable
- **CPLR 3101(c)**: Attorney work product — documents prepared in anticipation of litigation
- **CPLR 3101(d)**: Trial preparation materials — expert reports, witness statements
- **CPLR 3120**: Discovery and production of documents and things
- **CPLR 3130**: Interrogatories (limited to 25 in some courts)
- **CPLR 3123**: Requests for admission

#### Federal Rules of Civil Procedure (Federal Court)
- **Rule 26(b)(1)**: Scope — relevant to any party's claim or defense, proportional to needs of the case
- **Rule 26(a)**: Initial disclosures (mandatory in federal court)
- **Rule 33**: Interrogatories (limited to 25 without leave of court)
- **Rule 34**: Production of documents
- **Rule 36**: Requests for admission
- **Rule 26(b)(3)**: Work product protection
- **Rule 26(b)(5)**: Privilege log requirements

---

### PHASE 1: DOCUMENT INVENTORY & CATEGORIZATION

Review all available documents and categorize by:

**Relevance Categories:**
| Category | Description | Production Status |
|---|---|---|
| **Highly Relevant** | Core to claims/defenses; directly proves/disproves elements | Produce (unless privileged) |
| **Relevant** | Supports or provides context for key facts | Produce (unless privileged) |
| **Potentially Relevant** | May become relevant depending on case development | Preserve; produce if requested |
| **Not Relevant** | No connection to any claim or defense | No production obligation |
| **Privileged** | Protected from disclosure | Log on privilege log |
| **Confidential** | Sensitive business information | May need protective order |

**For each document, note:**
- Document type (email, contract, memo, report, etc.)
- Date or date range
- Author(s) and recipient(s)
- Subject matter
- Relevance category and rationale
- Privilege assertion (if any)
- Key excerpts or takeaways

---

### PHASE 2: PRIVILEGE REVIEW

Identify and categorize all potentially privileged documents:

#### Attorney-Client Privilege
**Elements (all must be present):**
1. Communication between attorney and client (or their agents)
2. Made in confidence
3. For the purpose of seeking or providing legal advice
4. The privilege has not been waived

**Common privilege issues:**
- 🔴 CC'ing non-essential third parties on attorney-client emails (waiver risk)
- 🔴 Forwarding privileged communications to outside parties
- 🟡 In-house counsel wearing "business hat" vs. "legal hat" — only legal advice is privileged
- 🟡 Communications with agents of the client (which employees count?)

#### Work Product Doctrine
**Elements:**
1. Documents or tangible things
2. Prepared in anticipation of litigation
3. By or for a party, or by a party's representative

**Two tiers of protection:**
- **Ordinary work product** (factual): Discoverable on showing of substantial need + inability to obtain without undue hardship
- **Opinion work product** (mental impressions, conclusions, legal theories): Near-absolute protection

#### Other Privileges to Consider
- **Common interest privilege**: Communications between co-parties or parties with shared legal interest
- **Mediation privilege**: Communications made during mediation (varies by jurisdiction)
- **Self-critical analysis privilege**: Internal investigations and audits (limited recognition)
- **Trade secrets**: Not a privilege per se, but may support protective order

#### Privilege Log Format

| # | Date | From | To | CC | Type | Description | Privilege Asserted |
|---|---|---|---|---|---|---|---|
| 1 | [date] | [name] | [name] | [names] | [email/memo/etc.] | [non-revealing description] | [A-C Privilege / Work Product / Both] |

**Privilege log best practices:**
- Description must be specific enough to assess the privilege claim but NOT reveal the privileged content
- Bad: "Email regarding legal matter" (too vague)
- Good: "Email from in-house counsel to CEO providing legal advice regarding proposed vendor contract terms"
- Include all necessary metadata (date, author, recipients, general subject)

---

### PHASE 3: DISCOVERY REQUESTS

#### Interrogatories
Draft targeted interrogatories focused on:
- Identity of witnesses and persons with knowledge
- Factual basis for claims/defenses (contention interrogatories)
- Damages calculations and methodology
- Insurance coverage applicable to the claims
- Corporate relationships and organizational structure
- Timeline of key events from opposing party's perspective

**Format:**
\`\`\`
INTERROGATORY NO. [#]:
[Clear, specific question that cannot be evaded with a vague answer]

(Include definitions and instructions at the beginning of the set)
\`\`\`

**Best practices:**
- Be specific — avoid compound questions that are easy to object to
- Define key terms at the beginning
- Ask for the factual basis, not legal conclusions
- Include "identify all documents" companion requests
- Stay within the court's limit (typically 25)

#### Document Demands (Requests for Production)
Request categories to consider:
- All communications between specific parties regarding [topic]
- All contracts, agreements, or amendments related to [subject]
- All internal reports, analyses, or memoranda concerning [issue]
- All financial records showing [damages/payments/losses]
- All photographs, videos, or recordings of [incident/scene]
- Insurance policies covering the claims at issue
- Personnel files (if employment matter)
- Electronic communications including text messages and chat

**Format:**
\`\`\`
REQUEST FOR PRODUCTION NO. [#]:
All [documents/communications/records] [specific description] for the period [date range].
\`\`\`

#### Requests for Admission
Use strategically to:
- Establish undisputed facts (reduce trial issues)
- Authenticate documents
- Establish the legal capacity of parties
- Confirm compliance with conditions precedent

---

### PHASE 4: PRODUCTION PLAN

Create a production checklist:

**Pre-Production Checklist:**
- [ ] Litigation hold issued and confirmed by all custodians
- [ ] Custodians identified (whose files need to be searched)
- [ ] Data sources identified (email, file shares, local drives, cloud, paper)
- [ ] Date range for collection determined
- [ ] Search terms agreed upon (if ESI protocol in place)
- [ ] Review platform set up (if using document review software)
- [ ] Privilege review team assigned
- [ ] Production format agreed upon (native, TIFF, PDF, load file)
- [ ] Bates numbering convention established
- [ ] Protective order in place (if producing confidential documents)
- [ ] Redaction protocol established (PII, trade secrets)
- [ ] Quality control process defined

**Production Timeline:**
| Milestone | Target Date | Owner | Status |
|---|---|---|---|
| Litigation hold confirmed | [date] | [name] | [status] |
| Document collection complete | [date] | [name] | [status] |
| First-pass review complete | [date] | [name] | [status] |
| Privilege review complete | [date] | [name] | [status] |
| Production to opposing party | [date] | [name] | [status] |
| Privilege log delivered | [date] | [name] | [status] |

**Protective Order Assessment:**
Evaluate whether a protective order is needed:
- Does the production include trade secrets or proprietary business information?
- Does it include personal information (PII, medical, financial)?
- Does it include competitively sensitive information?
- Is there a risk of public disclosure?
If yes to any: Draft or request a stipulated protective order before production.

---

### LITIGATION HOLD / PRESERVATION

If a litigation hold has not been issued:

**Hold Notice Elements:**
1. Description of the dispute or anticipated litigation
2. Instruction to preserve ALL potentially relevant documents and ESI
3. Specific categories of materials to preserve
4. Prohibition on routine deletion, including auto-delete policies
5. Instruction to notify IT to suspend auto-deletion for relevant custodians
6. Contact person for questions
7. Acknowledgment requirement

**Scope of preservation:**
- Emails (including deleted/archived)
- Text messages and chat (Slack, Teams, etc.)
- Documents on local and network drives
- Cloud storage (Dropbox, Google Drive, OneDrive, etc.)
- Voicemails
- Social media posts
- Database records
- Backup tapes (if routine deletion would destroy relevant data)

**Spoliation risks:**
- 🔴 Failure to issue timely hold = adverse inference or sanctions
- 🔴 Continued routine deletion after hold should have been issued
- 🔴 Failure to preserve relevant social media or text messages
- 🟡 Overly narrow hold scope that misses relevant custodians or data sources
`,
};
