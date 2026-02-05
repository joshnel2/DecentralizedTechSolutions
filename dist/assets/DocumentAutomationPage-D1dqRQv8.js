import{r as s,a6 as e,h as m}from"./vendor-DrKzkH4x.js";import{d as Ee,h as Ae}from"./index-CCWWoMiH.js";import{a as Se}from"./router-CNLU_KyZ.js";import{bo as we,bz as F,a4 as te,b7 as G,ah as De,aP as V,D as Q,y as ae,x as Re,F as x,S as X,as as q,ao as Ie,X as y,aa as O,J as qe,aX as Be,v as Pe,ak as K,aB as B,ap as J,am as Z,aN as ee,bA as Le}from"./icons-BtUkkwGS.js";import"./doc-parsers-U1nJMjtM.js";import"./react-dom-DfB-QKj2.js";import"./pdf-worker-CVmCB3lP.js";import"./state-72d44OIA.js";const Oe="_docAutoPage_1tkbp_1",Me="_header_1tkbp_8",Fe="_headerLeft_1tkbp_17",Ge="_headerIcon_1tkbp_23",Ve="_headerActions_1tkbp_46",$e="_primaryBtn_1tkbp_52",Ue="_secondaryBtn_1tkbp_72",ze="_toolbar_1tkbp_92",He="_searchBox_1tkbp_100",We="_clearSearch_1tkbp_131",Ye="_categoryTabs_1tkbp_145",Qe="_categoryTab_1tkbp_145",Xe="_active_1tkbp_167",Ke="_stats_1tkbp_175",Je="_statCard_1tkbp_181",Ze="_statValue_1tkbp_195",et="_statLabel_1tkbp_202",tt="_templatesGrid_1tkbp_208",at="_templateCard_1tkbp_214",nt="_customTemplate_1tkbp_230",rt="_templateIcon_1tkbp_238",st="_templateContent_1tkbp_250",it="_templateHeader_1tkbp_255",lt="_customBadge_1tkbp_269",ot="_templateMeta_1tkbp_291",ct="_categoryBadge_1tkbp_298",dt="_usageCount_1tkbp_307",_t="_variables_1tkbp_307",ut="_templateActions_1tkbp_312",mt="_generateBtn_1tkbp_319",pt="_actionIcons_1tkbp_339",yt="_iconBtn_1tkbp_344",ht="_deleteBtn_1tkbp_364",bt="_emptyState_1tkbp_371",gt="_modalOverlay_1tkbp_393",ft="_modal_1tkbp_393",xt="_editModal_1tkbp_419",vt="_createModal_1tkbp_420",Nt="_previewModal_1tkbp_424",kt="_modalHeader_1tkbp_428",Ct="_modalTitle_1tkbp_440",Tt="_closeBtn_1tkbp_457",jt="_modalForm_1tkbp_472",Et="_formFields_1tkbp_476",At="_formRow_1tkbp_481",St="_formGroup_1tkbp_487",wt="_required_1tkbp_499",Dt="_codeEditor_1tkbp_576",Rt="_hint_1tkbp_583",It="_modalActions_1tkbp_589",qt="_cancelBtn_1tkbp_598",Bt="_previewContent_1tkbp_615",Pt="_variablesSection_1tkbp_635",Lt="_sectionHeader_1tkbp_642",Ot="_addVarBtn_1tkbp_656",Mt="_noVars_1tkbp_674",Ft="_variablesList_1tkbp_682",Gt="_variableRow_1tkbp_688",Vt="_checkboxLabel_1tkbp_717",$t="_removeVarBtn_1tkbp_732",Ut="_availableFields_1tkbp_751",zt="_resultModal_1tkbp_784",Ht="_resultContent_1tkbp_788",Wt="_resultSuccess_1tkbp_792",Yt="_successIcon_1tkbp_797",Qt="_resultPreview_1tkbp_820",Xt="_resultActions_1tkbp_838",Kt="_savedNotification_1tkbp_871",Jt="_saveToDocsBtn_1tkbp_902",Zt="_saved_1tkbp_871",a={docAutoPage:Oe,header:Me,headerLeft:Fe,headerIcon:Ge,headerActions:Ve,primaryBtn:$e,secondaryBtn:Ue,toolbar:ze,searchBox:He,clearSearch:We,categoryTabs:Ye,categoryTab:Qe,active:Xe,stats:Ke,statCard:Je,statValue:Ze,statLabel:et,templatesGrid:tt,templateCard:at,customTemplate:nt,templateIcon:rt,templateContent:st,templateHeader:it,customBadge:lt,templateMeta:ot,categoryBadge:ct,usageCount:dt,variables:_t,templateActions:ut,generateBtn:mt,actionIcons:pt,iconBtn:yt,deleteBtn:ht,emptyState:bt,modalOverlay:gt,modal:ft,editModal:xt,createModal:vt,previewModal:Nt,modalHeader:kt,modalTitle:Ct,closeBtn:Tt,modalForm:jt,formFields:Et,formRow:At,formGroup:St,required:wt,codeEditor:Dt,hint:Rt,modalActions:It,cancelBtn:qt,previewContent:Bt,variablesSection:Pt,sectionHeader:Lt,addVarBtn:Ot,noVars:Mt,variablesList:Ft,variableRow:Gt,checkboxLabel:Vt,removeVarBtn:$t,availableFields:Ut,resultModal:zt,resultContent:Ht,resultSuccess:Wt,successIcon:Yt,resultPreview:Qt,resultActions:Xt,savedNotification:Kt,saveToDocsBtn:Jt,saved:Zt},ea=[{id:"1",name:"Engagement Letter",description:"Standard attorney-client engagement letter outlining scope of representation, fees, and terms",category:"Client Intake",documentType:"docx",icon:we,variables:[{key:"client_name",label:"Client Name",type:"client",required:!0},{key:"client_address",label:"Client Address",type:"textarea",required:!0,placeholder:"Enter full address"},{key:"matter_description",label:"Matter Description",type:"textarea",required:!0,placeholder:"Brief description of legal matter"},{key:"scope_of_work",label:"Scope of Work",type:"textarea",required:!0,placeholder:"Detailed scope of representation"},{key:"hourly_rate",label:"Hourly Rate ($)",type:"number",required:!0,defaultValue:"350"},{key:"retainer_amount",label:"Retainer Amount ($)",type:"number",required:!0,defaultValue:"5000"},{key:"effective_date",label:"Effective Date",type:"date",required:!0}],content:`ENGAGEMENT LETTER

Date: {{effective_date}}

{{client_name}}
{{client_address}}

Re: Engagement for Legal Services - {{matter_description}}

Dear {{client_name}},

This letter confirms that you have retained our firm to represent you in connection with the above-referenced matter.

SCOPE OF REPRESENTATION
{{scope_of_work}}

FEES AND BILLING
Our fees will be charged at an hourly rate of \${{hourly_rate}}. A retainer of \${{retainer_amount}} is required to commence representation.

Please sign below to acknowledge your acceptance of these terms.

_______________________
{{client_name}}
Date: _______________`,lastUsed:"2024-12-01",usageCount:156,createdAt:"2024-01-01"},{id:"2",name:"Demand Letter",description:"Pre-litigation demand letter for collection, personal injury, or breach of contract matters",category:"Litigation",documentType:"docx",icon:F,variables:[{key:"recipient_name",label:"Recipient Name",type:"text",required:!0},{key:"recipient_address",label:"Recipient Address",type:"textarea",required:!0},{key:"client_name",label:"Client Name",type:"client",required:!0},{key:"incident_date",label:"Incident/Breach Date",type:"date",required:!0},{key:"demand_amount",label:"Demand Amount ($)",type:"number",required:!0},{key:"demand_reason",label:"Reason for Demand",type:"textarea",required:!0,placeholder:"Detailed description of claim"},{key:"response_deadline",label:"Response Deadline",type:"date",required:!0}],content:`DEMAND LETTER
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
Our client hereby demands payment in the amount of \${{demand_amount}} no later than {{response_deadline}}.

Failure to respond by the deadline will result in our client pursuing all available legal remedies without further notice.

Very truly yours,
[Attorney Name]`,lastUsed:"2024-12-03",usageCount:234,createdAt:"2024-01-05"},{id:"3",name:"Power of Attorney",description:"General or limited power of attorney granting legal authority to act on behalf of another",category:"Estate Planning",documentType:"docx",icon:te,variables:[{key:"principal_name",label:"Principal Name",type:"text",required:!0},{key:"principal_address",label:"Principal Address",type:"textarea",required:!0},{key:"agent_name",label:"Agent Name",type:"text",required:!0},{key:"agent_address",label:"Agent Address",type:"textarea",required:!0},{key:"poa_type",label:"Type of POA",type:"select",required:!0,options:["General","Limited","Durable","Springing"]},{key:"powers_granted",label:"Powers Granted",type:"textarea",required:!0,placeholder:"Specific powers being granted"},{key:"effective_date",label:"Effective Date",type:"date",required:!0},{key:"expiration_date",label:"Expiration Date (if any)",type:"date",required:!1}],content:`{{poa_type}} POWER OF ATTORNEY

KNOW ALL PERSONS BY THESE PRESENTS:

I, {{principal_name}}, residing at {{principal_address}}, hereby appoint {{agent_name}}, residing at {{agent_address}}, as my true and lawful Attorney-in-Fact.

POWERS GRANTED:
{{powers_granted}}

This Power of Attorney shall become effective on {{effective_date}}.

IN WITNESS WHEREOF, I have executed this Power of Attorney on the date first written above.

_______________________
{{principal_name}}, Principal

STATE OF _______________
COUNTY OF ______________`,lastUsed:"2024-11-28",usageCount:89,createdAt:"2024-01-10"},{id:"4",name:"Non-Disclosure Agreement (NDA)",description:"Mutual or unilateral NDA to protect confidential business information",category:"Business",documentType:"docx",icon:G,variables:[{key:"disclosing_party",label:"Disclosing Party",type:"text",required:!0},{key:"receiving_party",label:"Receiving Party",type:"text",required:!0},{key:"nda_type",label:"NDA Type",type:"select",required:!0,options:["Mutual","Unilateral"]},{key:"purpose",label:"Purpose of Disclosure",type:"textarea",required:!0},{key:"confidential_info",label:"Definition of Confidential Info",type:"textarea",required:!0},{key:"term_years",label:"Term (Years)",type:"number",required:!0,defaultValue:"3"},{key:"effective_date",label:"Effective Date",type:"date",required:!0},{key:"governing_state",label:"Governing State",type:"text",required:!0}],content:`{{nda_type}} NON-DISCLOSURE AGREEMENT

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
{{disclosing_party}}              {{receiving_party}}`,lastUsed:"2024-12-04",usageCount:312,createdAt:"2024-01-15"},{id:"5",name:"Settlement Agreement",description:"Comprehensive settlement agreement to resolve disputes and claims between parties",category:"Litigation",documentType:"docx",icon:De,variables:[{key:"party_a",label:"First Party Name",type:"text",required:!0},{key:"party_b",label:"Second Party Name",type:"text",required:!0},{key:"case_number",label:"Case Number (if applicable)",type:"text",required:!1},{key:"dispute_description",label:"Description of Dispute",type:"textarea",required:!0},{key:"settlement_amount",label:"Settlement Amount ($)",type:"number",required:!0},{key:"payment_terms",label:"Payment Terms",type:"textarea",required:!0},{key:"release_scope",label:"Scope of Release",type:"textarea",required:!0},{key:"confidentiality",label:"Confidentiality Provisions",type:"select",required:!0,options:["Confidential","Non-Confidential"]},{key:"effective_date",label:"Effective Date",type:"date",required:!0}],content:`SETTLEMENT AGREEMENT AND MUTUAL RELEASE

This Settlement Agreement ("Agreement") is entered into as of {{effective_date}}.

PARTIES:
{{party_a}} ("Party A")
{{party_b}} ("Party B")

RECITALS:
The parties are involved in a dispute concerning: {{dispute_description}}

SETTLEMENT TERMS:
1. Settlement Payment: Party A/B shall pay \${{settlement_amount}}
2. Payment Terms: {{payment_terms}}

RELEASE:
{{release_scope}}

CONFIDENTIALITY: This Agreement is {{confidentiality}}.

_______________________          _______________________
{{party_a}}                       {{party_b}}`,lastUsed:"2024-11-30",usageCount:145,createdAt:"2024-01-20"},{id:"6",name:"Contract Amendment",description:"Amendment to modify existing contract terms and conditions",category:"Business",documentType:"docx",icon:V,variables:[{key:"original_contract_name",label:"Original Contract Name",type:"text",required:!0},{key:"original_date",label:"Original Contract Date",type:"date",required:!0},{key:"party_a",label:"First Party",type:"text",required:!0},{key:"party_b",label:"Second Party",type:"text",required:!0},{key:"amendment_number",label:"Amendment Number",type:"select",required:!0,options:["First","Second","Third","Fourth","Fifth"]},{key:"sections_amended",label:"Sections Being Amended",type:"textarea",required:!0},{key:"new_terms",label:"New Terms/Changes",type:"textarea",required:!0},{key:"effective_date",label:"Amendment Effective Date",type:"date",required:!0}],content:`{{amendment_number}} AMENDMENT TO {{original_contract_name}}

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
{{party_a}}                       {{party_b}}`,lastUsed:"2024-12-02",usageCount:98,createdAt:"2024-02-01"},{id:"7",name:"Cease and Desist Letter",description:"Formal demand to stop unlawful activity such as infringement, harassment, or defamation",category:"Litigation",documentType:"docx",icon:F,variables:[{key:"recipient_name",label:"Recipient Name",type:"text",required:!0},{key:"recipient_address",label:"Recipient Address",type:"textarea",required:!0},{key:"client_name",label:"Client Name",type:"client",required:!0},{key:"violation_type",label:"Type of Violation",type:"select",required:!0,options:["Trademark Infringement","Copyright Infringement","Defamation","Harassment","Breach of Contract","Other"]},{key:"violation_description",label:"Description of Violation",type:"textarea",required:!0},{key:"demands",label:"Specific Demands",type:"textarea",required:!0},{key:"compliance_deadline",label:"Compliance Deadline",type:"date",required:!0}],content:`CEASE AND DESIST NOTICE
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
[Attorney Name]`,lastUsed:"2024-11-25",usageCount:78,createdAt:"2024-02-10"},{id:"8",name:"Fee Agreement - Contingency",description:"Contingency fee agreement for personal injury and other contingency-based matters",category:"Client Intake",documentType:"docx",icon:Q,variables:[{key:"client_name",label:"Client Name",type:"client",required:!0},{key:"client_address",label:"Client Address",type:"textarea",required:!0},{key:"matter_type",label:"Type of Matter",type:"select",required:!0,options:["Personal Injury","Medical Malpractice","Employment","Products Liability","Other"]},{key:"matter_description",label:"Matter Description",type:"textarea",required:!0},{key:"contingency_pretrial",label:"Contingency % (Pre-Trial)",type:"number",required:!0,defaultValue:"33"},{key:"contingency_trial",label:"Contingency % (After Trial Begins)",type:"number",required:!0,defaultValue:"40"},{key:"contingency_appeal",label:"Contingency % (On Appeal)",type:"number",required:!0,defaultValue:"45"},{key:"costs_handling",label:"Costs Handling",type:"select",required:!0,options:["Client pays as incurred","Advanced by firm, deducted from recovery","Advanced by firm, repaid only if recovery"]}],content:`CONTINGENCY FEE AGREEMENT

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
Attorney`,lastUsed:"2024-12-04",usageCount:203,createdAt:"2024-02-15"},{id:"9",name:"Promissory Note",description:"Legal promise to pay a specified sum of money with defined terms",category:"Business",documentType:"docx",icon:Q,variables:[{key:"borrower_name",label:"Borrower Name",type:"text",required:!0},{key:"borrower_address",label:"Borrower Address",type:"textarea",required:!0},{key:"lender_name",label:"Lender Name",type:"text",required:!0},{key:"principal_amount",label:"Principal Amount ($)",type:"number",required:!0},{key:"interest_rate",label:"Interest Rate (%)",type:"number",required:!0},{key:"payment_schedule",label:"Payment Schedule",type:"select",required:!0,options:["Monthly","Quarterly","Semi-Annually","Annually","Lump Sum at Maturity"]},{key:"maturity_date",label:"Maturity Date",type:"date",required:!0},{key:"collateral",label:"Collateral (if any)",type:"textarea",required:!1},{key:"effective_date",label:"Effective Date",type:"date",required:!0}],content:`PROMISSORY NOTE

Principal Amount: \${{principal_amount}}
Date: {{effective_date}}

FOR VALUE RECEIVED, {{borrower_name}} ("Borrower"), residing at {{borrower_address}}, promises to pay to {{lender_name}} ("Lender") the principal sum of \${{principal_amount}}, together with interest at {{interest_rate}}% per annum.

PAYMENT TERMS:
Schedule: {{payment_schedule}}
Maturity Date: {{maturity_date}}

COLLATERAL:
{{collateral}}

_______________________          Date: _______________
{{borrower_name}}, Borrower`,lastUsed:"2024-11-20",usageCount:67,createdAt:"2024-03-01"},{id:"10",name:"Client Termination Letter",description:"Professional letter terminating attorney-client relationship with required notices",category:"Client Intake",documentType:"docx",icon:ae,variables:[{key:"client_name",label:"Client Name",type:"client",required:!0},{key:"client_address",label:"Client Address",type:"textarea",required:!0},{key:"matter_name",label:"Matter Name",type:"matter",required:!0},{key:"termination_reason",label:"Reason for Termination",type:"select",required:!0,options:["Completion of Matter","Client Request","Non-Payment","Conflict of Interest","Breakdown in Communication","Other"]},{key:"termination_date",label:"Termination Effective Date",type:"date",required:!0},{key:"pending_deadlines",label:"Pending Deadlines/Actions",type:"textarea",required:!1,placeholder:"List any upcoming deadlines client should be aware of"},{key:"statute_limitations",label:"Statute of Limitations Warnings",type:"textarea",required:!1},{key:"file_retrieval",label:"File Retrieval Instructions",type:"textarea",required:!0}],content:`TERMINATION OF REPRESENTATION

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
[Attorney Name]`,lastUsed:"2024-11-15",usageCount:45,createdAt:"2024-03-10"},{id:"11",name:"Retainer Agreement",description:"Comprehensive retainer agreement establishing ongoing legal representation with payment terms and conditions",category:"Client Intake",documentType:"docx",icon:Re,variables:[{key:"client_name",label:"Client Name",type:"client",required:!0},{key:"client_address",label:"Client Address",type:"textarea",required:!0,placeholder:"Enter full mailing address"},{key:"client_email",label:"Client Email",type:"text",required:!0,placeholder:"client@example.com"},{key:"client_phone",label:"Client Phone",type:"text",required:!0,placeholder:"(555) 555-5555"},{key:"matter_type",label:"Type of Legal Matter",type:"select",required:!0,options:["General Business Counsel","Litigation","Corporate Transactions","Employment Matters","Real Estate","Intellectual Property","Estate Planning","Family Law","Criminal Defense","Other"]},{key:"scope_of_services",label:"Scope of Legal Services",type:"textarea",required:!0,placeholder:"Detailed description of legal services to be provided"},{key:"retainer_amount",label:"Initial Retainer Amount ($)",type:"number",required:!0,defaultValue:"5000"},{key:"minimum_balance",label:"Minimum Retainer Balance ($)",type:"number",required:!0,defaultValue:"2500"},{key:"hourly_rate_partner",label:"Partner Hourly Rate ($)",type:"number",required:!0,defaultValue:"450"},{key:"hourly_rate_associate",label:"Associate Hourly Rate ($)",type:"number",required:!0,defaultValue:"300"},{key:"hourly_rate_paralegal",label:"Paralegal Hourly Rate ($)",type:"number",required:!0,defaultValue:"150"},{key:"billing_frequency",label:"Billing Frequency",type:"select",required:!0,options:["Monthly","Bi-Weekly","Quarterly"]},{key:"payment_due_days",label:"Payment Due (Days)",type:"number",required:!0,defaultValue:"30"},{key:"responsible_attorney",label:"Responsible Attorney",type:"text",required:!0},{key:"attorney_bar_number",label:"Attorney Bar Number",type:"text",required:!0},{key:"effective_date",label:"Effective Date",type:"date",required:!0},{key:"governing_state",label:"Governing State",type:"text",required:!0}],content:`RETAINER AGREEMENT FOR LEGAL SERVICES

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
The Client agrees to pay an initial retainer of \${{retainer_amount}} upon execution of this Agreement. This retainer will be deposited into the Firm's Client Trust Account and will be applied against fees and costs as they are incurred.

B. Minimum Balance
The Client agrees to maintain a minimum balance of \${{minimum_balance}} in the retainer account. When the balance falls below this amount, the Client will be billed for replenishment of the retainer.

C. Hourly Rates
Legal services will be billed at the following hourly rates:
- Partners: \${{hourly_rate_partner}}/hour
- Associates: \${{hourly_rate_associate}}/hour
- Paralegals: \${{hourly_rate_paralegal}}/hour

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
Bar Number: {{attorney_bar_number}}`,lastUsed:"2024-12-05",usageCount:187,createdAt:"2024-01-01"}],M=["All","Client Intake","Litigation","Business","Estate Planning"];function ca(){const ne=Se();Ee();const[d,v]=s.useState(ea),[j,$]=s.useState(""),[P,re]=s.useState("All"),[se,N]=s.useState(!1),[ie,k]=s.useState(!1),[le,h]=s.useState(!1),[oe,C]=s.useState(!1),[ce,E]=s.useState(!1),[c,A]=s.useState(""),[_,S]=s.useState(""),[l,de]=s.useState(null),[b,T]=s.useState({}),[o,g]=s.useState(null),[_e,ue]=s.useState(""),[i,f]=s.useState({name:"",description:"",category:"Business",documentType:"docx",variables:[],content:"",icon:x}),[u,w]=s.useState([]),[U,z]=s.useState(!1),[D,R]=s.useState(!1),H=d.filter(t=>{const r=t.name.toLowerCase().includes(j.toLowerCase())||t.description.toLowerCase().includes(j.toLowerCase()),n=P==="All"||t.category===P;return r&&n}),me=t=>{de(t);const r={};t.variables.forEach(n=>{n.defaultValue&&(r[n.key]=n.defaultValue)}),r.current_date=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"}),T(r),N(!0)},pe=t=>{g({...t}),k(!0)},ye=t=>{const r={...t,id:crypto.randomUUID(),name:`${t.name} (Copy)`,isCustom:!0,usageCount:0,createdAt:new Date().toISOString().split("T")[0]};v([r,...d])},he=t=>{confirm(`Are you sure you want to delete "${t.name}"?`)&&v(d.filter(r=>r.id!==t.id))},be=()=>{o&&(v(d.map(t=>t.id===o.id?o:t)),k(!1),g(null))},I=(t,r)=>{T(n=>({...n,[t]:r}))},ge=()=>{if(!l)return;let t=l.content;Object.entries(b).forEach(([r,n])=>{t=t.replace(new RegExp(`{{${r}}}`,"g"),n||`[${r}]`)}),ue(t),C(!0)},W=()=>{if(!l)return;let t=l.content;Object.entries(b).forEach(([r,n])=>{t=t.replace(new RegExp(`{{${r}}}`,"g"),n||`[${r}]`)}),v(d.map(r=>r.id===l.id?{...r,usageCount:r.usageCount+1,lastUsed:new Date().toISOString().split("T")[0]}:r)),A(t),S(l.name),N(!1),C(!1),E(!0)},fe=()=>{if(!c||!_)return;const t=new Blob([c],{type:"text/plain"}),r=URL.createObjectURL(t),n=document.createElement("a");n.href=r,n.download=`${_.replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.txt`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(r)},xe=()=>{if(c&&_){const t=new Blob([c],{type:"text/plain"}),r=URL.createObjectURL(t),n=document.createElement("a");n.href=r,n.download=`${_.replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.txt`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(r)}sessionStorage.setItem("documentAI_content",JSON.stringify({content:c,templateName:_,timestamp:new Date().toISOString()})),ne("/app/ai"),E(!1),A(""),S(""),T({})},ve=async()=>{if(!(!c||!_)){z(!0),R(!1);try{const t=`${_.replace(/\s+/g,"_")}_${new Date().toISOString().split("T")[0]}.txt`,r=new Blob([c],{type:"text/plain"}),n=new File([r],t,{type:"text/plain"});await Ae.upload(n,{tags:["generated","template",(l==null?void 0:l.category)||"document"]}),R(!0)}catch(t){console.error("Failed to save document:",t),alert("Failed to save document. Please try again.")}finally{z(!1)}}},Ne=()=>{if(!i.name||!i.content){alert("Please fill in the template name and content");return}const t={id:crypto.randomUUID(),name:i.name||"",description:i.description||"",category:i.category||"Business",documentType:"docx",variables:u,content:i.content||"",usageCount:0,createdAt:new Date().toISOString().split("T")[0],isCustom:!0,icon:x};v([t,...d]),h(!1),f({name:"",description:"",category:"Business",documentType:"docx",variables:[],content:"",icon:x}),w([])},ke=()=>{w([...u,{key:"",label:"",type:"text",required:!0}])},L=(t,r,n)=>{const p=[...u];p[t]={...p[t],[r]:n},r==="label"&&(p[t].key=n.toLowerCase().replace(/\s+/g,"_")),w(p)},Ce=t=>{w(u.filter((r,n)=>n!==t))},Te=t=>{switch(t){case"Client Intake":return ae;case"Litigation":return F;case"Business":return Le;case"Estate Planning":return te;default:return x}};return e.jsxs("div",{className:a.docAutoPage,children:[e.jsxs("div",{className:a.header,children:[e.jsxs("div",{className:a.headerLeft,children:[e.jsx("div",{className:a.headerIcon,children:e.jsx(X,{size:28})}),e.jsxs("div",{children:[e.jsx("h1",{children:"Document Automation"}),e.jsx("p",{children:"Generate legal documents instantly with smart templates and merge fields"})]})]}),e.jsx("div",{className:a.headerActions,children:e.jsxs("button",{className:a.primaryBtn,onClick:()=>h(!0),children:[e.jsx(q,{size:18}),"Create Template"]})})]}),e.jsxs("div",{className:a.toolbar,children:[e.jsxs("div",{className:a.searchBox,children:[e.jsx(Ie,{size:18}),e.jsx("input",{type:"text",placeholder:"Search templates...",value:j,onChange:t=>$(t.target.value)}),j&&e.jsx("button",{className:a.clearSearch,onClick:()=>$(""),children:e.jsx(y,{size:16})})]}),e.jsx("div",{className:a.categoryTabs,children:M.map(t=>e.jsx("button",{className:m(a.categoryTab,P===t&&a.active),onClick:()=>re(t),children:t},t))})]}),e.jsxs("div",{className:a.stats,children:[e.jsxs("div",{className:a.statCard,children:[e.jsx(x,{size:20}),e.jsxs("div",{children:[e.jsx("span",{className:a.statValue,children:d.length}),e.jsx("span",{className:a.statLabel,children:"Templates"})]})]}),e.jsxs("div",{className:a.statCard,children:[e.jsx(O,{size:20}),e.jsxs("div",{children:[e.jsx("span",{className:a.statValue,children:d.reduce((t,r)=>t+r.usageCount,0)}),e.jsx("span",{className:a.statLabel,children:"Documents Generated"})]})]}),e.jsxs("div",{className:a.statCard,children:[e.jsx(qe,{size:20}),e.jsxs("div",{children:[e.jsx("span",{className:a.statValue,children:"~5 min"}),e.jsx("span",{className:a.statLabel,children:"Avg. Time Saved"})]})]})]}),e.jsx("div",{className:a.templatesGrid,children:H.map(t=>{const r=t.icon||Te(t.category);return e.jsxs("div",{className:m(a.templateCard,t.isCustom&&a.customTemplate),children:[e.jsx("div",{className:a.templateIcon,children:e.jsx(r,{size:28})}),e.jsxs("div",{className:a.templateContent,children:[e.jsxs("div",{className:a.templateHeader,children:[e.jsx("h3",{children:t.name}),t.isCustom&&e.jsx("span",{className:a.customBadge,children:"Custom"})]}),e.jsx("p",{children:t.description}),e.jsxs("div",{className:a.templateMeta,children:[e.jsx("span",{className:a.categoryBadge,children:t.category}),e.jsxs("span",{className:a.usageCount,children:[t.usageCount," uses"]}),e.jsxs("span",{className:a.variables,children:[t.variables.length," fields"]})]})]}),e.jsxs("div",{className:a.templateActions,children:[e.jsxs("button",{className:a.generateBtn,onClick:()=>me(t),children:[e.jsx(O,{size:16})," Generate"]}),e.jsxs("div",{className:a.actionIcons,children:[e.jsx("button",{className:a.iconBtn,onClick:()=>pe(t),title:"Edit template",children:e.jsx(V,{size:16})}),e.jsx("button",{className:a.iconBtn,onClick:()=>ye(t),title:"Duplicate template",children:e.jsx(Be,{size:16})}),t.isCustom&&e.jsx("button",{className:m(a.iconBtn,a.deleteBtn),onClick:()=>he(t),title:"Delete template",children:e.jsx(Pe,{size:16})})]})]})]},t.id)})}),H.length===0&&e.jsxs("div",{className:a.emptyState,children:[e.jsx(x,{size:48}),e.jsx("h3",{children:"No templates found"}),e.jsx("p",{children:"Try adjusting your search or filters, or create a new template."}),e.jsxs("button",{className:a.primaryBtn,onClick:()=>h(!0),children:[e.jsx(q,{size:18}),"Create Template"]})]}),se&&l&&e.jsx("div",{className:a.modalOverlay,onClick:()=>N(!1),children:e.jsxs("div",{className:a.modal,onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:a.modalHeader,children:[e.jsxs("div",{className:a.modalTitle,children:[e.jsx(O,{size:20}),e.jsxs("h2",{children:["Generate: ",l.name]})]}),e.jsx("button",{onClick:()=>N(!1),className:a.closeBtn,children:e.jsx(y,{size:20})})]}),e.jsxs("form",{className:a.modalForm,onSubmit:t=>{t.preventDefault(),W()},children:[e.jsx("div",{className:a.formFields,children:l.variables.map(t=>{var r;return e.jsxs("div",{className:a.formGroup,children:[e.jsxs("label",{children:[t.label,t.required&&e.jsx("span",{className:a.required,children:"*"})]}),t.type==="select"?e.jsxs("select",{value:b[t.key]||"",onChange:n=>I(t.key,n.target.value),required:t.required,children:[e.jsxs("option",{value:"",children:["Select ",t.label]}),(r=t.options)==null?void 0:r.map(n=>e.jsx("option",{value:n,children:n},n))]}):t.type==="date"?e.jsx("input",{type:"date",value:b[t.key]||"",onChange:n=>I(t.key,n.target.value),required:t.required}):t.type==="textarea"?e.jsx("textarea",{value:b[t.key]||"",onChange:n=>I(t.key,n.target.value),placeholder:t.placeholder||`Enter ${t.label.toLowerCase()}`,required:t.required,rows:3}):e.jsx("input",{type:t.type==="number"?"number":"text",value:b[t.key]||"",onChange:n=>I(t.key,n.target.value),placeholder:t.placeholder||`Enter ${t.label.toLowerCase()}`,required:t.required})]},t.key)})}),e.jsxs("div",{className:a.modalActions,children:[e.jsx("button",{type:"button",onClick:()=>N(!1),className:a.cancelBtn,children:"Cancel"}),e.jsxs("button",{type:"button",onClick:ge,className:a.secondaryBtn,children:[e.jsx(K,{size:16})," Preview"]}),e.jsxs("button",{type:"submit",className:a.primaryBtn,children:[e.jsx(B,{size:16})," Generate Document"]})]})]})]})}),oe&&e.jsx("div",{className:a.modalOverlay,onClick:()=>C(!1),children:e.jsxs("div",{className:m(a.modal,a.previewModal),onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:a.modalHeader,children:[e.jsxs("div",{className:a.modalTitle,children:[e.jsx(K,{size:20}),e.jsx("h2",{children:"Document Preview"})]}),e.jsx("button",{onClick:()=>C(!1),className:a.closeBtn,children:e.jsx(y,{size:20})})]}),e.jsx("div",{className:a.previewContent,children:e.jsx("pre",{children:_e})}),e.jsxs("div",{className:a.modalActions,children:[e.jsx("button",{onClick:()=>C(!1),className:a.cancelBtn,children:"Close"}),e.jsxs("button",{onClick:W,className:a.primaryBtn,children:[e.jsx(B,{size:16})," Generate Document"]})]})]})}),ie&&o&&e.jsx("div",{className:a.modalOverlay,onClick:()=>k(!1),children:e.jsxs("div",{className:m(a.modal,a.editModal),onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:a.modalHeader,children:[e.jsxs("div",{className:a.modalTitle,children:[e.jsx(V,{size:20}),e.jsx("h2",{children:"Edit Template"})]}),e.jsx("button",{onClick:()=>k(!1),className:a.closeBtn,children:e.jsx(y,{size:20})})]}),e.jsxs("div",{className:a.modalForm,children:[e.jsxs("div",{className:a.formRow,children:[e.jsxs("div",{className:a.formGroup,children:[e.jsx("label",{children:"Template Name"}),e.jsx("input",{type:"text",value:o.name,onChange:t=>g({...o,name:t.target.value})})]}),e.jsxs("div",{className:a.formGroup,children:[e.jsx("label",{children:"Category"}),e.jsx("select",{value:o.category,onChange:t=>g({...o,category:t.target.value}),children:M.filter(t=>t!=="All").map(t=>e.jsx("option",{value:t,children:t},t))})]})]}),e.jsxs("div",{className:a.formGroup,children:[e.jsx("label",{children:"Description"}),e.jsx("textarea",{value:o.description,onChange:t=>g({...o,description:t.target.value}),rows:2})]}),e.jsxs("div",{className:a.formGroup,children:[e.jsx("label",{children:"Template Content"}),e.jsx("textarea",{value:o.content,onChange:t=>g({...o,content:t.target.value}),rows:12,className:a.codeEditor}),e.jsxs("p",{className:a.hint,children:["Use ","{{variable_name}}"," syntax for merge fields"]})]}),e.jsxs("div",{className:a.modalActions,children:[e.jsx("button",{onClick:()=>k(!1),className:a.cancelBtn,children:"Cancel"}),e.jsxs("button",{onClick:be,className:a.primaryBtn,children:[e.jsx(J,{size:16})," Save Changes"]})]})]})]})}),le&&e.jsx("div",{className:a.modalOverlay,onClick:()=>h(!1),children:e.jsxs("div",{className:m(a.modal,a.createModal),onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:a.modalHeader,children:[e.jsxs("div",{className:a.modalTitle,children:[e.jsx(q,{size:20}),e.jsx("h2",{children:"Create New Template"})]}),e.jsx("button",{onClick:()=>h(!1),className:a.closeBtn,children:e.jsx(y,{size:20})})]}),e.jsxs("div",{className:a.modalForm,children:[e.jsxs("div",{className:a.formRow,children:[e.jsxs("div",{className:a.formGroup,children:[e.jsxs("label",{children:["Template Name ",e.jsx("span",{className:a.required,children:"*"})]}),e.jsx("input",{type:"text",value:i.name||"",onChange:t=>f({...i,name:t.target.value}),placeholder:"e.g., Service Agreement"})]}),e.jsxs("div",{className:a.formGroup,children:[e.jsx("label",{children:"Category"}),e.jsx("select",{value:i.category||"Business",onChange:t=>f({...i,category:t.target.value}),children:M.filter(t=>t!=="All").map(t=>e.jsx("option",{value:t,children:t},t))})]})]}),e.jsxs("div",{className:a.formGroup,children:[e.jsx("label",{children:"Description"}),e.jsx("textarea",{value:i.description||"",onChange:t=>f({...i,description:t.target.value}),rows:2,placeholder:"Brief description of when to use this template"})]}),e.jsxs("div",{className:a.variablesSection,children:[e.jsxs("div",{className:a.sectionHeader,children:[e.jsx("h3",{children:"Merge Fields"}),e.jsxs("button",{type:"button",className:a.addVarBtn,onClick:ke,children:[e.jsx(q,{size:16})," Add Field"]})]}),u.length===0?e.jsx("p",{className:a.noVars,children:'No merge fields added yet. Click "Add Field" to create dynamic fields.'}):e.jsx("div",{className:a.variablesList,children:u.map((t,r)=>e.jsxs("div",{className:a.variableRow,children:[e.jsx("input",{type:"text",placeholder:"Field Label",value:t.label,onChange:n=>L(r,"label",n.target.value)}),e.jsxs("select",{value:t.type,onChange:n=>L(r,"type",n.target.value),children:[e.jsx("option",{value:"text",children:"Text"}),e.jsx("option",{value:"textarea",children:"Long Text"}),e.jsx("option",{value:"number",children:"Number"}),e.jsx("option",{value:"date",children:"Date"}),e.jsx("option",{value:"select",children:"Dropdown"})]}),e.jsxs("label",{className:a.checkboxLabel,children:[e.jsx("input",{type:"checkbox",checked:t.required,onChange:n=>L(r,"required",n.target.checked)}),"Required"]}),e.jsx("button",{type:"button",className:a.removeVarBtn,onClick:()=>Ce(r),children:e.jsx(y,{size:16})})]},r))})]}),e.jsxs("div",{className:a.formGroup,children:[e.jsxs("label",{children:["Template Content ",e.jsx("span",{className:a.required,children:"*"})]}),e.jsx("textarea",{value:i.content||"",onChange:t=>f({...i,content:t.target.value}),rows:12,className:a.codeEditor,placeholder:"Enter your template content here. Use {{field_name}} for merge fields."}),u.length>0&&e.jsxs("div",{className:a.availableFields,children:[e.jsx("span",{children:"Available fields:"}),u.map((t,r)=>e.jsx("code",{onClick:()=>{var Y;const n=((Y=document.activeElement)==null?void 0:Y.selectionStart)||0,p=i.content||"",je=p.slice(0,n)+`{{${t.key}}}`+p.slice(n);f({...i,content:je})},children:`{{${t.key}}}`},r))]})]}),e.jsxs("div",{className:a.modalActions,children:[e.jsx("button",{onClick:()=>h(!1),className:a.cancelBtn,children:"Cancel"}),e.jsxs("button",{onClick:Ne,className:a.primaryBtn,children:[e.jsx(J,{size:16})," Create Template"]})]})]})]})}),ce&&e.jsx("div",{className:a.modalOverlay,onClick:()=>{E(!1),A(""),S(""),T({}),R(!1)},children:e.jsxs("div",{className:m(a.modal,a.resultModal),onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:a.modalHeader,children:[e.jsxs("div",{className:a.modalTitle,children:[e.jsx(G,{size:20}),e.jsx("h2",{children:"Document Generated!"})]}),e.jsx("button",{onClick:()=>{E(!1),A(""),S(""),T({}),R(!1)},className:a.closeBtn,children:e.jsx(y,{size:20})})]}),e.jsxs("div",{className:a.resultContent,children:[e.jsxs("div",{className:a.resultSuccess,children:[e.jsx("div",{className:a.successIcon,children:e.jsx(G,{size:48})}),e.jsx("h3",{children:_}),e.jsx("p",{children:"Your document has been generated successfully. Save it to your documents, download it, or have AI review it."})]}),D&&e.jsxs("div",{className:a.savedNotification,children:[e.jsx(Z,{size:20}),e.jsx("span",{children:"Document saved to your Documents section!"})]}),e.jsx("div",{className:a.resultPreview,children:e.jsxs("pre",{children:[c.substring(0,500),c.length>500?"...":""]})})]}),e.jsxs("div",{className:a.resultActions,children:[e.jsx("button",{onClick:ve,className:m(a.saveToDocsBtn,D&&a.saved),disabled:U||D,children:D?e.jsxs(e.Fragment,{children:[e.jsx(Z,{size:18}),"Saved to Documents"]}):U?e.jsxs(e.Fragment,{children:[e.jsx(ee,{size:18}),"Saving..."]}):e.jsxs(e.Fragment,{children:[e.jsx(ee,{size:18}),"Save to Documents"]})}),e.jsxs("button",{onClick:fe,className:a.secondaryBtn,children:[e.jsx(B,{size:18}),"Download Only"]}),e.jsxs("button",{onClick:xe,className:a.primaryBtn,children:[e.jsx(B,{size:18}),e.jsx(X,{size:18}),"Download & Review with AI"]})]})]})})]})}export{ca as DocumentAutomationPage};
