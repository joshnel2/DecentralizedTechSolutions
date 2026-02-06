/**
 * Statutes and Rules Database
 * 
 * Comprehensive database of New York statutes, CPLR rules, and court procedures
 * that the agent can reference for legal tasks.
 */

export const statutesDatabase = {
  // ============== NEW YORK CPLR (CIVIL PRACTICE LAW & RULES) ==============
  cplr: {
    /**
     * Article 2: Limitations of Time
     */
    article2: {
      title: 'Limitations of Time',
      sections: {
        'CPLR 201': {
          title: 'Application of article',
          text: 'This article shall apply to an action, claim or proceeding commenced in a court.',
          notes: 'Determines applicability of limitation periods.'
        },
        'CPLR 202': {
          title: 'Accrual of cause of action and burden of proof',
          text: 'An action based upon a cause of action accruing without the state may not be commenced after the expiration of the time limited by the laws of either the state or the place without the state where the cause of action accrued.',
          notes: 'Choice of law provision for statute of limitations.'
        },
        'CPLR 203': {
          title: 'Method of computing periods of limitation generally',
          text: '(a) Accrual of cause of action and interposition of claim. The time within which an action must be commenced, except as otherwise expressly prescribed, shall be computed from the time the cause of action accrued to the time the claim is interposed.',
          deadlines: [
            'Personal injury: 3 years',
            'Contract: 6 years',
            'Property damage: 3 years',
            'Fraud: 6 years from discovery',
            'Medical malpractice: 2.5 years'
          ],
          notes: 'General statute of limitations rules.'
        },
        'CPLR 204': {
          title: 'Stay of commencement of action; denial of motion to dismiss',
          text: 'Where the commencement of an action has been stayed by a court or by statutory prohibition, the duration of the stay is not part of the time within which the action must be commenced.',
          notes: 'Tolls statute of limitations during stay.'
        },
        'CPLR 205': {
          title: 'Termination of action',
          text: '(a) New action by plaintiff. If an action is timely commenced and is terminated in any other manner than by a voluntary discontinuance, a failure to obtain personal jurisdiction over the defendant, a dismissal of the complaint for neglect to prosecute the action, or a final judgment upon the merits, the plaintiff may commence a new action upon the same transaction or occurrence within six months after the termination.',
          notes: 'Six-month savings provision for certain terminated actions.'
        }
      }
    },
    
    /**
     * Article 3: Jurisdiction, Service, and Appearance
     */
    article3: {
      title: 'Jurisdiction, Service, and Appearance',
      sections: {
        'CPLR 301': {
          title: 'Jurisdiction over persons, property or status',
          text: 'A court may exercise such jurisdiction over persons, property, or status as might have been exercised heretofore.',
          notes: 'General jurisdiction provision.'
        },
        'CPLR 302': {
          title: 'Personal jurisdiction by acts of non-domiciliaries',
          text: '(a) Acts which are the basis of jurisdiction. As to a cause of action arising from any of the acts enumerated in this section, a court may exercise personal jurisdiction over any non-domiciliary who in person or through an agent: 1. transacts any business within the state or contracts anywhere to supply goods or services in the state; or 2. commits a tortious act within the state; or 3. commits a tortious act without the state causing injury within the state; or 4. owns, uses, or possesses any real property situated within the state.',
          notes: 'New York long-arm statute.'
        },
        'CPLR 308': {
          title: 'Service of summons',
          text: '(1) Personal service; (2) Substituted service; (3) Service by publication; (4) Service by mail',
          deadlines: [
            'Personal service: Within 120 days of filing',
            'Alternative service: Court permission required'
          ],
          notes: 'Methods of service of process.'
        },
        'CPLR 311': {
          title: 'Service upon corporations',
          text: '(a) Personal service upon a corporation shall be made by delivering the summons to an officer, director, managing or general agent, or cashier or assistant cashier or to any other agent authorized by appointment or by law to receive service.',
          notes: 'Service on corporation rules.'
        },
        'CPLR 312': {
          title: 'Service upon the state',
          text: 'Service upon the state shall be made by delivering the summons to an assistant attorney-general at an office of the attorney-general within the state.',
          notes: 'Service on government entities.'
        }
      }
    },
    
    /**
     * Article 31: Disclosure
     */
    article31: {
      title: 'Disclosure',
      sections: {
        'CPLR 3101': {
          title: 'Scope of disclosure',
          text: '(a) There shall be full disclosure of all matter material and necessary in the prosecution or defense of an action, regardless of the burden of proof.',
          notes: 'Broad discovery standard.'
        },
        'CPLR 3102': {
          title: 'Method of obtaining disclosure',
          text: '(a) Disclosure may be obtained: 1. By stipulation of the parties; 2. On notice; 3. By court order.',
          notes: 'Methods for obtaining discovery.'
        },
        'CPLR 3103': {
          title: 'Protective orders',
          text: '(a) The court may at any time on its own initiative, or on motion of any party or witness, make a protective order denying, limiting, conditioning or regulating the use of any disclosure device.',
          notes: 'Court protection from abusive discovery.'
        },
        'CPLR 3120': {
          title: 'Discovery and production of documents and things',
          text: '1. After commencement of an action, any party may serve on any other party a notice or on any other person a subpoena duces tecum requiring the production of documents.',
          deadlines: [
            'Document requests: Must specify reasonable particularity',
            'Response deadline: 20 days for parties, longer for non-parties'
          ],
          notes: 'Document discovery procedures.'
        },
        'CPLR 3122': {
          title: 'Objections to disclosure; motion to compel',
          text: '(a) Within twenty days after service of a notice or demand for discovery, the party upon whom such notice or demand is served may serve a written response.',
          notes: 'Timing for discovery objections.'
        }
      }
    },
    
    /**
     * Article 32: Accelerated Judgment
     */
    article32: {
      title: 'Accelerated Judgment',
      sections: {
        'CPLR 3211': {
          title: 'Motion to dismiss',
          text: '(a) Motion to dismiss cause of action. A party may move for judgment dismissing one or more causes of action asserted against him on the ground that: 1. a defense is founded upon documentary evidence; 2. the court has not jurisdiction of the subject matter of the cause of action; 3. the party asserting the cause of action has not legal capacity to sue; 4. there is another action pending between the same parties for the same cause of action; 5. the cause of action may not be maintained because of arbitration and award, collateral estoppel, discharge in bankruptcy, infancy or other disability of the moving party, payment, release, res judicata, statute of limitations, or statute of frauds; 6. with respect to a counterclaim, it may not properly be interposed in the action.',
          deadlines: [
            'Motion timing: Before service of responsive pleading',
            'Response: Within 20 days'
          ],
          notes: 'Pre-answer motion to dismiss.'
        },
        'CPLR 3212': {
          title: 'Motion for summary judgment',
          text: '(a) Time; motion; supporting proof. Any party may move for summary judgment in any action, after issue has been joined.',
          deadlines: [
            'Motion timing: After joinder of issue',
            'Response: 30 days unless otherwise ordered',
            'Reply: 7 days after service of answering papers'
          ],
          notes: 'Summary judgment motion procedures.'
        },
        'CPLR 3213': {
          title: 'Motion for summary judgment in lieu of complaint',
          text: 'When an action is based upon an instrument for the payment of money only or upon any judgment, the plaintiff may serve with the summons a notice of motion for summary judgment and the supporting papers in lieu of a complaint.',
          notes: 'Expedited procedure for certain actions.'
        }
      }
    }
  },
  
  // ============== NEW YORK GENERAL BUSINESS LAW ==============
  generalBusinessLaw: {
    'GBL 349': {
      title: 'Deceptive acts or practices',
      text: '(a) Consumer oriented conduct. Deceptive acts or practices in the conduct of any business, trade or commerce or in the furnishing of any service in this state are hereby declared unlawful.',
      remedies: [
        'Actual damages or $50, whichever is greater',
        'Treble damages up to $1,000',
        'Attorney fees and costs'
      ],
      notes: 'New York consumer protection statute.'
    },
    'GBL 350': {
      title: 'False advertising',
      text: 'False advertising in the conduct of any business, trade or commerce or in the furnishing of any service in this state is hereby declared unlawful.',
      notes: 'Prohibits false or misleading advertising.'
    }
  },
  
  // ============== NEW YORK CIVIL RIGHTS LAW ==============
  civilRightsLaw: {
    'CRL 40-c': {
      title: 'Discrimination in places of public accommodation',
      text: 'All persons within the jurisdiction of this state shall be entitled to the full and equal accommodations, advantages, facilities and privileges of any place of public accommodation.',
      notes: 'Public accommodation anti-discrimination law.'
    },
    'CRL 50-a': {
      title: 'Personnel records of police officers, firefighters and correction officers',
      text: 'Repealed in 2020. Personnel records now subject to FOIL with certain redactions.',
      notes: 'Formerly protected police disciplinary records, now repealed.'
    }
  },
  
  // ============== FEDERAL RULES OF CIVIL PROCEDURE (FOR REFERENCE) ==============
  frcp: {
    'FRCP 8': {
      title: 'General rules of pleading',
      text: '(a) Claim for Relief. A pleading that states a claim for relief must contain: (1) a short and plain statement of the grounds for the court\'s jurisdiction; (2) a short and plain statement of the claim showing that the pleader is entitled to relief; and (3) a demand for the relief sought.',
      notes: 'Federal pleading standards.'
    },
    'FRCP 12': {
      title: 'Defenses and objections',
      text: '(b) How Presented. Every defense to a claim for relief in any pleading must be asserted in the responsive pleading if one is required.',
      notes: 'Motion to dismiss and answer requirements.'
    },
    'FRCP 26': {
      title: 'Duty to disclose; general provisions governing discovery',
      text: '(a) Required Disclosures. Except as exempted by Rule 26(a)(1)(B) or as otherwise stipulated or ordered by the court, a party must, without awaiting a discovery request, provide to the other parties initial disclosures.',
      notes: 'Federal discovery rules.'
    }
  },
  
  // ============== COURT RULES DATABASE ==============
  courtRules: {
    /**
     * New York State Unified Court System Rules
     */
    nyState: {
      '22 NYCRR 202.5': {
        title: 'Electronic filing',
        text: 'Authorizes and regulates electronic filing in civil matters in the New York State Unified Court System.',
        notes: 'NY e-filing rules.'
      },
      '22 NYCRR 202.7': {
        title: 'Motion procedures',
        text: 'Establishes procedures for motion practice including page limits, formatting, and timing.',
        deadlines: [
          'Motion papers: 25-page limit unless permission granted',
          'Opposition: 25-page limit',
          'Reply: 10-page limit'
        ],
        notes: 'NY motion practice rules.'
      },
      '22 NYCRR 202.8': {
        title: 'Preliminary conferences',
        text: 'Provides for preliminary conferences in civil cases to establish discovery schedules.',
        notes: 'Case management conference requirements.'
      },
      '22 NYCRR 202.12': {
        title: 'Summary judgment motions',
        text: 'Sets forth procedures for summary judgment motion practice.',
        notes: 'Summary judgment specific rules.'
      }
    },
    
    /**
     * New York County Supreme Court Commercial Division
     */
    nyCommercial: {
      'Rule 1': {
        title: 'Assignment of cases',
        text: 'Commercial cases shall be assigned to the Commercial Division.',
        notes: 'Case assignment rules.'
      },
      'Rule 9': {
        title: 'Preliminary conference',
        text: 'A preliminary conference shall be held within 45 days of filing of request for judicial intervention.',
        deadlines: [
          'Preliminary conference: Within 45 days of RJI',
          'Discovery completion: Set at preliminary conference'
        ],
        notes: 'Commercial Division timing rules.'
      },
      'Rule 13': {
        title: 'Expert disclosure',
        text: 'Requires early expert disclosure in commercial cases.',
        notes: 'Expert witness rules.'
      }
    },
    
    /**
     * Southern District of New York Local Rules
     */
    sdny: {
      'Rule 1.3': {
        title: 'Electronic case filing',
        text: 'All documents must be filed electronically except as otherwise provided.',
        notes: 'SDNY e-filing requirement.'
      },
      'Rule 1.4': {
        title: 'Form of papers',
        text: 'Specifies formatting requirements for all filed documents.',
        notes: 'Document formatting rules.'
      },
      'Rule 37.2': {
        title: 'Discovery disputes',
        text: 'Requires meet and confer before filing discovery motions.',
        notes: 'Discovery dispute procedures.'
      },
      'Rule 56.1': {
        title: 'Statements of material facts',
        text: 'Requires separate statement of undisputed material facts on summary judgment motions.',
        notes: 'Summary judgment local rule.'
      }
    }
  },
  
  // ============== UTILITY FUNCTIONS ==============
  utilities: {
    /**
     * Search statutes by keyword
     */
    searchStatutes(keyword) {
      const results = [];
      const searchText = keyword.toLowerCase();
      
      // Search CPLR
      for (const [articleName, article] of Object.entries(this.cplr)) {
        for (const [sectionId, section] of Object.entries(article.sections)) {
          const text = `${section.title} ${section.text}`.toLowerCase();
          if (text.includes(searchText)) {
            results.push({
              type: 'cplr',
              article: article.title,
              section: sectionId,
              title: section.title,
              text: section.text.substring(0, 200) + '...',
              match: 'cplr'
            });
          }
        }
      }
      
      // Search other statutes
      const otherStatutes = {
        'General Business Law': this.generalBusinessLaw,
        'Civil Rights Law': this.civilRightsLaw,
        'FRCP': this.frcp
      };
      
      for (const [lawName, law] of Object.entries(otherStatutes)) {
        for (const [sectionId, section] of Object.entries(law)) {
          const text = `${section.title} ${section.text}`.toLowerCase();
          if (text.includes(searchText)) {
            results.push({
              type: 'statute',
              law: lawName,
              section: sectionId,
              title: section.title,
              text: section.text.substring(0, 200) + '...',
              match: lawName.toLowerCase()
            });
          }
        }
      }
      
      // Search court rules
      for (const [courtName, court] of Object.entries(this.courtRules)) {
        for (const [ruleId, rule] of Object.entries(court)) {
          const text = `${rule.title} ${rule.text}`.toLowerCase();
          if (text.includes(searchText)) {
            results.push({
              type: 'court_rule',
              court: courtName,
              rule: ruleId,
              title: rule.title,
              text: rule.text.substring(0, 200) + '...',
              match: courtName.toLowerCase()
            });
          }
        }
      }
      
      return results.slice(0, 20); // Limit results
    },
    
    /**
     * Get specific statute by reference
     */
    getStatute(reference) {
      // Check CPLR format: CPLR 203, CPLR §203, etc.
      const cplrMatch = reference.match(/CPLR[\s§]*(\d+)/i);
      if (cplrMatch) {
        const section = cplrMatch[1];
        // Find in CPLR articles
        for (const [articleName, article] of Object.entries(this.cplr)) {
          if (article.sections[`CPLR ${section}`]) {
            return {
              type: 'cplr',
              article: article.title,
              section: `CPLR ${section}`,
              ...article.sections[`CPLR ${section}`]
            };
          }
        }
      }
      
      // Check other statutes
      const statuteMatch = reference.match(/(GBL|CRL|FRCP)[\s§]*(\S+)/i);
      if (statuteMatch) {
        const law = statuteMatch[1].toUpperCase();
        const section = statuteMatch[2];
        
        const laws = {
          'GBL': this.generalBusinessLaw,
          'CRL': this.civilRightsLaw,
          'FRCP': this.frcp
        };
        
        if (laws[law] && laws[law][`${law} ${section}`]) {
          return {
            type: 'statute',
            law,
            section: `${law} ${section}`,
            ...laws[law][`${law} ${section}`]
          };
        }
      }
      
      // Check court rules
      const ruleMatch = reference.match(/(\d+ NYCRR|Rule \d+\.\d+)/i);
      if (ruleMatch) {
        const ruleRef = ruleMatch[1];
        // Search court rules
        for (const [courtName, court] of Object.entries(this.courtRules)) {
          if (court[ruleRef]) {
            return {
              type: 'court_rule',
              court: courtName,
              rule: ruleRef,
              ...court[ruleRef]
            };
          }
        }
      }
      
      return null;
    },
    
    /**
     * Get deadlines for a statute
     */
    getDeadlines(statuteReference) {
      const statute = this.getStatute(statuteReference);
      if (!statute) return null;
      
      const deadlines = statute.deadlines || [];
      
      // Add general CPLR deadlines
      if (statute.type === 'cplr') {
        if (statute.section.includes('CPLR 203')) {
          deadlines.push('Accrual rules vary by cause of action');
          deadlines.push('Tolling may apply for disability, infancy, etc.');
        }
        if (statute.section.includes('CPLR 3212')) {
          deadlines.push('Note deadline for filing: At least 30 days before trial');
          deadlines.push('Response deadline: 30 days unless shortened by court');
        }
      }
      
      return {
        statute: statute.section,
        title: statute.title,
        deadlines
      };
    },
    
    /**
     * Get related statutes
     */
    getRelatedStatutes(statuteReference) {
      const statute = this.getStatute(statuteReference);
      if (!statute) return [];
      
      const related = [];
      
      if (statute.type === 'cplr') {
        const articleMatch = statute.section.match(/CPLR (\d+)/);
        if (articleMatch) {
          const articleNum = parseInt(articleMatch[1]);
          
          // Get other sections in same article
          for (const [articleName, article] of Object.entries(this.cplr)) {
            for (const [sectionId, section] of Object.entries(article.sections)) {
              if (sectionId !== statute.section) {
                related.push({
                  section: sectionId,
                  title: section.title,
                  article: article.title
                });
              }
            }
            break; // Only first matching article
          }
        }
      }
      
      return related.slice(0, 5);
    },
    
    /**
     * Validate legal citation
     */
    validateCitation(citation) {
      const statute = this.getStatute(citation);
      
      if (statute) {
        return {
          valid: true,
          statute: statute.section,
          title: statute.title,
          type: statute.type
        };
      }
      
      // Check if it might be a valid format we don't have
      const patterns = [
        /CPLR[\s§]*\d+/i,
        /GBL[\s§]*\d+/i,
        /CRL[\s§]*\d+/i,
        /FRCP[\s§]*\d+/i,
        /\d+ NYCRR/i,
        /Rule \d+\.\d+/i
      ];
      
      const mightBeValid = patterns.some(pattern => pattern.test(citation));
      
      return {
        valid: false,
        mightBeValid,
        suggestion: mightBeValid ? 'Citation format recognized but not in database' : 'Invalid citation format'
      };
    },
    
    /**
     * Generate statute reference for a legal issue
     */
    suggestStatute(issue) {
      const issueLower = issue.toLowerCase();
      const suggestions = [];
      
      if (issueLower.includes('statute of limitations') || issueLower.includes('time limit')) {
        suggestions.push({
          statute: 'CPLR 203',
          title: 'Method of computing periods of limitation generally',
          relevance: 'High - covers statute of limitations calculations'
        });
      }
      
      if (issueLower.includes('service of process') || issueLower.includes('serve') || issueLower.includes('summons')) {
        suggestions.push({
          statute: 'CPLR 308',
          title: 'Service of summons',
          relevance: 'High - covers methods of service'
        });
      }
      
      if (issueLower.includes('discovery') || issueLower.includes('document production')) {
        suggestions.push({
          statute: 'CPLR 3120',
          title: 'Discovery and production of documents and things',
          relevance: 'High - covers document discovery'
        });
      }
      
      if (issueLower.includes('motion to dismiss')) {
        suggestions.push({
          statute: 'CPLR 3211',
          title: 'Motion to dismiss',
          relevance: 'High - covers motion to dismiss grounds'
        });
      }
      
      if (issueLower.includes('summary judgment')) {
        suggestions.push({
          statute: 'CPLR 3212',
          title: 'Motion for summary judgment',
          relevance: 'High - covers summary judgment procedures'
        });
      }
      
      if (issueLower.includes('consumer') || issueLower.includes('deceptive') || issueLower.includes('advertising')) {
        suggestions.push({
          statute: 'GBL 349',
          title: 'Deceptive acts or practices',
          relevance: 'Medium - consumer protection statute'
        });
      }
      
      return suggestions;
    }
  }
};

// Make utilities available at top level
export const searchStatutes = statutesDatabase.utilities.searchStatutes.bind(statutesDatabase.utilities);
export const getStatute = statutesDatabase.utilities.getStatute.bind(statutesDatabase.utilities);
export const getDeadlines = statutesDatabase.utilities.getDeadlines.bind(statutesDatabase.utilities);
export const getRelatedStatutes = statutesDatabase.utilities.getRelatedStatutes.bind(statutesDatabase.utilities);
export const validateCitation = statutesDatabase.utilities.validateCitation.bind(statutesDatabase.utilities);
export const suggestStatute = statutesDatabase.utilities.suggestStatute.bind(statutesDatabase.utilities);