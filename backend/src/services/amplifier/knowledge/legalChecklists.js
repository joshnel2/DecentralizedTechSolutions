/**
 * Legal Checklist Library
 * 
 * Comprehensive checklists for various legal tasks and document reviews.
 * These ensure thoroughness and compliance with legal requirements.
 */

export const legalChecklists = {
  // ============== DOCUMENT REVIEW CHECKLISTS ==============
  documentReview: {
    /**
     * Contract Review Checklist
     */
    contractReview: {
      name: 'Contract Review Comprehensive Checklist',
      description: 'Systematic review of contracts and agreements',
      sections: [
        {
          name: 'Parties and Definitions',
          items: [
            'Correct legal names of all parties',
            'Accurate addresses and contact information',
            'Clear definitions of key terms',
            'Proper designation of roles (e.g., Licensor/Licensee)'
          ]
        },
        {
          name: 'Obligations and Deliverables',
          items: [
            'Clear description of services/products',
            'Specific deliverables with deadlines',
            'Performance standards and metrics',
            'Acceptance criteria and procedures'
          ]
        },
        {
          name: 'Compensation and Payment',
          items: [
            'Clear payment terms and amounts',
            'Invoicing procedures and timing',
            'Late payment penalties or interest',
            'Tax responsibility provisions'
          ]
        },
        {
          name: 'Term and Termination',
          items: [
            'Clear start and end dates',
            'Renewal terms and procedures',
            'Termination for cause provisions',
            'Termination for convenience rights',
            'Notice requirements for termination'
          ]
        },
        {
          name: 'Intellectual Property',
          items: [
            'Ownership of pre-existing IP',
            'Ownership of newly created IP',
            'License grants (scope, exclusivity, territory)',
            'IP infringement indemnification'
          ]
        },
        {
          name: 'Confidentiality',
          items: [
            'Definition of confidential information',
            'Obligations of receiving party',
            'Permitted disclosures',
            'Return/destruction upon termination',
            'Survival period'
          ]
        },
        {
          name: 'Liability and Indemnification',
          items: [
            'Limitation of liability provisions',
            'Indemnification procedures',
            'Insurance requirements',
            'Consequential damages exclusion'
          ]
        },
        {
          name: 'General Provisions',
          items: [
            'Governing law and jurisdiction',
            'Dispute resolution (litigation/arbitration)',
            'Assignment restrictions',
            'Force majeure provisions',
            'Entire agreement clause',
            'Severability clause',
            'Notice provisions'
          ]
        },
        {
          name: 'Special Industry Considerations',
          items: [
            'Regulatory compliance requirements',
            'Data privacy provisions (GDPR, CCPA)',
            'Export control restrictions',
            'Anti-bribery/anti-corruption clauses'
          ]
        }
      ]
    },
    
    /**
     * Employment Agreement Checklist
     */
    employmentAgreement: {
      name: 'Employment Agreement Review Checklist',
      description: 'Review of executive or key employee agreements',
      sections: [
        {
          name: 'Position and Duties',
          items: [
            'Clear job title and description',
            'Reporting structure',
            'Location and work arrangements',
            'Exclusivity of services'
          ]
        },
        {
          name: 'Compensation',
          items: [
            'Base salary amount and payment schedule',
            'Bonus structure and criteria',
            'Equity grants (options, RSUs) with vesting',
            'Benefits (health, retirement, vacation)'
          ]
        },
        {
          name: 'Term and Termination',
          items: [
            'Employment term (fixed or at-will)',
            'Termination for cause definitions',
            'Termination without cause rights',
            'Notice periods',
            'Severance package terms'
          ]
        },
        {
          name: 'Restrictive Covenants',
          items: [
            'Non-compete scope and duration',
            'Non-solicitation of clients and employees',
            'Non-disclosure obligations',
            'Reasonableness under state law'
          ]
        },
        {
          name: 'Intellectual Property',
          items: [
            'Invention assignment provisions',
            'Definition of work product',
            'Pre-existing IP exclusions',
            'Moral rights waivers'
          ]
        }
      ]
    }
  },
  
  // ============== LITIGATION CHECKLISTS ==============
  litigation: {
    /**
     Complaint Drafting Checklist
     */
    complaintDrafting: {
      name: 'Complaint Drafting Checklist',
      description: 'Ensure proper pleading under CPLR',
      sections: [
        {
          name: 'Caption and Formatting',
          items: [
            'Correct court and county',
            'Proper party names and designations',
            'Index number (if assigned)',
            'Attorney information block'
          ]
        },
        {
          name: 'Jurisdiction and Venue',
          items: [
            'Basis for subject matter jurisdiction',
            'Basis for personal jurisdiction',
            'Proper venue allegations',
            'Amount in controversy (if diversity)'
          ]
        },
        {
          name: 'Parties',
          items: [
            'Complete identification of all parties',
            'Capacity allegations (individual, corporate)',
            'Citizenship allegations for diversity',
            'Real party in interest allegations'
          ]
        },
        {
          name: 'Factual Allegations',
          items: [
            'Numbered paragraphs',
            'Chronological factual narrative',
            'Specific dates, amounts, and facts',
            'Incorporation by reference where appropriate'
          ]
        },
        {
          name: 'Causes of Action',
          items: [
            'Separate counts for each cause',
            'Elements of each claim properly alleged',
            'Incorporation of relevant factual allegations',
            'Proper labeling of claims'
          ]
        },
        {
          name: 'Prayer for Relief',
          items: [
            'Specific demand for each type of relief',
            'Inclusion of costs and attorney fees (if applicable)',
            'Proper "WHEREFORE" clause',
            'Jury demand (if applicable)'
          ]
        },
        {
          name: 'NY CPLR Compliance',
          items: [
            'CPLR 3013 compliance (plain and concise)',
            'CPLR 3016 particularity for certain claims',
            'CPLR 3017 demand for relief',
            'Verification (if required)'
          ]
        }
      ]
    },
    
    /**
     * Discovery Checklist
     */
    discoveryChecklist: {
      name: 'Discovery Planning and Response Checklist',
      description: 'Comprehensive discovery management',
      sections: [
        {
          name: 'Initial Disclosures',
          items: [
            'Witness list with contact information',
            'Document production categories',
            'Damage computations',
            'Insurance information'
          ]
        },
        {
          name: 'Document Requests',
          items: [
            'Proper CPLR 3120 formatting',
            'Reasonable time frame definitions',
            'Specific document categories',
            'Electronic discovery protocols',
            'Privilege log procedures'
          ]
        },
        {
          name: 'Interrogatories',
          items: [
            'CPLR 3130 compliance (25-question limit)',
            'Proper numbering and formatting',
            'Clear and unambiguous questions',
            'Definitions and instructions'
          ]
        },
        {
          name: 'Deposition Planning',
          items: [
            'Proper notice under CPLR 3107',
            'Video deposition protocols',
            'Exhibit preparation',
            'Witness preparation outline'
          ]
        },
        {
          name: 'Responses and Objections',
          items: [
            'Timely responses within CPLR deadlines',
            'Proper objection formatting',
            'Privilege assertions with specificity',
            'Supplemental responses when required'
          ]
        }
      ]
    }
  },
  
  // ============== CORPORATE/TRANSACTIONAL CHECKLISTS ==============
  corporate: {
    /**
     * Due Diligence Checklist
     */
    dueDiligence: {
      name: 'Legal Due Diligence Checklist',
      description: 'Comprehensive review for mergers/acquisitions',
      sections: [
        {
          name: 'Corporate Structure',
          items: [
            'Certificate of incorporation and bylaws',
            'Board and shareholder minutes',
            'Stock records and option plans',
            'Subsidiary and affiliate structure'
          ]
        },
        {
          name: 'Material Contracts',
          items: [
            'Customer and supplier contracts',
            'Loan agreements and credit facilities',
            'Leases and real estate documents',
            'IP licenses and agreements'
          ]
        },
        {
          name: 'Litigation and Compliance',
          items: [
            'Pending and threatened litigation',
            'Regulatory investigations',
            'Compliance with industry regulations',
            'Environmental liabilities'
          ]
        },
        {
          name: 'Employment Matters',
          items: [
            'Employment agreements and offer letters',
            'Employee benefit plans',
            'Labor disputes and grievances',
            'Independent contractor classifications'
          ]
        },
        {
          name: 'Intellectual Property',
          items: [
            'Patent, trademark, copyright registrations',
            'IP licensing agreements',
            'Open source software usage',
            'Trade secret protection measures'
          ]
        }
      ]
    },
    
    /**
     * Closing Checklist
     */
    closingChecklist: {
      name: 'Transaction Closing Checklist',
      description: 'Documents and actions for closing',
      sections: [
        {
          name: 'Pre-Closing Documents',
          items: [
            'Definitive agreement (fully executed)',
            'Disclosure schedules',
            'Board and shareholder approvals',
            'Third-party consents'
          ]
        },
        {
          name: 'Closing Deliverables',
          items: [
            'Officer certificates',
            'Good standing certificates',
            'Legal opinions',
            'Secretary certificates'
          ]
        },
        {
          name: 'Post-Closing Items',
          items: [
            'Filings (SEC, state, local)',
            'Notice to employees and customers',
            'Integration planning',
            'Escrow releases'
          ]
        }
      ]
    }
  },
  
  // ============== ETHICS AND COMPLIANCE CHECKLISTS ==============
  ethics: {
    /**
     * Conflict Check Checklist
     */
    conflictCheck: {
      name: 'Conflict of Interest Checklist',
      description: 'ABA Model Rule 1.7 compliance',
      sections: [
        {
          name: 'Client Identification',
          items: [
            'Full legal name of prospective client',
            'Related entities and affiliates',
            'Key personnel and decision-makers',
            'Adverse parties in matter'
          ]
        },
        {
          name: 'Firm-Wide Check',
          items: [
            'Current client database search',
            'Former client database search',
            'Matter description matching',
            'Adverse party matching'
          ]
        },
        {
          name: 'Individual Attorney Check',
          items: [
            'Personal representation conflicts',
            'Previous firm conflicts',
            'Government service conflicts',
            'Personal relationship conflicts'
          ]
        },
        {
          name: 'Waiver Considerations',
          items: [
            'Informed consent requirements',
            'Written confirmation needed',
            'Reasonableness of representation',
            'Documentation of waiver'
          ]
        }
      ]
    },
    
    /**
     * Trust Account Compliance
     */
    trustAccount: {
      name: 'Trust Account Compliance Checklist',
      description: 'IOLA and trust accounting rules',
      sections: [
        {
          name: 'Account Setup',
          items: [
            'Proper IOLA designation',
            'Interest allocation instructions',
            'Bank authorization signatures',
            'Three-way reconciliation procedures'
          ]
        },
        {
          name: 'Deposit Compliance',
          items: [
            'Timely deposit of client funds',
            'Proper identification of client funds',
            'Advance fee agreement documentation',
            'Flat fee allocation procedures'
          ]
        },
        {
          name: 'Disbursement Compliance',
          items: [
            'Funds only for intended purpose',
            'Timely disbursement to clients',
            'Proper accounting for each client',
            'Fee withdrawal only when earned'
          ]
        },
        {
          name: 'Record Keeping',
          items: [
            'Complete client ledger for each matter',
            'Monthly three-way reconciliation',
            'Bank statement retention',
            'Annual audit compliance'
          ]
        }
      ]
    }
  },
  
  // ============== CHECKLIST UTILITY FUNCTIONS ==============
  utilities: {
    /**
     * Get checklist by name
     */
    getChecklist(checklistName) {
      // Search through all categories
      const categories = ['documentReview', 'litigation', 'corporate', 'ethics'];
      
      for (const category of categories) {
        if (this[category] && this[category][checklistName]) {
          return this[category][checklistName];
        }
      }
      
      return null;
    },
    
    /**
     * List all available checklists
     */
    listChecklists() {
      const checklists = [];
      const categories = ['documentReview', 'litigation', 'corporate', 'ethics'];
      
      for (const category of categories) {
        if (this[category]) {
          for (const [name, checklist] of Object.entries(this[category])) {
            if (name !== 'utilities') {
              checklists.push({
                name,
                displayName: checklist.name,
                category,
                description: checklist.description,
                sectionCount: checklist.sections?.length || 0,
                itemCount: checklist.sections?.reduce((sum, section) => sum + section.items.length, 0) || 0
              });
            }
          }
        }
      }
      
      return checklists;
    },
    
    /**
     * Generate checklist as markdown
     */
    generateChecklist(checklistName, includeInstructions = true) {
      const checklist = this.getChecklist(checklistName);
      if (!checklist) {
        throw new Error(`Checklist ${checklistName} not found`);
      }
      
      let markdown = `# ${checklist.name}\n\n`;
      markdown += `**Description:** ${checklist.description}\n\n`;
      
      if (includeInstructions) {
        markdown += '## Instructions:\n';
        markdown += '1. Review each section thoroughly\n';
        markdown += '2. Check off completed items\n';
        markdown += '3. Note any issues or follow-up needed\n';
        markdown += '4. Document completion in matter notes\n\n';
      }
      
      for (const section of checklist.sections) {
        markdown += `## ${section.name}\n\n`;
        
        for (const item of section.items) {
          markdown += `- [ ] ${item}\n`;
        }
        
        markdown += '\n';
      }
      
      markdown += '## Completion Notes:\n';
      markdown += 'Date: _________\n';
      markdown += 'Reviewed by: _________\n';
      markdown += 'Issues found: _________\n';
      markdown += 'Follow-up needed: _________\n';
      
      return markdown;
    },
    
    /**
     * Validate task against checklist
     */
    validateAgainstChecklist(checklistName, taskDescription, completedItems = []) {
      const checklist = this.getChecklist(checklistName);
      if (!checklist) {
        return { valid: false, errors: ['Checklist not found'] };
      }
      
      const allItems = checklist.sections.flatMap(section => section.items);
      const completionRate = completedItems.length / allItems.length;
      
      const analysis = {
        checklist: checklist.name,
        totalItems: allItems.length,
        completedItems: completedItems.length,
        completionRate: Math.round(completionRate * 100),
        missingItems: allItems.filter(item => !completedItems.includes(item)),
        sections: []
      };
      
      // Analyze each section
      for (const section of checklist.sections) {
        const sectionItems = section.items;
        const completedSectionItems = completedItems.filter(item => sectionItems.includes(item));
        const sectionCompletionRate = completedSectionItems.length / sectionItems.length;
        
        analysis.sections.push({
          name: section.name,
          totalItems: sectionItems.length,
          completedItems: completedSectionItems.length,
          completionRate: Math.round(sectionCompletionRate * 100),
          critical: sectionCompletionRate < 0.5 // Flag sections with <50% completion
        });
      }
      
      return analysis;
    },
    
    /**
     * Get recommended checklist for task type
     */
    recommendChecklist(taskType) {
      const recommendations = {
        'document_review': ['contractReview', 'employmentAgreement'],
        'legal_research': ['complaintDrafting'],
        'billing_review': ['trustAccount'],
        'matter_intake': ['conflictCheck'],
        'due_diligence': ['dueDiligence', 'closingChecklist'],
        'litigation_prep': ['complaintDrafting', 'discoveryChecklist'],
        'compliance_check': ['conflictCheck', 'trustAccount']
      };
      
      return recommendations[taskType] || [];
    }
  }
};

// Make utilities available at top level
export const getChecklist = legalChecklists.utilities.getChecklist.bind(legalChecklists.utilities);
export const listChecklists = legalChecklists.utilities.listChecklists.bind(legalChecklists.utilities);
export const generateChecklist = legalChecklists.utilities.generateChecklist.bind(legalChecklists.utilities);
export const validateAgainstChecklist = legalChecklists.utilities.validateAgainstChecklist.bind(legalChecklists.utilities);
export const recommendChecklist = legalChecklists.utilities.recommendChecklist.bind(legalChecklists.utilities);