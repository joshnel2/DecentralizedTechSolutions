-- Enhanced Attorney-Specific Workflow Templates
-- These workflows are designed for common legal practice scenarios

-- 1. Litigation Case Opening Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Open Litigation Matter',
  'Complete workflow for opening a new litigation case including conflict check, engagement, and initial case assessment',
  ARRAY['new lawsuit', 'new litigation', 'open case', 'new case', 'file suit', 'start litigation', 'incoming lawsuit'],
  '[
    {"action": "list_clients", "description": "Check for existing client or conflicts"},
    {"action": "create_client", "description": "Create client record if new"},
    {"action": "create_matter", "params": {"type": "litigation"}, "description": "Create litigation matter"},
    {"action": "create_document", "params": {"template": "engagement_letter"}, "description": "Draft engagement letter"},
    {"action": "create_document", "params": {"template": "conflict_waiver"}, "description": "Draft conflict waiver if needed"},
    {"action": "create_task", "params": {"title": "Review case documents", "priority": "high"}, "description": "Task to review provided documents"},
    {"action": "create_task", "params": {"title": "Identify statute of limitations", "priority": "urgent"}, "description": "Critical deadline identification"},
    {"action": "create_task", "params": {"title": "Draft initial case assessment memo"}, "description": "Internal case evaluation"},
    {"action": "create_calendar_event", "params": {"type": "meeting"}, "description": "Schedule initial client meeting"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Open Litigation Matter'
);

-- 2. Respond to Lawsuit Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Respond to Lawsuit',
  'Workflow for responding to a complaint or summons within deadline',
  ARRAY['respond to lawsuit', 'answer complaint', 'got served', 'summons received', 'defendant case', 'responding to suit'],
  '[
    {"action": "create_matter", "params": {"type": "litigation", "priority": "urgent"}, "description": "Create matter for defense"},
    {"action": "create_calendar_event", "params": {"type": "deadline", "title": "Answer Due Date"}, "description": "Calculate and set answer deadline (typically 20-30 days)"},
    {"action": "create_task", "params": {"title": "Review complaint allegations", "priority": "urgent"}, "description": "Analyze each claim"},
    {"action": "create_task", "params": {"title": "Identify affirmative defenses"}, "description": "Research applicable defenses"},
    {"action": "create_task", "params": {"title": "Draft Answer or Motion to Dismiss"}, "description": "Prepare responsive pleading"},
    {"action": "create_task", "params": {"title": "Evaluate counterclaim potential"}, "description": "Consider offensive claims"},
    {"action": "log_time", "description": "Log time for initial case review"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Respond to Lawsuit'
);

-- 3. Discovery Management Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Manage Discovery',
  'Organize and track discovery requests, responses, and deadlines',
  ARRAY['discovery', 'interrogatories', 'document requests', 'RFP', 'RFA', 'discovery responses', 'propound discovery'],
  '[
    {"action": "get_matter", "description": "Get current matter details and discovery status"},
    {"action": "create_task", "params": {"title": "Draft discovery requests"}, "description": "Prepare interrogatories, RFPs, RFAs"},
    {"action": "create_calendar_event", "params": {"type": "deadline", "title": "Discovery Response Due"}, "description": "Track response deadlines (typically 30 days)"},
    {"action": "create_task", "params": {"title": "Review opposing discovery responses"}, "description": "Analyze responses for deficiencies"},
    {"action": "create_task", "params": {"title": "Prepare meet and confer letter if needed"}, "description": "Address discovery disputes"},
    {"action": "create_document", "params": {"template": "discovery_index"}, "description": "Create discovery tracking document"},
    {"action": "log_time", "description": "Log discovery work time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Manage Discovery'
);

-- 4. Deposition Preparation Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Prepare for Deposition',
  'Complete preparation for taking or defending a deposition',
  ARRAY['deposition prep', 'prepare deposition', 'depo prep', 'schedule deposition', 'deposition outline'],
  '[
    {"action": "get_matter", "description": "Review case background and key issues"},
    {"action": "search_document_content", "description": "Search for relevant documents to use as exhibits"},
    {"action": "create_document", "params": {"template": "deposition_outline"}, "description": "Create deposition outline/question list"},
    {"action": "create_task", "params": {"title": "Prepare exhibit binders"}, "description": "Organize documents for deposition"},
    {"action": "create_task", "params": {"title": "Send deposition notice"}, "description": "Formal notice to opposing counsel"},
    {"action": "create_calendar_event", "params": {"type": "deposition"}, "description": "Schedule deposition on calendar"},
    {"action": "create_task", "params": {"title": "Arrange court reporter"}, "description": "Book certified court reporter"},
    {"action": "create_task", "params": {"title": "Reserve conference room"}, "description": "Book location if needed"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Prepare for Deposition'
);

-- 5. Motion Practice Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'File Motion',
  'Prepare and file a motion with the court',
  ARRAY['file motion', 'motion to', 'summary judgment', 'motion to dismiss', 'motion to compel', 'prepare motion'],
  '[
    {"action": "get_matter", "description": "Get matter and court information"},
    {"action": "create_document", "params": {"template": "motion"}, "description": "Draft motion and memorandum of law"},
    {"action": "create_document", "params": {"template": "proposed_order"}, "description": "Draft proposed order"},
    {"action": "create_task", "params": {"title": "Compile supporting exhibits"}, "description": "Gather evidence and declarations"},
    {"action": "create_task", "params": {"title": "File with court"}, "description": "E-file or physical filing"},
    {"action": "create_task", "params": {"title": "Serve opposing counsel"}, "description": "Proof of service required"},
    {"action": "create_calendar_event", "params": {"type": "deadline", "title": "Opposition Due"}, "description": "Track response deadline"},
    {"action": "create_calendar_event", "params": {"type": "court_date", "title": "Motion Hearing"}, "description": "Schedule hearing date"},
    {"action": "log_time", "description": "Log motion drafting time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'File Motion'
);

-- 6. Settlement Negotiation Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Settlement Negotiation',
  'Manage settlement discussions and documentation',
  ARRAY['settlement', 'settle case', 'demand letter', 'settlement offer', 'negotiate settlement', 'mediation prep'],
  '[
    {"action": "get_matter", "description": "Review case value and exposure"},
    {"action": "create_document", "params": {"template": "demand_letter"}, "description": "Draft demand letter with damages calculation"},
    {"action": "create_task", "params": {"title": "Prepare settlement brochure"}, "description": "Compile supporting documentation"},
    {"action": "create_task", "params": {"title": "Review insurance coverage"}, "description": "Identify applicable policies"},
    {"action": "create_calendar_event", "params": {"type": "meeting", "title": "Settlement Conference"}, "description": "Schedule negotiation meeting"},
    {"action": "create_document", "params": {"template": "settlement_agreement"}, "description": "Draft settlement agreement when reached"},
    {"action": "create_task", "params": {"title": "Prepare release and dismissal"}, "description": "Final settlement documents"},
    {"action": "log_time", "description": "Log negotiation time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Settlement Negotiation'
);

-- 7. Corporate Transaction Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Corporate Transaction',
  'Handle M&A, stock purchase, or asset acquisition',
  ARRAY['merger', 'acquisition', 'M&A', 'buy company', 'sell company', 'stock purchase', 'asset purchase', 'corporate transaction'],
  '[
    {"action": "create_matter", "params": {"type": "corporate", "billing_type": "hourly"}, "description": "Create transaction matter"},
    {"action": "create_document", "params": {"template": "engagement_letter"}, "description": "Transaction engagement letter"},
    {"action": "create_task", "params": {"title": "Prepare due diligence checklist"}, "description": "List all items to review"},
    {"action": "create_task", "params": {"title": "Draft/review LOI or term sheet"}, "description": "Initial transaction terms"},
    {"action": "create_task", "params": {"title": "Conduct due diligence"}, "description": "Review target company documents"},
    {"action": "create_document", "params": {"template": "due_diligence_report"}, "description": "Summarize DD findings"},
    {"action": "create_task", "params": {"title": "Draft purchase agreement"}, "description": "Main transaction document"},
    {"action": "create_task", "params": {"title": "Prepare ancillary documents"}, "description": "Schedules, exhibits, side letters"},
    {"action": "create_calendar_event", "params": {"type": "deadline", "title": "Closing Date"}, "description": "Transaction closing deadline"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Corporate Transaction'
);

-- 8. Contract Review Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Contract Review',
  'Review and negotiate commercial contract',
  ARRAY['review contract', 'contract review', 'negotiate agreement', 'redline contract', 'markup agreement'],
  '[
    {"action": "get_matter", "description": "Get matter context"},
    {"action": "read_document_content", "description": "Read and analyze the contract"},
    {"action": "create_document", "params": {"template": "contract_review_memo"}, "description": "Create review memo highlighting key issues"},
    {"action": "create_task", "params": {"title": "Identify problematic provisions"}, "description": "Flag concerning terms"},
    {"action": "create_task", "params": {"title": "Draft redlined version"}, "description": "Mark up with proposed changes"},
    {"action": "create_task", "params": {"title": "Prepare negotiation points"}, "description": "List priorities for negotiation"},
    {"action": "log_time", "description": "Log contract review time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Contract Review'
);

-- 9. Estate Planning Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Estate Planning Package',
  'Prepare complete estate planning documents',
  ARRAY['estate plan', 'will', 'trust', 'power of attorney', 'estate planning', 'living trust', 'healthcare directive'],
  '[
    {"action": "create_client", "description": "Create or update client record"},
    {"action": "create_matter", "params": {"type": "estate_planning", "billing_type": "flat"}, "description": "Create estate planning matter"},
    {"action": "create_task", "params": {"title": "Gather asset information"}, "description": "Complete asset inventory"},
    {"action": "create_task", "params": {"title": "Identify beneficiaries and fiduciaries"}, "description": "Document family and appointees"},
    {"action": "create_document", "params": {"template": "last_will"}, "description": "Draft Last Will and Testament"},
    {"action": "create_document", "params": {"template": "revocable_trust"}, "description": "Draft Revocable Living Trust"},
    {"action": "create_document", "params": {"template": "financial_poa"}, "description": "Draft Financial Power of Attorney"},
    {"action": "create_document", "params": {"template": "healthcare_directive"}, "description": "Draft Healthcare Directive/Living Will"},
    {"action": "create_calendar_event", "params": {"type": "meeting", "title": "Document Signing"}, "description": "Schedule signing ceremony"},
    {"action": "create_task", "params": {"title": "Arrange witnesses and notary"}, "description": "Coordinate execution requirements"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Estate Planning Package'
);

-- 10. Real Estate Closing Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Real Estate Closing',
  'Handle residential or commercial real estate transaction',
  ARRAY['real estate closing', 'property purchase', 'home closing', 'commercial lease', 'property sale', 'title review'],
  '[
    {"action": "create_matter", "params": {"type": "real_estate"}, "description": "Create real estate matter"},
    {"action": "create_task", "params": {"title": "Order title search"}, "description": "Obtain title commitment"},
    {"action": "create_task", "params": {"title": "Review purchase agreement"}, "description": "Analyze contract terms"},
    {"action": "create_task", "params": {"title": "Review title commitment"}, "description": "Identify exceptions and requirements"},
    {"action": "create_task", "params": {"title": "Prepare closing documents"}, "description": "Deed, affidavits, settlement statement"},
    {"action": "create_task", "params": {"title": "Coordinate with lender"}, "description": "Obtain loan documents if financed"},
    {"action": "create_calendar_event", "params": {"type": "deadline", "title": "Closing Date"}, "description": "Real estate closing date"},
    {"action": "create_task", "params": {"title": "Conduct closing"}, "description": "Execute and record documents"},
    {"action": "create_task", "params": {"title": "Disburse funds"}, "description": "Handle settlement disbursements"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Real Estate Closing'
);

-- 11. Weekly Billing Review
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Weekly Billing Review',
  'Review unbilled time and prepare for invoicing',
  ARRAY['billing review', 'unbilled time', 'review time entries', 'billing audit', 'time review'],
  '[
    {"action": "get_my_time_entries", "description": "Get recent time entries"},
    {"action": "generate_report", "params": {"report_type": "billing_summary"}, "description": "Generate billing summary"},
    {"action": "list_invoices", "params": {"status": "draft"}, "description": "Check draft invoices"},
    {"action": "create_task", "params": {"title": "Review and finalize time descriptions"}, "description": "Improve billing narratives"},
    {"action": "list_invoices", "params": {"status": "overdue"}, "description": "Identify overdue invoices"},
    {"action": "create_task", "params": {"title": "Send collection reminders"}, "description": "Follow up on past due accounts"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Weekly Billing Review'
);

-- 12. Conflict Check Workflow
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Conflict Check',
  'Comprehensive conflict of interest check before accepting new matter',
  ARRAY['conflict check', 'conflicts', 'check conflicts', 'new matter conflict', 'can we take this case'],
  '[
    {"action": "list_clients", "description": "Search for existing client relationships"},
    {"action": "list_matters", "description": "Search matters for adverse parties"},
    {"action": "search_document_content", "description": "Search documents for party names"},
    {"action": "create_document", "params": {"template": "conflict_memo"}, "description": "Document conflict check results"},
    {"action": "create_task", "params": {"title": "Partner review of conflicts"}, "description": "Obtain approval to proceed"},
    {"action": "create_document", "params": {"template": "conflict_waiver"}, "description": "Prepare waiver if needed"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Conflict Check'
);

-- 13. Court Appearance Preparation
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Court Appearance Prep',
  'Prepare for court hearing or trial appearance',
  ARRAY['court prep', 'hearing prep', 'trial prep', 'court appearance', 'prepare for hearing', 'oral argument'],
  '[
    {"action": "get_matter", "description": "Review matter and pending motions"},
    {"action": "search_document_content", "description": "Find relevant pleadings and evidence"},
    {"action": "create_document", "params": {"template": "hearing_outline"}, "description": "Create argument outline"},
    {"action": "create_task", "params": {"title": "Prepare witness list"}, "description": "Identify witnesses if needed"},
    {"action": "create_task", "params": {"title": "Organize exhibits"}, "description": "Prepare exhibit binders"},
    {"action": "create_task", "params": {"title": "Review local court rules"}, "description": "Check specific judge requirements"},
    {"action": "create_calendar_event", "params": {"type": "court_date"}, "description": "Confirm court appearance on calendar"},
    {"action": "log_time", "description": "Log preparation time"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Court Appearance Prep'
);

-- 14. Client Status Update
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Client Status Update',
  'Prepare and send comprehensive status update to client',
  ARRAY['client update', 'status update', 'update client', 'case status', 'progress report'],
  '[
    {"action": "get_matter", "description": "Get full matter details and recent activity"},
    {"action": "get_calendar_events", "description": "Get upcoming deadlines and events"},
    {"action": "list_tasks", "description": "Get pending tasks and action items"},
    {"action": "list_invoices", "description": "Check billing status"},
    {"action": "create_document", "params": {"template": "status_letter"}, "description": "Draft client status letter"},
    {"action": "create_task", "params": {"title": "Send status update to client"}, "description": "Email or mail update"},
    {"action": "log_time", "description": "Log time for status update"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Client Status Update'
);

-- 15. End of Day Time Entry
INSERT INTO ai_workflow_templates (firm_id, name, description, trigger_phrases, steps)
SELECT 
  f.id,
  'Daily Time Entry',
  'Review and complete daily time entries before end of day',
  ARRAY['log my time', 'daily time', 'enter time', 'time entry', 'end of day time', 'catch up time'],
  '[
    {"action": "get_my_time_entries", "params": {"start_date": "today"}, "description": "Check today existing entries"},
    {"action": "get_calendar_events", "params": {"days_ahead": 0}, "description": "Review today calendar for billable activities"},
    {"action": "list_my_matters", "description": "List active matters for time entry"},
    {"action": "log_time", "description": "Log time entries for today work"},
    {"action": "generate_report", "params": {"report_type": "billing_summary"}, "description": "Review daily billing total"}
  ]'::jsonb
FROM firms f
WHERE NOT EXISTS (
  SELECT 1 FROM ai_workflow_templates wt 
  WHERE wt.firm_id = f.id AND wt.name = 'Daily Time Entry'
);
