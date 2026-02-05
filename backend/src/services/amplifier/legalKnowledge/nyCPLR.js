/**
 * New York Civil Practice Law and Rules (CPLR)
 * 
 * Reference: https://codes.findlaw.com/ny/civil-practice-law-and-rules/
 * 
 * This module provides the background agent with knowledge of NY CPLR
 * for litigation matters in New York state courts.
 */

export const NY_CPLR = {
  name: 'New York Civil Practice Law and Rules',
  abbreviation: 'CPLR',
  jurisdiction: 'New York',
  source: 'https://codes.findlaw.com/ny/civil-practice-law-and-rules/',
  lastUpdated: '2024',
  
  /**
   * CPLR Article Structure
   */
  articles: {
    1: { title: 'Short Title; Applicability and Definitions', sections: '101-107' },
    2: { title: 'Limitations of Time', sections: '201-218' },
    3: { title: 'Jurisdiction and Service, Appearance and Choice of Court', sections: '301-328' },
    4: { title: 'Special Proceedings', sections: '401-411' },
    5: { title: 'Venue', sections: '501-513' },
    6: { title: 'Joinder of Claims, Consolidation and Severance', sections: '601-604' },
    7: { title: 'Provisional Remedies', sections: '6001-6515' },
    // Article 7 - uses 6000 series for historical reasons
    8: { title: 'Writs', sections: '801-806' },
    9: { title: 'Class Actions', sections: '901-909' },
    10: { title: 'Parties Generally', sections: '1001-1025' },
    11: { title: 'Poor Persons', sections: '1101-1103' },
    12: { title: 'Infants, Incompetents and Conservatees', sections: '1201-1211' },
    13: { title: 'Actions by the State', sections: '1301-1311' },
    14: { title: 'Contribution', sections: '1401-1411' },
    // Article 14-A: Damage Actions; Effect of Contributory Negligence and Assumption of Risk
    15: { title: 'Actions Against Persons Jointly Liable', sections: '1501-1502' },
    16: { title: 'Limited Liability of Persons Jointly Liable', sections: '1600-1603' },
    20: { title: 'Mistakes, Defects, Irregularities and Extensions of Time', sections: '2001-2006' },
    21: { title: 'Papers', sections: '2101-2106' },
    22: { title: 'Stay, Motions, Orders and Mandates', sections: '2201-2223' },
    23: { title: 'Subpoenas, Oaths and Affirmations', sections: '2301-2310' },
    24: { title: 'Publication', sections: '2401-2402' },
    25: { title: 'Undertakings', sections: '2501-2513' },
    26: { title: 'Property Paid into Court', sections: '2601-2609' },
    27: { title: 'Disposition of Property in Litigation', sections: '2701-2703' },
    30: { title: 'Remedies and Pleading', sections: '3001-3044' },
    31: { title: 'Disclosure', sections: '3101-3140' },
    32: { title: 'Accelerated Judgment', sections: '3201-3222' },
    34: { title: 'Calendar Practice; Trial Preferences', sections: '3401-3408' },
    40: { title: 'Trial Generally', sections: '4001-4017' },
    41: { title: 'Trial by a Jury', sections: '4101-4113' },
    42: { title: 'Trial by the Court', sections: '4201-4213' },
    43: { title: 'Trial by a Referee', sections: '4301-4321' },
    44: { title: 'Trial Motions', sections: '4401-4406' },
    45: { title: 'Evidence', sections: '4501-4549' },
    50: { title: 'Judgments Generally', sections: '5001-5021' },
    // Article 50-A: Periodic Payment of Judgments in Medical/Dental Malpractice Actions
    // Article 50-B: Periodic Payment of Judgments in Personal Injury Actions
    51: { title: 'Enforcement of Judgments and Orders Generally', sections: '5101-5107' },
    52: { title: 'Enforcement of Money Judgments', sections: '5201-5252' },
    53: { title: 'Recognition of Foreign Country Money Judgments', sections: '5301-5309' },
    54: { title: 'Enforcement of Judgments Entitled to Full Faith and Credit', sections: '5401-5408' },
    55: { title: 'Appeals Generally', sections: '5501-5532' },
    56: { title: 'Appeals to the Court of Appeals', sections: '5601-5615' },
    57: { title: 'Appeals to the Appellate Division', sections: '5701-5713' },
    60: { title: 'Provisional Remedies Generally', sections: '6001' },
    61: { title: 'Arrest', sections: '6101-6118' },
    62: { title: 'Attachment', sections: '6201-6226' },
    63: { title: 'Injunction', sections: '6301-6315' },
    64: { title: 'Receivership', sections: '6401-6405' },
    65: { title: 'Notice of Pendency', sections: '6501-6515' },
    70: { title: 'Habeas Corpus', sections: '7001-7012' },
    71: { title: 'Recovery of Chattel', sections: '7101-7112' },
    75: { title: 'Arbitration', sections: '7501-7514' },
    76: { title: 'Proceeding to Enforce Agreement for Determination of Issue', sections: '7601' },
    77: { title: 'Proceeding Relating to Express Trust', sections: '7701-7706' },
    78: { title: 'Proceeding Against Body or Officer', sections: '7801-7806' },
    80: { title: 'Fees', sections: '8001-8022' },
    81: { title: 'Costs Generally', sections: '8101-8110' },
    82: { title: 'Amount of Costs', sections: '8201-8204' },
    83: { title: 'Disbursements and Additional Allowances', sections: '8301-8404' },
    84: { title: 'Taxation of Costs', sections: '8401-8404' },
    85: { title: 'Security for Costs', sections: '8501-8503' },
    86: { title: 'Forms', sections: '101 Form' }
  }
};

/**
 * ARTICLE 2: LIMITATIONS OF TIME (Statute of Limitations)
 * Critical for determining if claims are time-barred
 */
export const CPLR_ARTICLE_2_LIMITATIONS = {
  article: 2,
  title: 'Limitations of Time',
  reference: 'CPLR §§ 201-218',
  
  sections: {
    201: {
      title: 'Application of Limitations',
      summary: 'Actions are governed by the CPLR time limitations, unless a different period is expressly provided by law.'
    },
    
    202: {
      title: 'Cause of Action Accruing Without the State',
      summary: 'When a cause of action accrues outside NY, the shorter of NY\'s limitation period OR the limitation period of the state where it accrued applies.',
      rule: 'Borrowing statute - use shorter limitation period'
    },
    
    203: {
      title: 'Method of Computing Periods of Limitation',
      subsections: {
        a: 'Period computed from accrual to interposition of claim',
        b: 'Claim in complaint is interposed when action is commenced',
        c: 'Claim in amended pleading relates back to original pleading date if same conduct/transaction/occurrence',
        d: 'Claim arising from same transaction as counterclaim/cross-claim relates back',
        e: 'Effect of proceeding in another court - if timely commenced, new action within 6 months of termination is timely',
        f: 'Demand tolls limitation for 30 days (consumer credit)',
        g: 'Defendant must raise statute of limitations as affirmative defense'
      }
    },
    
    204: {
      title: 'Stay of Commencement',
      summary: 'Limitations tolled when commencement is stayed by court order or statutory prohibition.'
    },
    
    205: {
      title: 'Termination of Action (Six-Month Extension)',
      summary: 'If action is timely commenced but terminated without reaching merits (dismissal, voluntary discontinuance, etc.), plaintiff may commence NEW action within 6 MONTHS of termination.',
      rule: '6-MONTH SAVINGS PROVISION',
      important: 'Does not apply to: voluntary discontinuance by stipulation, neglect to prosecute, final judgment on merits'
    },
    
    206: {
      title: 'Interposition of Claim',
      summary: 'A claim is interposed against the defendant when: (1) summons is served, or (2) summons is filed with clerk in expedient service cases.'
    },
    
    207: {
      title: 'Defendant\'s Absence from State',
      summary: 'Time during which defendant is continuously absent from state is NOT computed as part of limitation period.',
      rule: 'Tolling for absence - clock stops when defendant leaves NY'
    },
    
    208: {
      title: 'Infancy, Insanity',
      summary: 'If plaintiff is under disability of infancy or insanity at accrual, action may be commenced within statute period OR within 3 years after disability ceases, whichever is longer.',
      limits: {
        infancy: 'Must sue within 3 years of turning 18',
        maximumExtension: 'Limitation cannot exceed 10 years after accrual (except for infancy in certain actions)'
      }
    },
    
    210: {
      title: 'Defendant\'s Death or Commitment',
      summary: 'If defendant dies or is committed before expiration, plaintiff has 18 months from death/commitment if original period would otherwise expire.'
    },
    
    211: {
      title: 'Actions by State',
      summary: 'Limitations not applicable to actions brought by the State, except tax collection actions.'
    },
    
    212: {
      title: 'Actions to Be Commenced Within 20 Years',
      claims: [
        'Action to recover real property or its possession',
        'Action to foreclose mortgage',
        'Action by state for support/care/maintenance'
      ]
    },
    
    213: {
      title: 'Actions to Be Commenced Within 6 Years',
      claims: [
        'Action on a contract (written or oral)',
        'Action on a sealed instrument',
        'Action on a bond or note',
        'Action by a state agency',
        'Action on a judgment',
        'Action for conversion of chattel',
        'Action for injury to property',
        'Action to recover damages for fraud (from discovery)',
        'Action based on mistake (except personal injury)',
        'Action upon contractual obligation'
      ],
      rule: 'DEFAULT PERIOD FOR CONTRACT ACTIONS = 6 YEARS'
    },
    
    214: {
      title: 'Actions to Be Commenced Within 3 Years',
      claims: [
        'Action to recover chattel (or damages for taking/detaining)',
        'Action to annul marriage on fraud grounds',
        'Action to recover penalty/forfeiture',
        'Action on liability created by statute',
        'ACTION TO RECOVER DAMAGES FOR PERSONAL INJURY',
        'Action to recover damages for malpractice (other than medical)',
        'Action to recover stolen property'
      ],
      rule: 'PERSONAL INJURY = 3 YEARS'
    },
    
    '214-a': {
      title: 'Medical, Dental and Podiatric Malpractice',
      rule: '2 YEARS 6 MONTHS from the act, omission, or failure OR from end of continuous treatment',
      exceptions: [
        'Foreign object: 1 year from discovery or when should have been discovered',
        'Continuous treatment doctrine may extend accrual date'
      ],
      important: 'Shorter than general personal injury'
    },
    
    '214-b': {
      title: 'Action for Damages from Exposure to Substances',
      rule: '3 years from discovery of injury and cause'
    },
    
    '214-c': {
      title: 'Action for Damages from Certain Environmental Torts',
      rule: '3 years from discovery'
    },
    
    '214-g': {
      title: 'Actions for Intentional Torts Against Persons Under 18',
      rule: 'May be commenced within 55 years of the offense',
      applies_to: ['Sexual abuse', 'Incest', 'Use in sexual performance', 'Sex trafficking'],
      important: 'Child Victims Act - extended period for child sexual abuse claims'
    },
    
    215: {
      title: 'Actions to Be Commenced Within 1 Year',
      claims: [
        'Action against sheriff/officer for escape or misconduct',
        'Action for assault, battery, false imprisonment, malicious prosecution, libel, slander',
        'Action under Fair Credit Reporting Act (or 2 years if willful)',
        'Action to recover chattel from town, city, village'
      ],
      rule: 'INTENTIONAL TORTS = 1 YEAR'
    },
    
    217: {
      title: 'Proceedings Against Body or Officer (Article 78)',
      rule: '4 MONTHS from determination becomes final',
      important: 'Very short period for challenging government action'
    },
    
    '217-a': {
      title: 'Proceeding Against Board of Elections',
      rule: '14 days from challenged act'
    },
    
    218: {
      title: 'Effect of Certain Agreements/Contracts',
      summary: 'Limitation period cannot be shortened below 1 year by agreement. Period can be extended by written acknowledgment or part payment.'
    }
  },
  
  quickReference: {
    '20_years': ['Recover real property', 'Foreclose mortgage'],
    '6_years': ['Contract (written/oral)', 'Judgment', 'Fraud (from discovery)', 'Property damage'],
    '3_years': ['PERSONAL INJURY', 'Property damage', 'Statutory liability'],
    '2.5_years': ['Medical/dental malpractice'],
    '1_year': ['Assault', 'Battery', 'Defamation', 'False imprisonment', 'Malicious prosecution'],
    '4_months': ['Article 78 (challenging government action)']
  }
};

/**
 * ARTICLE 3: JURISDICTION AND SERVICE
 * Critical for proper commencement of actions
 */
export const CPLR_ARTICLE_3_JURISDICTION = {
  article: 3,
  title: 'Jurisdiction and Service, Appearance and Choice of Court',
  reference: 'CPLR §§ 301-328',
  
  sections: {
    301: {
      title: 'Jurisdiction Over Persons, Property or Status',
      rule: 'Court obtains personal jurisdiction by service of process OR by defendant\'s consent/appearance.'
    },
    
    302: {
      title: 'Personal Jurisdiction by Acts of Non-Domiciliaries (Long-Arm Statute)',
      summary: 'Court may exercise jurisdiction over non-domiciliary who:',
      bases: {
        'a(1)': 'Transacts any business within the state OR contracts to supply goods/services in the state',
        'a(2)': 'Commits tortious act within the state (except defamation)',
        'a(3)': 'Commits tortious act WITHOUT the state causing injury WITHIN the state, IF: (i) regularly does business in state, (ii) derives substantial revenue from goods/services in state, or (iii) expects/should expect act to have consequences in state AND derives substantial revenue from interstate commerce',
        'a(4)': 'Owns, uses, or possesses real property in the state',
        'a(5)': 'Contracts to insure persons, property, or risks in the state'
      },
      rule: 'LONG-ARM JURISDICTION - Acts creating nexus with NY'
    },
    
    303: {
      title: 'Service of Process',
      summary: 'Personal jurisdiction requires proper service of summons and complaint.'
    },
    
    304: {
      title: 'Method of Commencing Action',
      rule: 'Action commenced by filing summons and complaint (or summons with notice).',
      effective: 'January 1, 1992 - NY became filing jurisdiction (previously serving jurisdiction)'
    },
    
    305: {
      title: 'Summons',
      subsections: {
        a: 'Form of summons - must specify basis of venue',
        b: 'Summons with notice - in lieu of complaint, must state nature of action and relief sought'
      }
    },
    
    306: {
      title: 'Proof of Service',
      subsections: {
        a: 'Proof by affidavit of server',
        b: 'Content: person served, date/time/place of service, manner of service',
        d: 'Proof must be filed with court within 120 days of filing'
      }
    },
    
    '306-a': {
      title: 'Index Number',
      rule: 'Summons must have index number when served.'
    },
    
    '306-b': {
      title: 'Service of Summons',
      rule: 'Summons must be served within 120 DAYS of filing.',
      extension: 'Court may extend upon good cause or interest of justice',
      important: '120-DAY RULE FOR SERVICE'
    },
    
    308: {
      title: 'PERSONAL SERVICE ON NATURAL PERSON',
      methods: {
        1: {
          name: 'Personal Delivery',
          rule: 'Delivering summons to defendant personally',
          best: true
        },
        2: {
          name: 'Substituted Service (Leave and Mail)',
          rule: 'Delivering to person of suitable age/discretion at actual dwelling place + mailing to last known residence OR actual place of business',
          timing: 'Complete 10 days after filing proof of service'
        },
        3: {
          name: 'Delivery to Agent',
          rule: 'Delivering to designated agent for service'
        },
        4: {
          name: 'Nail and Mail (Affixing)',
          rule: 'Affixing to door of dwelling/business + mailing',
          timing: 'Complete 10 days after filing proof',
          requirements: 'Due diligence showing personal/substituted service impracticable'
        },
        5: {
          name: 'Court-Ordered Service',
          rule: 'Any method court directs after showing impracticability of other methods',
          options: 'Can include service by publication, email, etc.'
        }
      },
      important: 'HIERARCHY OF SERVICE METHODS - Must attempt in order (except 3)'
    },
    
    310: {
      title: 'Personal Service on Infant/Incompetent',
      rule: 'Must serve BOTH the individual AND a parent/guardian/committee.'
    },
    
    311: {
      title: 'Personal Service on Corporation',
      methods: [
        'Officer',
        'Director', 
        'Managing or general agent',
        'Cashier or assistant cashier',
        'Secretary of State (if designated agent)',
        'Any agent authorized to receive service'
      ]
    },
    
    '311-a': {
      title: 'Personal Service on LLC',
      methods: [
        'Member',
        'Manager',
        'Secretary of State (if registered agent)',
        'Any agent authorized by operating agreement'
      ]
    },
    
    312: {
      title: 'Personal Service on Partnership',
      methods: [
        'General partner',
        'Managing agent',
        'Any agent authorized to receive service'
      ]
    },
    
    '312-a': {
      title: 'Service by Mail (Acknowledgment Method)',
      rule: 'Service by first class mail with acknowledgment form.',
      complete: 'When acknowledgment returned',
      defense: 'If defendant fails to acknowledge, liable for service costs'
    },
    
    313: {
      title: 'Service Outside State',
      rule: 'Service outside NY same as within state.',
      long_arm: 'Permitted for long-arm jurisdiction under 302'
    },
    
    314: {
      title: 'Service Outside United States',
      methods: [
        'Method prescribed by foreign jurisdiction',
        'Personal delivery (if not prohibited)',
        'Court-ordered method',
        'Hague Convention (if applicable)'
      ]
    },
    
    315: {
      title: 'Service by Publication',
      requirements: [
        'Court order required',
        'Must show service cannot be made by another method',
        'Must make due diligent effort to find defendant'
      ],
      publication: 'Once weekly for 4 consecutive weeks in designated newspaper'
    },
    
    316: {
      title: 'Subsequent Service Upon Party',
      rule: 'After first paper served, subsequent papers may be served on party\'s attorney.'
    },
    
    320: {
      title: 'Defendant\'s Appearance',
      rule: 'Appearance is made by serving answer OR motion OR by appearing at court date.',
      unconditional: 'Appearance waives defects in service unless objection is raised'
    },
    
    321: {
      title: 'Attorneys',
      rule: 'Party may appear by attorney in all civil actions.'
    }
  }
};

/**
 * ARTICLE 31: DISCLOSURE (Discovery)
 * Critical for litigation practice
 */
export const CPLR_ARTICLE_31_DISCLOSURE = {
  article: 31,
  title: 'Disclosure',
  reference: 'CPLR §§ 3101-3140',
  
  overview: 'NY discovery is party-driven. Automatic disclosure requirements + party-initiated discovery.',
  
  sections: {
    3101: {
      title: 'Scope of Disclosure',
      subsections: {
        a: {
          rule: 'Full disclosure of all matter material and necessary in prosecution or defense of action',
          standard: 'Material and necessary = relevant and reasonably calculated to lead to discoverable evidence'
        },
        b: 'Privileged matter not obtainable',
        c: 'Attorney work product: documents prepared in anticipation of litigation protected (qualified)',
        d: {
          rule: 'Trial preparation materials: materials prepared in anticipation of litigation have qualified immunity',
          exception: 'Can be obtained on showing of substantial need and undue hardship'
        },
        h: 'Expert trial witnesses must be disclosed'
      },
      rule: 'BROAD DISCOVERY - Material and necessary standard'
    },
    
    '3101-a': {
      title: 'Automatic Disclosure',
      timing: 'Within 20 days of joinder of issue',
      must_disclose: [
        'Insurance coverage',
        'Names of witnesses with knowledge of material facts',
        'Contact information for witnesses'
      ]
    },
    
    3102: {
      title: 'Method of Obtaining Disclosure',
      methods: {
        a: 'Depositions on oral questions (EBT)',
        b: 'Depositions on written questions',
        c: 'Interrogatories',
        d: 'Demand for address',
        e: 'Discovery and inspection of documents/things',
        f: 'Physical/mental examination'
      }
    },
    
    3103: {
      title: 'Protective Orders',
      grounds: [
        'Prevent unreasonable annoyance',
        'Expense',
        'Embarrassment',
        'Disadvantage',
        'Other prejudice'
      ],
      rule: 'Court may condition discovery or limit/deny it'
    },
    
    3104: {
      title: 'Supervision of Disclosure',
      rule: 'Court may regulate disclosure process to prevent abuse.'
    },
    
    3106: {
      title: 'Priority of Depositions',
      rule: 'After notice period, depositions may proceed in any order.',
      notice: 'At least 20 days notice for deposition'
    },
    
    3107: {
      title: 'Notice of Taking Oral Deposition',
      requirements: [
        'Reasonable notice to all parties',
        'At least 20 days before deposition',
        'Specifies time, place, and witness'
      ]
    },
    
    3110: {
      title: 'Where Depositions May Be Taken',
      locations: [
        'Within NY: any county',
        'Outside NY: any place',
        'Plaintiff: county of residence or employment',
        'Corporate officer: principal office'
      ]
    },
    
    3113: {
      title: 'Conduct of Examination',
      rules: [
        'Examination and cross-examination as at trial',
        'All objections except privilege/form preserved for trial',
        'Objections must be made succinctly (no coaching)',
        'May not instruct witness not to answer except for privilege'
      ]
    },
    
    3115: {
      title: 'Objections at Deposition',
      rule: 'Objections (except privilege/form) need not be raised at deposition - preserved for trial.',
      exception: 'Form objections must be made at deposition or waived'
    },
    
    3116: {
      title: 'Signing Deposition; Physical Preparation',
      timing: '60 days for witness to review and sign changes',
      effect: 'If not signed in 60 days, may be used as if signed'
    },
    
    3117: {
      title: 'Use of Depositions',
      uses: {
        a: 'Impeachment at trial',
        b: 'Admission of party-opponent (party or agent/employee)',
        c: 'Unavailable witness (dead, ill, absent from state, etc.)'
      }
    },
    
    3120: {
      title: 'Discovery and Production of Documents and Things',
      rule: 'Party may serve notice demanding production of documents, things, or entry upon land.',
      timing: 'Response within 20 days (or time court specifies)'
    },
    
    3121: {
      title: 'Physical or Mental Examination',
      requirements: [
        'Condition must be in controversy',
        'Must obtain court order',
        'Must show good cause'
      ],
      rule: 'Not automatic - requires motion and court order'
    },
    
    3122: {
      title: 'Objection to Disclosure, Inspection or Examination',
      timing: 'Objections must be served within 20 days of demand.',
      effect: 'If no objection, must comply'
    },
    
    '3122-a': {
      title: 'Certification of Business Records',
      rule: 'Business records can be authenticated by certification in lieu of live testimony.'
    },
    
    3123: {
      title: 'Compliance with Order',
      penalties: [
        'Preclusion of evidence',
        'Striking pleadings',
        'Default judgment',
        'Contempt'
      ]
    },
    
    3124: {
      title: 'Failure to Disclose',
      rule: 'Party seeking disclosure may move to compel.',
      costs: 'Prevailing party entitled to costs and fees'
    },
    
    3126: {
      title: 'Penalties for Refusal to Comply',
      penalties: [
        'Issues may be resolved against non-compliant party',
        'Preclude evidence',
        'Strike pleadings',
        'Stay action until compliance',
        'Dismissal',
        'Default judgment'
      ],
      rule: 'SEVERE PENALTIES for discovery abuse'
    },
    
    3130: {
      title: 'Use of Interrogatories',
      rule: 'Limited to 25 interrogatories (including subparts).',
      timing: 'Answers due within 20 days'
    },
    
    3131: {
      title: 'Scope of Interrogatories',
      rule: 'May relate to any matter within scope of 3101.',
      limit: '25 interrogatories, court can modify'
    },
    
    3132: {
      title: 'Service of Interrogatories',
      timing: 'After commencement of action, any time with notice.'
    },
    
    3133: {
      title: 'Answers to Interrogatories',
      requirements: [
        'Answer separately under oath',
        'Within 20 days',
        'State with reasonable particularity grounds for any objection'
      ]
    },
    
    3140: {
      title: 'Disclosure of Expert Intended to Be Called at Trial',
      rule: 'Upon demand, must provide name and address of expert and substance of expected testimony.',
      timing: 'Response within 20 days'
    }
  },
  
  timingQuickReference: {
    'Automatic disclosure': '20 days after joinder of issue',
    'Deposition notice': '20 days before deposition',
    'Document demand response': '20 days',
    'Interrogatory answers': '20 days',
    'Objections to demands': '20 days',
    'Expert disclosure': '20 days after demand',
    'Deposition signature': '60 days'
  }
};

/**
 * ARTICLE 32: ACCELERATED JUDGMENT
 * Motions to Dismiss and Summary Judgment
 */
export const CPLR_ARTICLE_32_JUDGMENT = {
  article: 32,
  title: 'Accelerated Judgment',
  reference: 'CPLR §§ 3201-3222',
  
  sections: {
    3211: {
      title: 'MOTION TO DISMISS',
      grounds: {
        'a(1)': 'Defense founded on documentary evidence',
        'a(2)': 'Lack of subject matter jurisdiction',
        'a(3)': 'Lack of capacity to sue',
        'a(4)': 'Another action pending between same parties on same cause',
        'a(5)': 'Cause of action may not be maintained because of arbitration agreement, discharge in bankruptcy, infancy, etc.',
        'a(6)': 'With respect to counterclaim, that it may not be interposed',
        'a(7)': 'FAILURE TO STATE A CAUSE OF ACTION',
        'a(8)': 'Lack of personal jurisdiction',
        'a(9)': 'Release, payment, res judicata, statute of limitations',
        'a(10)': 'Statute of frauds',
        'a(11)': 'Defendant not licensee required by law to be licensed'
      },
      timing: {
        rule: 'Must move within 60 days of answer',
        exception: 'Jurisdiction defenses waived if not raised in first responsive pleading or motion'
      },
      waiver: {
        'a(8)': 'Personal jurisdiction waived if not raised in answer or pre-answer motion',
        preserved: 'Subject matter jurisdiction (a(2)), failure to state cause (a(7)) never waived'
      },
      conversion: 'Court may convert to summary judgment if extrinsic evidence submitted',
      important: 'MOST COMMON PRE-ANSWER MOTION'
    },
    
    3212: {
      title: 'SUMMARY JUDGMENT',
      subsections: {
        a: {
          rule: 'Any party may move for summary judgment after joinder of issue',
          timing: 'Must move no later than 120 days after note of issue filed',
          effect: 'Delayed motions may be denied or deemed untimely'
        },
        b: {
          rule: 'Motion shall show there is no genuine issue of material fact and movant is entitled to judgment as a matter of law.',
          burden: 'Movant must make prima facie showing; then burden shifts to opponent to raise triable issue of fact'
        },
        c: {
          rule: 'Immediate trial of issue of fact',
          effect: 'Court may order immediate trial if facts not in dispute'
        },
        e: {
          rule: 'Partial summary judgment - court may grant partial summary judgment',
          effect: 'Narrows issues for trial'
        },
        f: {
          rule: 'Search the record - court may search record and grant summary judgment to non-moving party',
          important: 'Even without cross-motion'
        },
        g: {
          rule: 'If facts unavailable to opponent, court may deny motion or order continuance for discovery'
        }
      },
      standard: 'NO GENUINE ISSUE OF MATERIAL FACT',
      important: 'MAIN DISPOSITIVE MOTION'
    },
    
    3213: {
      title: 'Motion for Summary Judgment in Lieu of Complaint',
      applies: 'Actions based on instrument for payment of money only',
      rule: 'Can move immediately without complaint',
      effect: 'Expedited procedure for clear cases'
    },
    
    3215: {
      title: 'Default Judgment',
      rule: 'If defendant fails to appear or answer, plaintiff may enter default judgment.',
      requirements: [
        'Proof of service',
        'Proof of facts (affidavit or otherwise)',
        'Default must not be vacated'
      ],
      timing: 'Application within 1 year of default or default is deemed vacated'
    },
    
    3216: {
      title: 'Want of Prosecution (90-Day Notice)',
      rule: 'If no proceeding for 1 year, party may serve 90-day demand.',
      effect: 'If no action within 90 days, action may be dismissed',
      important: 'DISMISSAL FOR FAILURE TO PROSECUTE'
    },
    
    3217: {
      title: 'Voluntary Discontinuance',
      methods: {
        a: 'Without court order - by stipulation or by notice before answer or motion for summary judgment',
        b: 'By court order - any time on terms court deems proper',
        c: 'Plaintiff may discontinue only once without prejudice'
      }
    },
    
    3218: {
      title: 'Confession of Judgment',
      rule: 'Defendant may confess judgment by verified statement.',
      requirements: 'Must state facts from which liability arises'
    },
    
    3219: {
      title: 'Tender (Offer to Pay)',
      effect: 'If defendant tenders what is actually owed, plaintiff cannot recover costs from that point'
    },
    
    3220: {
      title: 'Offer to Compromise (Settlement Offer)',
      rule: 'Defendant may make written offer to compromise.',
      effect: 'If not accepted and plaintiff fails to obtain more favorable judgment, plaintiff pays defendant\'s costs from time of offer',
      important: 'SHIFTS COSTS if offer not beaten'
    },
    
    3222: {
      title: 'Offer to Liquidate Damages',
      rule: 'Party may accept liability but dispute damages.',
      effect: 'Limits trial to damages issue only'
    }
  },
  
  timingQuickReference: {
    'Pre-answer motion to dismiss': '60 days after answer deadline (or in answer)',
    'Summary judgment': '120 days after note of issue',
    'Default judgment application': 'Within 1 year of default',
    '90-day demand to prosecute': 'After 1 year of inaction'
  }
};

/**
 * COMMON TIME COMPUTATIONS
 * How to count days under CPLR
 */
export const CPLR_TIME_COMPUTATION = {
  reference: 'CPLR § 2103, General Construction Law § 25',
  
  rules: {
    generalRule: {
      rule: 'Exclude day from which time starts; include last day',
      example: 'If served Monday, count starts Tuesday'
    },
    
    lastDayRule: {
      rule: 'If last day falls on Saturday, Sunday, or public holiday, period extends to next business day'
    },
    
    shortPeriods: {
      rule: 'For periods of 11 days or less, exclude Saturdays, Sundays, and public holidays',
      example: '10-day period excludes weekends'
    },
    
    serviceByMail: {
      rule: 'Add 5 days to any period when paper served by mail within NY',
      example: '20 days to respond becomes 25 days if served by mail'
    },
    
    serviceByOvernight: {
      rule: 'Add 1 day for overnight delivery service'
    },
    
    serviceByElectronic: {
      rule: 'If consent to e-service, same day (no additional days)'
    }
  },
  
  commonCalculations: {
    'Answer to complaint': {
      personal_service: '20 days',
      mail_service: '25 days (20 + 5 mail)',
      service_outside_NY: '30 days'
    },
    'Reply to counterclaim': '20 days',
    'Discovery response': '20 days (25 by mail)',
    'Summary judgment': '120 days after note of issue',
    'Appeal (appellate division)': '30 days from service of judgment with notice of entry',
    'Appeal (Court of Appeals)': '30 days from service of order with notice of entry'
  }
};

/**
 * KEY CPLR DEADLINES QUICK REFERENCE
 */
export const CPLR_DEADLINES_QUICK_REFERENCE = {
  serviceTiming: {
    'Service of summons': '120 days from filing (CPLR 306-b)',
    'Substituted/nail-mail complete': '10 days after filing proof of service'
  },
  
  responsive_pleadings: {
    'Answer - personal service': '20 days from service',
    'Answer - mail service': '25 days from service',
    'Answer - outside NY': '30 days from service',
    'Reply to counterclaim': '20 days'
  },
  
  motions: {
    'Pre-answer motion to dismiss': 'Within 60 days of answer deadline',
    'Summary judgment': 'Within 120 days of note of issue',
    'Motion for leave to amend': 'Any time before trial (liberally granted)',
    'Motion to compel': 'Any time after discovery deadline'
  },
  
  discovery: {
    'Automatic disclosure': '20 days after joinder of issue',
    'Deposition notice': '20 days before deposition',
    'Document demand response': '20 days (25 by mail)',
    'Interrogatory answers': '20 days (25 by mail)',
    'Objections': '20 days (25 by mail)',
    'Expert disclosure': '20 days after demand',
    'Deposition signature': '60 days'
  },
  
  trial_related: {
    'Note of issue': 'After discovery complete',
    'Certificate of readiness': 'With note of issue',
    'Calendar call': 'Per court\'s schedule',
    'Trial readiness': 'As directed by court'
  },
  
  post_judgment: {
    'Motion to vacate default': 'Within 1 year (CPLR 5015)',
    'Motion to renew/reargue': 'Reasonable time',
    'Appeal to Appellate Division': '30 days from service with notice of entry',
    'Appeal to Court of Appeals': '30 days from service with notice of entry',
    'Enforcement of judgment': '20 years (CPLR 211)'
  },
  
  statute_of_limitations: {
    'Contract (written/oral)': '6 years',
    'Personal injury': '3 years',
    'Medical malpractice': '2.5 years',
    'Intentional torts': '1 year',
    'Property damage': '3 years',
    'Article 78 proceeding': '4 months',
    'Mortgage foreclosure': '6 years from default/acceleration'
  }
};

/**
 * Get relevant CPLR provisions based on matter type or action
 */
export function getCPLRGuidanceForMatter(matterType, matterDescription = '') {
  const guidance = {
    relevantArticles: [],
    keyDeadlines: [],
    commonMotions: [],
    discoveryNotes: [],
    warnings: []
  };
  
  const description = (matterDescription || '').toLowerCase();
  const type = (matterType || '').toLowerCase();
  
  // Personal injury
  if (type.includes('personal injury') || type.includes('pi') || 
      description.includes('injury') || description.includes('accident') ||
      description.includes('negligence') || description.includes('slip') ||
      description.includes('fall') || description.includes('car accident')) {
    guidance.relevantArticles.push('Article 2 (Limitations)', 'Article 14-A (Comparative Negligence)');
    guidance.keyDeadlines.push({
      name: 'Statute of Limitations',
      period: '3 years from date of injury',
      citation: 'CPLR § 214(5)'
    });
    guidance.warnings.push('CHECK FOR NOTICE OF CLAIM REQUIREMENT if defendant is municipality (90 days)');
    guidance.discoveryNotes.push('Demand authorizations for medical records', 'Physical examination under CPLR 3121');
  }
  
  // Medical malpractice
  if (type.includes('medical') || type.includes('malpractice') ||
      description.includes('doctor') || description.includes('hospital') ||
      description.includes('surgery') || description.includes('misdiagnosis')) {
    guidance.relevantArticles.push('Article 2 (Limitations)', 'CPLR 214-a (Med Mal)');
    guidance.keyDeadlines.push({
      name: 'Statute of Limitations',
      period: '2 years 6 months from act/omission or end of continuous treatment',
      citation: 'CPLR § 214-a'
    });
    guidance.warnings.push(
      'SHORTER THAN REGULAR PI - 2.5 years, not 3 years',
      'Certificate of merit required (CPLR 3012-a)',
      'Foreign object discovery rule may extend limitations'
    );
  }
  
  // Contract
  if (type.includes('contract') || type.includes('breach') ||
      description.includes('contract') || description.includes('agreement') ||
      description.includes('breach') || description.includes('payment')) {
    guidance.relevantArticles.push('Article 2 (Limitations)', 'Article 30 (Remedies)');
    guidance.keyDeadlines.push({
      name: 'Statute of Limitations',
      period: '6 years from breach',
      citation: 'CPLR § 213(2)'
    });
    guidance.commonMotions.push('Summary judgment on instrument (CPLR 3213) if clear terms');
  }
  
  // Defamation
  if (type.includes('defamation') || description.includes('libel') || 
      description.includes('slander') || description.includes('defamation')) {
    guidance.relevantArticles.push('Article 2 (Limitations)');
    guidance.keyDeadlines.push({
      name: 'Statute of Limitations',
      period: '1 year from publication',
      citation: 'CPLR § 215(3)'
    });
    guidance.warnings.push('VERY SHORT - 1 year limitation period');
  }
  
  // Real property / Foreclosure
  if (type.includes('real property') || type.includes('foreclosure') ||
      description.includes('property') || description.includes('mortgage') ||
      description.includes('foreclosure') || description.includes('deed')) {
    guidance.relevantArticles.push('Article 2 (Limitations)', 'RPAPL Article 13');
    guidance.keyDeadlines.push({
      name: 'Foreclosure Limitations',
      period: '6 years from default/acceleration',
      citation: 'CPLR § 213(4)'
    });
  }
  
  // Government/Article 78
  if (type.includes('article 78') || type.includes('government') ||
      description.includes('government') || description.includes('agency') ||
      description.includes('administrative') || description.includes('city') ||
      description.includes('state')) {
    guidance.relevantArticles.push('Article 78 (Proceeding Against Body or Officer)');
    guidance.keyDeadlines.push({
      name: 'Article 78 Limitations',
      period: '4 months from final determination',
      citation: 'CPLR § 217'
    });
    guidance.warnings.push('VERY SHORT - Only 4 months to challenge government action');
  }
  
  // Discovery-intensive
  if (type.includes('litigation') || type.includes('civil') ||
      description.includes('discovery') || description.includes('deposition')) {
    guidance.relevantArticles.push('Article 31 (Disclosure)');
    guidance.discoveryNotes.push(
      'Automatic disclosure within 20 days of joinder',
      '25 interrogatory limit (CPLR 3130)',
      '20 days to respond to demands (add 5 for mail)',
      'Expert disclosure required (CPLR 3101(d))'
    );
  }
  
  // Default guidance
  guidance.commonMotions.push(
    'Motion to dismiss (CPLR 3211)',
    'Motion for summary judgment (CPLR 3212)',
    'Motion to compel discovery (CPLR 3124)'
  );
  
  return guidance;
}

/**
 * Format CPLR citation properly
 */
export function formatCPLRCitation(section) {
  if (!section) return '';
  const sectionStr = String(section).replace('§', '').trim();
  return `CPLR § ${sectionStr}`;
}

/**
 * Get full CPLR context for system prompt
 */
export function getCPLRContextForPrompt() {
  return `
## NEW YORK CIVIL PRACTICE LAW AND RULES (CPLR) REFERENCE

You have access to the NY CPLR for litigation matters in New York courts.

### KEY STATUTES OF LIMITATIONS (CPLR Article 2)
| Claim Type | Period | Citation |
|------------|--------|----------|
| Contract (written or oral) | 6 years | CPLR § 213(2) |
| Personal injury | 3 years | CPLR § 214(5) |
| Medical malpractice | 2.5 years | CPLR § 214-a |
| Property damage | 3 years | CPLR § 214(4) |
| Intentional torts (assault, battery, defamation) | 1 year | CPLR § 215 |
| Article 78 (challenge government action) | 4 months | CPLR § 217 |
| Fraud | 6 years from commission or 2 years from discovery | CPLR § 213(8) |
| Child sexual abuse | 55 years | CPLR § 214-g |

### SAVINGS PROVISIONS
- **CPLR § 205**: If action dismissed (not on merits), new action within 6 months is timely
- **CPLR § 203(c)**: Amended pleading relates back if same transaction/occurrence
- **CPLR § 207**: Tolling when defendant absent from state

### SERVICE OF PROCESS (CPLR Article 3)
- **CPLR § 306-b**: Summons must be served within 120 DAYS of filing
- **CPLR § 308**: Personal service methods (in order of preference):
  1. Personal delivery to defendant
  2. Leave and mail (substituted service) - complete in 10 days
  3. Nail and mail (with due diligence showing)
  4. Court-ordered service

### TIME TO ANSWER
- Personal service in NY: 20 days
- Mail service in NY: 25 days (20 + 5 for mail)
- Service outside NY: 30 days

### DISCOVERY DEADLINES (CPLR Article 31)
- Automatic disclosure: 20 days after joinder of issue
- Response to demands: 20 days (25 by mail)
- Deposition notice: 20 days before
- Interrogatories: Limited to 25; answers due in 20 days
- Expert disclosure: 20 days after demand

### KEY MOTIONS
- **CPLR § 3211**: Motion to dismiss (must move within 60 days of answer deadline)
- **CPLR § 3212**: Summary judgment (must move within 120 days of note of issue)
- **CPLR § 3216**: 90-day demand for failure to prosecute

### TIME COMPUTATION
- Exclude first day, include last day
- If last day is weekend/holiday, extends to next business day
- For periods of 11 days or less, exclude weekends/holidays
- Add 5 days for mail service in NY

### ALWAYS CITE CPLR
When creating legal documents, notes, or analysis involving NY litigation:
- Cite specific CPLR sections (e.g., "CPLR § 214(5)")
- Include deadline calculations
- Note any special rules that apply
`;
}

export default {
  NY_CPLR,
  CPLR_ARTICLE_2_LIMITATIONS,
  CPLR_ARTICLE_3_JURISDICTION,
  CPLR_ARTICLE_31_DISCLOSURE,
  CPLR_ARTICLE_32_JUDGMENT,
  CPLR_TIME_COMPUTATION,
  CPLR_DEADLINES_QUICK_REFERENCE,
  getCPLRGuidanceForMatter,
  formatCPLRCitation,
  getCPLRContextForPrompt
};
