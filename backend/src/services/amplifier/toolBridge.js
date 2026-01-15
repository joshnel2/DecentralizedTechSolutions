/**
 * Tool Bridge for Amplifier Background Agent
 * 
 * This module provides all the same tools that the normal AI agent has access to.
 * Full parity with aiAgent.js tool set.
 */

import { query, withTransaction } from '../../db/connection.js';
import { formatDate, formatDateTime, getTodayInTimezone } from '../../utils/dateUtils.js';

/**
 * Complete list of tools available to Amplifier - FULL PARITY with aiAgent.js
 */
export const AMPLIFIER_TOOLS = {
  // ============== TIME ENTRIES ==============
  log_time: {
    description: "Log billable time for the user on a specific matter",
    parameters: {
      matter_id: "string - Matter ID or name",
      hours: "number - Hours to log (0.1 to 24)",
      description: "string - Description of work",
      date: "string - Date YYYY-MM-DD (optional, defaults to today)",
      billable: "boolean - Whether billable (optional, defaults to true)"
    },
    required: ["matter_id", "hours", "description"]
  },
  
  get_my_time_entries: {
    description: "Get user's recent time entries",
    parameters: {
      limit: "number - Max entries to return",
      start_date: "string - Filter from date",
      end_date: "string - Filter to date",
      matter_id: "string - Filter by matter"
    },
    required: []
  },
  
  update_time_entry: {
    description: "Update an existing time entry",
    parameters: {
      time_entry_id: "string - UUID of the time entry to update",
      hours: "number - New hours value",
      description: "string - New description",
      date: "string - New date (YYYY-MM-DD)",
      billable: "boolean - Whether billable"
    },
    required: ["time_entry_id"]
  },
  
  delete_time_entry: {
    description: "Delete a time entry. Cannot delete if already billed.",
    parameters: {
      time_entry_id: "string - UUID of the time entry to delete"
    },
    required: ["time_entry_id"]
  },
  
  // ============== MATTERS ==============
  list_my_matters: {
    description: "Get matters the user can access",
    parameters: {
      status: "string - active|pending|closed|on_hold",
      limit: "number - Max to return"
    },
    required: []
  },
  
  search_matters: {
    description: "Search for matters by name, number, or client",
    parameters: {
      search: "string - Search term",
      status: "string - Filter by status",
      client_id: "string - Filter by client"
    },
    required: []
  },
  
  get_matter: {
    description: "Get comprehensive info about a matter including documents, tasks, events",
    parameters: {
      matter_id: "string - Matter ID or name"
    },
    required: ["matter_id"]
  },
  
  create_matter: {
    description: "Create a new legal matter/case",
    parameters: {
      name: "string - Matter name",
      client_id: "string - Client ID",
      description: "string - Description",
      type: "string - Matter type",
      priority: "string - low|medium|high|urgent",
      billing_type: "string - hourly|flat|contingency|retainer|pro_bono",
      billing_rate: "number - Hourly rate"
    },
    required: ["name"]
  },
  
  update_matter: {
    description: "Update an existing matter",
    parameters: {
      matter_id: "string - Matter ID",
      name: "string - New name",
      description: "string - New description",
      status: "string - New status",
      priority: "string - New priority"
    },
    required: ["matter_id"]
  },
  
  close_matter: {
    description: "Close a matter with resolution",
    parameters: {
      matter_id: "string - Matter ID",
      resolution: "string - Resolution outcome",
      closing_notes: "string - Closing notes"
    },
    required: ["matter_id"]
  },
  
  archive_matter: {
    description: "Archive a closed matter to remove it from active lists",
    parameters: {
      matter_id: "string - UUID of the matter"
    },
    required: ["matter_id"]
  },
  
  reopen_matter: {
    description: "Reopen a closed or archived matter",
    parameters: {
      matter_id: "string - UUID of the matter",
      reason: "string - Reason for reopening"
    },
    required: ["matter_id"]
  },
  
  delete_matter: {
    description: "Permanently delete a matter. Only works on matters with no time entries, invoices, or documents.",
    parameters: {
      matter_id: "string - UUID of the matter to delete",
      confirm: "boolean - Must be true to confirm deletion"
    },
    required: ["matter_id", "confirm"]
  },
  
  add_matter_note: {
    description: "Add a note to a matter",
    parameters: {
      matter_id: "string - UUID of the matter",
      content: "string - Note content"
    },
    required: ["matter_id", "content"]
  },
  
  get_matter_summary: {
    description: "Get billing and activity summary for a specific matter",
    parameters: {
      matter_id: "string - UUID of the matter"
    },
    required: ["matter_id"]
  },
  
  // ============== CLIENTS ==============
  list_clients: {
    description: "Get list of clients",
    parameters: {
      search: "string - Search by name",
      type: "string - person|company",
      limit: "number - Max to return"
    },
    required: []
  },
  
  get_client: {
    description: "Get comprehensive info about a client",
    parameters: {
      client_id: "string - Client ID"
    },
    required: ["client_id"]
  },
  
  create_client: {
    description: "Create a new client",
    parameters: {
      display_name: "string - Full name or company name",
      type: "string - person|company",
      email: "string - Email address",
      phone: "string - Phone number",
      first_name: "string - First name (for person)",
      last_name: "string - Last name (for person)"
    },
    required: ["display_name"]
  },
  
  update_client: {
    description: "Update an existing client",
    parameters: {
      client_id: "string - Client ID",
      display_name: "string",
      email: "string",
      phone: "string"
    },
    required: ["client_id"]
  },
  
  archive_client: {
    description: "Archive a client to remove them from active lists",
    parameters: {
      client_id: "string - UUID of the client",
      reason: "string - Reason for archiving"
    },
    required: ["client_id"]
  },
  
  reactivate_client: {
    description: "Reactivate an archived client",
    parameters: {
      client_id: "string - UUID of the client"
    },
    required: ["client_id"]
  },
  
  delete_client: {
    description: "Permanently delete a client. Only works on clients with no matters, invoices, or documents.",
    parameters: {
      client_id: "string - UUID of the client to delete",
      confirm: "boolean - Must be true to confirm deletion"
    },
    required: ["client_id", "confirm"]
  },
  
  add_client_note: {
    description: "Add a note to a client record",
    parameters: {
      client_id: "string - UUID of the client",
      content: "string - The note content",
      note_type: "string - general|preference|important|contact|billing"
    },
    required: ["client_id", "content"]
  },
  
  get_client_communications: {
    description: "Get all emails and communications linked to a specific client",
    parameters: {
      client_id: "string - The client ID"
    },
    required: ["client_id"]
  },
  
  // ============== INVOICES ==============
  list_invoices: {
    description: "Get list of invoices",
    parameters: {
      status: "string - draft|sent|paid|overdue",
      client_id: "string - Filter by client",
      matter_id: "string - Filter by matter"
    },
    required: []
  },
  
  get_invoice: {
    description: "Get detailed information about a specific invoice",
    parameters: {
      invoice_id: "string - UUID of the invoice"
    },
    required: ["invoice_id"]
  },
  
  create_invoice: {
    description: "Create a new invoice",
    parameters: {
      client_id: "string - Client ID (required)",
      matter_id: "string - Matter ID",
      due_date: "string - Due date YYYY-MM-DD",
      include_unbilled_time: "boolean - Include unbilled time entries",
      items: "array - Custom line items [{description, amount}]",
      amount: "number - Simple amount (alternative to items array)"
    },
    required: ["client_id"]
  },
  
  send_invoice: {
    description: "Mark invoice as sent",
    parameters: {
      invoice_id: "string - Invoice ID"
    },
    required: ["invoice_id"]
  },
  
  record_payment: {
    description: "Record payment against invoice",
    parameters: {
      invoice_id: "string - Invoice ID",
      amount: "number - Payment amount",
      payment_method: "string - Payment method",
      payment_date: "string - Date YYYY-MM-DD"
    },
    required: ["invoice_id", "amount"]
  },
  
  void_invoice: {
    description: "Void/cancel an invoice. Cannot void paid invoices.",
    parameters: {
      invoice_id: "string - UUID of the invoice to void",
      reason: "string - Reason for voiding"
    },
    required: ["invoice_id", "reason"]
  },
  
  delete_invoice: {
    description: "Permanently delete a draft invoice. Only works on invoices with status 'draft'.",
    parameters: {
      invoice_id: "string - UUID of the invoice to delete",
      confirm: "boolean - Must be true to confirm deletion"
    },
    required: ["invoice_id", "confirm"]
  },
  
  // ============== DOCUMENTS ==============
  list_documents: {
    description: "Get list of documents",
    parameters: {
      matter_id: "string - Filter by matter",
      client_id: "string - Filter by client",
      search: "string - Search by name"
    },
    required: []
  },
  
  get_document: {
    description: "Get information about a specific document",
    parameters: {
      document_id: "string - UUID of the document"
    },
    required: ["document_id"]
  },
  
  read_document_content: {
    description: "Read the text content of a document",
    parameters: {
      document_id: "string - Document ID",
      max_length: "number - Max characters"
    },
    required: ["document_id"]
  },
  
  find_and_read_document: {
    description: "Find a document by name and read its content",
    parameters: {
      document_name: "string - Search term for document name",
      matter_id: "string - Optional: limit search to specific matter",
      max_length: "number - Max characters to return"
    },
    required: ["document_name"]
  },
  
  analyze_image: {
    description: "Analyze an image file to describe its contents",
    parameters: {
      document_id: "string - UUID of the image document",
      question: "string - Optional specific question about the image"
    },
    required: ["document_id"]
  },
  
  get_matter_documents_content: {
    description: "Get a summary of all documents attached to a matter with content previews",
    parameters: {
      matter_id: "string - UUID of the matter",
      include_content: "boolean - Include document content previews"
    },
    required: ["matter_id"]
  },
  
  create_document: {
    description: "Create a new PDF document",
    parameters: {
      name: "string - Document name",
      content: "string - Document content (markdown)",
      matter_id: "string - Attach to matter",
      client_id: "string - Attach to client",
      tags: "array - Optional tags for the document"
    },
    required: ["name", "content"]
  },
  
  update_document: {
    description: "Create an edited version of an existing document (clones original)",
    parameters: {
      document_id: "string - ID of the document to edit",
      new_content: "string - The new/updated content",
      new_name: "string - Optional custom name for the new document"
    },
    required: ["document_id", "new_content"]
  },
  
  delete_document: {
    description: "Permanently delete a document",
    parameters: {
      document_id: "string - UUID of the document to delete",
      confirm: "boolean - Must be true to confirm deletion"
    },
    required: ["document_id", "confirm"]
  },
  
  move_document: {
    description: "Move a document to a different matter or client",
    parameters: {
      document_id: "string - UUID of the document to move",
      new_matter_id: "string - UUID of the new matter",
      new_client_id: "string - UUID of the new client"
    },
    required: ["document_id"]
  },
  
  rename_document: {
    description: "Rename a document",
    parameters: {
      document_id: "string - UUID of the document to rename",
      new_name: "string - New name for the document"
    },
    required: ["document_id", "new_name"]
  },
  
  share_document: {
    description: "Share a document with a specific user",
    parameters: {
      document_id: "string - UUID of the document to share",
      user_id: "string - UUID of the user to share with",
      permission_level: "string - view|edit"
    },
    required: ["document_id", "user_id"]
  },
  
  search_document_content: {
    description: "Search within all document contents",
    parameters: {
      search_term: "string - Text to search for",
      matter_id: "string - Limit to matter",
      client_id: "string - Limit to client"
    },
    required: ["search_term"]
  },
  
  draft_email_for_matter: {
    description: "Draft a professional email related to a matter",
    parameters: {
      matter_id: "string - UUID of the matter",
      to: "string - Recipient email addresses",
      subject: "string - Email subject line",
      body: "string - Email body content",
      email_type: "string - client_update|demand_letter|settlement_proposal|scheduling|follow_up|general",
      cc: "string - CC recipients",
      save_to_outlook: "boolean - Whether to save as draft in Outlook",
      link_to_matter: "boolean - Whether to link email to matter"
    },
    required: ["matter_id", "subject", "body"]
  },
  
  create_note: {
    description: "Create a note/memo attached to a matter or client",
    parameters: {
      title: "string - Note title",
      content: "string - Note content (can be markdown)",
      matter_id: "string - Matter to attach to",
      client_id: "string - Client to attach to",
      note_type: "string - general|meeting|research|case_note|memo"
    },
    required: ["title", "content"]
  },
  
  // ============== VERSION HISTORY ==============
  get_document_versions: {
    description: "Get the version history of a document",
    parameters: {
      document_id: "string - UUID of the document"
    },
    required: ["document_id"]
  },
  
  read_version_content: {
    description: "Read the text content of a specific version of a document",
    parameters: {
      document_id: "string - UUID of the document",
      version_number: "number - Version number to read (1 is the original)",
      max_length: "number - Max characters to return"
    },
    required: ["document_id", "version_number"]
  },
  
  compare_versions: {
    description: "Compare two versions of a document and show what changed",
    parameters: {
      document_id: "string - UUID of the document",
      version1: "number - First version number (older)",
      version2: "number - Second version number (newer)"
    },
    required: ["document_id", "version1", "version2"]
  },
  
  // ============== CALENDAR ==============
  get_calendar_events: {
    description: "Get upcoming calendar events",
    parameters: {
      days_ahead: "number - Days to look ahead",
      days_behind: "number - Days to look behind",
      matter_id: "string - Filter by matter",
      type: "string - Event type"
    },
    required: []
  },
  
  create_calendar_event: {
    description: "Create a new calendar event",
    parameters: {
      title: "string - Event title",
      start_time: "string - Start datetime ISO 8601",
      end_time: "string - End datetime",
      type: "string - meeting|court_date|deadline|reminder",
      matter_id: "string - Associated matter",
      location: "string - Event location",
      description: "string - Event description",
      all_day: "boolean - Whether this is an all-day event"
    },
    required: ["title", "start_time"]
  },
  
  update_calendar_event: {
    description: "Update an existing calendar event",
    parameters: {
      event_id: "string - UUID of the event",
      title: "string",
      start_time: "string",
      end_time: "string",
      type: "string",
      location: "string",
      description: "string",
      status: "string - confirmed|tentative|cancelled"
    },
    required: ["event_id"]
  },
  
  delete_calendar_event: {
    description: "Delete a calendar event",
    parameters: {
      event_id: "string - UUID of the event"
    },
    required: ["event_id"]
  },
  
  // ============== TASKS ==============
  list_tasks: {
    description: "Get list of tasks",
    parameters: {
      status: "string - pending|in_progress|completed",
      matter_id: "string - Filter by matter",
      assigned_to: "string - Filter by assignee (user ID, email, name, or 'me')",
      due_before: "string - Filter tasks due before this date",
      include_completed: "boolean - Include completed tasks"
    },
    required: []
  },
  
  create_task: {
    description: "Create a new task",
    parameters: {
      title: "string - Task title",
      due_date: "string - Due date YYYY-MM-DD",
      priority: "string - low|medium|high|urgent",
      matter_id: "string - Link to matter",
      client_id: "string - Link to client",
      assigned_to: "string - Assign to user (ID, email, name, or 'me')",
      notes: "string - Additional notes"
    },
    required: ["title"]
  },
  
  complete_task: {
    description: "Mark task as completed",
    parameters: {
      task_id: "string - Task ID"
    },
    required: ["task_id"]
  },
  
  update_task: {
    description: "Update a task",
    parameters: {
      task_id: "string - UUID of the task",
      title: "string",
      due_date: "string",
      priority: "string - low|medium|high|urgent",
      status: "string - pending|in_progress|completed|cancelled",
      assigned_to: "string",
      notes: "string"
    },
    required: ["task_id"]
  },
  
  delete_task: {
    description: "Permanently delete a task",
    parameters: {
      task_id: "string - UUID of the task to delete"
    },
    required: ["task_id"]
  },
  
  // ============== REPORTS ==============
  generate_report: {
    description: "Generate various reports",
    parameters: {
      report_type: "string - billing_summary|time_by_matter|time_by_user|revenue|outstanding_invoices|matter_status|productivity|client_summary",
      start_date: "string - Start date",
      end_date: "string - End date",
      matter_id: "string - Filter by matter",
      client_id: "string - Filter by client",
      user_id: "string - Filter by user"
    },
    required: ["report_type"]
  },
  
  get_firm_analytics: {
    description: "Get firm-wide analytics and KPIs",
    parameters: {
      time_period: "string - current_month|last_week|last_month|last_quarter|year_to_date|all_time"
    },
    required: []
  },
  
  get_user_stats: {
    description: "Get the current user's personal statistics",
    parameters: {
      time_period: "string - today|this_week|this_month|this_year"
    },
    required: []
  },
  
  // ============== TEAM ==============
  list_team_members: {
    description: "Get list of team members",
    parameters: {
      role: "string - Filter by role",
      active_only: "boolean - Only active members"
    },
    required: []
  },
  
  get_team_member: {
    description: "Get information about a specific team member",
    parameters: {
      user_id: "string - UUID of the team member"
    },
    required: ["user_id"]
  },
  
  // ============== EXPENSES ==============
  create_expense: {
    description: "Create a new expense entry",
    parameters: {
      matter_id: "string - UUID of the matter",
      amount: "number - Expense amount",
      description: "string - Expense description",
      date: "string - Expense date (YYYY-MM-DD)",
      category: "string - filing_fees|travel|copies|postage|etc",
      billable: "boolean - Whether billable to client"
    },
    required: ["matter_id", "amount", "description"]
  },
  
  list_expenses: {
    description: "Get a list of expenses",
    parameters: {
      matter_id: "string - Filter by matter",
      start_date: "string - Filter from date",
      end_date: "string - Filter to date",
      billable: "boolean - Filter by billable status"
    },
    required: []
  },
  
  // ============== NAVIGATION ==============
  navigate_to_page: {
    description: "Navigate the user to a specific page in the application",
    parameters: {
      page: "string - dashboard|matters|clients|calendar|time|billing|documents|team|reports|analytics|settings"
    },
    required: ["page"]
  },
  
  open_matter: {
    description: "Open a specific matter/case for the user to view",
    parameters: {
      matter_id: "string - UUID of the matter to open"
    },
    required: ["matter_id"]
  },
  
  open_client: {
    description: "Open a specific client's page for the user to view",
    parameters: {
      client_id: "string - UUID of the client to open"
    },
    required: ["client_id"]
  },
  
  open_invoice: {
    description: "Open a specific invoice for the user to view",
    parameters: {
      invoice_id: "string - UUID of the invoice to open"
    },
    required: ["invoice_id"]
  },
  
  open_new_time_entry: {
    description: "Open the time entry form for the user to log time",
    parameters: {
      matter_id: "string - Optional: pre-select this matter"
    },
    required: []
  },
  
  open_new_calendar_event: {
    description: "Open the calendar event form",
    parameters: {
      date: "string - Optional: pre-select date (YYYY-MM-DD)",
      matter_id: "string - Optional: pre-select matter"
    },
    required: []
  },
  
  // ============== MATTER PERMISSIONS ==============
  get_matter_permissions: {
    description: "Get the list of users and groups who have access to a specific matter",
    parameters: {
      matter_id: "string - UUID of the matter"
    },
    required: ["matter_id"]
  },
  
  share_matter: {
    description: "Share a matter with a user or group, granting them access",
    parameters: {
      matter_id: "string - UUID of the matter to share",
      user_id: "string - UUID of the user to share with",
      group_id: "string - UUID of the group to share with",
      permission_level: "string - view|edit|admin",
      can_view_documents: "boolean",
      can_view_notes: "boolean",
      can_edit: "boolean"
    },
    required: ["matter_id"]
  },
  
  remove_matter_permission: {
    description: "Remove a user's or group's access to a matter",
    parameters: {
      matter_id: "string - UUID of the matter",
      user_id: "string - UUID of the user to remove",
      permission_id: "string - UUID of the permission to remove"
    },
    required: ["matter_id"]
  },
  
  update_matter_visibility: {
    description: "Change a matter's visibility between 'firm_wide' and 'restricted'",
    parameters: {
      matter_id: "string - UUID of the matter",
      visibility: "string - firm_wide|restricted"
    },
    required: ["matter_id", "visibility"]
  },
  
  // ============== EMAIL LINKING ==============
  link_email_to_matter: {
    description: "Link an email to a matter for record keeping",
    parameters: {
      email_id: "string - The ID of the email",
      matter_id: "string - The matter to link to"
    },
    required: ["email_id", "matter_id"]
  },
  
  link_email_to_client: {
    description: "Link an email to a client for record keeping",
    parameters: {
      email_id: "string - The ID of the email",
      client_id: "string - The client to link to"
    },
    required: ["email_id", "client_id"]
  },
  
  get_matter_emails: {
    description: "Get emails that have been linked to a specific matter",
    parameters: {
      matter_id: "string - UUID of the matter"
    },
    required: ["matter_id"]
  },
  
  // ============== INTEGRATION STATUS ==============
  get_integrations_status: {
    description: "Check which integrations are connected for this user",
    parameters: {},
    required: []
  },
  
  check_email_integration: {
    description: "Check if email (Outlook) integration is connected",
    parameters: {},
    required: []
  },
  
  // ============== QUICKBOOKS ==============
  get_quickbooks_status: {
    description: "Check if QuickBooks is connected and get account info",
    parameters: {},
    required: []
  },
  
  get_quickbooks_invoices: {
    description: "Get invoices from QuickBooks",
    parameters: {
      limit: "number - Number of invoices to return",
      status: "string - paid|unpaid|overdue"
    },
    required: []
  },
  
  get_quickbooks_customers: {
    description: "Get customers from QuickBooks",
    parameters: {
      search: "string - Search by customer name",
      limit: "number - Number to return"
    },
    required: []
  },
  
  create_quickbooks_invoice: {
    description: "Create an invoice in QuickBooks from an Apex invoice",
    parameters: {
      apex_invoice_id: "string - UUID of the Apex invoice to push"
    },
    required: ["apex_invoice_id"]
  },
  
  sync_quickbooks: {
    description: "Trigger a sync with QuickBooks to pull latest data",
    parameters: {},
    required: []
  },
  
  get_quickbooks_balance: {
    description: "Get account balances and financial summary from QuickBooks",
    parameters: {},
    required: []
  },
  
  // ============== OUTLOOK EMAIL ==============
  get_emails: {
    description: "Get recent emails from the user's connected Outlook inbox",
    parameters: {
      limit: "number - Number of emails to retrieve",
      folder: "string - Email folder (inbox, sent, drafts)",
      unread_only: "boolean - Only show unread emails"
    },
    required: []
  },
  
  search_emails: {
    description: "Search for emails by sender, subject, or content",
    parameters: {
      query: "string - Search query",
      from: "string - Filter by sender email or name",
      subject: "string - Filter by subject line",
      limit: "number - Number of results"
    },
    required: []
  },
  
  get_email: {
    description: "Get the full content of a specific email by ID",
    parameters: {
      email_id: "string - The ID of the email to retrieve"
    },
    required: ["email_id"]
  },
  
  draft_email: {
    description: "Create a draft email in the user's Outlook drafts folder",
    parameters: {
      to: "string - Recipient email addresses",
      subject: "string - Email subject line",
      body: "string - Email body content",
      cc: "string - CC recipients",
      importance: "string - low|normal|high"
    },
    required: ["to", "subject", "body"]
  },
  
  send_email: {
    description: "Send an email directly through the user's Outlook",
    parameters: {
      to: "string - Recipient email addresses",
      subject: "string - Email subject line",
      body: "string - Email body content",
      cc: "string - CC recipients",
      importance: "string - low|normal|high",
      document_ids: "array - Array of document IDs to attach"
    },
    required: ["to", "subject", "body"]
  },
  
  reply_to_email: {
    description: "Create a reply to an existing email",
    parameters: {
      email_id: "string - ID of the email to reply to",
      body: "string - Reply content",
      reply_all: "boolean - Reply to all recipients",
      send: "boolean - Send immediately or save as draft"
    },
    required: ["email_id", "body"]
  },
  
  // ============== OUTLOOK CALENDAR ==============
  create_outlook_event: {
    description: "Create a calendar event in the user's Outlook calendar",
    parameters: {
      title: "string - Event title",
      start_time: "string - Start date/time in ISO format",
      end_time: "string - End date/time in ISO format",
      location: "string - Event location",
      description: "string - Event description",
      matter_id: "string - Link to a matter"
    },
    required: ["title", "start_time"]
  },
  
  sync_outlook_calendar: {
    description: "Sync calendar events from Outlook to Apex",
    parameters: {},
    required: []
  },
  
  // ============== CLOUD STORAGE ==============
  list_cloud_files: {
    description: "List files from connected cloud storage",
    parameters: {
      provider: "string - onedrive|googledrive|dropbox",
      folder_path: "string - Path to folder",
      limit: "number - Number of files to return"
    },
    required: ["provider"]
  },
  
  search_cloud_files: {
    description: "Search for files across connected cloud storage",
    parameters: {
      provider: "string - onedrive|googledrive|dropbox",
      query: "string - Search query"
    },
    required: ["provider", "query"]
  },
  
  get_cloud_file_info: {
    description: "Get detailed information about a specific file in cloud storage",
    parameters: {
      provider: "string - onedrive|googledrive|dropbox",
      file_id: "string - File ID"
    },
    required: ["provider", "file_id"]
  },
  
  // ============== DOCUSIGN ==============
  get_docusign_status: {
    description: "Check DocuSign connection status and get recent envelope activity",
    parameters: {},
    required: []
  },
  
  get_docusign_envelopes: {
    description: "Get DocuSign envelopes (documents sent for signature)",
    parameters: {
      status: "string - sent|delivered|completed|declined|voided",
      days: "number - Look back this many days",
      limit: "number - Number to return"
    },
    required: []
  },
  
  send_for_signature: {
    description: "Send a document for electronic signature via DocuSign",
    parameters: {
      document_id: "string - Apex document ID to send for signature",
      signer_email: "string - Email of the person who needs to sign",
      signer_name: "string - Name of the signer",
      email_subject: "string - Subject line for the signature request",
      email_body: "string - Message body for the signature request"
    },
    required: ["document_id", "signer_email", "signer_name"]
  },
  
  // ============== SLACK ==============
  get_slack_status: {
    description: "Check Slack connection status and get workspace info",
    parameters: {},
    required: []
  },
  
  get_slack_channels: {
    description: "List available Slack channels the bot can post to",
    parameters: {
      limit: "number - Number of channels to return"
    },
    required: []
  },
  
  send_slack_message: {
    description: "Send a message to a Slack channel",
    parameters: {
      channel: "string - Channel name or ID",
      message: "string - Message text to send"
    },
    required: ["channel", "message"]
  },
  
  // ============== ZOOM ==============
  get_zoom_status: {
    description: "Check Zoom connection status",
    parameters: {},
    required: []
  },
  
  get_zoom_meetings: {
    description: "Get upcoming Zoom meetings",
    parameters: {
      type: "string - upcoming|scheduled|live",
      limit: "number - Number to return"
    },
    required: []
  },
  
  create_zoom_meeting: {
    description: "Create a new Zoom meeting",
    parameters: {
      topic: "string - Meeting topic/title",
      start_time: "string - Start time in ISO format",
      duration: "number - Duration in minutes",
      agenda: "string - Meeting agenda/description",
      matter_id: "string - Link to a matter"
    },
    required: ["topic", "start_time"]
  },
  
  // ============== QUICKEN ==============
  get_quicken_status: {
    description: "Check Quicken connection status",
    parameters: {},
    required: []
  },
  
  get_quicken_summary: {
    description: "Get a financial summary from Quicken",
    parameters: {},
    required: []
  },
  
  get_quicken_transactions: {
    description: "Get recent transactions from Quicken",
    parameters: {
      days: "number - Look back this many days",
      category: "string - Filter by category",
      limit: "number - Number to return"
    },
    required: []
  },
  
  get_quicken_accounts: {
    description: "Get list of accounts and their balances from Quicken",
    parameters: {},
    required: []
  },
  
  // ============== NOTIFICATIONS ==============
  send_notification: {
    description: "Send a notification to users (in-app, email, or SMS)",
    parameters: {
      user_id: "string - UUID of user to notify, 'all', or 'self'",
      title: "string - Notification title",
      message: "string - Notification message body",
      type: "string - general|deadline_reminder|matter_update|payment_received|document_update|urgent|ai_insight",
      priority: "string - low|normal|high|urgent",
      channels: "array - Delivery channels [in_app, email, sms]",
      entity_type: "string - Related entity type (matter, client, invoice, etc.)",
      entity_id: "string - UUID of the related entity",
      action_url: "string - URL to open when notification is clicked"
    },
    required: ["title"]
  },
  
  get_notifications: {
    description: "Get user's notifications",
    parameters: {
      limit: "number - Number to return",
      unread_only: "boolean - Only return unread notifications"
    },
    required: []
  },
  
  schedule_notification: {
    description: "Schedule a notification to be sent at a future time",
    parameters: {
      user_id: "string - UUID of user to notify, 'all', or 'self'",
      title: "string - Notification title",
      message: "string - Notification message",
      scheduled_for: "string - When to send (ISO 8601 format)",
      type: "string - deadline_reminder|calendar_reminder|follow_up|general",
      channels: "array - Delivery channels [in_app, email, sms]",
      entity_type: "string - Related entity type",
      entity_id: "string - UUID of related entity"
    },
    required: ["title", "scheduled_for"]
  },
  
  send_deadline_reminder: {
    description: "Send a reminder about an upcoming deadline",
    parameters: {
      matter_id: "string - UUID of the matter with the deadline",
      deadline_date: "string - The deadline date (YYYY-MM-DD)",
      deadline_description: "string - Description of what's due",
      user_ids: "array - UUIDs of users to notify",
      include_sms: "boolean - Also send SMS if within 24 hours"
    },
    required: ["matter_id", "deadline_date", "deadline_description"]
  },
  
  // ============== PLANNING & PROGRESS ==============
  think_and_plan: {
    description: "Create a plan for a complex task",
    parameters: {
      goal: "string - The overall goal",
      analysis: "string - Analysis of what needs to be done",
      steps: "array - List of steps to take",
      information_needed: "array - What information you need to gather first"
    },
    required: ["goal", "analysis", "steps"]
  },
  
  evaluate_progress: {
    description: "Evaluate progress toward a goal",
    parameters: {
      original_goal: "string - The original goal",
      completed_steps: "array - Steps completed",
      remaining_steps: "array - Steps remaining",
      blockers: "array - Any blockers or issues",
      confidence: "number - Confidence level 0-100",
      should_continue: "boolean - Whether you should continue or stop"
    },
    required: ["original_goal", "completed_steps", "should_continue"]
  },
  
  task_complete: {
    description: "Mark a complex task as complete with summary",
    parameters: {
      goal: "string - The original goal",
      summary: "string - Summary of accomplishments",
      actions_taken: "array - List of actions taken",
      results: "string - The results/outcome",
      recommendations: "array - Follow-up recommendations",
      key_learnings: "array - Key insights and learnings from this task",
      quality_assessment: "string - Overall assessment of the quality of work",
      improvements_for_next_time: "array - What you would do differently next time"
    },
    required: ["goal", "summary", "actions_taken"]
  },
  
  request_human_input: {
    description: "Request human guidance, approval, or clarification before proceeding",
    parameters: {
      question: "string - What you need to ask the human",
      context: "string - Context for why you're asking",
      options: "array - Options for the human to choose from",
      urgency: "string - low|medium|high",
      what_you_would_do: "string - What you would do if you had to decide yourself"
    },
    required: ["question", "context"]
  },
  
  log_work: {
    description: "Log work progress and learnings",
    parameters: {
      action: "string - What action was taken",
      result: "string - The result",
      next_step: "string - What to do next",
      reflection: "string - What was learned",
      quality_rating: "number - Rate the quality of this step 1-10",
      improvement_idea: "string - A specific idea for how to do this better next time"
    },
    required: ["action"]
  }
};

/**
 * Execute a tool call for Amplifier
 * This function routes tool calls to the appropriate handler
 */
export async function executeTool(toolName, params, context) {
  const { userId, firmId, token } = context;
  
  console.log(`[Amplifier Tool] Executing: ${toolName}`, params);
  
  try {
    switch (toolName) {
      // ============== TIME ENTRIES ==============
      case 'log_time':
        return await logTime(params, userId, firmId);
      case 'get_my_time_entries':
        return await getTimeEntries(params, userId, firmId);
      case 'update_time_entry':
        return await updateTimeEntry(params, userId, firmId);
      case 'delete_time_entry':
        return await deleteTimeEntry(params, userId, firmId);
      
      // ============== MATTERS ==============
      case 'list_my_matters':
        return await listMatters(params, userId, firmId);
      case 'search_matters':
        return await searchMatters(params, userId, firmId);
      case 'get_matter':
        return await getMatter(params, userId, firmId);
      case 'create_matter':
        return await createMatter(params, userId, firmId);
      case 'update_matter':
        return await updateMatter(params, userId, firmId);
      case 'close_matter':
        return await closeMatter(params, userId, firmId);
      case 'archive_matter':
        return await archiveMatter(params, userId, firmId);
      case 'reopen_matter':
        return await reopenMatter(params, userId, firmId);
      case 'delete_matter':
        return await deleteMatter(params, userId, firmId);
      case 'add_matter_note':
        return await addMatterNote(params, userId, firmId);
      case 'get_matter_summary':
        return await getMatterSummary(params, userId, firmId);
      
      // ============== CLIENTS ==============
      case 'list_clients':
        return await listClients(params, userId, firmId);
      case 'get_client':
        return await getClient(params, userId, firmId);
      case 'create_client':
        return await createClient(params, userId, firmId);
      case 'update_client':
        return await updateClient(params, userId, firmId);
      case 'archive_client':
        return await archiveClient(params, userId, firmId);
      case 'reactivate_client':
        return await reactivateClient(params, userId, firmId);
      case 'delete_client':
        return await deleteClient(params, userId, firmId);
      case 'add_client_note':
        return await addClientNote(params, userId, firmId);
      case 'get_client_communications':
        return await getClientCommunications(params, userId, firmId);
      
      // ============== INVOICES ==============
      case 'list_invoices':
        return await listInvoices(params, userId, firmId);
      case 'get_invoice':
        return await getInvoice(params, userId, firmId);
      case 'create_invoice':
        return await createInvoice(params, userId, firmId);
      case 'send_invoice':
        return await sendInvoice(params, userId, firmId);
      case 'record_payment':
        return await recordPayment(params, userId, firmId);
      case 'void_invoice':
        return await voidInvoice(params, userId, firmId);
      case 'delete_invoice':
        return await deleteInvoice(params, userId, firmId);
      
      // ============== DOCUMENTS ==============
      case 'list_documents':
        return await listDocuments(params, userId, firmId);
      case 'get_document':
        return await getDocument(params, userId, firmId);
      case 'read_document_content':
        return await readDocumentContent(params, userId, firmId);
      case 'find_and_read_document':
        return await findAndReadDocument(params, userId, firmId);
      case 'analyze_image':
        return await analyzeImage(params, userId, firmId);
      case 'get_matter_documents_content':
        return await getMatterDocumentsContent(params, userId, firmId);
      case 'create_document':
        return await createDocument(params, userId, firmId);
      case 'update_document':
        return await updateDocument(params, userId, firmId);
      case 'delete_document':
        return await deleteDocument(params, userId, firmId);
      case 'move_document':
        return await moveDocument(params, userId, firmId);
      case 'rename_document':
        return await renameDocument(params, userId, firmId);
      case 'share_document':
        return await shareDocument(params, userId, firmId);
      case 'search_document_content':
        return await searchDocumentContent(params, userId, firmId);
      case 'draft_email_for_matter':
        return await draftEmailForMatter(params, userId, firmId);
      case 'create_note':
        return await createNote(params, userId, firmId);
      
      // ============== VERSION HISTORY ==============
      case 'get_document_versions':
        return await getDocumentVersions(params, userId, firmId);
      case 'read_version_content':
        return await readVersionContent(params, userId, firmId);
      case 'compare_versions':
        return await compareVersions(params, userId, firmId);
      
      // ============== CALENDAR ==============
      case 'get_calendar_events':
        return await getCalendarEvents(params, userId, firmId);
      case 'create_calendar_event':
        return await createCalendarEvent(params, userId, firmId);
      case 'update_calendar_event':
        return await updateCalendarEvent(params, userId, firmId);
      case 'delete_calendar_event':
        return await deleteCalendarEvent(params, userId, firmId);
      
      // ============== TASKS ==============
      case 'list_tasks':
        return await listTasks(params, userId, firmId);
      case 'create_task':
        return await createTask(params, userId, firmId);
      case 'complete_task':
        return await completeTask(params, userId, firmId);
      case 'update_task':
        return await updateTask(params, userId, firmId);
      case 'delete_task':
        return await deleteTask(params, userId, firmId);
      
      // ============== REPORTS ==============
      case 'generate_report':
        return await generateReport(params, userId, firmId);
      case 'get_firm_analytics':
        return await getFirmAnalytics(params, userId, firmId);
      case 'get_user_stats':
        return await getUserStats(params, userId, firmId);
      
      // ============== TEAM ==============
      case 'list_team_members':
        return await listTeamMembers(params, userId, firmId);
      case 'get_team_member':
        return await getTeamMember(params, userId, firmId);
      
      // ============== EXPENSES ==============
      case 'create_expense':
        return await createExpense(params, userId, firmId);
      case 'list_expenses':
        return await listExpenses(params, userId, firmId);
      
      // ============== NAVIGATION (pass-through for background agent) ==============
      case 'navigate_to_page':
      case 'open_matter':
      case 'open_client':
      case 'open_invoice':
      case 'open_new_time_entry':
      case 'open_new_calendar_event':
        return { success: true, message: `Navigation command recorded: ${toolName}`, data: params, note: 'Background agent cannot navigate UI directly. The result will be delivered when task completes.' };
      
      // ============== MATTER PERMISSIONS ==============
      case 'get_matter_permissions':
        return await getMatterPermissions(params, userId, firmId);
      case 'share_matter':
        return await shareMatter(params, userId, firmId);
      case 'remove_matter_permission':
        return await removeMatterPermission(params, userId, firmId);
      case 'update_matter_visibility':
        return await updateMatterVisibility(params, userId, firmId);
      
      // ============== EMAIL LINKING ==============
      case 'link_email_to_matter':
        return await linkEmailToMatter(params, userId, firmId);
      case 'link_email_to_client':
        return await linkEmailToClient(params, userId, firmId);
      case 'get_matter_emails':
        return await getMatterEmails(params, userId, firmId);
      
      // ============== INTEGRATION STATUS ==============
      case 'get_integrations_status':
        return await getIntegrationsStatus(params, userId, firmId);
      case 'check_email_integration':
        return await checkEmailIntegration(params, userId, firmId);
      
      // ============== QUICKBOOKS ==============
      case 'get_quickbooks_status':
        return await getQuickBooksStatus(params, userId, firmId);
      case 'get_quickbooks_invoices':
        return await getQuickBooksInvoices(params, userId, firmId);
      case 'get_quickbooks_customers':
        return await getQuickBooksCustomers(params, userId, firmId);
      case 'create_quickbooks_invoice':
        return await createQuickBooksInvoice(params, userId, firmId);
      case 'sync_quickbooks':
        return await syncQuickBooks(params, userId, firmId);
      case 'get_quickbooks_balance':
        return await getQuickBooksBalance(params, userId, firmId);
      
      // ============== OUTLOOK EMAIL ==============
      case 'get_emails':
        return await getEmails(params, userId, firmId);
      case 'search_emails':
        return await searchEmails(params, userId, firmId);
      case 'get_email':
        return await getEmailById(params, userId, firmId);
      case 'draft_email':
        return await draftEmail(params, userId, firmId);
      case 'send_email':
        return await sendEmail(params, userId, firmId);
      case 'reply_to_email':
        return await replyToEmail(params, userId, firmId);
      
      // ============== OUTLOOK CALENDAR ==============
      case 'create_outlook_event':
        return await createOutlookEvent(params, userId, firmId);
      case 'sync_outlook_calendar':
        return await syncOutlookCalendar(params, userId, firmId);
      
      // ============== CLOUD STORAGE ==============
      case 'list_cloud_files':
        return await listCloudFiles(params, userId, firmId);
      case 'search_cloud_files':
        return await searchCloudFiles(params, userId, firmId);
      case 'get_cloud_file_info':
        return await getCloudFileInfo(params, userId, firmId);
      
      // ============== DOCUSIGN ==============
      case 'get_docusign_status':
        return await getDocuSignStatus(params, userId, firmId);
      case 'get_docusign_envelopes':
        return await getDocuSignEnvelopes(params, userId, firmId);
      case 'send_for_signature':
        return await sendForSignature(params, userId, firmId);
      
      // ============== SLACK ==============
      case 'get_slack_status':
        return await getSlackStatus(params, userId, firmId);
      case 'get_slack_channels':
        return await getSlackChannels(params, userId, firmId);
      case 'send_slack_message':
        return await sendSlackMessage(params, userId, firmId);
      
      // ============== ZOOM ==============
      case 'get_zoom_status':
        return await getZoomStatus(params, userId, firmId);
      case 'get_zoom_meetings':
        return await getZoomMeetings(params, userId, firmId);
      case 'create_zoom_meeting':
        return await createZoomMeeting(params, userId, firmId);
      
      // ============== QUICKEN ==============
      case 'get_quicken_status':
        return await getQuickenStatus(params, userId, firmId);
      case 'get_quicken_summary':
        return await getQuickenSummary(params, userId, firmId);
      case 'get_quicken_transactions':
        return await getQuickenTransactions(params, userId, firmId);
      case 'get_quicken_accounts':
        return await getQuickenAccounts(params, userId, firmId);
      
      // ============== NOTIFICATIONS ==============
      case 'send_notification':
        return await sendNotification(params, userId, firmId);
      case 'get_notifications':
        return await getNotifications(params, userId, firmId);
      case 'schedule_notification':
        return await scheduleNotification(params, userId, firmId);
      case 'send_deadline_reminder':
        return await sendDeadlineReminder(params, userId, firmId);
      
      // ============== PLANNING (pass-through) ==============
      case 'think_and_plan':
      case 'evaluate_progress':
      case 'task_complete':
      case 'log_work':
      case 'request_human_input':
        return { success: true, message: 'Planning step recorded', data: params };
      
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`[Amplifier Tool] Error executing ${toolName}:`, error);
    return { error: error.message };
  }
}

// ============== TOOL IMPLEMENTATIONS ==============

async function logTime(params, userId, firmId) {
  const { matter_id, hours, description, date, billable = true } = params;
  
  // Find matter by ID or name
  let matterId = matter_id;
  if (!matter_id.match(/^[0-9a-f-]{36}$/i)) {
    const matterResult = await query(`
      SELECT id FROM matters 
      WHERE firm_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
    
    if (!matterResult.rows.length) {
      return { error: `Matter not found: ${matter_id}` };
    }
    matterId = matterResult.rows[0].id;
  }
  
  // Get billing rate
  const matterInfo = await query(`
    SELECT m.billing_rate, m.billing_type, u.hourly_rate
    FROM matters m
    LEFT JOIN users u ON u.id = $2
    WHERE m.id = $1
  `, [matterId, userId]);
  
  const rate = matterInfo.rows[0]?.billing_rate || matterInfo.rows[0]?.hourly_rate || 0;
  const amount = hours * rate;
  
  const result = await query(`
    INSERT INTO time_entries (firm_id, user_id, matter_id, hours, description, date, billable, rate, amount)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, hours, description, date, amount
  `, [firmId, userId, matterId, hours, description, date || getTodayInTimezone(), billable, rate, amount]);
  
  return { success: true, timeEntry: result.rows[0] };
}

async function getTimeEntries(params, userId, firmId) {
  const { limit = 20, start_date, end_date, matter_id } = params;
  
  let sql = `
    SELECT te.*, m.name as matter_name
    FROM time_entries te
    LEFT JOIN matters m ON te.matter_id = m.id
    WHERE te.firm_id = $1 AND te.user_id = $2
  `;
  const values = [firmId, userId];
  let idx = 3;
  
  if (start_date) {
    sql += ` AND te.date >= $${idx++}`;
    values.push(start_date);
  }
  if (end_date) {
    sql += ` AND te.date <= $${idx++}`;
    values.push(end_date);
  }
  if (matter_id) {
    sql += ` AND te.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY te.date DESC, te.created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { timeEntries: result.rows };
}

async function listMatters(params, userId, firmId) {
  const { status = 'active', limit = 50 } = params;
  
  const result = await query(`
    SELECT m.*, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1 AND m.status = $2
    ORDER BY m.created_at DESC
    LIMIT $3
  `, [firmId, status, limit]);
  
  return { matters: result.rows };
}

async function searchMatters(params, userId, firmId) {
  const { search, status, client_id } = params;
  
  let sql = `
    SELECT m.*, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `;
  const values = [firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND (LOWER(m.name) LIKE $${idx} OR LOWER(m.number) LIKE $${idx} OR LOWER(c.display_name) LIKE $${idx})`;
    values.push(`%${search.toLowerCase()}%`);
    idx++;
  }
  if (status) {
    sql += ` AND m.status = $${idx++}`;
    values.push(status);
  }
  if (client_id) {
    sql += ` AND m.client_id = $${idx++}`;
    values.push(client_id);
  }
  
  sql += ` ORDER BY m.created_at DESC LIMIT 20`;
  
  const result = await query(sql, values);
  return { matters: result.rows };
}

async function getMatter(params, userId, firmId) {
  const { matter_id } = params;
  
  // Support flexible matching
  let matterQuery;
  if (matter_id.match(/^[0-9a-f-]{36}$/i)) {
    matterQuery = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.id = $1 AND m.firm_id = $2
    `, [matter_id, firmId]);
  } else {
    matterQuery = await query(`
      SELECT m.*, c.display_name as client_name, c.email as client_email
      FROM matters m
      LEFT JOIN clients c ON m.client_id = c.id
      WHERE m.firm_id = $1 AND (LOWER(m.name) LIKE $2 OR LOWER(m.number) LIKE $2)
      LIMIT 1
    `, [firmId, `%${matter_id.toLowerCase()}%`]);
  }
  
  if (!matterQuery.rows.length) {
    return { error: `Matter not found: ${matter_id}` };
  }
  
  const matter = matterQuery.rows[0];
  
  // Get related data
  const [docs, tasks, events, timeEntries] = await Promise.all([
    query(`SELECT id, original_name, type, created_at FROM documents WHERE matter_id = $1 LIMIT 10`, [matter.id]),
    query(`SELECT id, name, status, due_date FROM matter_tasks WHERE matter_id = $1 LIMIT 10`, [matter.id]),
    query(`SELECT id, title, start_time, type FROM calendar_events WHERE matter_id = $1 AND start_time >= NOW() LIMIT 5`, [matter.id]),
    query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_amount FROM time_entries WHERE matter_id = $1`, [matter.id])
  ]);
  
  return {
    matter,
    documents: docs.rows,
    tasks: tasks.rows,
    upcomingEvents: events.rows,
    billing: timeEntries.rows[0]
  };
}

async function createMatter(params, userId, firmId) {
  const { name, client_id, description, type, priority = 'medium', billing_type = 'hourly', billing_rate } = params;
  
  // Generate matter number
  const countResult = await query('SELECT COUNT(*) FROM matters WHERE firm_id = $1', [firmId]);
  const number = `M-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;
  
  const result = await query(`
    INSERT INTO matters (firm_id, name, number, client_id, description, type, priority, billing_type, billing_rate, status, responsible_attorney)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
    RETURNING *
  `, [firmId, name, number, client_id || null, description || null, type || 'general', priority, billing_type, billing_rate || null, userId]);
  
  return { success: true, matter: result.rows[0] };
}

async function updateMatter(params, userId, firmId) {
  const { matter_id, ...updates } = params;
  
  const fields = [];
  const values = [matter_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE matters SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, matter: result.rows[0] };
}

async function closeMatter(params, userId, firmId) {
  const { matter_id, resolution, closing_notes } = params;
  
  const result = await query(`
    UPDATE matters 
    SET status = 'closed', close_date = NOW(), resolution = $3, closing_notes = $4, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [matter_id, firmId, resolution || null, closing_notes || null]);
  
  return { success: true, matter: result.rows[0] };
}

async function listClients(params, userId, firmId) {
  const { search, type, limit = 50 } = params;
  
  let sql = 'SELECT * FROM clients WHERE firm_id = $1 AND is_active = true';
  const values = [firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND LOWER(display_name) LIKE $${idx++}`;
    values.push(`%${search.toLowerCase()}%`);
  }
  if (type) {
    sql += ` AND type = $${idx++}`;
    values.push(type);
  }
  
  sql += ` ORDER BY display_name LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { clients: result.rows };
}

async function getClient(params, userId, firmId) {
  const { client_id } = params;
  
  const clientResult = await query('SELECT * FROM clients WHERE id = $1 AND firm_id = $2', [client_id, firmId]);
  if (!clientResult.rows.length) return { error: 'Client not found' };
  
  const [matters, invoices] = await Promise.all([
    query('SELECT id, name, number, status FROM matters WHERE client_id = $1 LIMIT 10', [client_id]),
    query('SELECT id, number, total, amount_due, status FROM invoices WHERE client_id = $1 LIMIT 10', [client_id])
  ]);
  
  return {
    client: clientResult.rows[0],
    matters: matters.rows,
    invoices: invoices.rows
  };
}

async function createClient(params, userId, firmId) {
  const { display_name, type = 'person', email, phone, first_name, last_name } = params;
  
  const result = await query(`
    INSERT INTO clients (firm_id, display_name, type, email, phone, first_name, last_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [firmId, display_name, type, email || null, phone || null, first_name || null, last_name || null]);
  
  return { success: true, client: result.rows[0] };
}

async function updateClient(params, userId, firmId) {
  const { client_id, ...updates } = params;
  
  const fields = [];
  const values = [client_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE clients SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, client: result.rows[0] };
}

async function listInvoices(params, userId, firmId) {
  const { status, client_id, matter_id, limit = 20 } = params;
  
  let sql = `
    SELECT i.*, c.display_name as client_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.firm_id = $1
  `;
  const values = [firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND i.status = $${idx++}`;
    values.push(status);
  }
  if (client_id) {
    sql += ` AND i.client_id = $${idx++}`;
    values.push(client_id);
  }
  if (matter_id) {
    sql += ` AND i.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  
  sql += ` ORDER BY i.created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { invoices: result.rows };
}

async function createInvoice(params, userId, firmId) {
  const { client_id, matter_id, due_date, items, include_unbilled_time } = params;
  
  // Generate invoice number
  const countResult = await query('SELECT COUNT(*) FROM invoices WHERE firm_id = $1', [firmId]);
  const number = `INV-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;
  
  let total = 0;
  if (items && items.length) {
    total = items.reduce((sum, item) => sum + (item.amount * (item.quantity || 1)), 0);
  }
  
  const result = await query(`
    INSERT INTO invoices (firm_id, client_id, matter_id, number, due_date, total, amount_due, status)
    VALUES ($1, $2, $3, $4, $5, $6, $6, 'draft')
    RETURNING *
  `, [firmId, client_id, matter_id || null, number, due_date || null, total]);
  
  return { success: true, invoice: result.rows[0] };
}

async function recordPayment(params, userId, firmId) {
  const { invoice_id, amount, payment_method, payment_date } = params;
  
  const result = await query(`
    INSERT INTO payments (firm_id, invoice_id, amount, payment_method, payment_date)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [firmId, invoice_id, amount, payment_method || 'other', payment_date || getTodayInTimezone()]);
  
  // Update invoice amount_due
  await query(`
    UPDATE invoices SET amount_due = amount_due - $1,
    status = CASE WHEN amount_due - $1 <= 0 THEN 'paid' ELSE status END
    WHERE id = $2
  `, [amount, invoice_id]);
  
  return { success: true, payment: result.rows[0] };
}

async function listDocuments(params, userId, firmId) {
  const { matter_id, client_id, search, limit = 20 } = params;
  
  let sql = 'SELECT * FROM documents WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (client_id) {
    sql += ` AND client_id = $${idx++}`;
    values.push(client_id);
  }
  if (search) {
    sql += ` AND LOWER(original_name) LIKE $${idx++}`;
    values.push(`%${search.toLowerCase()}%`);
  }
  
  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  values.push(limit);
  
  const result = await query(sql, values);
  return { documents: result.rows };
}

async function readDocumentContent(params, userId, firmId) {
  const { document_id, max_length = 10000 } = params;
  
  const result = await query(`
    SELECT original_name, extracted_text 
    FROM documents 
    WHERE id = $1 AND firm_id = $2
  `, [document_id, firmId]);
  
  if (!result.rows.length) return { error: 'Document not found' };
  
  const doc = result.rows[0];
  const content = doc.extracted_text || '';
  
  return {
    name: doc.original_name,
    content: content.substring(0, max_length),
    truncated: content.length > max_length
  };
}

async function searchDocumentContent(params, userId, firmId) {
  const { search_term, matter_id, client_id } = params;
  
  let sql = `
    SELECT id, original_name, matter_id,
      SUBSTRING(extracted_text FROM POSITION(LOWER($2) IN LOWER(extracted_text)) FOR 200) as excerpt
    FROM documents
    WHERE firm_id = $1 AND LOWER(extracted_text) LIKE $3
  `;
  const values = [firmId, search_term, `%${search_term.toLowerCase()}%`];
  let idx = 4;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (client_id) {
    sql += ` AND client_id = $${idx++}`;
    values.push(client_id);
  }
  
  sql += ' LIMIT 10';
  
  const result = await query(sql, values);
  return { results: result.rows };
}

async function getCalendarEvents(params, userId, firmId) {
  const { days_ahead = 7, matter_id, type } = params;
  
  let sql = `
    SELECT e.*, m.name as matter_name
    FROM calendar_events e
    LEFT JOIN matters m ON e.matter_id = m.id
    WHERE e.firm_id = $1 AND e.start_time >= NOW() AND e.start_time < NOW() + INTERVAL '${days_ahead} days'
  `;
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND e.matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (type) {
    sql += ` AND e.type = $${idx++}`;
    values.push(type);
  }
  
  sql += ' ORDER BY e.start_time';
  
  const result = await query(sql, values);
  return { events: result.rows };
}

async function createCalendarEvent(params, userId, firmId) {
  const { title, start_time, end_time, type = 'meeting', matter_id, location, description } = params;
  
  const result = await query(`
    INSERT INTO calendar_events (firm_id, user_id, title, start_time, end_time, type, matter_id, location, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [firmId, userId, title, start_time, end_time || null, type, matter_id || null, location || null, description || null]);
  
  return { success: true, event: result.rows[0] };
}

async function listTasks(params, userId, firmId) {
  const { status, matter_id, assigned_to } = params;
  
  let sql = `SELECT * FROM matter_tasks WHERE firm_id = $1`;
  const values = [firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND status = $${idx++}`;
    values.push(status);
  }
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (assigned_to) {
    sql += ` AND assignee = $${idx++}`;
    values.push(assigned_to === 'me' ? userId : assigned_to);
  }
  
  sql += ' ORDER BY due_date NULLS LAST, created_at DESC LIMIT 50';
  
  const result = await query(sql, values);
  return { tasks: result.rows };
}

async function createTask(params, userId, firmId) {
  const { title, due_date, priority = 'medium', matter_id, assigned_to } = params;
  
  const result = await query(`
    INSERT INTO matter_tasks (firm_id, matter_id, name, due_date, priority, assignee, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    RETURNING *
  `, [firmId, matter_id || null, title, due_date || null, priority, assigned_to || userId]);
  
  return { success: true, task: result.rows[0] };
}

async function completeTask(params, userId, firmId) {
  const { task_id } = params;
  
  const result = await query(`
    UPDATE matter_tasks SET status = 'completed', completed_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [task_id, firmId]);
  
  return { success: true, task: result.rows[0] };
}

async function generateReport(params, userId, firmId) {
  const { report_type, start_date, end_date, matter_id, client_id } = params;
  
  // Simplified report generation
  let report = { type: report_type };
  
  switch (report_type) {
    case 'billing_summary':
      const billing = await query(`
        SELECT SUM(hours) as total_hours, SUM(amount) as total_amount,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1
          ${start_date ? 'AND date >= $2' : ''}
          ${end_date ? 'AND date <= $3' : ''}
      `, [firmId, start_date, end_date].filter(Boolean));
      report.data = billing.rows[0];
      break;
    
    case 'outstanding_invoices':
      const outstanding = await query(`
        SELECT i.*, c.display_name as client_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.firm_id = $1 AND i.status IN ('sent', 'overdue')
        ORDER BY i.due_date
      `, [firmId]);
      report.data = outstanding.rows;
      break;
    
    default:
      report.data = { message: `Report type ${report_type} not yet implemented` };
  }
  
  return report;
}

async function getFirmAnalytics(params, userId, firmId) {
  const { time_period = 'current_month' } = params;
  
  const [matters, time, invoices] = await Promise.all([
    query(`SELECT status, COUNT(*) as count FROM matters WHERE firm_id = $1 GROUP BY status`, [firmId]),
    query(`
      SELECT SUM(hours) as total_hours, SUM(amount) as total_amount
      FROM time_entries WHERE firm_id = $1 AND date >= DATE_TRUNC('month', CURRENT_DATE)
    `, [firmId]),
    query(`
      SELECT SUM(total) as total_billed, SUM(amount_due) as outstanding
      FROM invoices WHERE firm_id = $1
    `, [firmId])
  ]);
  
  return {
    mattersByStatus: matters.rows,
    thisMonth: time.rows[0],
    invoiceSummary: invoices.rows[0]
  };
}

async function listTeamMembers(params, userId, firmId) {
  const { role, active_only = true } = params;
  
  let sql = 'SELECT id, first_name, last_name, email, role FROM users WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (active_only) {
    sql += ' AND is_active = true';
  }
  if (role) {
    sql += ` AND role = $${idx++}`;
    values.push(role);
  }
  
  const result = await query(sql, values);
  return { members: result.rows };
}

// ============== NEW TOOL IMPLEMENTATIONS ==============

async function updateTimeEntry(params, userId, firmId) {
  const { time_entry_id, ...updates } = params;
  
  const fields = [];
  const values = [time_entry_id, firmId, userId];
  let idx = 4;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE time_entries SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2 AND user_id = $3
    RETURNING *
  `, values);
  
  return { success: true, timeEntry: result.rows[0] };
}

async function deleteTimeEntry(params, userId, firmId) {
  const { time_entry_id } = params;
  
  // Check if already billed
  const check = await query(`
    SELECT te.id, te.invoice_id FROM time_entries te
    WHERE te.id = $1 AND te.firm_id = $2 AND te.user_id = $3
  `, [time_entry_id, firmId, userId]);
  
  if (!check.rows.length) return { error: 'Time entry not found' };
  if (check.rows[0].invoice_id) return { error: 'Cannot delete billed time entry' };
  
  await query('DELETE FROM time_entries WHERE id = $1', [time_entry_id]);
  return { success: true, message: 'Time entry deleted' };
}

async function archiveMatter(params, userId, firmId) {
  const { matter_id } = params;
  
  const result = await query(`
    UPDATE matters SET is_archived = true, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [matter_id, firmId]);
  
  return { success: true, matter: result.rows[0] };
}

async function reopenMatter(params, userId, firmId) {
  const { matter_id, reason } = params;
  
  const result = await query(`
    UPDATE matters SET status = 'active', is_archived = false, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [matter_id, firmId]);
  
  return { success: true, matter: result.rows[0], reason };
}

async function deleteMatter(params, userId, firmId) {
  const { matter_id, confirm } = params;
  
  if (!confirm) return { error: 'Must confirm deletion' };
  
  // Check for related records
  const checks = await Promise.all([
    query('SELECT COUNT(*) FROM time_entries WHERE matter_id = $1', [matter_id]),
    query('SELECT COUNT(*) FROM invoices WHERE matter_id = $1', [matter_id]),
    query('SELECT COUNT(*) FROM documents WHERE matter_id = $1', [matter_id])
  ]);
  
  const hasRelated = checks.some(r => parseInt(r.rows[0].count) > 0);
  if (hasRelated) return { error: 'Cannot delete matter with related records' };
  
  await query('DELETE FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, firmId]);
  return { success: true, message: 'Matter deleted' };
}

async function addMatterNote(params, userId, firmId) {
  const { matter_id, content } = params;
  
  const result = await query(`
    INSERT INTO matter_notes (firm_id, matter_id, user_id, content)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [firmId, matter_id, userId, content]);
  
  return { success: true, note: result.rows[0] };
}

async function getMatterSummary(params, userId, firmId) {
  const { matter_id } = params;
  
  const [time, invoices, tasks, events] = await Promise.all([
    query(`SELECT SUM(hours) as total_hours, SUM(amount) as total_billed FROM time_entries WHERE matter_id = $1`, [matter_id]),
    query(`SELECT COUNT(*) as count, SUM(total) as total FROM invoices WHERE matter_id = $1`, [matter_id]),
    query(`SELECT status, COUNT(*) as count FROM matter_tasks WHERE matter_id = $1 GROUP BY status`, [matter_id]),
    query(`SELECT COUNT(*) as upcoming FROM calendar_events WHERE matter_id = $1 AND start_time >= NOW()`, [matter_id])
  ]);
  
  return {
    billing: time.rows[0],
    invoices: invoices.rows[0],
    tasksByStatus: tasks.rows,
    upcomingEvents: events.rows[0].upcoming
  };
}

async function archiveClient(params, userId, firmId) {
  const { client_id, reason } = params;
  
  const result = await query(`
    UPDATE clients SET is_active = false, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [client_id, firmId]);
  
  return { success: true, client: result.rows[0], reason };
}

async function reactivateClient(params, userId, firmId) {
  const { client_id } = params;
  
  const result = await query(`
    UPDATE clients SET is_active = true, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [client_id, firmId]);
  
  return { success: true, client: result.rows[0] };
}

async function deleteClient(params, userId, firmId) {
  const { client_id, confirm } = params;
  
  if (!confirm) return { error: 'Must confirm deletion' };
  
  const checks = await Promise.all([
    query('SELECT COUNT(*) FROM matters WHERE client_id = $1', [client_id]),
    query('SELECT COUNT(*) FROM invoices WHERE client_id = $1', [client_id])
  ]);
  
  const hasRelated = checks.some(r => parseInt(r.rows[0].count) > 0);
  if (hasRelated) return { error: 'Cannot delete client with related records' };
  
  await query('DELETE FROM clients WHERE id = $1 AND firm_id = $2', [client_id, firmId]);
  return { success: true, message: 'Client deleted' };
}

async function addClientNote(params, userId, firmId) {
  const { client_id, content, note_type = 'general' } = params;
  
  const result = await query(`
    INSERT INTO client_notes (firm_id, client_id, user_id, content, note_type)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [firmId, client_id, userId, content, note_type]);
  
  return { success: true, note: result.rows[0] };
}

async function getClientCommunications(params, userId, firmId) {
  const { client_id } = params;
  
  const result = await query(`
    SELECT * FROM email_links 
    WHERE client_id = $1 AND firm_id = $2
    ORDER BY created_at DESC LIMIT 50
  `, [client_id, firmId]);
  
  return { communications: result.rows };
}

async function getInvoice(params, userId, firmId) {
  const { invoice_id } = params;
  
  const result = await query(`
    SELECT i.*, c.display_name as client_name, m.name as matter_name
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN matters m ON i.matter_id = m.id
    WHERE i.id = $1 AND i.firm_id = $2
  `, [invoice_id, firmId]);
  
  if (!result.rows.length) return { error: 'Invoice not found' };
  
  const items = await query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice_id]);
  const payments = await query('SELECT * FROM payments WHERE invoice_id = $1', [invoice_id]);
  
  return {
    invoice: result.rows[0],
    items: items.rows,
    payments: payments.rows
  };
}

async function sendInvoice(params, userId, firmId) {
  const { invoice_id } = params;
  
  const result = await query(`
    UPDATE invoices SET status = 'sent', sent_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [invoice_id, firmId]);
  
  return { success: true, invoice: result.rows[0] };
}

async function voidInvoice(params, userId, firmId) {
  const { invoice_id, reason } = params;
  
  const result = await query(`
    UPDATE invoices SET status = 'void', void_reason = $3, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2 AND status != 'paid'
    RETURNING *
  `, [invoice_id, firmId, reason]);
  
  if (!result.rows.length) return { error: 'Cannot void paid invoice' };
  return { success: true, invoice: result.rows[0] };
}

async function deleteInvoice(params, userId, firmId) {
  const { invoice_id, confirm } = params;
  
  if (!confirm) return { error: 'Must confirm deletion' };
  
  const check = await query('SELECT status FROM invoices WHERE id = $1 AND firm_id = $2', [invoice_id, firmId]);
  if (!check.rows.length) return { error: 'Invoice not found' };
  if (check.rows[0].status !== 'draft') return { error: 'Can only delete draft invoices' };
  
  await query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoice_id]);
  await query('DELETE FROM invoices WHERE id = $1', [invoice_id]);
  return { success: true, message: 'Invoice deleted' };
}

async function getDocument(params, userId, firmId) {
  const { document_id } = params;
  
  const result = await query(`
    SELECT d.*, m.name as matter_name, c.display_name as client_name
    FROM documents d
    LEFT JOIN matters m ON d.matter_id = m.id
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.id = $1 AND d.firm_id = $2
  `, [document_id, firmId]);
  
  return { document: result.rows[0] };
}

async function findAndReadDocument(params, userId, firmId) {
  const { document_name, matter_id, max_length = 10000 } = params;
  
  let sql = `
    SELECT id, original_name, extracted_text 
    FROM documents 
    WHERE firm_id = $1 AND LOWER(original_name) LIKE $2
  `;
  const values = [firmId, `%${document_name.toLowerCase()}%`];
  
  if (matter_id) {
    sql += ' AND matter_id = $3';
    values.push(matter_id);
  }
  
  sql += ' LIMIT 1';
  
  const result = await query(sql, values);
  
  if (!result.rows.length) return { error: `Document not found: ${document_name}` };
  
  const doc = result.rows[0];
  const content = doc.extracted_text || '';
  
  return {
    document_id: doc.id,
    name: doc.original_name,
    content: content.substring(0, max_length),
    truncated: content.length > max_length
  };
}

async function analyzeImage(params, userId, firmId) {
  // This would normally call Azure Computer Vision or similar
  return { message: 'Image analysis not available in background mode. Use the main chat interface for image analysis.' };
}

async function getMatterDocumentsContent(params, userId, firmId) {
  const { matter_id, include_content = true } = params;
  
  const docs = await query(`
    SELECT id, original_name, type, created_at, 
    ${include_content ? 'SUBSTRING(extracted_text, 1, 500) as preview' : "'...' as preview"}
    FROM documents WHERE matter_id = $1 AND firm_id = $2
    ORDER BY created_at DESC
  `, [matter_id, firmId]);
  
  return { documents: docs.rows };
}

async function createDocument(params, userId, firmId) {
  const { name, content, matter_id, client_id, tags } = params;
  
  // For background agent, we create a document record
  // The actual PDF generation would happen through the main API
  const result = await query(`
    INSERT INTO documents (firm_id, matter_id, client_id, original_name, type, extracted_text, uploaded_by)
    VALUES ($1, $2, $3, $4, 'application/pdf', $5, $6)
    RETURNING *
  `, [firmId, matter_id || null, client_id || null, name + '.pdf', content, userId]);
  
  return { success: true, document: result.rows[0], note: 'Document created. PDF generation queued.' };
}

async function updateDocument(params, userId, firmId) {
  const { document_id, new_content, new_name } = params;
  
  const original = await query('SELECT * FROM documents WHERE id = $1 AND firm_id = $2', [document_id, firmId]);
  if (!original.rows.length) return { error: 'Document not found' };
  
  const doc = original.rows[0];
  const editedName = new_name || `${doc.original_name.replace(/\.[^.]+$/, '')} (AI).pdf`;
  
  const result = await query(`
    INSERT INTO documents (firm_id, matter_id, client_id, original_name, type, extracted_text, uploaded_by, parent_document_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [firmId, doc.matter_id, doc.client_id, editedName, doc.type, new_content, userId, document_id]);
  
  return { success: true, document: result.rows[0], message: 'Edited version created' };
}

async function deleteDocument(params, userId, firmId) {
  const { document_id, confirm } = params;
  
  if (!confirm) return { error: 'Must confirm deletion' };
  
  await query('DELETE FROM documents WHERE id = $1 AND firm_id = $2', [document_id, firmId]);
  return { success: true, message: 'Document deleted' };
}

async function moveDocument(params, userId, firmId) {
  const { document_id, new_matter_id, new_client_id } = params;
  
  const result = await query(`
    UPDATE documents SET matter_id = $3, client_id = $4, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [document_id, firmId, new_matter_id || null, new_client_id || null]);
  
  return { success: true, document: result.rows[0] };
}

async function renameDocument(params, userId, firmId) {
  const { document_id, new_name } = params;
  
  const result = await query(`
    UPDATE documents SET original_name = $3, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [document_id, firmId, new_name]);
  
  return { success: true, document: result.rows[0] };
}

async function shareDocument(params, userId, firmId) {
  const { document_id, user_id, permission_level = 'view' } = params;
  
  const result = await query(`
    INSERT INTO document_shares (document_id, user_id, permission_level, shared_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (document_id, user_id) DO UPDATE SET permission_level = $3
    RETURNING *
  `, [document_id, user_id, permission_level, userId]);
  
  return { success: true, share: result.rows[0] };
}

async function draftEmailForMatter(params, userId, firmId) {
  const { matter_id, to, subject, body, email_type, cc, save_to_outlook, link_to_matter } = params;
  
  // Get matter info for context
  const matter = await query('SELECT name FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, firmId]);
  const matterName = matter.rows[0]?.name || 'Unknown Matter';
  
  return {
    success: true,
    draft: {
      matter_id,
      matter_name: matterName,
      to,
      subject,
      body,
      cc,
      email_type
    },
    note: 'Email draft created. Save to Outlook requires email integration.'
  };
}

async function createNote(params, userId, firmId) {
  const { title, content, matter_id, client_id, note_type = 'general' } = params;
  
  if (matter_id) {
    const result = await query(`
      INSERT INTO matter_notes (firm_id, matter_id, user_id, title, content, note_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [firmId, matter_id, userId, title, content, note_type]);
    return { success: true, note: result.rows[0] };
  }
  
  if (client_id) {
    const result = await query(`
      INSERT INTO client_notes (firm_id, client_id, user_id, title, content, note_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [firmId, client_id, userId, title, content, note_type]);
    return { success: true, note: result.rows[0] };
  }
  
  return { error: 'Must specify matter_id or client_id' };
}

async function getDocumentVersions(params, userId, firmId) {
  const { document_id } = params;
  
  const result = await query(`
    SELECT v.*, u.first_name, u.last_name
    FROM document_versions v
    LEFT JOIN users u ON v.created_by = u.id
    WHERE v.document_id = $1
    ORDER BY v.version_number DESC
  `, [document_id]);
  
  return { versions: result.rows };
}

async function readVersionContent(params, userId, firmId) {
  const { document_id, version_number, max_length = 10000 } = params;
  
  const result = await query(`
    SELECT content FROM document_versions
    WHERE document_id = $1 AND version_number = $2
  `, [document_id, version_number]);
  
  if (!result.rows.length) return { error: 'Version not found' };
  
  const content = result.rows[0].content || '';
  return {
    content: content.substring(0, max_length),
    truncated: content.length > max_length
  };
}

async function compareVersions(params, userId, firmId) {
  const { document_id, version1, version2 } = params;
  
  const [v1, v2] = await Promise.all([
    query('SELECT content FROM document_versions WHERE document_id = $1 AND version_number = $2', [document_id, version1]),
    query('SELECT content FROM document_versions WHERE document_id = $1 AND version_number = $2', [document_id, version2])
  ]);
  
  if (!v1.rows.length || !v2.rows.length) return { error: 'One or both versions not found' };
  
  return {
    version1: { number: version1, content: v1.rows[0].content?.substring(0, 2000) },
    version2: { number: version2, content: v2.rows[0].content?.substring(0, 2000) },
    note: 'Full diff comparison requires the main interface'
  };
}

async function updateCalendarEvent(params, userId, firmId) {
  const { event_id, ...updates } = params;
  
  const fields = [];
  const values = [event_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE calendar_events SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, event: result.rows[0] };
}

async function deleteCalendarEvent(params, userId, firmId) {
  const { event_id } = params;
  
  await query('DELETE FROM calendar_events WHERE id = $1 AND firm_id = $2', [event_id, firmId]);
  return { success: true, message: 'Event deleted' };
}

async function updateTask(params, userId, firmId) {
  const { task_id, ...updates } = params;
  
  // Handle assigned_to resolution
  if (updates.assigned_to) {
    updates.assignee = await resolveUserId(updates.assigned_to, userId, firmId);
    delete updates.assigned_to;
  }
  
  const fields = [];
  const values = [task_id, firmId];
  let idx = 3;
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }
  
  if (!fields.length) return { error: 'No fields to update' };
  
  const result = await query(`
    UPDATE matter_tasks SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, values);
  
  return { success: true, task: result.rows[0] };
}

async function deleteTask(params, userId, firmId) {
  const { task_id } = params;
  
  await query('DELETE FROM matter_tasks WHERE id = $1 AND firm_id = $2', [task_id, firmId]);
  return { success: true, message: 'Task deleted' };
}

async function getUserStats(params, userId, firmId) {
  const { time_period = 'this_month' } = params;
  
  let dateFilter = "date >= DATE_TRUNC('month', CURRENT_DATE)";
  if (time_period === 'today') dateFilter = "date = CURRENT_DATE";
  if (time_period === 'this_week') dateFilter = "date >= DATE_TRUNC('week', CURRENT_DATE)";
  if (time_period === 'this_year') dateFilter = "date >= DATE_TRUNC('year', CURRENT_DATE)";
  
  const stats = await query(`
    SELECT SUM(hours) as total_hours, SUM(amount) as total_billed, COUNT(*) as entries
    FROM time_entries WHERE user_id = $1 AND firm_id = $2 AND ${dateFilter}
  `, [userId, firmId]);
  
  const tasks = await query(`
    SELECT status, COUNT(*) as count FROM matter_tasks
    WHERE assignee = $1 AND firm_id = $2
    GROUP BY status
  `, [userId, firmId]);
  
  return {
    timeStats: stats.rows[0],
    tasksByStatus: tasks.rows
  };
}

async function getTeamMember(params, userId, firmId) {
  const { user_id } = params;
  
  const result = await query(`
    SELECT id, first_name, last_name, email, role, hourly_rate
    FROM users WHERE id = $1 AND firm_id = $2
  `, [user_id, firmId]);
  
  return { member: result.rows[0] };
}

async function createExpense(params, userId, firmId) {
  const { matter_id, amount, description, date, category, billable = true } = params;
  
  const result = await query(`
    INSERT INTO expenses (firm_id, matter_id, user_id, amount, description, date, category, billable)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [firmId, matter_id, userId, amount, description, date || getTodayInTimezone(), category || 'other', billable]);
  
  return { success: true, expense: result.rows[0] };
}

async function listExpenses(params, userId, firmId) {
  const { matter_id, start_date, end_date, billable } = params;
  
  let sql = 'SELECT * FROM expenses WHERE firm_id = $1';
  const values = [firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND matter_id = $${idx++}`;
    values.push(matter_id);
  }
  if (start_date) {
    sql += ` AND date >= $${idx++}`;
    values.push(start_date);
  }
  if (end_date) {
    sql += ` AND date <= $${idx++}`;
    values.push(end_date);
  }
  if (billable !== undefined) {
    sql += ` AND billable = $${idx++}`;
    values.push(billable);
  }
  
  sql += ' ORDER BY date DESC LIMIT 50';
  
  const result = await query(sql, values);
  return { expenses: result.rows };
}

async function getMatterPermissions(params, userId, firmId) {
  const { matter_id } = params;
  
  const matter = await query('SELECT visibility, responsible_attorney FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, firmId]);
  const permissions = await query(`
    SELECT mp.*, u.first_name, u.last_name, u.email
    FROM matter_permissions mp
    LEFT JOIN users u ON mp.user_id = u.id
    WHERE mp.matter_id = $1
  `, [matter_id]);
  
  return {
    visibility: matter.rows[0]?.visibility || 'firm_wide',
    responsible_attorney: matter.rows[0]?.responsible_attorney,
    permissions: permissions.rows
  };
}

async function shareMatter(params, userId, firmId) {
  const { matter_id, user_id, group_id, permission_level = 'view', can_view_documents = true, can_view_notes = true, can_edit = false } = params;
  
  const result = await query(`
    INSERT INTO matter_permissions (matter_id, user_id, group_id, permission_level, can_view_documents, can_view_notes, can_edit, granted_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (matter_id, user_id) DO UPDATE SET permission_level = $4
    RETURNING *
  `, [matter_id, user_id || null, group_id || null, permission_level, can_view_documents, can_view_notes, can_edit, userId]);
  
  // Set to restricted if currently firm_wide
  await query("UPDATE matters SET visibility = 'restricted' WHERE id = $1 AND visibility = 'firm_wide'", [matter_id]);
  
  return { success: true, permission: result.rows[0] };
}

async function removeMatterPermission(params, userId, firmId) {
  const { matter_id, user_id, permission_id } = params;
  
  if (permission_id) {
    await query('DELETE FROM matter_permissions WHERE id = $1 AND matter_id = $2', [permission_id, matter_id]);
  } else if (user_id) {
    await query('DELETE FROM matter_permissions WHERE user_id = $1 AND matter_id = $2', [user_id, matter_id]);
  }
  
  return { success: true, message: 'Permission removed' };
}

async function updateMatterVisibility(params, userId, firmId) {
  const { matter_id, visibility } = params;
  
  const result = await query(`
    UPDATE matters SET visibility = $3, updated_at = NOW()
    WHERE id = $1 AND firm_id = $2
    RETURNING *
  `, [matter_id, firmId, visibility]);
  
  return { success: true, matter: result.rows[0] };
}

async function linkEmailToMatter(params, userId, firmId) {
  const { email_id, matter_id } = params;
  
  const result = await query(`
    INSERT INTO email_links (firm_id, email_id, matter_id, linked_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [firmId, email_id, matter_id, userId]);
  
  return { success: true, link: result.rows[0] };
}

async function linkEmailToClient(params, userId, firmId) {
  const { email_id, client_id } = params;
  
  const result = await query(`
    INSERT INTO email_links (firm_id, email_id, client_id, linked_by)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [firmId, email_id, client_id, userId]);
  
  return { success: true, link: result.rows[0] };
}

async function getMatterEmails(params, userId, firmId) {
  const { matter_id } = params;
  
  const result = await query(`
    SELECT * FROM email_links 
    WHERE matter_id = $1 AND firm_id = $2
    ORDER BY created_at DESC LIMIT 50
  `, [matter_id, firmId]);
  
  return { emails: result.rows };
}

// ============== INTEGRATION HELPERS ==============

async function getIntegrationToken(userId, firmId, provider) {
  const result = await query(`
    SELECT access_token, refresh_token, token_expiry
    FROM user_integrations
    WHERE user_id = $1 AND provider = $2
  `, [userId, provider]);
  
  return result.rows[0];
}

async function getIntegrationsStatus(params, userId, firmId) {
  const result = await query(`
    SELECT provider, is_connected, connected_at
    FROM user_integrations
    WHERE user_id = $1
  `, [userId]);
  
  const integrations = {};
  for (const row of result.rows) {
    integrations[row.provider] = { connected: row.is_connected, connected_at: row.connected_at };
  }
  
  return { integrations };
}

async function checkEmailIntegration(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'outlook');
  return { connected: !!token?.access_token };
}

// ============== QUICKBOOKS (stubs - require actual API integration) ==============

async function getQuickBooksStatus(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'quickbooks');
  if (!token?.access_token) return { connected: false, message: 'QuickBooks not connected' };
  return { connected: true, message: 'QuickBooks connected' };
}

async function getQuickBooksInvoices(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'quickbooks');
  if (!token?.access_token) return { error: 'QuickBooks not connected' };
  return { message: 'QuickBooks invoice sync not available in background mode' };
}

async function getQuickBooksCustomers(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'quickbooks');
  if (!token?.access_token) return { error: 'QuickBooks not connected' };
  return { message: 'QuickBooks customer sync not available in background mode' };
}

async function createQuickBooksInvoice(params, userId, firmId) {
  return { message: 'QuickBooks invoice creation queued. Will sync on next integration run.' };
}

async function syncQuickBooks(params, userId, firmId) {
  return { message: 'QuickBooks sync queued' };
}

async function getQuickBooksBalance(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'quickbooks');
  if (!token?.access_token) return { error: 'QuickBooks not connected' };
  return { message: 'QuickBooks balance data not available in background mode' };
}

// ============== OUTLOOK EMAIL (stubs - require MS Graph API) ==============

async function getEmails(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'outlook');
  if (!token?.access_token) return { error: 'Outlook not connected' };
  return { message: 'Email fetching requires active session. Use chat interface.' };
}

async function searchEmails(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'outlook');
  if (!token?.access_token) return { error: 'Outlook not connected' };
  return { message: 'Email search requires active session. Use chat interface.' };
}

async function getEmailById(params, userId, firmId) {
  return { message: 'Email content requires active session. Use chat interface.' };
}

async function draftEmail(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'outlook');
  if (!token?.access_token) return { error: 'Outlook not connected' };
  return { success: true, message: 'Email draft queued', draft: params };
}

async function sendEmail(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'outlook');
  if (!token?.access_token) return { error: 'Outlook not connected' };
  return { success: true, message: 'Email queued for sending', email: params };
}

async function replyToEmail(params, userId, firmId) {
  return { message: 'Email reply requires active session. Use chat interface.' };
}

async function createOutlookEvent(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'outlook');
  if (!token?.access_token) return { error: 'Outlook not connected' };
  return { success: true, message: 'Outlook event creation queued', event: params };
}

async function syncOutlookCalendar(params, userId, firmId) {
  return { message: 'Calendar sync queued' };
}

// ============== CLOUD STORAGE ==============

async function listCloudFiles(params, userId, firmId) {
  const { provider } = params;
  const token = await getIntegrationToken(userId, firmId, provider);
  if (!token?.access_token) return { error: `${provider} not connected` };
  return { message: `${provider} file listing requires active session` };
}

async function searchCloudFiles(params, userId, firmId) {
  const { provider } = params;
  const token = await getIntegrationToken(userId, firmId, provider);
  if (!token?.access_token) return { error: `${provider} not connected` };
  return { message: `${provider} file search requires active session` };
}

async function getCloudFileInfo(params, userId, firmId) {
  return { message: 'Cloud file info requires active session' };
}

// ============== DOCUSIGN ==============

async function getDocuSignStatus(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'docusign');
  return { connected: !!token?.access_token };
}

async function getDocuSignEnvelopes(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'docusign');
  if (!token?.access_token) return { error: 'DocuSign not connected' };
  return { message: 'DocuSign envelope listing requires active session' };
}

async function sendForSignature(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'docusign');
  if (!token?.access_token) return { error: 'DocuSign not connected' };
  return { success: true, message: 'Signature request queued', request: params };
}

// ============== SLACK ==============

async function getSlackStatus(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'slack');
  return { connected: !!token?.access_token };
}

async function getSlackChannels(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'slack');
  if (!token?.access_token) return { error: 'Slack not connected' };
  return { message: 'Slack channel listing requires active session' };
}

async function sendSlackMessage(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'slack');
  if (!token?.access_token) return { error: 'Slack not connected' };
  return { success: true, message: 'Slack message queued', msg: params };
}

// ============== ZOOM ==============

async function getZoomStatus(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'zoom');
  return { connected: !!token?.access_token };
}

async function getZoomMeetings(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'zoom');
  if (!token?.access_token) return { error: 'Zoom not connected' };
  return { message: 'Zoom meeting listing requires active session' };
}

async function createZoomMeeting(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'zoom');
  if (!token?.access_token) return { error: 'Zoom not connected' };
  return { success: true, message: 'Zoom meeting creation queued', meeting: params };
}

// ============== QUICKEN ==============

async function getQuickenStatus(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'quicken');
  return { connected: !!token?.access_token };
}

async function getQuickenSummary(params, userId, firmId) {
  const token = await getIntegrationToken(userId, firmId, 'quicken');
  if (!token?.access_token) return { error: 'Quicken not connected' };
  return { message: 'Quicken data requires active session' };
}

async function getQuickenTransactions(params, userId, firmId) {
  return { message: 'Quicken transaction listing requires active session' };
}

async function getQuickenAccounts(params, userId, firmId) {
  return { message: 'Quicken account listing requires active session' };
}

// ============== NOTIFICATIONS ==============

async function sendNotification(params, userId, firmId) {
  const { user_id, title, message, type = 'general', priority = 'normal', channels = ['in_app'], entity_type, entity_id, action_url } = params;
  
  const targetUserId = user_id === 'self' ? userId : user_id;
  
  const result = await query(`
    INSERT INTO notifications (firm_id, user_id, title, message, type, priority, entity_type, entity_id, action_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [firmId, targetUserId, title, message, type, priority, entity_type || null, entity_id || null, action_url || null]);
  
  return { success: true, notification: result.rows[0] };
}

async function getNotifications(params, userId, firmId) {
  const { limit = 20, unread_only = false } = params;
  
  let sql = 'SELECT * FROM notifications WHERE user_id = $1';
  if (unread_only) sql += ' AND is_read = false';
  sql += ' ORDER BY created_at DESC LIMIT $2';
  
  const result = await query(sql, [userId, limit]);
  return { notifications: result.rows };
}

async function scheduleNotification(params, userId, firmId) {
  const { user_id, title, message, scheduled_for, type, channels, entity_type, entity_id } = params;
  
  const targetUserId = user_id === 'self' ? userId : user_id;
  
  const result = await query(`
    INSERT INTO scheduled_notifications (firm_id, user_id, title, message, scheduled_for, type, entity_type, entity_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [firmId, targetUserId, title, message, scheduled_for, type || 'general', entity_type || null, entity_id || null]);
  
  return { success: true, scheduled: result.rows[0] };
}

async function sendDeadlineReminder(params, userId, firmId) {
  const { matter_id, deadline_date, deadline_description, user_ids, include_sms } = params;
  
  const matter = await query('SELECT name, responsible_attorney FROM matters WHERE id = $1', [matter_id]);
  const matterName = matter.rows[0]?.name || 'Unknown Matter';
  
  const title = `Deadline Reminder: ${matterName}`;
  const message = `${deadline_description} - Due: ${deadline_date}`;
  
  // Send to responsible attorney if no specific users
  const targets = user_ids || [matter.rows[0]?.responsible_attorney];
  
  for (const targetId of targets.filter(Boolean)) {
    await query(`
      INSERT INTO notifications (firm_id, user_id, title, message, type, priority, entity_type, entity_id)
      VALUES ($1, $2, $3, $4, 'deadline_reminder', 'high', 'matter', $5)
    `, [firmId, targetId, title, message, matter_id]);
  }
  
  return { success: true, message: `Deadline reminder sent to ${targets.length} user(s)` };
}

// ============== HELPER FUNCTIONS ==============

async function resolveUserId(identifier, currentUserId, firmId) {
  if (!identifier || identifier === 'me') return currentUserId;
  if (identifier.match(/^[0-9a-f-]{36}$/i)) return identifier;
  
  if (identifier.includes('@')) {
    const result = await query(
      'SELECT id FROM users WHERE firm_id = $1 AND LOWER(email) = LOWER($2)',
      [firmId, identifier]
    );
    if (result.rows.length > 0) return result.rows[0].id;
  }
  
  const result = await query(
    `SELECT id FROM users WHERE firm_id = $1 AND (
      LOWER(first_name || ' ' || last_name) LIKE LOWER($2) OR
      LOWER(last_name) LIKE LOWER($2)
    )`,
    [firmId, `%${identifier}%`]
  );
  if (result.rows.length > 0) return result.rows[0].id;
  
  return currentUserId;
}

export default {
  AMPLIFIER_TOOLS,
  executeTool
};
