import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  FileText, Search, Play, Download, X, Sparkles, Plus, 
  Edit3, Copy, Trash2, Save, Eye, ChevronDown, ChevronRight,
  FileSignature, Scale, Gavel, Building, Users, DollarSign,
  Clock, Shield, Briefcase, FileCheck, MessageSquare, CheckCircle2, FolderPlus
} from 'lucide-react'
import { clsx } from 'clsx'
import styles from './DocumentAutomationPage.module.css'
import { documentsApi } from '../services/api'

interface TemplateVariable {
  key: string
  label: string
  type: 'text' | 'date' | 'number' | 'select' | 'client' | 'matter' | 'user' | 'textarea'
  required: boolean
  defaultValue?: string
  options?: string[]
  placeholder?: string
}

interface DocumentTemplate {
  id: string
  name: string
  description: string
  category: string
  documentType: string
  variables: TemplateVariable[]
  content: string
  lastUsed?: string
  usageCount: number
  createdAt: string
  isCustom?: boolean
  icon: typeof FileText
}

// 10 Pre-automated document templates most used by lawyers
const preAutomatedTemplates: DocumentTemplate[] = [
  {
    id: '1',
    name: 'Engagement Letter',
    description: 'Standard attorney-client engagement letter outlining scope of representation, fees, and terms',
    category: 'Client Intake',
    documentType: 'docx',
    icon: FileSignature,
    variables: [
      { key: 'client_name', label: 'Client Name', type: 'client', required: true },
      { key: 'client_address', label: 'Client Address', type: 'textarea', required: true, placeholder: 'Enter full address' },
      { key: 'matter_description', label: 'Matter Description', type: 'textarea', required: true, placeholder: 'Brief description of legal matter' },
      { key: 'scope_of_work', label: 'Scope of Work', type: 'textarea', required: true, placeholder: 'Detailed scope of representation' },
      { key: 'hourly_rate', label: 'Hourly Rate ($)', type: 'number', required: true, defaultValue: '350' },
      { key: 'retainer_amount', label: 'Retainer Amount ($)', type: 'number', required: true, defaultValue: '5000' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true }
    ],
    content: `ENGAGEMENT LETTER

Date: {{effective_date}}

{{client_name}}
{{client_address}}

Re: Engagement for Legal Services - {{matter_description}}

Dear {{client_name}},

This letter confirms that you have retained our firm to represent you in connection with the above-referenced matter.

SCOPE OF REPRESENTATION
{{scope_of_work}}

FEES AND BILLING
Our fees will be charged at an hourly rate of ${'${{hourly_rate}}'}. A retainer of ${'${{retainer_amount}}'} is required to commence representation.

Please sign below to acknowledge your acceptance of these terms.

_______________________
{{client_name}}
Date: _______________`,
    lastUsed: '2024-12-01',
    usageCount: 156,
    createdAt: '2024-01-01'
  },
  {
    id: '2',
    name: 'Demand Letter',
    description: 'Pre-litigation demand letter for collection, personal injury, or breach of contract matters',
    category: 'Litigation',
    documentType: 'docx',
    icon: Gavel,
    variables: [
      { key: 'recipient_name', label: 'Recipient Name', type: 'text', required: true },
      { key: 'recipient_address', label: 'Recipient Address', type: 'textarea', required: true },
      { key: 'client_name', label: 'Client Name', type: 'client', required: true },
      { key: 'incident_date', label: 'Incident/Breach Date', type: 'date', required: true },
      { key: 'demand_amount', label: 'Demand Amount ($)', type: 'number', required: true },
      { key: 'demand_reason', label: 'Reason for Demand', type: 'textarea', required: true, placeholder: 'Detailed description of claim' },
      { key: 'response_deadline', label: 'Response Deadline', type: 'date', required: true }
    ],
    content: `DEMAND LETTER
[SENT VIA CERTIFIED MAIL]

Date: {{current_date}}

{{recipient_name}}
{{recipient_address}}

Re: Demand for Payment - {{client_name}}

Dear {{recipient_name}},

Please be advised that this firm represents {{client_name}} in connection with the matter described herein.

On {{incident_date}}, the following occurred:
{{demand_reason}}

DEMAND
Our client hereby demands payment in the amount of ${'${{demand_amount}}'} no later than {{response_deadline}}.

Failure to respond by the deadline will result in our client pursuing all available legal remedies without further notice.

Very truly yours,
[Attorney Name]`,
    lastUsed: '2024-12-03',
    usageCount: 234,
    createdAt: '2024-01-05'
  },
  {
    id: '3',
    name: 'Power of Attorney',
    description: 'General or limited power of attorney granting legal authority to act on behalf of another',
    category: 'Estate Planning',
    documentType: 'docx',
    icon: Shield,
    variables: [
      { key: 'principal_name', label: 'Principal Name', type: 'text', required: true },
      { key: 'principal_address', label: 'Principal Address', type: 'textarea', required: true },
      { key: 'agent_name', label: 'Agent Name', type: 'text', required: true },
      { key: 'agent_address', label: 'Agent Address', type: 'textarea', required: true },
      { key: 'poa_type', label: 'Type of POA', type: 'select', required: true, options: ['General', 'Limited', 'Durable', 'Springing'] },
      { key: 'powers_granted', label: 'Powers Granted', type: 'textarea', required: true, placeholder: 'Specific powers being granted' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'expiration_date', label: 'Expiration Date (if any)', type: 'date', required: false }
    ],
    content: `{{poa_type}} POWER OF ATTORNEY

KNOW ALL PERSONS BY THESE PRESENTS:

I, {{principal_name}}, residing at {{principal_address}}, hereby appoint {{agent_name}}, residing at {{agent_address}}, as my true and lawful Attorney-in-Fact.

POWERS GRANTED:
{{powers_granted}}

This Power of Attorney shall become effective on {{effective_date}}.

IN WITNESS WHEREOF, I have executed this Power of Attorney on the date first written above.

_______________________
{{principal_name}}, Principal

STATE OF _______________
COUNTY OF ______________`,
    lastUsed: '2024-11-28',
    usageCount: 89,
    createdAt: '2024-01-10'
  },
  {
    id: '4',
    name: 'Non-Disclosure Agreement (NDA)',
    description: 'Mutual or unilateral NDA to protect confidential business information',
    category: 'Business',
    documentType: 'docx',
    icon: FileCheck,
    variables: [
      { key: 'disclosing_party', label: 'Disclosing Party', type: 'text', required: true },
      { key: 'receiving_party', label: 'Receiving Party', type: 'text', required: true },
      { key: 'nda_type', label: 'NDA Type', type: 'select', required: true, options: ['Mutual', 'Unilateral'] },
      { key: 'purpose', label: 'Purpose of Disclosure', type: 'textarea', required: true },
      { key: 'confidential_info', label: 'Definition of Confidential Info', type: 'textarea', required: true },
      { key: 'term_years', label: 'Term (Years)', type: 'number', required: true, defaultValue: '3' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'governing_state', label: 'Governing State', type: 'text', required: true }
    ],
    content: `{{nda_type}} NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of {{effective_date}} by and between:

Disclosing Party: {{disclosing_party}}
Receiving Party: {{receiving_party}}

PURPOSE: {{purpose}}

CONFIDENTIAL INFORMATION:
{{confidential_info}}

TERM: This Agreement shall remain in effect for {{term_years}} years from the Effective Date.

GOVERNING LAW: This Agreement shall be governed by the laws of the State of {{governing_state}}.

IN WITNESS WHEREOF, the parties have executed this Agreement.

_______________________          _______________________
{{disclosing_party}}              {{receiving_party}}`,
    lastUsed: '2024-12-04',
    usageCount: 312,
    createdAt: '2024-01-15'
  },
  {
    id: '5',
    name: 'Settlement Agreement',
    description: 'Comprehensive settlement agreement to resolve disputes and claims between parties',
    category: 'Litigation',
    documentType: 'docx',
    icon: Scale,
    variables: [
      { key: 'party_a', label: 'First Party Name', type: 'text', required: true },
      { key: 'party_b', label: 'Second Party Name', type: 'text', required: true },
      { key: 'case_number', label: 'Case Number (if applicable)', type: 'text', required: false },
      { key: 'dispute_description', label: 'Description of Dispute', type: 'textarea', required: true },
      { key: 'settlement_amount', label: 'Settlement Amount ($)', type: 'number', required: true },
      { key: 'payment_terms', label: 'Payment Terms', type: 'textarea', required: true },
      { key: 'release_scope', label: 'Scope of Release', type: 'textarea', required: true },
      { key: 'confidentiality', label: 'Confidentiality Provisions', type: 'select', required: true, options: ['Confidential', 'Non-Confidential'] },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true }
    ],
    content: `SETTLEMENT AGREEMENT AND MUTUAL RELEASE

This Settlement Agreement ("Agreement") is entered into as of {{effective_date}}.

PARTIES:
{{party_a}} ("Party A")
{{party_b}} ("Party B")

RECITALS:
The parties are involved in a dispute concerning: {{dispute_description}}

SETTLEMENT TERMS:
1. Settlement Payment: Party A/B shall pay ${'${{settlement_amount}}'}
2. Payment Terms: {{payment_terms}}

RELEASE:
{{release_scope}}

CONFIDENTIALITY: This Agreement is {{confidentiality}}.

_______________________          _______________________
{{party_a}}                       {{party_b}}`,
    lastUsed: '2024-11-30',
    usageCount: 145,
    createdAt: '2024-01-20'
  },
  {
    id: '6',
    name: 'Contract Amendment',
    description: 'Amendment to modify existing contract terms and conditions',
    category: 'Business',
    documentType: 'docx',
    icon: Edit3,
    variables: [
      { key: 'original_contract_name', label: 'Original Contract Name', type: 'text', required: true },
      { key: 'original_date', label: 'Original Contract Date', type: 'date', required: true },
      { key: 'party_a', label: 'First Party', type: 'text', required: true },
      { key: 'party_b', label: 'Second Party', type: 'text', required: true },
      { key: 'amendment_number', label: 'Amendment Number', type: 'select', required: true, options: ['First', 'Second', 'Third', 'Fourth', 'Fifth'] },
      { key: 'sections_amended', label: 'Sections Being Amended', type: 'textarea', required: true },
      { key: 'new_terms', label: 'New Terms/Changes', type: 'textarea', required: true },
      { key: 'effective_date', label: 'Amendment Effective Date', type: 'date', required: true }
    ],
    content: `{{amendment_number}} AMENDMENT TO {{original_contract_name}}

This Amendment is made effective as of {{effective_date}}.

PARTIES:
{{party_a}}
{{party_b}}

RECITALS:
The parties entered into {{original_contract_name}} dated {{original_date}} (the "Original Agreement").

AMENDMENTS:
The following sections are hereby amended:
{{sections_amended}}

NEW TERMS:
{{new_terms}}

All other terms of the Original Agreement remain in full force and effect.

_______________________          _______________________
{{party_a}}                       {{party_b}}`,
    lastUsed: '2024-12-02',
    usageCount: 98,
    createdAt: '2024-02-01'
  },
  {
    id: '7',
    name: 'Cease and Desist Letter',
    description: 'Formal demand to stop unlawful activity such as infringement, harassment, or defamation',
    category: 'Litigation',
    documentType: 'docx',
    icon: Gavel,
    variables: [
      { key: 'recipient_name', label: 'Recipient Name', type: 'text', required: true },
      { key: 'recipient_address', label: 'Recipient Address', type: 'textarea', required: true },
      { key: 'client_name', label: 'Client Name', type: 'client', required: true },
      { key: 'violation_type', label: 'Type of Violation', type: 'select', required: true, options: ['Trademark Infringement', 'Copyright Infringement', 'Defamation', 'Harassment', 'Breach of Contract', 'Other'] },
      { key: 'violation_description', label: 'Description of Violation', type: 'textarea', required: true },
      { key: 'demands', label: 'Specific Demands', type: 'textarea', required: true },
      { key: 'compliance_deadline', label: 'Compliance Deadline', type: 'date', required: true }
    ],
    content: `CEASE AND DESIST NOTICE
[SENT VIA CERTIFIED MAIL]

Date: {{current_date}}

{{recipient_name}}
{{recipient_address}}

Re: {{violation_type}} - Cease and Desist

Dear {{recipient_name}},

This firm represents {{client_name}}. We write regarding your unlawful conduct as described below.

VIOLATION:
{{violation_description}}

DEMANDS:
{{demands}}

You are hereby demanded to cease and desist from the above-described conduct immediately, and in any event no later than {{compliance_deadline}}.

Failure to comply will result in immediate legal action.

Very truly yours,
[Attorney Name]`,
    lastUsed: '2024-11-25',
    usageCount: 78,
    createdAt: '2024-02-10'
  },
  {
    id: '8',
    name: 'Fee Agreement - Contingency',
    description: 'Contingency fee agreement for personal injury and other contingency-based matters',
    category: 'Client Intake',
    documentType: 'docx',
    icon: DollarSign,
    variables: [
      { key: 'client_name', label: 'Client Name', type: 'client', required: true },
      { key: 'client_address', label: 'Client Address', type: 'textarea', required: true },
      { key: 'matter_type', label: 'Type of Matter', type: 'select', required: true, options: ['Personal Injury', 'Medical Malpractice', 'Employment', 'Products Liability', 'Other'] },
      { key: 'matter_description', label: 'Matter Description', type: 'textarea', required: true },
      { key: 'contingency_pretrial', label: 'Contingency % (Pre-Trial)', type: 'number', required: true, defaultValue: '33' },
      { key: 'contingency_trial', label: 'Contingency % (After Trial Begins)', type: 'number', required: true, defaultValue: '40' },
      { key: 'contingency_appeal', label: 'Contingency % (On Appeal)', type: 'number', required: true, defaultValue: '45' },
      { key: 'costs_handling', label: 'Costs Handling', type: 'select', required: true, options: ['Client pays as incurred', 'Advanced by firm, deducted from recovery', 'Advanced by firm, repaid only if recovery'] }
    ],
    content: `CONTINGENCY FEE AGREEMENT

CLIENT: {{client_name}}
ADDRESS: {{client_address}}

MATTER: {{matter_type}} - {{matter_description}}

FEE STRUCTURE:
- Pre-Trial Resolution: {{contingency_pretrial}}% of gross recovery
- After Trial Commences: {{contingency_trial}}% of gross recovery  
- On Appeal: {{contingency_appeal}}% of gross recovery

COSTS AND EXPENSES:
{{costs_handling}}

By signing below, Client acknowledges reading and understanding these terms.

_______________________          Date: _______________
{{client_name}}

_______________________          Date: _______________
Attorney`,
    lastUsed: '2024-12-04',
    usageCount: 203,
    createdAt: '2024-02-15'
  },
  {
    id: '9',
    name: 'Promissory Note',
    description: 'Legal promise to pay a specified sum of money with defined terms',
    category: 'Business',
    documentType: 'docx',
    icon: DollarSign,
    variables: [
      { key: 'borrower_name', label: 'Borrower Name', type: 'text', required: true },
      { key: 'borrower_address', label: 'Borrower Address', type: 'textarea', required: true },
      { key: 'lender_name', label: 'Lender Name', type: 'text', required: true },
      { key: 'principal_amount', label: 'Principal Amount ($)', type: 'number', required: true },
      { key: 'interest_rate', label: 'Interest Rate (%)', type: 'number', required: true },
      { key: 'payment_schedule', label: 'Payment Schedule', type: 'select', required: true, options: ['Monthly', 'Quarterly', 'Semi-Annually', 'Annually', 'Lump Sum at Maturity'] },
      { key: 'maturity_date', label: 'Maturity Date', type: 'date', required: true },
      { key: 'collateral', label: 'Collateral (if any)', type: 'textarea', required: false },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true }
    ],
    content: `PROMISSORY NOTE

Principal Amount: ${'${{principal_amount}}'}
Date: {{effective_date}}

FOR VALUE RECEIVED, {{borrower_name}} ("Borrower"), residing at {{borrower_address}}, promises to pay to {{lender_name}} ("Lender") the principal sum of ${'${{principal_amount}}'}, together with interest at {{interest_rate}}% per annum.

PAYMENT TERMS:
Schedule: {{payment_schedule}}
Maturity Date: {{maturity_date}}

COLLATERAL:
{{collateral}}

_______________________          Date: _______________
{{borrower_name}}, Borrower`,
    lastUsed: '2024-11-20',
    usageCount: 67,
    createdAt: '2024-03-01'
  },
  {
    id: '10',
    name: 'Client Termination Letter',
    description: 'Professional letter terminating attorney-client relationship with required notices',
    category: 'Client Intake',
    documentType: 'docx',
    icon: Users,
    variables: [
      { key: 'client_name', label: 'Client Name', type: 'client', required: true },
      { key: 'client_address', label: 'Client Address', type: 'textarea', required: true },
      { key: 'matter_name', label: 'Matter Name', type: 'matter', required: true },
      { key: 'termination_reason', label: 'Reason for Termination', type: 'select', required: true, options: ['Completion of Matter', 'Client Request', 'Non-Payment', 'Conflict of Interest', 'Breakdown in Communication', 'Other'] },
      { key: 'termination_date', label: 'Termination Effective Date', type: 'date', required: true },
      { key: 'pending_deadlines', label: 'Pending Deadlines/Actions', type: 'textarea', required: false, placeholder: 'List any upcoming deadlines client should be aware of' },
      { key: 'statute_limitations', label: 'Statute of Limitations Warnings', type: 'textarea', required: false },
      { key: 'file_retrieval', label: 'File Retrieval Instructions', type: 'textarea', required: true }
    ],
    content: `TERMINATION OF REPRESENTATION

Date: {{current_date}}

{{client_name}}
{{client_address}}

Re: Termination of Representation - {{matter_name}}

Dear {{client_name}},

This letter confirms that our firm's representation of you in the above matter will terminate effective {{termination_date}}.

REASON: {{termination_reason}}

IMPORTANT NOTICES:
Pending Deadlines: {{pending_deadlines}}
Statute of Limitations: {{statute_limitations}}

YOUR FILE:
{{file_retrieval}}

We wish you the best in your future endeavors.

Sincerely,
[Attorney Name]`,
    lastUsed: '2024-11-15',
    usageCount: 45,
    createdAt: '2024-03-10'
  },
  {
    id: '11',
    name: 'Retainer Agreement',
    description: 'Comprehensive retainer agreement establishing ongoing legal representation with payment terms and conditions',
    category: 'Client Intake',
    documentType: 'docx',
    icon: Briefcase,
    variables: [
      { key: 'client_name', label: 'Client Name', type: 'client', required: true },
      { key: 'client_address', label: 'Client Address', type: 'textarea', required: true, placeholder: 'Enter full mailing address' },
      { key: 'client_email', label: 'Client Email', type: 'text', required: true, placeholder: 'client@example.com' },
      { key: 'client_phone', label: 'Client Phone', type: 'text', required: true, placeholder: '(555) 555-5555' },
      { key: 'matter_type', label: 'Type of Legal Matter', type: 'select', required: true, options: ['General Business Counsel', 'Litigation', 'Corporate Transactions', 'Employment Matters', 'Real Estate', 'Intellectual Property', 'Estate Planning', 'Family Law', 'Criminal Defense', 'Other'] },
      { key: 'scope_of_services', label: 'Scope of Legal Services', type: 'textarea', required: true, placeholder: 'Detailed description of legal services to be provided' },
      { key: 'retainer_amount', label: 'Initial Retainer Amount ($)', type: 'number', required: true, defaultValue: '5000' },
      { key: 'minimum_balance', label: 'Minimum Retainer Balance ($)', type: 'number', required: true, defaultValue: '2500' },
      { key: 'hourly_rate_partner', label: 'Partner Hourly Rate ($)', type: 'number', required: true, defaultValue: '450' },
      { key: 'hourly_rate_associate', label: 'Associate Hourly Rate ($)', type: 'number', required: true, defaultValue: '300' },
      { key: 'hourly_rate_paralegal', label: 'Paralegal Hourly Rate ($)', type: 'number', required: true, defaultValue: '150' },
      { key: 'billing_frequency', label: 'Billing Frequency', type: 'select', required: true, options: ['Monthly', 'Bi-Weekly', 'Quarterly'] },
      { key: 'payment_due_days', label: 'Payment Due (Days)', type: 'number', required: true, defaultValue: '30' },
      { key: 'responsible_attorney', label: 'Responsible Attorney', type: 'text', required: true },
      { key: 'attorney_bar_number', label: 'Attorney Bar Number', type: 'text', required: true },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { key: 'governing_state', label: 'Governing State', type: 'text', required: true }
    ],
    content: `RETAINER AGREEMENT FOR LEGAL SERVICES

This Retainer Agreement ("Agreement") is entered into as of {{effective_date}} by and between:

ATTORNEY/LAW FIRM:
[Law Firm Name]
[Firm Address]
Responsible Attorney: {{responsible_attorney}}
Bar Number: {{attorney_bar_number}}

CLIENT:
{{client_name}}
{{client_address}}
Email: {{client_email}}
Phone: {{client_phone}}

1. ENGAGEMENT AND SCOPE OF SERVICES

The Client hereby retains the Law Firm to provide legal services in connection with:

Matter Type: {{matter_type}}

Scope of Services:
{{scope_of_services}}

This Agreement covers only the legal services described above. Any additional matters or services will require a separate agreement or written amendment to this Agreement.

2. RETAINER AND FEES

A. Initial Retainer
The Client agrees to pay an initial retainer of ${'${{retainer_amount}}'} upon execution of this Agreement. This retainer will be deposited into the Firm's Client Trust Account and will be applied against fees and costs as they are incurred.

B. Minimum Balance
The Client agrees to maintain a minimum balance of ${'${{minimum_balance}}'} in the retainer account. When the balance falls below this amount, the Client will be billed for replenishment of the retainer.

C. Hourly Rates
Legal services will be billed at the following hourly rates:
- Partners: ${'${{hourly_rate_partner}}'}/hour
- Associates: ${'${{hourly_rate_associate}}'}/hour
- Paralegals: ${'${{hourly_rate_paralegal}}'}/hour

These rates are subject to annual review and adjustment with 30 days written notice to the Client.

D. Billing and Payment
- Invoices will be issued {{billing_frequency}}
- Payment is due within {{payment_due_days}} days of the invoice date
- Interest of 1.5% per month may be charged on overdue balances

3. COSTS AND EXPENSES

In addition to legal fees, the Client agrees to reimburse the Firm for all costs and expenses incurred in connection with the representation, including but not limited to:
- Court filing fees and service of process costs
- Deposition and transcript costs
- Expert witness fees
- Travel expenses
- Photocopying, printing, and postage
- Database and research services
- Overnight delivery and messenger services

4. CLIENT RESPONSIBILITIES

The Client agrees to:
- Provide complete and accurate information relevant to the matter
- Respond promptly to requests for information or decisions
- Keep the Firm informed of any changes in contact information
- Pay all invoices in a timely manner
- Cooperate fully in the legal process

5. COMMUNICATION

The Firm will keep the Client reasonably informed about the status of the matter. The Client may contact {{responsible_attorney}} or other assigned attorneys during normal business hours. Emails and calls will be returned within one business day.

6. CONFIDENTIALITY

All information shared between the Client and the Firm is protected by attorney-client privilege and will be kept strictly confidential, except as required by law or with the Client's consent.

7. TERMINATION

Either party may terminate this Agreement at any time with written notice. Upon termination:
- The Client remains responsible for all fees and costs incurred through the date of termination
- The Firm will take reasonable steps to protect the Client's interests
- The Client's file will be made available for transfer to new counsel
- Any unused portion of the retainer will be refunded within 30 days

8. CONFLICTS OF INTEREST

The Firm has conducted a conflicts check and has determined that no conflict of interest exists that would prevent representation. If a conflict arises during the representation, the Firm will promptly notify the Client and take appropriate action.

9. NO GUARANTEE OF OUTCOME

The Client acknowledges that the Firm has made no promises or guarantees regarding the outcome of this matter. The Firm will use its best professional efforts on the Client's behalf.

10. DISPUTE RESOLUTION

Any disputes arising from this Agreement shall first be submitted to mediation. If mediation is unsuccessful, disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.

11. GOVERNING LAW

This Agreement shall be governed by the laws of the State of {{governing_state}}.

12. ENTIRE AGREEMENT

This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements, representations, and understandings.

BY SIGNING BELOW, THE PARTIES ACKNOWLEDGE THAT THEY HAVE READ, UNDERSTAND, AND AGREE TO BE BOUND BY THE TERMS OF THIS AGREEMENT.

CLIENT:

_________________________________          Date: _______________
{{client_name}}

ATTORNEY/LAW FIRM:

_________________________________          Date: _______________
{{responsible_attorney}}
Bar Number: {{attorney_bar_number}}`,
    lastUsed: '2024-12-05',
    usageCount: 187,
    createdAt: '2024-01-01'
  }
]

const categories = ['All', 'Client Intake', 'Litigation', 'Business', 'Estate Planning']

export function DocumentAutomationPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<DocumentTemplate[]>(preAutomatedTemplates)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')
  const [generatedTemplateName, setGeneratedTemplateName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  
  // New template state
  const [newTemplate, setNewTemplate] = useState<Partial<DocumentTemplate>>({
    name: '',
    description: '',
    category: 'Business',
    documentType: 'docx',
    variables: [],
    content: '',
    icon: FileText
  })
  const [newVariables, setNewVariables] = useState<TemplateVariable[]>([])
  
  // Save to documents state
  const [isSavingToDocuments, setIsSavingToDocuments] = useState(false)
  const [savedToDocuments, setSavedToDocuments] = useState(false)

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleGenerateClick = (template: DocumentTemplate) => {
    setSelectedTemplate(template)
    // Initialize form values with defaults
    const defaults: Record<string, string> = {}
    template.variables.forEach(v => {
      if (v.defaultValue) defaults[v.key] = v.defaultValue
    })
    // Add current date
    defaults['current_date'] = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    })
    setFormValues(defaults)
    setShowGenerateModal(true)
  }

  const handleEditClick = (template: DocumentTemplate) => {
    setEditingTemplate({ ...template })
    setShowEditModal(true)
  }

  const handleDuplicateClick = (template: DocumentTemplate) => {
    const duplicated: DocumentTemplate = {
      ...template,
      id: crypto.randomUUID(),
      name: `${template.name} (Copy)`,
      isCustom: true,
      usageCount: 0,
      createdAt: new Date().toISOString().split('T')[0]
    }
    setTemplates([duplicated, ...templates])
  }

  const handleDeleteClick = (template: DocumentTemplate) => {
    if (confirm(`Are you sure you want to delete "${template.name}"?`)) {
      setTemplates(templates.filter(t => t.id !== template.id))
    }
  }

  const handleSaveEdit = () => {
    if (!editingTemplate) return
    setTemplates(templates.map(t => t.id === editingTemplate.id ? editingTemplate : t))
    setShowEditModal(false)
    setEditingTemplate(null)
  }

  const handleFormChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
  }

  const generatePreview = () => {
    if (!selectedTemplate) return
    let content = selectedTemplate.content
    Object.entries(formValues).forEach(([key, value]) => {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value || `[${key}]`)
    })
    setPreviewContent(content)
    setShowPreviewModal(true)
  }

  const handleGenerateDocument = () => {
    if (!selectedTemplate) return
    
    // Generate the document content
    let content = selectedTemplate.content
    Object.entries(formValues).forEach(([key, value]) => {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value || `[${key}]`)
    })
    
    // Update usage count
    setTemplates(templates.map(t => 
      t.id === selectedTemplate.id 
        ? { ...t, usageCount: t.usageCount + 1, lastUsed: new Date().toISOString().split('T')[0] }
        : t
    ))
    
    // Store generated content and show result modal
    setGeneratedContent(content)
    setGeneratedTemplateName(selectedTemplate.name)
    setShowGenerateModal(false)
    setShowPreviewModal(false)
    setShowResultModal(true)
  }

  const handleDownloadDocument = () => {
    if (!generatedContent || !generatedTemplateName) return
    
    const blob = new Blob([generatedContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${generatedTemplateName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleOpenInDocumentAI = () => {
    // Store the document content in sessionStorage to pass to AI page
    sessionStorage.setItem('documentAI_content', JSON.stringify({
      content: generatedContent,
      templateName: generatedTemplateName,
      timestamp: new Date().toISOString()
    }))
    
    // Navigate to AI Assistant page
    navigate('/app/ai')
    
    // Close the modal
    setShowResultModal(false)
    setGeneratedContent('')
    setGeneratedTemplateName('')
    setFormValues({})
  }

  const handleSaveToDocuments = async () => {
    if (!generatedContent || !generatedTemplateName) return
    
    setIsSavingToDocuments(true)
    setSavedToDocuments(false)
    
    try {
      // Create a file from the generated content
      const fileName = `${generatedTemplateName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`
      const blob = new Blob([generatedContent], { type: 'text/plain' })
      const file = new File([blob], fileName, { type: 'text/plain' })
      
      // Upload the document
      await documentsApi.upload(file, {
        tags: ['generated', 'template', selectedTemplate?.category || 'document']
      })
      
      setSavedToDocuments(true)
    } catch (error) {
      console.error('Failed to save document:', error)
      alert('Failed to save document. Please try again.')
    } finally {
      setIsSavingToDocuments(false)
    }
  }

  const handleCreateTemplate = () => {
    if (!newTemplate.name || !newTemplate.content) {
      alert('Please fill in the template name and content')
      return
    }
    
    const template: DocumentTemplate = {
      id: crypto.randomUUID(),
      name: newTemplate.name || '',
      description: newTemplate.description || '',
      category: newTemplate.category || 'Business',
      documentType: 'docx',
      variables: newVariables,
      content: newTemplate.content || '',
      usageCount: 0,
      createdAt: new Date().toISOString().split('T')[0],
      isCustom: true,
      icon: FileText
    }
    
    setTemplates([template, ...templates])
    setShowCreateModal(false)
    setNewTemplate({
      name: '',
      description: '',
      category: 'Business',
      documentType: 'docx',
      variables: [],
      content: '',
      icon: FileText
    })
    setNewVariables([])
  }

  const addVariable = () => {
    setNewVariables([...newVariables, {
      key: '',
      label: '',
      type: 'text',
      required: true
    }])
  }

  const updateVariable = (index: number, field: keyof TemplateVariable, value: any) => {
    const updated = [...newVariables]
    updated[index] = { ...updated[index], [field]: value }
    // Auto-generate key from label
    if (field === 'label') {
      updated[index].key = value.toLowerCase().replace(/\s+/g, '_')
    }
    setNewVariables(updated)
  }

  const removeVariable = (index: number) => {
    setNewVariables(newVariables.filter((_, i) => i !== index))
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Client Intake': return Users
      case 'Litigation': return Gavel
      case 'Business': return Building
      case 'Estate Planning': return Shield
      default: return FileText
    }
  }

  return (
    <div className={styles.docAutoPage}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><Sparkles size={28} /></div>
          <div>
            <h1>Document Automation</h1>
            <p>Generate legal documents instantly with smart templates and merge fields</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            Create Template
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search templates..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
          />
          {searchQuery && (
            <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className={styles.categoryTabs}>
          {categories.map(cat => (
            <button 
              key={cat} 
              className={clsx(styles.categoryTab, categoryFilter === cat && styles.active)} 
              onClick={() => setCategoryFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <FileText size={20} />
          <div>
            <span className={styles.statValue}>{templates.length}</span>
            <span className={styles.statLabel}>Templates</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <Play size={20} />
          <div>
            <span className={styles.statValue}>{templates.reduce((sum, t) => sum + t.usageCount, 0)}</span>
            <span className={styles.statLabel}>Documents Generated</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <Clock size={20} />
          <div>
            <span className={styles.statValue}>~5 min</span>
            <span className={styles.statLabel}>Avg. Time Saved</span>
          </div>
        </div>
      </div>

      <div className={styles.templatesGrid}>
        {filteredTemplates.map(template => {
          const IconComponent = template.icon || getCategoryIcon(template.category)
          return (
            <div key={template.id} className={clsx(styles.templateCard, template.isCustom && styles.customTemplate)}>
              <div className={styles.templateIcon}>
                <IconComponent size={28} />
              </div>
              <div className={styles.templateContent}>
                <div className={styles.templateHeader}>
                  <h3>{template.name}</h3>
                  {template.isCustom && <span className={styles.customBadge}>Custom</span>}
                </div>
                <p>{template.description}</p>
                <div className={styles.templateMeta}>
                  <span className={styles.categoryBadge}>{template.category}</span>
                  <span className={styles.usageCount}>{template.usageCount} uses</span>
                  <span className={styles.variables}>{template.variables.length} fields</span>
                </div>
              </div>
              <div className={styles.templateActions}>
                <button 
                  className={styles.generateBtn} 
                  onClick={() => handleGenerateClick(template)}
                >
                  <Play size={16} /> Generate
                </button>
                <div className={styles.actionIcons}>
                  <button 
                    className={styles.iconBtn} 
                    onClick={() => handleEditClick(template)}
                    title="Edit template"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button 
                    className={styles.iconBtn} 
                    onClick={() => handleDuplicateClick(template)}
                    title="Duplicate template"
                  >
                    <Copy size={16} />
                  </button>
                  {template.isCustom && (
                    <button 
                      className={clsx(styles.iconBtn, styles.deleteBtn)} 
                      onClick={() => handleDeleteClick(template)}
                      title="Delete template"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className={styles.emptyState}>
          <FileText size={48} />
          <h3>No templates found</h3>
          <p>Try adjusting your search or filters, or create a new template.</p>
          <button className={styles.primaryBtn} onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            Create Template
          </button>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && selectedTemplate && (
        <div className={styles.modalOverlay} onClick={() => setShowGenerateModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <Play size={20} />
                <h2>Generate: {selectedTemplate.name}</h2>
              </div>
              <button onClick={() => setShowGenerateModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <form className={styles.modalForm} onSubmit={(e) => { e.preventDefault(); handleGenerateDocument(); }}>
              <div className={styles.formFields}>
                {selectedTemplate.variables.map(v => (
                  <div key={v.key} className={styles.formGroup}>
                    <label>
                      {v.label}
                      {v.required && <span className={styles.required}>*</span>}
                    </label>
                    {v.type === 'select' ? (
                      <select 
                        value={formValues[v.key] || ''} 
                        onChange={(e) => handleFormChange(v.key, e.target.value)}
                        required={v.required}
                      >
                        <option value="">Select {v.label}</option>
                        {v.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : v.type === 'date' ? (
                      <input 
                        type="date" 
                        value={formValues[v.key] || ''} 
                        onChange={(e) => handleFormChange(v.key, e.target.value)}
                        required={v.required}
                      />
                    ) : v.type === 'textarea' ? (
                      <textarea
                        value={formValues[v.key] || ''} 
                        onChange={(e) => handleFormChange(v.key, e.target.value)}
                        placeholder={v.placeholder || `Enter ${v.label.toLowerCase()}`}
                        required={v.required}
                        rows={3}
                      />
                    ) : (
                      <input 
                        type={v.type === 'number' ? 'number' : 'text'} 
                        value={formValues[v.key] || ''} 
                        onChange={(e) => handleFormChange(v.key, e.target.value)}
                        placeholder={v.placeholder || `Enter ${v.label.toLowerCase()}`}
                        required={v.required}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.modalActions}>
                <button 
                  type="button" 
                  onClick={() => setShowGenerateModal(false)} 
                  className={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={generatePreview} 
                  className={styles.secondaryBtn}
                >
                  <Eye size={16} /> Preview
                </button>
                <button type="submit" className={styles.primaryBtn}>
                  <Download size={16} /> Generate Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className={styles.modalOverlay} onClick={() => setShowPreviewModal(false)}>
          <div className={clsx(styles.modal, styles.previewModal)} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <Eye size={20} />
                <h2>Document Preview</h2>
              </div>
              <button onClick={() => setShowPreviewModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.previewContent}>
              <pre>{previewContent}</pre>
            </div>
            <div className={styles.modalActions}>
              <button onClick={() => setShowPreviewModal(false)} className={styles.cancelBtn}>
                Close
              </button>
              <button onClick={handleGenerateDocument} className={styles.primaryBtn}>
                <Download size={16} /> Generate Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingTemplate && (
        <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div className={clsx(styles.modal, styles.editModal)} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <Edit3 size={20} />
                <h2>Edit Template</h2>
              </div>
              <button onClick={() => setShowEditModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Template Name</label>
                  <input 
                    type="text" 
                    value={editingTemplate.name} 
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Category</label>
                  <select 
                    value={editingTemplate.category}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                  >
                    {categories.filter(c => c !== 'All').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea 
                  value={editingTemplate.description} 
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Template Content</label>
                <textarea 
                  value={editingTemplate.content} 
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, content: e.target.value })}
                  rows={12}
                  className={styles.codeEditor}
                />
                <p className={styles.hint}>Use {"{{variable_name}}"} syntax for merge fields</p>
              </div>
              <div className={styles.modalActions}>
                <button onClick={() => setShowEditModal(false)} className={styles.cancelBtn}>
                  Cancel
                </button>
                <button onClick={handleSaveEdit} className={styles.primaryBtn}>
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={clsx(styles.modal, styles.createModal)} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <Plus size={20} />
                <h2>Create New Template</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Template Name <span className={styles.required}>*</span></label>
                  <input 
                    type="text" 
                    value={newTemplate.name || ''} 
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    placeholder="e.g., Service Agreement"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Category</label>
                  <select 
                    value={newTemplate.category || 'Business'}
                    onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  >
                    {categories.filter(c => c !== 'All').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea 
                  value={newTemplate.description || ''} 
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of when to use this template"
                />
              </div>

              <div className={styles.variablesSection}>
                <div className={styles.sectionHeader}>
                  <h3>Merge Fields</h3>
                  <button type="button" className={styles.addVarBtn} onClick={addVariable}>
                    <Plus size={16} /> Add Field
                  </button>
                </div>
                {newVariables.length === 0 ? (
                  <p className={styles.noVars}>No merge fields added yet. Click "Add Field" to create dynamic fields.</p>
                ) : (
                  <div className={styles.variablesList}>
                    {newVariables.map((variable, index) => (
                      <div key={index} className={styles.variableRow}>
                        <input 
                          type="text"
                          placeholder="Field Label"
                          value={variable.label}
                          onChange={(e) => updateVariable(index, 'label', e.target.value)}
                        />
                        <select 
                          value={variable.type}
                          onChange={(e) => updateVariable(index, 'type', e.target.value)}
                        >
                          <option value="text">Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Dropdown</option>
                        </select>
                        <label className={styles.checkboxLabel}>
                          <input 
                            type="checkbox"
                            checked={variable.required}
                            onChange={(e) => updateVariable(index, 'required', e.target.checked)}
                          />
                          Required
                        </label>
                        <button 
                          type="button"
                          className={styles.removeVarBtn}
                          onClick={() => removeVariable(index)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.formGroup}>
                <label>Template Content <span className={styles.required}>*</span></label>
                <textarea 
                  value={newTemplate.content || ''} 
                  onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
                  rows={12}
                  className={styles.codeEditor}
                  placeholder="Enter your template content here. Use {{field_name}} for merge fields."
                />
                {newVariables.length > 0 && (
                  <div className={styles.availableFields}>
                    <span>Available fields:</span>
                    {newVariables.map((v, i) => (
                      <code key={i} onClick={() => {
                        const cursorPos = (document.activeElement as HTMLTextAreaElement)?.selectionStart || 0
                        const content = newTemplate.content || ''
                        const newContent = content.slice(0, cursorPos) + `{{${v.key}}}` + content.slice(cursorPos)
                        setNewTemplate({ ...newTemplate, content: newContent })
                      }}>
                        {`{{${v.key}}}`}
                      </code>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.modalActions}>
                <button onClick={() => setShowCreateModal(false)} className={styles.cancelBtn}>
                  Cancel
                </button>
                <button onClick={handleCreateTemplate} className={styles.primaryBtn}>
                  <Save size={16} /> Create Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Generated Result Modal */}
      {showResultModal && (
        <div className={styles.modalOverlay} onClick={() => {
          setShowResultModal(false)
          setGeneratedContent('')
          setGeneratedTemplateName('')
          setFormValues({})
          setSavedToDocuments(false)
        }}>
          <div className={clsx(styles.modal, styles.resultModal)} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <FileCheck size={20} />
                <h2>Document Generated!</h2>
              </div>
              <button onClick={() => {
                setShowResultModal(false)
                setGeneratedContent('')
                setGeneratedTemplateName('')
                setFormValues({})
                setSavedToDocuments(false)
              }} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.resultContent}>
              <div className={styles.resultSuccess}>
                <div className={styles.successIcon}>
                  <FileCheck size={48} />
                </div>
                <h3>{generatedTemplateName}</h3>
                <p>Your document has been generated successfully. Save it to your documents, download it, or have AI review it.</p>
              </div>
              
              {/* Success notification when saved to documents */}
              {savedToDocuments && (
                <div className={styles.savedNotification}>
                  <CheckCircle2 size={20} />
                  <span>Document saved to your Documents section!</span>
                </div>
              )}
              
              <div className={styles.resultPreview}>
                <pre>{generatedContent.substring(0, 500)}{generatedContent.length > 500 ? '...' : ''}</pre>
              </div>
            </div>
            <div className={styles.resultActions}>
              <button 
                onClick={handleSaveToDocuments} 
                className={clsx(styles.saveToDocsBtn, savedToDocuments && styles.saved)}
                disabled={isSavingToDocuments || savedToDocuments}
              >
                {savedToDocuments ? (
                  <>
                    <CheckCircle2 size={18} />
                    Saved to Documents
                  </>
                ) : isSavingToDocuments ? (
                  <>
                    <FolderPlus size={18} />
                    Saving...
                  </>
                ) : (
                  <>
                    <FolderPlus size={18} />
                    Save to Documents
                  </>
                )}
              </button>
              <button onClick={handleDownloadDocument} className={styles.secondaryBtn}>
                <Download size={18} />
                Download
              </button>
              <button onClick={handleOpenInDocumentAI} className={styles.primaryBtn}>
                <Sparkles size={18} />
                Review with AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
