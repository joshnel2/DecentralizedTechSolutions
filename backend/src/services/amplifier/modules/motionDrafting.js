/**
 * Motion Drafting Module
 * 
 * Guides the junior attorney agent through drafting a motion
 * with supporting memorandum of law using IRAC analysis.
 * 
 * Supports all common motion types:
 * - Motion to Dismiss (12(b)(6) / CPLR 3211)
 * - Motion for Summary Judgment (Rule 56 / CPLR 3212)
 * - Motion to Compel Discovery
 * - Motion for Preliminary Injunction
 * - Motion in Limine
 * - General motions
 */

export const motionDraftingModule = {
  metadata: {
    name: 'Motion Drafting',
    description: 'Draft a motion with supporting memorandum of law using IRAC analysis',
    category: 'litigation',
    estimatedMinutes: 15,
    complexity: 'high',
    tags: ['litigation', 'motion', 'brief', 'drafting', 'IRAC', 'junior-attorney'],
  },
  
  requiredContext: ['matterId'],
  optionalContext: ['motionType', 'jurisdiction', 'deadline'],
  
  executionPlan: [
    {
      name: 'Review Matter and Pleadings',
      description: 'Load matter details and review existing pleadings and filings',
      tools: ['get_matter', 'list_documents', 'read_document_content'],
      required: true,
    },
    {
      name: 'Research Applicable Law',
      description: 'Identify the legal standard, controlling statutes, and case authority',
      tools: ['search_document_content', 'lookup_cplr'],
      required: true,
    },
    {
      name: 'Plan Motion Structure',
      description: 'Outline the motion arguments using IRAC methodology',
      tools: ['think_and_plan', 'add_matter_note'],
      required: true,
    },
    {
      name: 'Draft Notice of Motion',
      description: 'Draft the notice of motion with caption and relief sought',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Draft Memorandum of Law',
      description: 'Draft the supporting memorandum with IRAC analysis',
      tools: ['create_document'],
      required: true,
    },
    {
      name: 'Draft Supporting Declaration',
      description: 'Draft affidavit/declaration with supporting facts',
      tools: ['create_document'],
      required: false,
    },
    {
      name: 'Create Follow-up Tasks',
      description: 'Tasks for partner review, filing, and service',
      tools: ['create_task', 'create_calendar_event'],
      required: true,
    },
  ],
  
  qualityGates: [
    {
      metric: 'documents_read',
      minValue: 2,
      description: 'At least two matter documents reviewed (pleadings, contracts, etc.)',
    },
    {
      metric: 'notes_created',
      minValue: 1,
      description: 'Research notes documenting legal analysis',
    },
    {
      metric: 'documents_created',
      minValue: 2,
      description: 'Notice of Motion and Memorandum of Law created',
    },
    {
      metric: 'tasks_created',
      minValue: 2,
      description: 'Review task for partner and filing/service tasks',
    },
  ],
  
  expectedOutputs: [
    'Notice of Motion with proper caption',
    'Memorandum of Law with IRAC analysis (800+ words)',
    'Supporting declaration/affidavit (if applicable)',
    'Research notes with citations',
    'Partner review task',
    'Filing deadline calendar event',
  ],
  
  instructions: `
## MOTION DRAFTING WORKFLOW — JUNIOR ATTORNEY

You are drafting a motion as a junior associate attorney. Your work will be reviewed
by a supervising partner before filing. Every citation must be verified or marked
[UNVERIFIED]. Every argument must follow IRAC methodology.

### PHASE 1: PREPARATION (Discovery Phase)

1. Use \`get_matter\` to understand the case posture
2. Use \`list_documents\` to identify all relevant filings
3. Use \`read_document_content\` on:
   - The complaint/petition
   - The answer/responsive pleading
   - Any prior motions or court orders
   - Relevant contracts or agreements
   - Key correspondence
4. Note the procedural posture: What stage is the case in?

### PHASE 2: LEGAL RESEARCH (Analysis Phase)

1. Identify the type of motion and applicable standard:
   - **Motion to Dismiss:** Legal insufficiency of pleading (CPLR 3211 / Rule 12(b)(6))
   - **Summary Judgment:** No genuine dispute of material fact (CPLR 3212 / Rule 56)
   - **Motion to Compel:** Discovery obligation not met (CPLR 3124 / Rule 37)
   - **Preliminary Injunction:** Likelihood of success + irreparable harm (CPLR 6301 / Rule 65)
   - **Motion in Limine:** Exclude prejudicial/inadmissible evidence (FRE 403)

2. Research governing law:
   - Use \`lookup_cplr\` for NY-specific rules
   - Identify the standard of review
   - Find controlling case authority
   - Note burden of proof allocation

3. Create research note with \`add_matter_note\`:
   - Standard of review
   - Key authorities
   - Elements/factors to address
   - Opposing party's likely counterarguments

### PHASE 3: DRAFTING (Action Phase)

#### NOTICE OF MOTION
Create document with \`create_document\`:

\`\`\`
[COURT NAME]
[COUNTY]

---

[PLAINTIFF(S)]                    Index No.: [NUMBER]
                                  
    v.                           NOTICE OF MOTION
                                  
[DEFENDANT(S)]                    

---

PLEASE TAKE NOTICE that upon the [accompanying memorandum of law / 
affidavit of ___], the undersigned will move this Court at [location], 
on [date] at [time], or as soon thereafter as counsel may be heard, 
for an order:

1. [Specific relief sought]
2. [Additional relief]
3. Granting such other and further relief as this Court deems just and proper.

Dated: [City, State]
       [Date]

                                  [FIRM NAME]
                                  Attorneys for [Party]
                                  
                                  By: _________________________
                                  [Attorney Name]
                                  [Address]
                                  [Phone]
                                  [Email]
\`\`\`

#### MEMORANDUM OF LAW
Create document with \`create_document\` (MINIMUM 800 words):

\`\`\`
MEMORANDUM OF LAW IN SUPPORT OF [MOTION TYPE]

I. PRELIMINARY STATEMENT
[2-3 paragraphs introducing the case and motion; state the relief sought]

II. STATEMENT OF FACTS
[Chronological recitation of relevant facts from the record;
cite to specific documents, depositions, or admissions]

III. LEGAL STANDARD
[State the applicable legal standard with citations;
explain the burden of proof]

IV. ARGUMENT

A. [First Point Heading — State the Conclusion as a Complete Sentence]

   ISSUE: [Precise legal question]
   
   RULE: [Governing law with pinpoint citations]
   [Quote key statutory/case language]
   
   APPLICATION: [Apply the rule to the specific facts of this case]
   [Reference specific evidence from the record]
   [Distinguish unfavorable authority if needed]
   
   CONCLUSION: [Specific conclusion on this point]

B. [Second Point Heading]
   [IRAC analysis...]

C. [Additional Points as Needed]
   [IRAC analysis...]

V. CONCLUSION

For the foregoing reasons, [Party] respectfully requests that this Court 
grant the motion and [specific relief].

Dated: [Date]
       [City, State]

                                  Respectfully submitted,
                                  
                                  [FIRM NAME]
                                  By: _________________________
                                  [Attorney Name]
\`\`\`

### PHASE 4: REVIEW AND FOLLOW-UP

1. Create tasks with \`create_task\`:
   - "Partner review: [Motion Type] draft - URGENT"
   - "File [Motion Type] after partner approval"
   - "Serve [Motion Type] on opposing counsel"
   - "Prepare for oral argument on [Motion Type]"

2. Create calendar events with \`create_calendar_event\`:
   - Filing deadline
   - Response deadline (for opposing party)
   - Hearing date (if known)
   - Internal review deadline (5 business days before filing)

### CITATION INTEGRITY RULES
- Use \`lookup_cplr\` for NY statutes — these are VERIFIED
- Mark all case citations as [UNVERIFIED - VERIFY BEFORE FILING]
- Never fabricate case names, reporter citations, or holdings
- If you cannot find specific authority, state the general principle and note "further research recommended"
- Always include pinpoint citations (specific page numbers)

### COMMON MISTAKES TO AVOID
- Writing generic legal analysis not tied to the specific facts
- Missing the standard of review
- Not addressing the opposing party's likely arguments
- Forgetting the prayer for relief
- Using placeholder text instead of real content
- Not checking local rules for page limits and formatting
`,
};
