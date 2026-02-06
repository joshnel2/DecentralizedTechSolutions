/**
 * Legal Document Template Library
 * 
 * Standard legal document templates and forms that the agent can reference
 * and use as starting points for document creation.
 */

export const documentTemplates = {
  // ============== CONTRACTS & AGREEMENTS ==============
  contracts: {
    /**
     * Non-Disclosure Agreement (NDA)
     */
    nda: {
      name: 'Non-Disclosure Agreement',
      category: 'contract',
      description: 'Standard mutual confidentiality agreement',
      keySections: [
        'Definition of Confidential Information',
        'Obligations of Receiving Party',
        'Exclusions from Confidential Information',
        'Term and Termination',
        'Remedies for Breach',
        'Governing Law and Jurisdiction'
      ],
      checklist: [
        'Define confidential information specifically',
        'Include mutual vs unilateral confidentiality',
        'Specify permitted disclosures (employees, advisors)',
        'Include return/destruction clause',
        'Set reasonable term (1-3 years typical)',
        'Include survival clause for confidentiality obligations',
        'Specify governing law and dispute resolution'
      ],
      commonProvisions: {
        confidentialInformation: 'Includes all non-public information disclosed by either party',
        exclusions: 'Information already public, independently developed, or rightfully received',
        term: 'Typically 1-3 years from disclosure',
        returnObligation: 'Return or destroy upon termination',
        governingLaw: 'Specify state law (often Delaware or New York)'
      }
    },
    
    /**
     * Consulting Agreement
     */
    consultingAgreement: {
      name: 'Consulting Services Agreement',
      category: 'contract',
      description: 'Agreement for independent contractor services',
      keySections: [
        'Services and Deliverables',
        'Compensation and Payment Terms',
        'Term and Termination',
        'Independent Contractor Status',
        'Intellectual Property',
        'Confidentiality',
        'Indemnification'
      ],
      checklist: [
        'Define services with specificity or attach statement of work',
        'Specify hourly rate or fixed fee',
        'Include payment terms (net 30 typical)',
        'Confirm independent contractor status (not employee)',
        'Specify IP ownership (typically work product belongs to client)',
        'Include confidentiality provisions',
        'Mutual indemnification for breaches'
      ]
    },
    
    /**
     * Employment Agreement
     */
    employmentAgreement: {
      name: 'Employment Agreement',
      category: 'contract',
      description: 'Executive or key employee agreement',
      keySections: [
        'Position and Duties',
        'Compensation and Benefits',
        'Term and Termination',
        'Confidentiality and IP',
        'Non-Compete and Non-Solicit',
        'Severance and Change of Control'
      ],
      checklist: [
        'Define position, title, and reporting structure',
        'Specify base salary, bonus structure, and equity',
        'List benefits (health insurance, retirement, vacation)',
        'Include at-will employment language (if applicable)',
        'Confidentiality and invention assignment provisions',
        'Consider non-compete restrictions (check state enforceability)',
        'Severance provisions for termination without cause',
        'Include arbitration clause if desired'
      ]
    }
  },
  
  // ============== LEGAL PLEADINGS ==============
  pleadings: {
    /**
     * Complaint
     */
    complaint: {
      name: 'Civil Complaint',
      category: 'pleading',
      description: 'Initial pleading commencing civil action',
      structure: [
        'Caption (Court, Parties)',
        'Jurisdiction and Venue',
        'Parties',
        'Factual Allegations',
        'Causes of Action',
        'Prayer for Relief'
      ],
      checklist: [
        'Proper court and caption formatting',
        'Allege jurisdictional basis (diversity, federal question)',
        'Describe parties with specificity',
        'Factual allegations in numbered paragraphs',
        'Separate counts for each cause of action',
        'Demand for judgment (prayer for relief)',
        'Signature block with attorney information'
      ],
      nyCplrReferences: [
        'CPLR 3013: Statements in pleadings',
        'CPLR 3014: Separate statements',
        'CPLR 3015: Specific matters',
        'CPLR 3016: Particularity'
      ]
    },
    
    /**
     * Answer
     */
    answer: {
      name: 'Answer to Complaint',
      category: 'pleading',
      description: 'Response to allegations in complaint',
      structure: [
        'Caption',
        'Admissions and Denials',
        'Affirmative Defenses',
        'Counterclaims (if any)',
        'Cross-claims (if any)',
        'Prayer for Relief'
      ],
      checklist: [
        'Respond to each numbered paragraph (admit, deny, lack knowledge)',
        'Plead affirmative defenses specifically',
        'Include counterclaims if applicable',
        'Include cross-claims if applicable',
        'Demand for judgment',
        'Signature block'
      ],
      nyCplrReferences: [
        'CPLR 3018: Responsive pleadings',
        'CPLR 3019: Counterclaims and cross-claims'
      ]
    }
  },
  
  // ============== CORRESPONDENCE ==============
  correspondence: {
    /**
     * Demand Letter
     */
    demandLetter: {
      name: 'Demand Letter',
      category: 'correspondence',
      description: 'Formal demand for payment or action',
      structure: [
        'Header (Date, Recipient)',
        'Reference Line',
        'Introduction',
        'Factual Background',
        'Legal Basis',
        'Demand',
        'Deadline',
        'Consequences of Non-Compliance',
        'Closing'
      ],
      checklist: [
        'Clear identification of parties',
        'Concise factual summary',
        'Citation to legal authority',
        'Specific demand (amount, action)',
        'Reasonable deadline (typically 10-30 days)',
        'Statement of intent to pursue legal action',
        'Professional but firm tone'
      ]
    },
    
    /**
     * Legal Opinion Letter
     */
    opinionLetter: {
      name: 'Legal Opinion Letter',
      category: 'correspondence',
      description: 'Formal legal opinion on specific matter',
      structure: [
        'Addressee',
        'Subject Line',
        'Scope and Limitations',
        'Factual Assumptions',
        'Legal Analysis',
        'Conclusion',
        'Qualifications',
        'Signature'
      ],
      checklist: [
        'Clear statement of who opinion is for',
        'Specific description of questions addressed',
        'List of assumptions and limitations',
        'Thorough legal analysis with citations',
        'Clear conclusion answering each question',
        'Appropriate disclaimers and qualifications',
        'Attorney signature and date'
      ]
    }
  },
  
  // ============== INTERNAL DOCUMENTS ==============
  internal: {
    /**
     * Engagement Letter
     */
    engagementLetter: {
      name: 'Attorney-Client Engagement Letter',
      category: 'internal',
      description: 'Formalizes attorney-client relationship',
      keySections: [
        'Scope of Representation',
        'Client Responsibilities',
        'Attorney Responsibilities',
        'Fees and Billing',
        'Confidentiality',
        'Termination',
        'Dispute Resolution'
      ],
      checklist: [
        'Clear description of services to be provided',
        'Explicit list of what is NOT included',
        'Fee structure (hourly, contingency, flat)',
        'Billing procedures and payment terms',
        'Confidentiality provisions',
        'Termination rights for both parties',
        'Conflict check acknowledgment',
        'Client signature required'
      ],
      ethicalRequirements: [
        'Clear communication of fee arrangement (ABA Model Rule 1.5)',
        'Scope of representation (ABA Model Rule 1.2)',
        'Confidentiality (ABA Model Rule 1.6)',
        'Conflict check (ABA Model Rule 1.7)'
      ]
    },
    
    /**
     * Case Strategy Memo
     */
    caseStrategyMemo: {
      name: 'Case Strategy Memorandum',
      category: 'internal',
      description: 'Internal analysis and strategy planning',
      structure: [
        'Case Summary',
        'Factual Analysis',
        'Legal Issues',
        'Strengths and Weaknesses',
        'Discovery Plan',
        'Motion Strategy',
        'Settlement Analysis',
        'Recommendations'
      ],
      checklist: [
        'Concise case overview',
        'Key facts with source references',
        'Legal issues with supporting authority',
        'Honest assessment of strengths/weaknesses',
        'Comprehensive discovery plan',
        'Potential motion practice',
        'Settlement value analysis',
        'Clear recommendations for next steps'
      ]
    }
  },
  
  // ============== TEMPLATE GENERATION FUNCTIONS ==============
  generators: {
    /**
     * Generate document from template
     */
    generateDocument(templateName, variables = {}) {
      const template = this.getTemplate(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }
      
      let content = `# ${template.name}\n\n`;
      content += `**Category:** ${template.category}\n`;
      content += `**Description:** ${template.description}\n\n`;
      
      if (template.keySections) {
        content += '## Key Sections:\n';
        template.keySections.forEach(section => {
          content += `- ${section}\n`;
        });
        content += '\n';
      }
      
      if (template.checklist) {
        content += '## Checklist:\n';
        template.checklist.forEach(item => {
          content += `- [ ] ${item}\n`;
        });
        content += '\n';
      }
      
      if (variables.customContent) {
        content += '## Custom Content:\n';
        content += variables.customContent + '\n\n';
      }
      
      if (template.nyCplrReferences) {
        content += '## NY CPLR References:\n';
        template.nyCplrReferences.forEach(ref => {
          content += `- ${ref}\n`;
        });
        content += '\n';
      }
      
      if (template.ethicalRequirements) {
        content += '## Ethical Requirements:\n';
        template.ethicalRequirements.forEach(req => {
          content += `- ${req}\n`;
        });
      }
      
      return content;
    },
    
    /**
     * Get template by name
     */
    getTemplate(templateName) {
      // Search through all categories
      const categories = ['contracts', 'pleadings', 'correspondence', 'internal'];
      
      for (const category of categories) {
        if (this[category] && this[category][templateName]) {
          return this[category][templateName];
        }
      }
      
      return null;
    },
    
    /**
     * List all available templates
     */
    listTemplates() {
      const templates = [];
      const categories = ['contracts', 'pleadings', 'correspondence', 'internal'];
      
      for (const category of categories) {
        if (this[category]) {
          for (const [name, template] of Object.entries(this[category])) {
            if (name !== 'generators') {
              templates.push({
                name,
                displayName: template.name,
                category,
                description: template.description
              });
            }
          }
        }
      }
      
      return templates;
    },
    
    /**
     * Get checklist for document type
     */
    getChecklist(templateName) {
      const template = this.getTemplate(templateName);
      return template?.checklist || [];
    },
    
    /**
     * Validate document against template requirements
     */
    validateDocument(templateName, documentContent) {
      const template = this.getTemplate(templateName);
      if (!template) {
        return { valid: false, errors: ['Template not found'] };
      }
      
      const errors = [];
      const warnings = [];
      
      // Check for key sections
      if (template.keySections) {
        for (const section of template.keySections) {
          if (!documentContent.toLowerCase().includes(section.toLowerCase().replace(/ /g, ''))) {
            warnings.push(`Key section "${section}" may be missing or incomplete`);
          }
        }
      }
      
      // Check NY CPLR references for pleadings
      if (template.category === 'pleading' && template.nyCplrReferences) {
        let hasCplrReference = false;
        for (const ref of template.nyCplrReferences) {
          if (documentContent.includes('CPLR') || documentContent.includes('Civil Practice')) {
            hasCplrReference = true;
            break;
          }
        }
        if (!hasCplrReference) {
          warnings.push('Consider adding NY CPLR references for proper pleading format');
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        checklist: template.checklist || []
      };
    }
  }
};

// Make generators available at top level
export const generateDocument = documentTemplates.generators.generateDocument.bind(documentTemplates.generators);
export const getTemplate = documentTemplates.generators.getTemplate.bind(documentTemplates.generators);
export const listTemplates = documentTemplates.generators.listTemplates.bind(documentTemplates.generators);
export const getChecklist = documentTemplates.generators.getChecklist.bind(documentTemplates.generators);
export const validateDocument = documentTemplates.generators.validateDocument.bind(documentTemplates.generators);