import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { hasPermission } from '../utils/auth.js';
import {
  DEFAULT_TIMEZONE,
  getDatePartsInTimezone,
  getTodayInTimezone,
  getTomorrowInTimezone,
  createDateInTimezone,
  getCurrentTimePartsInTimezone,
  formatDate,
  formatTime,
  formatDateTime,
  getDateInTimezone
} from '../utils/dateUtils.js';

const router = Router();

// Azure OpenAI configuration
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = '2024-08-01-preview';

// =============================================================================
// TOOL DEFINITIONS - Complete set of user actions
// =============================================================================
const TOOLS = [
  // ===================== TIME ENTRIES =====================
  {
    type: "function",
    function: {
      name: "log_time",
      description: "Log billable time for the user on a specific matter. Use this when the user wants to record time spent on a case.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter. Use search_matters to find it." },
          hours: { type: "number", description: "Hours to log (0.1 to 24)" },
          description: { type: "string", description: "Description of work performed" },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Defaults to today." },
          billable: { type: "boolean", description: "Whether billable. Defaults to true." },
          activity_code: { type: "string", description: "Activity code (optional)" }
        },
        required: ["matter_id", "hours", "description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_my_time_entries",
      description: "Get the user's recent time entries.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number to return (default 20)" },
          start_date: { type: "string", description: "Filter from date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "Filter to date (YYYY-MM-DD)" },
          matter_id: { type: "string", description: "Filter by matter UUID" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_time_entry",
      description: "Update an existing time entry.",
      parameters: {
        type: "object",
        properties: {
          time_entry_id: { type: "string", description: "UUID of the time entry to update" },
          hours: { type: "number", description: "New hours value" },
          description: { type: "string", description: "New description" },
          date: { type: "string", description: "New date (YYYY-MM-DD)" },
          billable: { type: "boolean", description: "Whether billable" }
        },
        required: ["time_entry_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_time_entry",
      description: "Delete a time entry. Cannot delete if already billed.",
      parameters: {
        type: "object",
        properties: {
          time_entry_id: { type: "string", description: "UUID of the time entry to delete" }
        },
        required: ["time_entry_id"]
      }
    }
  },

  // ===================== MATTERS =====================
  {
    type: "function",
    function: {
      name: "list_my_matters",
      description: "Get matters the user can access.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "pending", "closed", "on_hold"], description: "Filter by status" },
          limit: { type: "integer", description: "Number to return (default 50)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_matters",
      description: "Search for matters by name, number, or client.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search term" },
          status: { type: "string", enum: ["active", "pending", "closed", "on_hold"] },
          client_id: { type: "string", description: "Filter by client UUID" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_matter",
      description: "Get comprehensive information about a matter including: details, documents (with content previews), linked emails, tasks, events, invoices, and billing stats. Use this to understand everything about a case.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_matter",
      description: "Create a new legal matter/case.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Matter name (e.g., 'Smith v. Jones')" },
          client_id: { type: "string", description: "Client UUID (use list_clients to find)" },
          description: { type: "string", description: "Matter description" },
          type: { type: "string", description: "Matter type (litigation, contract, corporate, etc.)" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
          billing_type: { type: "string", enum: ["hourly", "flat", "contingency", "retainer", "pro_bono"] },
          billing_rate: { type: "number", description: "Hourly rate if applicable" },
          court_name: { type: "string", description: "Court name if applicable" },
          case_number: { type: "string", description: "Case number if applicable" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_matter",
      description: "Update an existing matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          name: { type: "string", description: "New name" },
          description: { type: "string", description: "New description" },
          status: { type: "string", enum: ["active", "pending", "closed", "on_hold"] },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          billing_rate: { type: "number", description: "New billing rate" }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "close_matter",
      description: "Close a matter. Optionally set a resolution/outcome.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          resolution: { type: "string", description: "Resolution/outcome (e.g., 'Settled', 'Won', 'Lost', 'Dismissed')" },
          closing_notes: { type: "string", description: "Notes about why the matter was closed" }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "archive_matter",
      description: "Archive a closed matter to remove it from active lists.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reopen_matter",
      description: "Reopen a closed or archived matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          reason: { type: "string", description: "Reason for reopening" }
        },
        required: ["matter_id"]
      }
    }
  },

  // ===================== CLIENTS =====================
  {
    type: "function",
    function: {
      name: "list_clients",
      description: "Get a list of clients.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by name" },
          type: { type: "string", enum: ["person", "company"], description: "Filter by type" },
          limit: { type: "integer", description: "Number to return (default 50)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_client",
      description: "Get comprehensive information about a client including: contact details, all matters, documents (with previews), communications/emails, invoices, and billing stats. Use this to understand everything about a client relationship.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" }
        },
        required: ["client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Create a new client.",
      parameters: {
        type: "object",
        properties: {
          display_name: { type: "string", description: "Full name or company name" },
          type: { type: "string", enum: ["person", "company"], description: "Client type" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          first_name: { type: "string", description: "First name (for person)" },
          last_name: { type: "string", description: "Last name (for person)" },
          company_name: { type: "string", description: "Company name" },
          address_street: { type: "string" },
          address_city: { type: "string" },
          address_state: { type: "string" },
          address_zip: { type: "string" },
          notes: { type: "string", description: "Additional notes" }
        },
        required: ["display_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_client",
      description: "Update an existing client.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          display_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address_street: { type: "string" },
          address_city: { type: "string" },
          address_state: { type: "string" },
          address_zip: { type: "string" },
          notes: { type: "string" }
        },
        required: ["client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "archive_client",
      description: "Archive a client to remove them from active lists. Their matters and history are preserved.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          reason: { type: "string", description: "Reason for archiving" }
        },
        required: ["client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reactivate_client",
      description: "Reactivate an archived client.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" }
        },
        required: ["client_id"]
      }
    }
  },

  // ===================== INVOICES =====================
  {
    type: "function",
    function: {
      name: "list_invoices",
      description: "Get a list of invoices including invoices synced from QuickBooks.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "sent", "paid", "pending", "overdue", "partial", "void"] },
          client_id: { type: "string", description: "Filter by client" },
          matter_id: { type: "string", description: "Filter by matter" },
          source: { type: "string", description: "Filter by source: 'local' or 'quickbooks'" },
          limit: { type: "integer" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_invoice",
      description: "Get detailed information about a specific invoice.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "UUID of the invoice" }
        },
        required: ["invoice_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_invoice",
      description: "Create a new invoice for a client. Can include unbilled time entries and/or custom line items with specific amounts.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client (required)" },
          matter_id: { type: "string", description: "UUID of the matter (optional)" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          notes: { type: "string", description: "Invoice notes" },
          include_unbilled_time: { type: "boolean", description: "Include unbilled time entries. Defaults to false when custom items provided." },
          items: { 
            type: "array", 
            description: "Custom line items to add to the invoice",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Item description" },
                amount: { type: "number", description: "Item amount in dollars" },
                quantity: { type: "number", description: "Quantity (defaults to 1)" }
              },
              required: ["description", "amount"]
            }
          },
          amount: { type: "number", description: "Simple way to create invoice with single amount (alternative to items array)" }
        },
        required: ["client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_invoice",
      description: "Mark an invoice as sent.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "UUID of the invoice" }
        },
        required: ["invoice_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "record_payment",
      description: "Record a payment against an invoice.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "UUID of the invoice" },
          amount: { type: "number", description: "Payment amount" },
          payment_method: { type: "string", description: "Payment method (check, credit_card, bank_transfer, cash)" },
          payment_date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
          reference: { type: "string", description: "Payment reference/check number" },
          notes: { type: "string", description: "Payment notes" }
        },
        required: ["invoice_id", "amount"]
      }
    }
  },

  // ===================== TASKS =====================
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task or to-do item. Can be assigned to a matter, client, or user.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title/description" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
          matter_id: { type: "string", description: "Optional: Link to a matter" },
          client_id: { type: "string", description: "Optional: Link to a client" },
          assigned_to: { type: "string", description: "Optional: User ID to assign to" },
          notes: { type: "string", description: "Additional notes" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Get a list of tasks. Can filter by status, matter, or assignee.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
          matter_id: { type: "string", description: "Filter by matter" },
          assigned_to: { type: "string", description: "Filter by assignee (user ID or 'me')" },
          due_before: { type: "string", description: "Filter tasks due before this date" },
          include_completed: { type: "boolean", description: "Include completed tasks (default false)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID of the task" }
        },
        required: ["task_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update a task.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID of the task" },
          title: { type: "string" },
          due_date: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
          assigned_to: { type: "string" },
          notes: { type: "string" }
        },
        required: ["task_id"]
      }
    }
  },

  // ===================== REPORTS =====================
  {
    type: "function",
    function: {
      name: "generate_report",
      description: "Generate various reports about firm performance, billing, productivity, etc.",
      parameters: {
        type: "object",
        properties: {
          report_type: { 
            type: "string", 
            enum: ["billing_summary", "time_by_matter", "time_by_user", "revenue", "outstanding_invoices", "matter_status", "productivity", "client_summary"],
            description: "Type of report to generate"
          },
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
          matter_id: { type: "string", description: "Optional: Filter by matter" },
          client_id: { type: "string", description: "Optional: Filter by client" },
          user_id: { type: "string", description: "Optional: Filter by user" }
        },
        required: ["report_type"]
      }
    }
  },

  // ===================== CALENDAR =====================
  {
    type: "function",
    function: {
      name: "get_calendar_events",
      description: "Get upcoming calendar events.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "integer", description: "Days to look ahead (default 7)" },
          days_behind: { type: "integer", description: "Days to look behind (default 0)" },
          matter_id: { type: "string", description: "Filter by matter" },
          type: { type: "string", enum: ["meeting", "court_date", "deadline", "reminder", "task", "deposition", "other"] }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a new calendar event. Use this when the user wants to schedule a meeting, deadline, court date, or any other calendar event.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title (required)" },
          start_time: { type: "string", description: "Start date/time in ISO 8601 format, e.g., '2025-01-15T14:00:00' (required)" },
          end_time: { type: "string", description: "End date/time (optional, defaults to 1 hour after start)" },
          type: { type: "string", enum: ["meeting", "court_date", "deadline", "reminder", "task", "closing", "deposition", "other"], description: "Type of event (optional, defaults to 'meeting')" },
          matter_id: { type: "string", description: "Associated matter UUID (optional)" },
          location: { type: "string", description: "Event location (optional)" },
          description: { type: "string", description: "Event description/notes (optional)" },
          all_day: { type: "boolean", description: "Whether this is an all-day event (optional, defaults to false)" }
        },
        required: ["title", "start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_calendar_event",
      description: "Update an existing calendar event.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "UUID of the event" },
          title: { type: "string" },
          start_time: { type: "string" },
          end_time: { type: "string" },
          type: { type: "string", enum: ["meeting", "court_date", "deadline", "reminder", "task", "deposition", "other"] },
          location: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["confirmed", "tentative", "cancelled"] }
        },
        required: ["event_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_calendar_event",
      description: "Delete a calendar event.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "UUID of the event" }
        },
        required: ["event_id"]
      }
    }
  },

  // ===================== DOCUMENTS =====================
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "Search and list documents in the system. Use this FIRST when a user asks about a document by name - it will return document IDs you can then use with read_document_content to get the full text.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Filter by matter ID" },
          client_id: { type: "string", description: "Filter by client ID" },
          search: { type: "string", description: "Search documents by name (e.g. 'contract', 'NDA', 'buddha boy')" },
          source: { type: "string", description: "Filter by source: 'local', 'onedrive', 'googledrive', 'dropbox'" },
          limit: { type: "integer", description: "Max results to return (default 20)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_document",
      description: "Get information about a specific document.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document" }
        },
        required: ["document_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_document_content",
      description: "Read the FULL TEXT content of a document. Use this after finding a document with list_documents to read what's inside it. Works with PDFs, Word docs, text files. Returns the actual document text so you can answer questions about it.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document (get this from list_documents first)" },
          max_length: { type: "number", description: "Max characters to return (default 10000, max 50000)" }
        },
        required: ["document_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_matter_documents_content",
      description: "Get a summary of all documents attached to a matter, including their content previews. Useful for understanding the full picture of a case.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          include_content: { type: "boolean", description: "Include document content previews (default true)" }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_document_content",
      description: "Search within document contents across all documents in the firm. Find specific clauses, terms, or information.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string", description: "Text to search for within documents" },
          matter_id: { type: "string", description: "Optional: limit search to specific matter" },
          client_id: { type: "string", description: "Optional: limit search to specific client" }
        },
        required: ["search_term"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "save_uploaded_document",
      description: "Save an uploaded document to the Documents page. Use this when user uploads a file in chat and wants to save it to a matter or client.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Matter to attach the document to" },
          client_id: { type: "string", description: "Client to attach the document to" },
          document_name: { type: "string", description: "Optional: rename the document" },
          tags: { type: "array", items: { type: "string" }, description: "Optional: tags for the document" }
        },
        required: []
      }
    }
  },

  // ===================== TEAM =====================
  {
    type: "function",
    function: {
      name: "list_team_members",
      description: "Get a list of team members in the firm.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Filter by role" },
          active_only: { type: "boolean", description: "Only show active members (default true)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_team_member",
      description: "Get information about a specific team member.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "UUID of the team member" }
        },
        required: ["user_id"]
      }
    }
  },

  // ===================== EXPENSES =====================
  {
    type: "function",
    function: {
      name: "create_expense",
      description: "Create a new expense entry.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          amount: { type: "number", description: "Expense amount" },
          description: { type: "string", description: "Expense description" },
          date: { type: "string", description: "Expense date (YYYY-MM-DD)" },
          category: { type: "string", description: "Expense category (filing_fees, travel, copies, postage, etc.)" },
          billable: { type: "boolean", description: "Whether billable to client (default true)" }
        },
        required: ["matter_id", "amount", "description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_expenses",
      description: "Get a list of expenses.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Filter by matter" },
          start_date: { type: "string", description: "Filter from date" },
          end_date: { type: "string", description: "Filter to date" },
          billable: { type: "boolean", description: "Filter by billable status" }
        },
        required: []
      }
    }
  },

  // ===================== ANALYTICS =====================
  {
    type: "function",
    function: {
      name: "get_firm_analytics",
      description: "Get firm-wide analytics and KPIs. Admin/Partner only.",
      parameters: {
        type: "object",
        properties: {
          time_period: { type: "string", enum: ["current_month", "last_week", "last_month", "last_quarter", "year_to_date", "all_time"] }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_stats",
      description: "Get the current user's personal statistics.",
      parameters: {
        type: "object",
        properties: {
          time_period: { type: "string", enum: ["today", "this_week", "this_month", "this_year"] }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_matter_summary",
      description: "Get billing and activity summary for a specific matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" }
        },
        required: ["matter_id"]
      }
    }
  },

  // ===================== TASKS/NOTES =====================
  {
    type: "function",
    function: {
      name: "add_matter_note",
      description: "Add a note to a matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" },
          content: { type: "string", description: "Note content" }
        },
        required: ["matter_id", "content"]
      }
    }
  },

  // ===================== AUTONOMOUS AGENT TOOLS =====================
  {
    type: "function",
    function: {
      name: "start_background_task",
      description: "REQUIRED for complex tasks! Start a background task that shows a progress bar to the user. USE THIS when: user says 'background', 'review', 'analyze', 'audit', 'research', 'prepare', or any task needing 5+ steps. The user will see real-time progress while you work.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The goal/task to accomplish" },
          plan: { type: "array", items: { type: "string" }, description: "List of steps you'll take" },
          estimated_steps: { type: "number", description: "Estimated number of actions needed" },
          matter_id: { type: "string", description: "Optional: Related matter ID" },
          client_id: { type: "string", description: "Optional: Related client ID" }
        },
        required: ["goal", "plan"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "think_and_plan",
      description: "Use this to think through a complex task and create a plan. Call this FIRST when given a complex goal. Break down the goal into steps you'll take.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The overall goal you're trying to achieve" },
          analysis: { type: "string", description: "Your analysis of what needs to be done" },
          steps: { 
            type: "array", 
            items: { type: "string" },
            description: "List of steps you plan to take to achieve the goal"
          },
          information_needed: {
            type: "array",
            items: { type: "string" },
            description: "What information you need to gather first"
          }
        },
        required: ["goal", "analysis", "steps"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "evaluate_progress",
      description: "Use this to evaluate your progress toward a goal. Call this periodically during complex tasks to check if you're on track.",
      parameters: {
        type: "object",
        properties: {
          original_goal: { type: "string", description: "The original goal" },
          completed_steps: { type: "array", items: { type: "string" }, description: "Steps you've completed" },
          remaining_steps: { type: "array", items: { type: "string" }, description: "Steps still to do" },
          blockers: { type: "array", items: { type: "string" }, description: "Any blockers or issues" },
          confidence: { type: "number", description: "Your confidence level 0-100 that you can complete this" },
          should_continue: { type: "boolean", description: "Whether you should continue or stop" }
        },
        required: ["original_goal", "completed_steps", "should_continue"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "task_complete",
      description: "Call this when you have finished a complex task or achieved a goal. Summarize what you accomplished.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The original goal" },
          summary: { type: "string", description: "Summary of what you accomplished" },
          actions_taken: { type: "array", items: { type: "string" }, description: "List of actions you took" },
          results: { type: "string", description: "The results/outcome" },
          recommendations: { type: "array", items: { type: "string" }, description: "Any recommendations for follow-up" }
        },
        required: ["goal", "summary", "actions_taken"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_human_input",
      description: "Call this when you need human guidance, approval, or clarification before proceeding. Use when uncertain or for important decisions.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "What you need to ask the human" },
          context: { type: "string", description: "Context for why you're asking" },
          options: { type: "array", items: { type: "string" }, description: "Options for the human to choose from, if applicable" },
          urgency: { type: "string", enum: ["low", "medium", "high"], description: "How urgent is this decision" },
          what_you_would_do: { type: "string", description: "What you would do if you had to decide yourself" }
        },
        required: ["question", "context"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "log_work",
      description: "Log a note about work you've done or observations you've made. Use this to keep track of your progress on complex tasks.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "What action you took or what you observed" },
          result: { type: "string", description: "The result or outcome" },
          next_step: { type: "string", description: "What you plan to do next" }
        },
        required: ["action"]
      }
    }
  },

  // ===================== NAVIGATION =====================
  {
    type: "function",
    function: {
      name: "navigate_to_page",
      description: "Navigate the user to a specific page in the application. Use this when the user asks to 'open', 'show me', 'go to', 'take me to', or 'pull up' a page like matters, clients, calendar, time tracking, billing, etc.",
      parameters: {
        type: "object",
        properties: {
          page: { 
            type: "string", 
            enum: ["dashboard", "matters", "clients", "calendar", "time", "billing", "documents", "team", "reports", "analytics", "settings"],
            description: "The page to navigate to"
          }
        },
        required: ["page"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_matter",
      description: "Open a specific matter/case for the user to view. Use this when the user wants to see, open, view, or pull up a specific matter. Search for the matter first if you don't have the ID.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter to open" }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_client",
      description: "Open a specific client's page for the user to view. Use this when the user wants to see, open, view, or pull up a specific client. Search for the client first if you don't have the ID.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client to open" }
        },
        required: ["client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_invoice",
      description: "Open a specific invoice for the user to view. Use this when the user wants to see or view a specific invoice.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "UUID of the invoice to open" }
        },
        required: ["invoice_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_new_time_entry",
      description: "Open the time entry form for the user to log time. Use this when the user wants to add, create, or log a new time entry manually.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Optional: pre-select this matter in the form" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "open_new_calendar_event",
      description: "Open the calendar event form for the user to create a new event. Use this when the user wants to add or schedule something on their calendar manually.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Optional: pre-select this date (YYYY-MM-DD)" },
          matter_id: { type: "string", description: "Optional: pre-select this matter" }
        },
        required: []
      }
    }
  },

  // ===================== MATTER PERMISSIONS & SHARING =====================
  {
    type: "function",
    function: {
      name: "get_matter_permissions",
      description: "Get the list of users and groups who have access to a specific matter. Shows the visibility setting (firm_wide or restricted), responsible attorney, originating attorney, and all explicit permissions. Use this when the user asks 'who can see this matter?', 'who has access?', 'is this matter shared?', etc.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter. Use search_matters first to find it." }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "share_matter",
      description: "Share a matter with a user or group, granting them access. This adds them to the matter's permissions. If the matter is currently 'firm_wide', it will automatically be changed to 'restricted'. Only admins, owners, billing users, or the responsible attorney can share a matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter to share. Use search_matters to find it." },
          user_id: { type: "string", description: "UUID of the user to share with. Use list_team_members to find users. Either user_id OR group_id is required, not both." },
          group_id: { type: "string", description: "UUID of the group to share with. Either user_id OR group_id is required, not both." },
          permission_level: { type: "string", enum: ["view", "edit", "admin"], description: "Level of access: 'view' (see matter), 'edit' (see and modify), 'admin' (full control including managing permissions). Defaults to 'view'." },
          can_view_documents: { type: "boolean", description: "Whether the user can view documents. Defaults to true." },
          can_view_notes: { type: "boolean", description: "Whether the user can view notes. Defaults to true." },
          can_edit: { type: "boolean", description: "Whether the user can edit the matter. Defaults to false for 'view' level, true for 'edit' and 'admin' levels." }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "remove_matter_permission",
      description: "Remove a user's or group's access to a matter. This revokes their permission to see the restricted matter. Only admins, owners, billing users, or the responsible attorney can remove permissions.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter. Use search_matters to find it." },
          user_id: { type: "string", description: "UUID of the user whose permission to remove. Either user_id OR permission_id is required." },
          permission_id: { type: "string", description: "UUID of the specific permission to remove. Get this from get_matter_permissions." }
        },
        required: ["matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_matter_visibility",
      description: "Change a matter's visibility between 'firm_wide' (everyone can see) and 'restricted' (only selected users/groups can see). When changing to 'restricted', existing assigned users keep access. Only admins, owners, billing users, or the responsible attorney can change visibility.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter. Use search_matters to find it." },
          visibility: { type: "string", enum: ["firm_wide", "restricted"], description: "'firm_wide' = everyone in the firm can see, 'restricted' = only selected users/groups" }
        },
        required: ["matter_id", "visibility"]
      }
    }
  },

  // ===================== EMAIL INTEGRATION (OUTLOOK) =====================
  {
    type: "function",
    function: {
      name: "get_emails",
      description: "Get recent emails from the user's connected Outlook account. Requires Outlook integration to be connected.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number of emails to return (default 20, max 50)" },
          search: { type: "string", description: "Search term to filter emails by subject or sender" },
          unread_only: { type: "boolean", description: "Only return unread emails" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_email",
      description: "Get the full content of a specific email by ID.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The ID of the email to retrieve" }
        },
        required: ["email_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email from the user's connected Outlook account.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address(es), comma-separated for multiple" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (plain text or HTML)" },
          cc: { type: "string", description: "CC recipients, comma-separated (optional)" },
          matter_id: { type: "string", description: "Link this email to a matter (optional)" }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reply_to_email",
      description: "Reply to an existing email.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The ID of the email to reply to" },
          body: { type: "string", description: "Reply body content" },
          reply_all: { type: "boolean", description: "Reply to all recipients (default false)" }
        },
        required: ["email_id", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "link_email_to_matter",
      description: "Link an email to a matter for record keeping.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The ID of the email" },
          matter_id: { type: "string", description: "The matter to link the email to" }
        },
        required: ["email_id", "matter_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "link_email_to_client",
      description: "Link an email to a client for record keeping.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The ID of the email" },
          client_id: { type: "string", description: "The client to link the email to" }
        },
        required: ["email_id", "client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_client_communications",
      description: "Get all emails and communications linked to a specific client.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "The client ID" }
        },
        required: ["client_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "configure_auto_email_linking",
      description: "Enable or disable automatic email linking to clients based on email address. When enabled, incoming emails from a client's email address are automatically linked to that client.",
      parameters: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "Whether to enable auto-linking" }
        },
        required: ["enabled"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_email_integration",
      description: "Check if email (Outlook) integration is connected and working.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },

  // ===================== QUICKBOOKS INTEGRATION =====================
  {
    type: "function",
    function: {
      name: "get_quickbooks_status",
      description: "Check if QuickBooks is connected and get account info.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_quickbooks_invoices",
      description: "Get invoices from QuickBooks.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number of invoices to return (default 20)" },
          status: { type: "string", enum: ["paid", "unpaid", "overdue"], description: "Filter by status" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_quickbooks_customers",
      description: "Get customers from QuickBooks.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by customer name" },
          limit: { type: "integer", description: "Number to return (default 20)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_quickbooks_invoice",
      description: "Create an invoice in QuickBooks from an Apex invoice.",
      parameters: {
        type: "object",
        properties: {
          apex_invoice_id: { type: "string", description: "UUID of the Apex invoice to push to QuickBooks" }
        },
        required: ["apex_invoice_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "sync_quickbooks",
      description: "Trigger a sync with QuickBooks to pull latest data.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_quickbooks_balance",
      description: "Get account balances and financial summary from QuickBooks.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },

  // ===================== INTEGRATION STATUS =====================
  {
    type: "function",
    function: {
      name: "get_integrations_status",
      description: "Check which integrations are connected for this user. Returns status of Outlook, OneDrive, Google, Google Drive, QuickBooks, Dropbox, DocuSign, Slack, Zoom, and Quicken. Use this FIRST when a user asks about any integration to see if it's connected.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },

  // ===================== MATTER EMAILS =====================
  {
    type: "function",
    function: {
      name: "get_matter_emails",
      description: "Get emails that have been linked to a specific matter.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter" }
        },
        required: ["matter_id"]
      }
    }
  },

  // ===================== OUTLOOK CALENDAR SYNC =====================
  {
    type: "function",
    function: {
      name: "create_outlook_event",
      description: "Create a calendar event in the user's Outlook calendar. This syncs an event FROM Apex TO Outlook.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          start_time: { type: "string", description: "Start date/time in ISO format" },
          end_time: { type: "string", description: "End date/time in ISO format (optional)" },
          location: { type: "string", description: "Event location (optional)" },
          description: { type: "string", description: "Event description (optional)" },
          matter_id: { type: "string", description: "Link to a matter (optional)" }
        },
        required: ["title", "start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "sync_outlook_calendar",
      description: "Sync calendar events from Outlook to Apex.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },

  // ===================== OUTLOOK EMAILS =====================
  {
    type: "function",
    function: {
      name: "get_emails",
      description: "Get recent emails from the user's connected Outlook inbox. Use this to show the user their emails or find specific messages.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number of emails to retrieve (default 20, max 50)" },
          folder: { type: "string", description: "Email folder (inbox, sent, drafts). Default: inbox" },
          unread_only: { type: "boolean", description: "Only show unread emails" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search for emails by sender, subject, or content. Use this when the user wants to find specific emails.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query - can search sender, subject, or body content" },
          from: { type: "string", description: "Filter by sender email or name" },
          subject: { type: "string", description: "Filter by subject line" },
          limit: { type: "integer", description: "Number of results (default 10)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_email",
      description: "Get the full content of a specific email by ID. Use this to read the complete email body.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The ID of the email to retrieve" }
        },
        required: ["email_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_email",
      description: "Create a draft email in the user's Outlook drafts folder. Use this when the user wants to compose an email but not send it yet.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address(es), comma-separated" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (can include HTML)" },
          cc: { type: "string", description: "CC recipients, comma-separated (optional)" },
          importance: { type: "string", enum: ["low", "normal", "high"], description: "Email importance (default: normal)" }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email directly through the user's Outlook. Use this when the user wants to send an email immediately.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address(es), comma-separated" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (can include HTML)" },
          cc: { type: "string", description: "CC recipients, comma-separated (optional)" },
          importance: { type: "string", enum: ["low", "normal", "high"], description: "Email importance (default: normal)" }
        },
        required: ["to", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reply_to_email",
      description: "Create a reply to an existing email. Can save as draft or send immediately.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "ID of the email to reply to" },
          body: { type: "string", description: "Reply content" },
          reply_all: { type: "boolean", description: "Reply to all recipients (default: false)" },
          send: { type: "boolean", description: "Send immediately (true) or save as draft (false, default)" }
        },
        required: ["email_id", "body"]
      }
    }
  },

  // ===================== CLOUD STORAGE =====================
  {
    type: "function",
    function: {
      name: "list_cloud_files",
      description: "List files from connected cloud storage (OneDrive, Google Drive, or Dropbox).",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["onedrive", "googledrive", "dropbox"], description: "Which cloud storage to list from" },
          folder_path: { type: "string", description: "Path to folder (default: root)" },
          limit: { type: "integer", description: "Number of files to return (default 20)" }
        },
        required: ["provider"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_cloud_files",
      description: "Search for files across connected cloud storage.",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["onedrive", "googledrive", "dropbox"], description: "Which cloud storage to search" },
          query: { type: "string", description: "Search query (filename or content)" }
        },
        required: ["provider", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cloud_file_info",
      description: "Get detailed information about a specific file in cloud storage.",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["onedrive", "googledrive", "dropbox"], description: "Which cloud storage" },
          file_id: { type: "string", description: "File ID" }
        },
        required: ["provider", "file_id"]
      }
    }
  },

  // ===================== DOCUSIGN =====================
  {
    type: "function",
    function: {
      name: "get_docusign_status",
      description: "Check DocuSign connection status and get recent envelope activity.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_docusign_envelopes",
      description: "Get DocuSign envelopes (documents sent for signature).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["sent", "delivered", "completed", "declined", "voided"], description: "Filter by status" },
          days: { type: "integer", description: "Look back this many days (default 30)" },
          limit: { type: "integer", description: "Number to return (default 20)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_for_signature",
      description: "Send a document for electronic signature via DocuSign.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "Apex document ID to send for signature" },
          signer_email: { type: "string", description: "Email of the person who needs to sign" },
          signer_name: { type: "string", description: "Name of the signer" },
          email_subject: { type: "string", description: "Subject line for the signature request" },
          email_body: { type: "string", description: "Message body for the signature request" }
        },
        required: ["document_id", "signer_email", "signer_name"]
      }
    }
  },

  // ===================== SLACK =====================
  {
    type: "function",
    function: {
      name: "get_slack_status",
      description: "Check Slack connection status and get workspace info.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_slack_channels",
      description: "List available Slack channels the bot can post to.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number of channels to return (default 20)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_slack_message",
      description: "Send a message to a Slack channel.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel name (without #) or channel ID" },
          message: { type: "string", description: "Message text to send" }
        },
        required: ["channel", "message"]
      }
    }
  },

  // ===================== ZOOM =====================
  {
    type: "function",
    function: {
      name: "get_zoom_status",
      description: "Check Zoom connection status.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_zoom_meetings",
      description: "Get upcoming Zoom meetings.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["upcoming", "scheduled", "live"], description: "Type of meetings (default: upcoming)" },
          limit: { type: "integer", description: "Number to return (default 20)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_zoom_meeting",
      description: "Create a new Zoom meeting.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Meeting topic/title" },
          start_time: { type: "string", description: "Start time in ISO format" },
          duration: { type: "integer", description: "Duration in minutes (default 60)" },
          agenda: { type: "string", description: "Meeting agenda/description" },
          matter_id: { type: "string", description: "Link to a matter (optional)" }
        },
        required: ["topic", "start_time"]
      }
    }
  },

  // ===================== QUICKEN =====================
  {
    type: "function",
    function: {
      name: "get_quicken_status",
      description: "Check Quicken connection status.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_quicken_summary",
      description: "Get a financial summary from Quicken including account balances and recent activity.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_quicken_transactions",
      description: "Get recent transactions from Quicken.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "integer", description: "Look back this many days (default 30)" },
          category: { type: "string", description: "Filter by category" },
          limit: { type: "integer", description: "Number to return (default 50)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_quicken_accounts",
      description: "Get list of accounts and their balances from Quicken.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];

// =============================================================================
// TOOL EXECUTION
// =============================================================================
async function executeTool(toolName, args, user, req = null) {
  console.log(`Executing tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      // Time Entries
      case 'log_time': return await logTime(args, user);
      case 'get_my_time_entries': return await getMyTimeEntries(args, user);
      case 'update_time_entry': return await updateTimeEntry(args, user);
      case 'delete_time_entry': return await deleteTimeEntry(args, user);
      
      // Matters
      case 'list_my_matters': return await listMyMatters(args, user);
      case 'search_matters': return await searchMatters(args, user);
      case 'get_matter': return await getMatter(args, user);
      case 'create_matter': return await createMatter(args, user);
      case 'update_matter': return await updateMatter(args, user);
      case 'close_matter': return await closeMatter(args, user);
      case 'archive_matter': return await archiveMatter(args, user);
      case 'reopen_matter': return await reopenMatter(args, user);
      
      // Clients
      case 'list_clients': return await listClients(args, user);
      case 'get_client': return await getClient(args, user);
      case 'create_client': return await createClient(args, user);
      case 'archive_client': return await archiveClient(args, user);
      case 'reactivate_client': return await reactivateClient(args, user);
      case 'update_client': return await updateClient(args, user);
      
      // Invoices
      case 'list_invoices': return await listInvoices(args, user);
      case 'get_invoice': return await getInvoice(args, user);
      case 'create_invoice': return await createInvoice(args, user);
      case 'send_invoice': return await sendInvoice(args, user);
      case 'record_payment': return await recordPayment(args, user);
      
      // Tasks
      case 'create_task': return await createTask(args, user);
      case 'list_tasks': return await listTasks(args, user);
      case 'complete_task': return await completeTask(args, user);
      case 'update_task': return await updateTask(args, user);
      
      // Reports
      case 'generate_report': return await generateReport(args, user);
      
      // Calendar
      case 'get_calendar_events': return await getCalendarEvents(args, user);
      case 'create_calendar_event': return await createCalendarEvent(args, user);
      case 'update_calendar_event': return await updateCalendarEvent(args, user);
      case 'delete_calendar_event': return await deleteCalendarEvent(args, user);
      
      // Documents
      case 'list_documents': return await listDocuments(args, user);
      case 'get_document': return await getDocument(args, user);
      case 'read_document_content': return await readDocumentContent(args, user);
      case 'get_matter_documents_content': return await getMatterDocumentsContent(args, user);
      case 'search_document_content': return await searchDocumentContent(args, user);
      case 'save_uploaded_document': return await saveUploadedDocument(args, user, req);
      
      // Team
      case 'list_team_members': return await listTeamMembers(args, user);
      case 'get_team_member': return await getTeamMember(args, user);
      
      // Expenses
      case 'create_expense': return await createExpense(args, user);
      case 'list_expenses': return await listExpenses(args, user);
      
      // Analytics
      case 'get_firm_analytics': return await getFirmAnalytics(args, user);
      case 'get_user_stats': return await getUserStats(args, user);
      case 'get_matter_summary': return await getMatterSummary(args, user);
      
      // Notes
      case 'add_matter_note': return await addMatterNote(args, user);
      
      // Autonomous Agent Tools
      case 'start_background_task': return await startBackgroundTask(args, user);
      case 'think_and_plan': return await thinkAndPlan(args, user);
      case 'evaluate_progress': return await evaluateProgress(args, user);
      case 'task_complete': return await taskComplete(args, user);
      case 'request_human_input': return await requestHumanInput(args, user);
      case 'log_work': return await logWork(args, user);
      
      // Navigation
      case 'navigate_to_page': return await navigateToPage(args, user);
      case 'open_matter': return await openMatter(args, user);
      case 'open_client': return await openClient(args, user);
      case 'open_invoice': return await openInvoice(args, user);
      case 'open_new_time_entry': return await openNewTimeEntry(args, user);
      case 'open_new_calendar_event': return await openNewCalendarEvent(args, user);
      
      // Matter Permissions & Sharing
      case 'get_matter_permissions': return await getMatterPermissions(args, user);
      case 'share_matter': return await shareMatter(args, user);
      case 'remove_matter_permission': return await removeMatterPermission(args, user);
      case 'update_matter_visibility': return await updateMatterVisibility(args, user);
      
      // QuickBooks Integration
      case 'get_quickbooks_status': return await getQuickBooksStatus(args, user);
      case 'get_quickbooks_invoices': return await getQuickBooksInvoices(args, user);
      case 'get_quickbooks_customers': return await getQuickBooksCustomers(args, user);
      case 'create_quickbooks_invoice': return await createQuickBooksInvoice(args, user);
      case 'sync_quickbooks': return await syncQuickBooks(args, user);
      case 'get_quickbooks_balance': return await getQuickBooksBalance(args, user);
      
      // Integration Status
      case 'get_integrations_status': return await getIntegrationsStatus(args, user);
      
      // Matter Emails
      case 'get_matter_emails': return await getMatterEmails(args, user);
      
      // Outlook Calendar Sync
      case 'create_outlook_event': return await createOutlookEvent(args, user);
      case 'sync_outlook_calendar': return await syncOutlookCalendar(args, user);
      
      // Outlook Emails
      case 'get_emails': return await getEmails(args, user);
      case 'search_emails': return await searchEmails(args, user);
      case 'get_email': return await getEmail(args, user);
      case 'draft_email': return await draftEmail(args, user);
      case 'send_email': return await sendEmail(args, user);
      case 'reply_to_email': return await replyToEmail(args, user);
      case 'link_email_to_matter': return await linkEmailToMatter(args, user);
      case 'link_email_to_client': return await linkEmailToClient(args, user);
      case 'get_matter_emails': return await getMatterEmails(args, user);
      case 'get_client_communications': return await getClientCommunications(args, user);
      case 'configure_auto_email_linking': return await configureAutoEmailLinking(args, user);
      
      // Cloud Storage
      case 'list_cloud_files': return await listCloudFiles(args, user);
      case 'search_cloud_files': return await searchCloudFiles(args, user);
      case 'get_cloud_file_info': return await getCloudFileInfo(args, user);
      
      // DocuSign
      case 'get_docusign_status': return await getDocuSignStatus(args, user);
      case 'get_docusign_envelopes': return await getDocuSignEnvelopes(args, user);
      case 'send_for_signature': return await sendForSignature(args, user);
      
      // Slack
      case 'get_slack_status': return await getSlackStatus(args, user);
      case 'get_slack_channels': return await getSlackChannels(args, user);
      case 'send_slack_message': return await sendSlackMessage(args, user);
      
      // Zoom
      case 'get_zoom_status': return await getZoomStatus(args, user);
      case 'get_zoom_meetings': return await getZoomMeetings(args, user);
      case 'create_zoom_meeting': return await createZoomMeeting(args, user);
      
      // Quicken
      case 'get_quicken_status': return await getQuickenStatus(args, user);
      case 'get_quicken_summary': return await getQuickenSummary(args, user);
      case 'get_quicken_transactions': return await getQuickenTransactions(args, user);
      case 'get_quicken_accounts': return await getQuickenAccounts(args, user);
      
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { error: error.message };
  }
}

// =============================================================================
// TIME ENTRY FUNCTIONS
// =============================================================================
async function logTime(args, user) {
  const { matter_id, hours, description, date, billable = true, activity_code } = args;
  
  if (!matter_id || !hours || !description) {
    return { error: 'Missing required fields: matter_id, hours, description' };
  }
  
  if (hours <= 0 || hours > 24) {
    return { error: 'Hours must be between 0.1 and 24' };
  }
  
  const isAdmin = ['owner', 'admin'].includes(user.role);
  
  const matterResult = await query(
    `SELECT m.id, m.name, m.number, m.billing_rate, m.responsible_attorney, m.status,
            EXISTS(SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2) as user_is_assigned
     FROM matters m WHERE m.id = $1 AND m.firm_id = $3`,
    [matter_id, user.id, user.firmId]
  );
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  if (matter.status === 'closed') {
    return { error: 'Cannot log time to a closed matter' };
  }
  
  const isAuthorized = isAdmin || matter.responsible_attorney === user.id || matter.user_is_assigned;
  if (!isAuthorized) {
    return { error: 'You are not authorized to log time to this matter' };
  }
  
  // Get billing rate
  let billingRate = matter.billing_rate;
  if (!billingRate) {
    const userResult = await query('SELECT hourly_rate FROM users WHERE id = $1', [user.id]);
    billingRate = userResult.rows[0]?.hourly_rate || 350;
  }
  
  const entryDate = date || getTodayInTimezone(DEFAULT_TIMEZONE);
  
  const result = await query(
    `INSERT INTO time_entries (firm_id, matter_id, user_id, date, hours, description, billable, rate, activity_code, entry_type, ai_generated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ai_suggested', true) RETURNING *`,
    [user.firmId, matter_id, user.id, entryDate, hours, description, billable, billingRate, activity_code || null]
  );
  
  const entry = result.rows[0];
  
  return {
    success: true,
    message: `Logged ${hours} hours to "${matter.name}" (${matter.number})`,
    data: {
      id: entry.id,
      matter: matter.name,
      matter_number: matter.number,
      hours: parseFloat(entry.hours),
      amount: parseFloat(entry.amount),
      date: entry.date
    }
  };
}

async function getMyTimeEntries(args, user) {
  const { limit = 20, start_date, end_date, matter_id } = args;
  
  let sql = `
    SELECT te.*, m.name as matter_name, m.number as matter_number
    FROM time_entries te
    LEFT JOIN matters m ON te.matter_id = m.id
    WHERE te.firm_id = $1 AND te.user_id = $2
  `;
  const params = [user.firmId, user.id];
  let idx = 3;
  
  if (matter_id) {
    sql += ` AND te.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  if (start_date) {
    sql += ` AND te.date >= $${idx++}`;
    params.push(start_date);
  }
  if (end_date) {
    sql += ` AND te.date <= $${idx++}`;
    params.push(end_date);
  }
  
  sql += ` ORDER BY te.date DESC, te.created_at DESC LIMIT $${idx}`;
  params.push(Math.min(parseInt(limit), 100));
  
  const result = await query(sql, params);
  
  const summaryResult = await query(
    `SELECT SUM(hours) as total_hours, SUM(amount) as total_amount
     FROM time_entries WHERE firm_id = $1 AND user_id = $2 AND date >= DATE_TRUNC('month', CURRENT_DATE)`,
    [user.firmId, user.id]
  );
  
  return {
    entries: result.rows.map(e => ({
      id: e.id,
      date: e.date,
      hours: parseFloat(e.hours),
      amount: parseFloat(e.amount),
      matter: e.matter_name,
      matter_number: e.matter_number,
      description: e.description,
      billable: e.billable,
      billed: e.billed
    })),
    this_month: {
      hours: parseFloat(summaryResult.rows[0]?.total_hours || 0),
      amount: parseFloat(summaryResult.rows[0]?.total_amount || 0)
    }
  };
}

async function updateTimeEntry(args, user) {
  const { time_entry_id, hours, description, date, billable } = args;
  
  if (!time_entry_id) {
    return { error: 'time_entry_id is required' };
  }
  
  // Check ownership
  const existing = await query(
    'SELECT * FROM time_entries WHERE id = $1 AND firm_id = $2',
    [time_entry_id, user.firmId]
  );
  
  if (existing.rows.length === 0) {
    return { error: 'Time entry not found' };
  }
  
  const entry = existing.rows[0];
  
  // Only the owner or admin can edit
  const isAdmin = ['owner', 'admin'].includes(user.role);
  if (entry.user_id !== user.id && !isAdmin) {
    return { error: 'You can only edit your own time entries' };
  }
  
  if (entry.billed) {
    return { error: 'Cannot edit a billed time entry' };
  }
  
  const result = await query(
    `UPDATE time_entries SET
      hours = COALESCE($1, hours),
      description = COALESCE($2, description),
      date = COALESCE($3, date),
      billable = COALESCE($4, billable),
      updated_at = NOW()
    WHERE id = $5 RETURNING *`,
    [hours, description, date, billable, time_entry_id]
  );
  
  const updated = result.rows[0];
  
  return {
    success: true,
    message: 'Time entry updated',
    data: {
      id: updated.id,
      hours: parseFloat(updated.hours),
      description: updated.description,
      date: updated.date,
      amount: parseFloat(updated.amount)
    }
  };
}

async function deleteTimeEntry(args, user) {
  const { time_entry_id } = args;
  
  if (!time_entry_id) {
    return { error: 'time_entry_id is required' };
  }
  
  const existing = await query(
    'SELECT * FROM time_entries WHERE id = $1 AND firm_id = $2',
    [time_entry_id, user.firmId]
  );
  
  if (existing.rows.length === 0) {
    return { error: 'Time entry not found' };
  }
  
  const entry = existing.rows[0];
  
  const isAdmin = ['owner', 'admin'].includes(user.role);
  if (entry.user_id !== user.id && !isAdmin) {
    return { error: 'You can only delete your own time entries' };
  }
  
  if (entry.billed) {
    return { error: 'Cannot delete a billed time entry' };
  }
  
  await query('DELETE FROM time_entries WHERE id = $1', [time_entry_id]);
  
  return {
    success: true,
    message: `Deleted time entry (${parseFloat(entry.hours)} hours)`
  };
}

// =============================================================================
// MATTER FUNCTIONS
// =============================================================================
async function listMyMatters(args, user) {
  const { status, limit = 50 } = args;
  const isAdmin = ['owner', 'admin'].includes(user.role);
  
  let sql = `
    SELECT m.id, m.name, m.number, m.status, m.priority, m.billing_type, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (!isAdmin) {
    sql += ` AND (m.responsible_attorney = $${idx} OR EXISTS (
      SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $${idx}
    ))`;
    params.push(user.id);
    idx++;
  }
  
  if (status) {
    sql += ` AND m.status = $${idx++}`;
    params.push(status);
  }
  
  sql += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
  params.push(Math.min(parseInt(limit), 100));
  
  const result = await query(sql, params);
  
  return {
    matters: result.rows.map(m => ({
      id: m.id,
      name: m.name,
      number: m.number,
      status: m.status,
      priority: m.priority,
      billing_type: m.billing_type,
      client: m.client_name
    })),
    count: result.rows.length
  };
}

async function searchMatters(args, user) {
  const { search, status, client_id } = args;
  const isAdmin = ['owner', 'admin'].includes(user.role);
  
  let sql = `
    SELECT m.id, m.name, m.number, m.status, m.priority, c.display_name as client_name
    FROM matters m
    LEFT JOIN clients c ON m.client_id = c.id
    WHERE m.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (!isAdmin) {
    sql += ` AND (m.responsible_attorney = $${idx} OR EXISTS (SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $${idx}))`;
    params.push(user.id);
    idx++;
  }
  
  if (search) {
    sql += ` AND (m.name ILIKE $${idx} OR m.number ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }
  if (status) {
    sql += ` AND m.status = $${idx++}`;
    params.push(status);
  }
  if (client_id) {
    sql += ` AND m.client_id = $${idx++}`;
    params.push(client_id);
  }
  
  sql += ` ORDER BY m.created_at DESC LIMIT 25`;
  
  const result = await query(sql, params);
  
  return {
    matters: result.rows.map(m => ({
      id: m.id,
      name: m.name,
      number: m.number,
      status: m.status,
      priority: m.priority,
      client: m.client_name
    })),
    count: result.rows.length
  };
}

async function getMatter(args, user) {
  const { matter_id } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required' };
  }
  
  const result = await query(
    `SELECT m.*, c.display_name as client_name, c.email as client_email,
            u.first_name || ' ' || u.last_name as responsible_attorney_name
     FROM matters m
     LEFT JOIN clients c ON m.client_id = c.id
     LEFT JOIN users u ON m.responsible_attorney = u.id
     WHERE m.id = $1 AND m.firm_id = $2`,
    [matter_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const m = result.rows[0];
  
  // Get summary stats
  const stats = await query(
    `SELECT 
      COALESCE(SUM(hours), 0) as total_hours,
      COALESCE(SUM(amount), 0) as total_billed,
      COALESCE(SUM(CASE WHEN billed = false THEN amount ELSE 0 END), 0) as unbilled
     FROM time_entries WHERE matter_id = $1`,
    [matter_id]
  );
  
  // Get documents with content summaries
  const docsResult = await query(
    `SELECT id, name, type, ai_summary, uploaded_at,
            CASE WHEN content_text IS NOT NULL THEN LEFT(content_text, 500) ELSE NULL END as content_preview,
            CASE WHEN content_text IS NOT NULL THEN LENGTH(content_text) ELSE 0 END as content_length
     FROM documents 
     WHERE matter_id = $1 AND firm_id = $2
     ORDER BY uploaded_at DESC 
     LIMIT 15`,
    [matter_id, user.firmId]
  );
  
  const documents = docsResult.rows.map(d => ({
    id: d.id,
    name: d.name,
    type: d.type,
    summary: d.ai_summary,
    content_preview: d.content_preview,
    has_full_content: d.content_length > 0,
    content_length: d.content_length,
    uploaded_at: d.uploaded_at
  }));
  
  // Get linked emails
  const emailsResult = await query(
    `SELECT id, subject, from_address, received_at, notes
     FROM email_links 
     WHERE matter_id = $1 AND firm_id = $2
     ORDER BY received_at DESC 
     LIMIT 10`,
    [matter_id, user.firmId]
  );
  
  // Get upcoming events/tasks for this matter
  const eventsResult = await query(
    `SELECT id, title, type, start_time, status, priority
     FROM calendar_events 
     WHERE matter_id = $1 AND firm_id = $2 AND (start_time >= NOW() OR type = 'task')
     ORDER BY start_time ASC 
     LIMIT 10`,
    [matter_id, user.firmId]
  );
  
  // Get invoices for this matter
  const invoicesResult = await query(
    `SELECT id, invoice_number, status, amount, due_date
     FROM invoices 
     WHERE matter_id = $1 AND firm_id = $2
     ORDER BY created_at DESC 
     LIMIT 5`,
    [matter_id, user.firmId]
  );
  
  return {
    id: m.id,
    name: m.name,
    number: m.number,
    description: m.description,
    status: m.status,
    priority: m.priority,
    type: m.type,
    client: m.client_name,
    client_id: m.client_id,
    client_email: m.client_email,
    responsible_attorney: m.responsible_attorney_name,
    billing_type: m.billing_type,
    billing_rate: m.billing_rate ? parseFloat(m.billing_rate) : null,
    open_date: m.open_date,
    court_name: m.court_name,
    case_number: m.case_number,
    stats: {
      total_hours: parseFloat(stats.rows[0].total_hours),
      total_billed: parseFloat(stats.rows[0].total_billed),
      unbilled: parseFloat(stats.rows[0].unbilled)
    },
    documents: {
      count: documents.length,
      items: documents,
      note: documents.length > 0 ? 'Use read_document_content(document_id) for full document text' : null
    },
    emails: {
      count: emailsResult.rows.length,
      items: emailsResult.rows.map(e => ({
        id: e.id,
        subject: e.subject,
        from: e.from_address,
        date: e.received_at,
        notes: e.notes
      }))
    },
    events_and_tasks: eventsResult.rows.map(e => ({
      id: e.id,
      title: e.title,
      type: e.type,
      date: e.start_time,
      status: e.status,
      priority: e.priority
    })),
    invoices: invoicesResult.rows.map(i => ({
      id: i.id,
      number: i.invoice_number,
      status: i.status,
      amount: parseFloat(i.amount),
      due_date: i.due_date
    }))
  };
}

async function createMatter(args, user) {
  const { name, client_id, description, type = 'other', priority = 'medium', billing_type = 'hourly', billing_rate, court_name, case_number } = args;
  
  if (!name) {
    return { error: 'Matter name is required' };
  }
  
  // Generate matter number - find max existing number for this year and increment
  const year = new Date().getFullYear();
  const prefix = `MTR-${year}-`;
  const maxResult = await query(
    `SELECT number FROM matters 
     WHERE firm_id = $1 AND number LIKE $2 
     ORDER BY number DESC LIMIT 1`,
    [user.firmId, `${prefix}%`]
  );
  
  let nextNum = 1;
  if (maxResult.rows.length > 0) {
    const lastNumber = maxResult.rows[0].number;
    const lastNum = parseInt(lastNumber.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }
  const number = `${prefix}${String(nextNum).padStart(3, '0')}`;
  
  if (client_id) {
    const clientCheck = await query('SELECT id FROM clients WHERE id = $1 AND firm_id = $2', [client_id, user.firmId]);
    if (clientCheck.rows.length === 0) {
      return { error: 'Client not found' };
    }
  }
  
  // Use today's date for open_date (in Eastern timezone)
  const openDate = getTodayInTimezone(DEFAULT_TIMEZONE);
  
  const result = await query(
    `INSERT INTO matters (firm_id, number, name, description, client_id, type, status, priority,
      responsible_attorney, billing_type, billing_rate, court_name, case_number, open_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11, $12, $13, $8) RETURNING *`,
    [user.firmId, number, name, description || null, client_id || null, type, priority, 
     user.id, billing_type, billing_rate || null, court_name || null, case_number || null, openDate]
  );
  
  const matter = result.rows[0];
  
  await query('INSERT INTO matter_assignments (matter_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [matter.id, user.id]);
  
  return {
    success: true,
    message: `Created matter "${name}" (${number})`,
    data: { id: matter.id, name: matter.name, number: matter.number, status: matter.status }
  };
}

async function updateMatter(args, user) {
  const { matter_id, name, description, status, priority, billing_rate } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required' };
  }
  
  if (!hasPermission(user.role, 'matters:edit')) {
    return { error: 'You do not have permission to edit matters' };
  }
  
  const existing = await query('SELECT id FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, user.firmId]);
  if (existing.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const result = await query(
    `UPDATE matters SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      status = COALESCE($3, status),
      priority = COALESCE($4, priority),
      billing_rate = COALESCE($5, billing_rate),
      updated_at = NOW()
    WHERE id = $6 RETURNING *`,
    [name, description, status, priority, billing_rate, matter_id]
  );
  
  const updated = result.rows[0];
  
  return {
    success: true,
    message: `Updated matter "${updated.name}"`,
    data: { id: updated.id, name: updated.name, status: updated.status, priority: updated.priority }
  };
}

async function closeMatter(args, user) {
  const { matter_id, resolution, closing_notes } = args;
  
  const result = await query(
    `UPDATE matters SET 
       status = 'closed', 
       closed_at = NOW(),
       resolution = COALESCE($2, resolution),
       closing_notes = COALESCE($3, closing_notes),
       updated_at = NOW()
     WHERE id = $1 AND firm_id = $4 
     RETURNING id, name, number`,
    [matter_id, resolution, closing_notes, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = result.rows[0];
  return {
    success: true,
    message: `Closed matter "${matter.name}" (${matter.number})${resolution ? ` - ${resolution}` : ''}`,
    data: { id: matter.id, name: matter.name, status: 'closed', resolution }
  };
}

async function archiveMatter(args, user) {
  const { matter_id } = args;
  
  const result = await query(
    `UPDATE matters SET 
       status = 'archived', 
       archived_at = NOW(),
       updated_at = NOW()
     WHERE id = $1 AND firm_id = $2 
     RETURNING id, name, number`,
    [matter_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = result.rows[0];
  return {
    success: true,
    message: `Archived matter "${matter.name}" (${matter.number})`,
    data: { id: matter.id, name: matter.name, status: 'archived' }
  };
}

async function reopenMatter(args, user) {
  const { matter_id, reason } = args;
  
  const result = await query(
    `UPDATE matters SET 
       status = 'active', 
       closed_at = NULL,
       archived_at = NULL,
       updated_at = NOW()
     WHERE id = $1 AND firm_id = $2 
     RETURNING id, name, number`,
    [matter_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = result.rows[0];
  
  // Log the reopening with reason
  if (reason) {
    await query(
      `INSERT INTO matter_notes (matter_id, firm_id, content, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [matter_id, user.firmId, `Matter reopened: ${reason}`, user.id]
    );
  }
  
  return {
    success: true,
    message: `Reopened matter "${matter.name}" (${matter.number})`,
    data: { id: matter.id, name: matter.name, status: 'active' }
  };
}

// =============================================================================
// CLIENT FUNCTIONS
// =============================================================================
async function listClients(args, user) {
  const { search, type, limit = 50 } = args;
  
  let sql = `SELECT id, display_name, type, email, phone, is_active FROM clients WHERE firm_id = $1`;
  const params = [user.firmId];
  let idx = 2;
  
  if (search) {
    sql += ` AND display_name ILIKE $${idx++}`;
    params.push(`%${search}%`);
  }
  if (type) {
    sql += ` AND type = $${idx++}`;
    params.push(type);
  }
  
  sql += ` ORDER BY display_name LIMIT ${Math.min(parseInt(limit), 100)}`;
  
  const result = await query(sql, params);
  
  return {
    clients: result.rows.map(c => ({
      id: c.id,
      name: c.display_name,
      type: c.type,
      email: c.email,
      phone: c.phone,
      active: c.is_active
    })),
    count: result.rows.length
  };
}

async function getClient(args, user) {
  const { client_id } = args;
  
  if (!client_id) {
    return { error: 'client_id is required' };
  }
  
  const result = await query(
    `SELECT c.*, 
      (SELECT COUNT(*) FROM matters WHERE client_id = c.id) as matter_count,
      (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE client_id = c.id) as total_billed,
      (SELECT COALESCE(SUM(amount_due), 0) FROM invoices WHERE client_id = c.id AND status != 'paid') as outstanding
     FROM clients c WHERE c.id = $1 AND c.firm_id = $2`,
    [client_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const c = result.rows[0];
  
  // Get client's matters
  const mattersResult = await query(
    `SELECT id, name, number, status, type, priority
     FROM matters 
     WHERE client_id = $1 AND firm_id = $2
     ORDER BY created_at DESC 
     LIMIT 10`,
    [client_id, user.firmId]
  );
  
  // Get client's documents
  const docsResult = await query(
    `SELECT id, name, type, ai_summary, uploaded_at,
            CASE WHEN content_text IS NOT NULL THEN LEFT(content_text, 300) ELSE NULL END as content_preview,
            CASE WHEN content_text IS NOT NULL THEN true ELSE false END as has_content
     FROM documents 
     WHERE client_id = $1 AND firm_id = $2
     ORDER BY uploaded_at DESC 
     LIMIT 10`,
    [client_id, user.firmId]
  );
  
  // Get linked emails/communications
  const emailsResult = await query(
    `SELECT id, subject, from_address, received_at, notes, matter_id
     FROM email_links 
     WHERE client_id = $1 AND firm_id = $2
     ORDER BY received_at DESC 
     LIMIT 10`,
    [client_id, user.firmId]
  );
  
  // Get recent invoices
  const invoicesResult = await query(
    `SELECT id, invoice_number, status, amount, due_date
     FROM invoices 
     WHERE client_id = $1 AND firm_id = $2
     ORDER BY created_at DESC 
     LIMIT 5`,
    [client_id, user.firmId]
  );
  
  return {
    id: c.id,
    name: c.display_name,
    type: c.type,
    email: c.email,
    phone: c.phone,
    address: {
      street: c.address_street,
      city: c.address_city,
      state: c.address_state,
      zip: c.address_zip
    },
    notes: c.notes,
    active: c.is_active,
    stats: {
      matter_count: parseInt(c.matter_count),
      total_billed: parseFloat(c.total_billed),
      outstanding: parseFloat(c.outstanding)
    },
    matters: mattersResult.rows.map(m => ({
      id: m.id,
      name: m.name,
      number: m.number,
      status: m.status,
      type: m.type,
      priority: m.priority
    })),
    documents: {
      count: docsResult.rows.length,
      items: docsResult.rows.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        summary: d.ai_summary,
        content_preview: d.content_preview,
        has_full_content: d.has_content,
        uploaded_at: d.uploaded_at
      })),
      note: docsResult.rows.length > 0 ? 'Use read_document_content(document_id) for full text' : null
    },
    communications: emailsResult.rows.map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from_address,
      date: e.received_at,
      notes: e.notes
    })),
    invoices: invoicesResult.rows.map(i => ({
      id: i.id,
      number: i.invoice_number,
      status: i.status,
      amount: parseFloat(i.amount),
      due_date: i.due_date
    }))
  };
}

async function createClient(args, user) {
  const { display_name, type = 'person', email, phone, first_name, last_name, company_name, address_street, address_city, address_state, address_zip, notes } = args;
  
  if (!display_name) {
    return { error: 'display_name is required' };
  }
  
  if (email) {
    const emailCheck = await query('SELECT id FROM clients WHERE email = $1 AND firm_id = $2', [email, user.firmId]);
    if (emailCheck.rows.length > 0) {
      return { error: 'A client with this email already exists' };
    }
  }
  
  const result = await query(
    `INSERT INTO clients (firm_id, display_name, type, email, phone, first_name, last_name, company_name, 
      address_street, address_city, address_state, address_zip, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [user.firmId, display_name, type, email || null, phone || null, first_name || null, last_name || null, 
     company_name || null, address_street || null, address_city || null, address_state || null, address_zip || null, notes || null, user.id]
  );
  
  const client = result.rows[0];
  
  return {
    success: true,
    message: `Created client "${display_name}"`,
    data: { id: client.id, name: client.display_name, type: client.type, email: client.email }
  };
}

async function updateClient(args, user) {
  const { client_id, display_name, email, phone, address_street, address_city, address_state, address_zip, notes } = args;
  
  if (!client_id) {
    return { error: 'client_id is required' };
  }
  
  if (!hasPermission(user.role, 'clients:edit')) {
    return { error: 'You do not have permission to edit clients' };
  }
  
  const existing = await query('SELECT id FROM clients WHERE id = $1 AND firm_id = $2', [client_id, user.firmId]);
  if (existing.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const result = await query(
    `UPDATE clients SET
      display_name = COALESCE($1, display_name),
      email = COALESCE($2, email),
      phone = COALESCE($3, phone),
      address_street = COALESCE($4, address_street),
      address_city = COALESCE($5, address_city),
      address_state = COALESCE($6, address_state),
      address_zip = COALESCE($7, address_zip),
      notes = COALESCE($8, notes),
      updated_at = NOW()
    WHERE id = $9 RETURNING *`,
    [display_name, email, phone, address_street, address_city, address_state, address_zip, notes, client_id]
  );
  
  return {
    success: true,
    message: `Updated client "${result.rows[0].display_name}"`,
    data: { id: result.rows[0].id, name: result.rows[0].display_name }
  };
}

async function archiveClient(args, user) {
  const { client_id, reason } = args;
  
  const result = await query(
    `UPDATE clients SET 
       is_active = false,
       updated_at = NOW()
     WHERE id = $1 AND firm_id = $2 
     RETURNING id, display_name`,
    [client_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const client = result.rows[0];
  return {
    success: true,
    message: `Archived client "${client.display_name}"${reason ? ` - ${reason}` : ''}`,
    data: { id: client.id, name: client.display_name, is_active: false }
  };
}

async function reactivateClient(args, user) {
  const { client_id } = args;
  
  const result = await query(
    `UPDATE clients SET 
       is_active = true,
       updated_at = NOW()
     WHERE id = $1 AND firm_id = $2 
     RETURNING id, display_name`,
    [client_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const client = result.rows[0];
  return {
    success: true,
    message: `Reactivated client "${client.display_name}"`,
    data: { id: client.id, name: client.display_name, is_active: true }
  };
}

// =============================================================================
// INVOICE FUNCTIONS
// =============================================================================
async function listInvoices(args, user) {
  const { status, client_id, matter_id, source, limit = 20 } = args;
  
  let sql = `
    SELECT i.id, i.invoice_number, i.status, i.amount, i.due_date, i.external_id, i.external_source, c.display_name as client_name, m.name as matter_name, i.description
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    LEFT JOIN matters m ON i.matter_id = m.id
    WHERE i.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND i.status = $${idx++}`;
    params.push(status);
  }
  if (client_id) {
    sql += ` AND i.client_id = $${idx++}`;
    params.push(client_id);
  }
  if (matter_id) {
    sql += ` AND i.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  if (source) {
    if (source === 'local') {
      sql += ` AND i.external_source IS NULL`;
    } else {
      sql += ` AND i.external_source = $${idx++}`;
      params.push(source);
    }
  }
  
  sql += ` ORDER BY i.created_at DESC LIMIT ${Math.min(parseInt(limit), 50)}`;
  
  const result = await query(sql, params);
  
  return {
    invoices: result.rows.map(i => ({
      id: i.id,
      number: i.invoice_number,
      client: i.client_name,
      matter: i.matter_name,
      status: i.status,
      total: parseFloat(i.amount || 0),
      due_date: i.due_date,
      description: i.description,
      source: i.external_source || 'local',
      quickbooks_id: i.external_source === 'quickbooks' ? i.external_id : null
    })),
    count: result.rows.length
  };
}

async function getInvoice(args, user) {
  const { invoice_id } = args;
  
  if (!invoice_id) {
    return { error: 'invoice_id is required' };
  }
  
  const result = await query(
    `SELECT i.*, c.display_name as client_name, c.email as client_email, m.name as matter_name
     FROM invoices i
     LEFT JOIN clients c ON i.client_id = c.id
     LEFT JOIN matters m ON i.matter_id = m.id
     WHERE i.id = $1 AND i.firm_id = $2`,
    [invoice_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  const i = result.rows[0];
  
  return {
    id: i.id,
    number: i.number,
    client: i.client_name,
    client_email: i.client_email,
    matter: i.matter_name,
    status: i.status,
    issue_date: i.issue_date,
    due_date: i.due_date,
    subtotal: parseFloat(i.subtotal),
    tax_amount: parseFloat(i.tax_amount),
    total: parseFloat(i.total),
    amount_paid: parseFloat(i.amount_paid),
    amount_due: parseFloat(i.amount_due),
    line_items: i.line_items,
    notes: i.notes
  };
}

async function createInvoice(args, user) {
  console.log('createInvoice called with args:', JSON.stringify(args));
  
  if (!hasPermission(user.role, 'billing:create')) {
    return { error: 'You do not have permission to create invoices' };
  }
  
  const { client_id, matter_id, due_date, notes, items, amount, include_unbilled_time } = args;
  
  if (!client_id) {
    return { error: 'client_id is required' };
  }
  
  const clientCheck = await query('SELECT id, display_name FROM clients WHERE id = $1 AND firm_id = $2', [client_id, user.firmId]);
  if (clientCheck.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  return await withTransaction(async (client) => {
    // Generate invoice number
    const countResult = await client.query('SELECT COUNT(*) FROM invoices WHERE firm_id = $1', [user.firmId]);
    const count = parseInt(countResult.rows[0].count) + 1;
    const number = `INV-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
    
    let lineItems = [];
    let subtotalFees = 0;
    
    // Add custom line items if provided
    if (items && Array.isArray(items)) {
      for (const item of items) {
        const qty = item.quantity || 1;
        const itemAmount = parseFloat(item.amount) * qty;
        lineItems.push({
          type: 'fee',
          description: item.description,
          quantity: qty,
          rate: parseFloat(item.amount),
          amount: itemAmount
        });
        subtotalFees += itemAmount;
      }
    }
    
    // If simple amount provided, add as single line item
    if (amount && !items) {
      lineItems.push({
        type: 'fee',
        description: notes || 'Professional services',
        quantity: 1,
        rate: parseFloat(amount),
        amount: parseFloat(amount)
      });
      subtotalFees += parseFloat(amount);
    }
    
    // Include unbilled time entries if requested (or if no custom items provided)
    const shouldIncludeTime = include_unbilled_time === true || (include_unbilled_time !== false && lineItems.length === 0);
    
    if (shouldIncludeTime) {
      let timeQuery = `SELECT te.*, m.name as matter_name FROM time_entries te
        LEFT JOIN matters m ON te.matter_id = m.id
        WHERE te.firm_id = $1 AND te.billable = true AND te.billed = false`;
      const timeParams = [user.firmId];
      
      if (matter_id) {
        timeQuery += ` AND te.matter_id = $2`;
        timeParams.push(matter_id);
      } else {
        timeQuery += ` AND m.client_id = $2`;
        timeParams.push(client_id);
      }
      
      const timeEntries = await client.query(timeQuery, timeParams);
      
      for (const te of timeEntries.rows) {
        const teAmount = parseFloat(te.hours) * parseFloat(te.rate);
        lineItems.push({
          type: 'fee',
          description: `${te.matter_name || 'Time entry'}: ${te.description}`,
          quantity: parseFloat(te.hours),
          rate: parseFloat(te.rate),
          amount: teAmount,
          time_entry_id: te.id
        });
        subtotalFees += teAmount;
      }
    }
    
    if (lineItems.length === 0) {
      return { error: 'No line items to invoice. Please provide items, amount, or ensure there are unbilled time entries.' };
    }
    
    // Default due date is 30 days from today (in Eastern timezone)
    const dueD = due_date || (() => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const parts = getDatePartsInTimezone(futureDate, DEFAULT_TIMEZONE);
      return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    })();
    
    // Calculate total
    const total = subtotalFees;
    
    const invoiceResult = await client.query(
      `INSERT INTO invoices (firm_id, number, matter_id, client_id, status, issue_date, due_date,
        subtotal_fees, subtotal, total, amount_due, line_items, notes, created_by)
       VALUES ($1, $2, $3, $4, 'draft', CURRENT_DATE, $5, $6, $6, $6, $6, $7, $8, $9) RETURNING *`,
      [user.firmId, number, matter_id || null, client_id, dueD, subtotalFees, JSON.stringify(lineItems), notes || null, user.id]
    );
    
    const invoice = invoiceResult.rows[0];
    
    // Update time entries with invoice ID
    for (const item of lineItems) {
      if (item.time_entry_id) {
        await client.query('UPDATE time_entries SET invoice_id = $1, billed = true WHERE id = $2', [invoice.id, item.time_entry_id]);
      }
    }
    
    console.log('Invoice created successfully:', invoice.id, 'Total:', subtotalFees);
    
    return {
      success: true,
      message: `Created invoice ${number} for $${subtotalFees.toFixed(2)}`,
      data: {
        id: invoice.id,
        number: invoice.number,
        client: clientCheck.rows[0].display_name,
        total: subtotalFees,
        line_item_count: lineItems.length
      }
    };
  });
}

async function sendInvoice(args, user) {
  const { invoice_id } = args;
  
  if (!invoice_id) {
    return { error: 'invoice_id is required' };
  }
  
  const existing = await query('SELECT * FROM invoices WHERE id = $1 AND firm_id = $2', [invoice_id, user.firmId]);
  if (existing.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  if (existing.rows[0].status !== 'draft') {
    return { error: 'Invoice has already been sent' };
  }
  
  await query(
    `UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1`,
    [invoice_id]
  );
  
  return {
    success: true,
    message: `Invoice ${existing.rows[0].number} marked as sent`
  };
}

async function recordPayment(args, user) {
  const { invoice_id, amount, payment_method, payment_date, reference, notes } = args;
  
  if (!invoice_id || !amount) {
    return { error: 'invoice_id and amount are required' };
  }
  
  if (amount <= 0) {
    return { error: 'Amount must be positive' };
  }
  
  const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1 AND firm_id = $2', [invoice_id, user.firmId]);
  if (invoiceResult.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  const invoice = invoiceResult.rows[0];
  
  return await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO payments (firm_id, invoice_id, client_id, amount, payment_method, reference, payment_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [user.firmId, invoice_id, invoice.client_id, amount, payment_method || null, reference || null, 
       payment_date || getTodayInTimezone(DEFAULT_TIMEZONE), notes || null, user.id]
    );
    
    const newAmountPaid = parseFloat(invoice.amount_paid) + amount;
    const newStatus = newAmountPaid >= parseFloat(invoice.total) ? 'paid' : 'partial';
    
    await client.query(
      `UPDATE invoices SET amount_paid = $1, status = $2, paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END WHERE id = $3`,
      [newAmountPaid, newStatus, invoice_id]
    );
    
    return {
      success: true,
      message: `Recorded payment of $${amount.toFixed(2)} for invoice ${invoice.number}`,
      data: {
        new_status: newStatus,
        amount_paid: newAmountPaid,
        amount_remaining: parseFloat(invoice.total) - newAmountPaid
      }
    };
  });
}

// =============================================================================
// CALENDAR FUNCTIONS
// =============================================================================
async function getCalendarEvents(args, user) {
  const { days_ahead = 7, days_behind = 0, matter_id, type } = args;
  
  let sql = `
    SELECT e.id, e.title, e.start_time, e.end_time, e.type, e.location, e.status, m.name as matter_name
    FROM calendar_events e
    LEFT JOIN matters m ON e.matter_id = m.id
    WHERE e.firm_id = $1 
      AND e.start_time >= NOW() - INTERVAL '${parseInt(days_behind)} days'
      AND e.start_time < NOW() + INTERVAL '${parseInt(days_ahead)} days'
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND e.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  if (type) {
    sql += ` AND e.type = $${idx++}`;
    params.push(type);
  }
  
  sql += ` ORDER BY e.start_time LIMIT 50`;
  
  const result = await query(sql, params);
  
  return {
    events: result.rows.map(e => ({
      id: e.id,
      title: e.title,
      start: formatDateTime(e.start_time),
      end: formatDateTime(e.end_time),
      type: e.type,
      location: e.location,
      status: e.status,
      matter: e.matter_name
    })),
    count: result.rows.length
  };
}

async function createCalendarEvent(args, user) {
  console.log('createCalendarEvent called with args:', JSON.stringify(args));
  
  // Check permission
  if (!hasPermission(user.role, 'calendar:create')) {
    return { error: 'You do not have permission to create calendar events' };
  }
  
  const { title, start_time, end_time, type = 'meeting', matter_id, location, description, all_day = false } = args;
  
  if (!title) {
    return { error: 'Event title is required' };
  }
  
  if (!start_time) {
    return { error: 'Start time is required. Please specify when the event should be scheduled.' };
  }
  
  const validTypes = ['meeting', 'court_date', 'deadline', 'reminder', 'task', 'closing', 'deposition', 'other'];
  const eventType = validTypes.includes(type) ? type : 'meeting';
  
  // Parse start time - handle various formats
  // IMPORTANT: All times should be interpreted as Eastern timezone
  let startDate;
  try {
    console.log('Parsing start_time:', start_time);
    
    // Get today and tomorrow in the correct timezone
    const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
    const tomorrowStr = getTomorrowInTimezone(DEFAULT_TIMEZONE);
    
    // Check if this is an ISO-style datetime string (e.g., "2025-12-11T14:00:00")
    const isoMatch = start_time.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    
    if (isoMatch) {
      // This is an ISO format - interpret as Eastern timezone
      const dateStr = isoMatch[1];
      const hours = parseInt(isoMatch[2] || '9');
      const minutes = parseInt(isoMatch[3] || '0');
      
      // Create the date in Eastern timezone
      startDate = createDateInTimezone(dateStr, hours, minutes, DEFAULT_TIMEZONE);
      console.log('Parsed ISO datetime as Eastern:', { dateStr, hours, minutes, result: startDate.toISOString() });
    }
    // Check for "tomorrow" keyword
    else if (start_time.toLowerCase().includes('tomorrow')) {
      // Try to extract time
      const timeMatch = start_time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      let hours = 9; // Default to 9am
      let minutes = 0;
      
      if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2] || '0');
        const meridiem = timeMatch[3]?.toLowerCase();
        
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
      }
      
      startDate = createDateInTimezone(tomorrowStr, hours, minutes, DEFAULT_TIMEZONE);
      console.log('Parsed "tomorrow" as Eastern:', { tomorrowStr, hours, minutes, result: startDate.toISOString() });
    }
    // Check for "today" keyword  
    else if (start_time.toLowerCase().includes('today')) {
      const timeMatch = start_time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      let hours = 9; // Default to 9am
      let minutes = 0;
      
      if (timeMatch) {
        hours = parseInt(timeMatch[1]);
        minutes = parseInt(timeMatch[2] || '0');
        const meridiem = timeMatch[3]?.toLowerCase();
        
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
      }
      
      startDate = createDateInTimezone(todayStr, hours, minutes, DEFAULT_TIMEZONE);
      console.log('Parsed "today" as Eastern:', { todayStr, hours, minutes, result: startDate.toISOString() });
    }
    // Try just time format (assume today)
    else {
      const timeMatch = start_time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2] || '0');
        const meridiem = timeMatch[3]?.toLowerCase();
        
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
        
        startDate = createDateInTimezone(todayStr, hours, minutes, DEFAULT_TIMEZONE);
        console.log('Parsed time-only as Eastern today:', { todayStr, hours, minutes, result: startDate.toISOString() });
      } else {
        // Last resort - try native Date parsing (will use server timezone)
        startDate = new Date(start_time);
      }
    }
    
    console.log('Final parsed start date:', startDate);
    
    if (!startDate || isNaN(startDate.getTime())) {
      return { error: `Could not parse start_time "${start_time}". Please use a format like "2025-01-15T14:00:00" or "tomorrow at 2pm"` };
    }
  } catch (e) {
    console.error('Error parsing start_time:', e);
    return { error: 'Could not parse start_time' };
  }
  
  // Calculate end time
  let endDate;
  if (end_time) {
    try {
      // Check if this is an ISO-style datetime string
      const isoMatch = end_time.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
      
      if (isoMatch) {
        // This is an ISO format - interpret as Eastern timezone
        const dateStr = isoMatch[1];
        const hours = parseInt(isoMatch[2] || '9');
        const minutes = parseInt(isoMatch[3] || '0');
        endDate = createDateInTimezone(dateStr, hours, minutes, DEFAULT_TIMEZONE);
      } else {
        endDate = new Date(end_time);
      }
      
      if (isNaN(endDate.getTime())) {
        // If end_time is invalid, default to 1 hour after start
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }
    } catch (e) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
  } else {
    if (eventType === 'meeting' || eventType === 'court_date' || eventType === 'deposition') {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour
    } else {
      endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 minutes
    }
  }
  
  // Validate matter_id if provided
  let validMatterId = null;
  if (matter_id) {
    try {
      const matterCheck = await query('SELECT id FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, user.firmId]);
      if (matterCheck.rows.length > 0) {
        validMatterId = matter_id;
      }
    } catch (e) {
      // Invalid UUID format, ignore
      console.log('Invalid matter_id format:', matter_id);
    }
  }
  
  try {
    console.log('Inserting calendar event:', { title, startDate: startDate.toISOString(), endDate: endDate.toISOString(), eventType });
    
    const result = await query(
      `INSERT INTO calendar_events (firm_id, title, start_time, end_time, type, matter_id, location, description, all_day, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [user.firmId, title, startDate.toISOString(), endDate.toISOString(), eventType, validMatterId, location || null, description || null, all_day, user.id]
    );
    
    const event = result.rows[0];
    console.log('Calendar event created successfully:', event.id);
    
    return {
      success: true,
      message: `Created ${eventType} "${title}" scheduled for ${formatDateTime(startDate)}`,
      data: { id: event.id, title: event.title, start: formatDateTime(event.start_time), end: formatDateTime(event.end_time), type: event.type }
    };
  } catch (dbError) {
    console.error('Database error creating calendar event:', dbError);
    return { error: `Failed to create event: ${dbError.message}` };
  }
}

async function updateCalendarEvent(args, user) {
  const { event_id, title, start_time, end_time, type, location, description, status } = args;
  
  if (!event_id) {
    return { error: 'event_id is required' };
  }
  
  const existing = await query('SELECT id FROM calendar_events WHERE id = $1 AND firm_id = $2', [event_id, user.firmId]);
  if (existing.rows.length === 0) {
    return { error: 'Event not found' };
  }
  
  const result = await query(
    `UPDATE calendar_events SET
      title = COALESCE($1, title),
      start_time = COALESCE($2, start_time),
      end_time = COALESCE($3, end_time),
      type = COALESCE($4, type),
      location = COALESCE($5, location),
      description = COALESCE($6, description),
      status = COALESCE($7, status),
      updated_at = NOW()
    WHERE id = $8 RETURNING *`,
    [title, start_time, end_time, type, location, description, status, event_id]
  );
  
  return {
    success: true,
    message: `Updated event "${result.rows[0].title}"`,
    data: { id: result.rows[0].id, title: result.rows[0].title }
  };
}

async function deleteCalendarEvent(args, user) {
  const { event_id } = args;
  
  if (!event_id) {
    return { error: 'event_id is required' };
  }
  
  const existing = await query('SELECT title FROM calendar_events WHERE id = $1 AND firm_id = $2', [event_id, user.firmId]);
  if (existing.rows.length === 0) {
    return { error: 'Event not found' };
  }
  
  await query('DELETE FROM calendar_events WHERE id = $1', [event_id]);
  
  return {
    success: true,
    message: `Deleted event "${existing.rows[0].title}"`
  };
}

// =============================================================================
// TASK FUNCTIONS
// =============================================================================
async function createTask(args, user) {
  const { title, due_date, priority = 'medium', matter_id, client_id, assigned_to, notes } = args;
  
  if (!title) {
    return { error: 'Task title is required' };
  }
  
  // Create task in database (uses calendar_events table with type='task' for simplicity)
  const result = await query(
    `INSERT INTO calendar_events (firm_id, title, description, start_time, type, matter_id, client_id, priority, status, created_by, assigned_to)
     VALUES ($1, $2, $3, $4, 'task', $5, $6, $7, 'pending', $8, $9)
     RETURNING id, title`,
    [
      user.firmId,
      title,
      notes || null,
      due_date ? new Date(due_date) : null,
      matter_id || null,
      client_id || null,
      priority,
      user.id,
      assigned_to || user.id
    ]
  );
  
  const task = result.rows[0];
  return {
    success: true,
    message: `Created task "${title}"${due_date ? ` due ${due_date}` : ''}`,
    data: { id: task.id, title: task.title, due_date, priority }
  };
}

async function listTasks(args, user) {
  const { status, matter_id, assigned_to, due_before, include_completed = false } = args;
  
  let sql = `
    SELECT ce.id, ce.title, ce.description, ce.start_time as due_date, ce.priority, ce.status, 
           ce.matter_id, m.name as matter_name, ce.client_id, c.display_name as client_name,
           u.first_name || ' ' || u.last_name as assigned_to_name
    FROM calendar_events ce
    LEFT JOIN matters m ON ce.matter_id = m.id
    LEFT JOIN clients c ON ce.client_id = c.id
    LEFT JOIN users u ON ce.assigned_to = u.id
    WHERE ce.firm_id = $1 AND ce.type = 'task'
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (status) {
    sql += ` AND ce.status = $${idx++}`;
    params.push(status);
  } else if (!include_completed) {
    sql += ` AND ce.status != 'completed'`;
  }
  
  if (matter_id) {
    sql += ` AND ce.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  
  if (assigned_to === 'me') {
    sql += ` AND ce.assigned_to = $${idx++}`;
    params.push(user.id);
  } else if (assigned_to) {
    sql += ` AND ce.assigned_to = $${idx++}`;
    params.push(assigned_to);
  }
  
  if (due_before) {
    sql += ` AND ce.start_time <= $${idx++}`;
    params.push(due_before);
  }
  
  sql += ` ORDER BY ce.start_time ASC NULLS LAST, ce.priority DESC LIMIT 50`;
  
  const result = await query(sql, params);
  
  return {
    tasks: result.rows.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      due_date: t.due_date,
      priority: t.priority,
      status: t.status,
      matter: t.matter_name,
      client: t.client_name,
      assigned_to: t.assigned_to_name
    })),
    count: result.rows.length
  };
}

async function completeTask(args, user) {
  const { task_id } = args;
  
  const result = await query(
    `UPDATE calendar_events SET status = 'completed', updated_at = NOW()
     WHERE id = $1 AND firm_id = $2 AND type = 'task'
     RETURNING id, title`,
    [task_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Task not found' };
  }
  
  return {
    success: true,
    message: `Completed task "${result.rows[0].title}"`,
    data: { id: result.rows[0].id, status: 'completed' }
  };
}

async function updateTask(args, user) {
  const { task_id, title, due_date, priority, status, assigned_to, notes } = args;
  
  const result = await query(
    `UPDATE calendar_events SET
       title = COALESCE($1, title),
       start_time = COALESCE($2, start_time),
       priority = COALESCE($3, priority),
       status = COALESCE($4, status),
       assigned_to = COALESCE($5, assigned_to),
       description = COALESCE($6, description),
       updated_at = NOW()
     WHERE id = $7 AND firm_id = $8 AND type = 'task'
     RETURNING id, title, status`,
    [title, due_date ? new Date(due_date) : null, priority, status, assigned_to, notes, task_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Task not found' };
  }
  
  return {
    success: true,
    message: `Updated task "${result.rows[0].title}"`,
    data: result.rows[0]
  };
}

// =============================================================================
// REPORT FUNCTIONS
// =============================================================================
async function generateReport(args, user) {
  const { report_type, start_date, end_date, matter_id, client_id, user_id } = args;
  
  const startDt = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDt = end_date ? new Date(end_date) : new Date();
  
  switch (report_type) {
    case 'billing_summary': {
      const result = await query(`
        SELECT 
          COUNT(DISTINCT i.id) as total_invoices,
          SUM(i.amount) as total_billed,
          SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as total_collected,
          SUM(CASE WHEN i.status IN ('sent', 'overdue') THEN i.amount ELSE 0 END) as outstanding
        FROM invoices i
        WHERE i.firm_id = $1 AND i.created_at BETWEEN $2 AND $3
      `, [user.firmId, startDt, endDt]);
      
      return {
        report: 'Billing Summary',
        period: { start: startDt.toISOString().split('T')[0], end: endDt.toISOString().split('T')[0] },
        data: {
          total_invoices: parseInt(result.rows[0].total_invoices) || 0,
          total_billed: parseFloat(result.rows[0].total_billed) || 0,
          total_collected: parseFloat(result.rows[0].total_collected) || 0,
          outstanding: parseFloat(result.rows[0].outstanding) || 0
        }
      };
    }
    
    case 'time_by_matter': {
      const result = await query(`
        SELECT m.name as matter_name, m.number as matter_number,
               SUM(te.duration_minutes) as total_minutes,
               SUM(te.duration_minutes * te.rate / 60) as total_value,
               COUNT(te.id) as entry_count
        FROM time_entries te
        JOIN matters m ON te.matter_id = m.id
        WHERE te.firm_id = $1 AND te.date BETWEEN $2 AND $3
        GROUP BY m.id, m.name, m.number
        ORDER BY total_minutes DESC
        LIMIT 20
      `, [user.firmId, startDt, endDt]);
      
      return {
        report: 'Time by Matter',
        period: { start: startDt.toISOString().split('T')[0], end: endDt.toISOString().split('T')[0] },
        data: result.rows.map(r => ({
          matter: `${r.matter_number} - ${r.matter_name}`,
          hours: (parseInt(r.total_minutes) / 60).toFixed(1),
          value: parseFloat(r.total_value) || 0,
          entries: parseInt(r.entry_count)
        }))
      };
    }
    
    case 'time_by_user': {
      const result = await query(`
        SELECT u.first_name || ' ' || u.last_name as user_name,
               SUM(te.duration_minutes) as total_minutes,
               SUM(te.duration_minutes * te.rate / 60) as total_value,
               COUNT(te.id) as entry_count
        FROM time_entries te
        JOIN users u ON te.user_id = u.id
        WHERE te.firm_id = $1 AND te.date BETWEEN $2 AND $3
        GROUP BY u.id, u.first_name, u.last_name
        ORDER BY total_minutes DESC
      `, [user.firmId, startDt, endDt]);
      
      return {
        report: 'Time by User',
        period: { start: startDt.toISOString().split('T')[0], end: endDt.toISOString().split('T')[0] },
        data: result.rows.map(r => ({
          user: r.user_name,
          hours: (parseInt(r.total_minutes) / 60).toFixed(1),
          value: parseFloat(r.total_value) || 0,
          entries: parseInt(r.entry_count)
        }))
      };
    }
    
    case 'outstanding_invoices': {
      const result = await query(`
        SELECT i.invoice_number, c.display_name as client, i.amount, i.due_date, i.status,
               CURRENT_DATE - i.due_date as days_overdue
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.firm_id = $1 AND i.status IN ('sent', 'overdue', 'partial')
        ORDER BY i.due_date ASC
        LIMIT 50
      `, [user.firmId]);
      
      return {
        report: 'Outstanding Invoices',
        data: result.rows.map(r => ({
          invoice: r.invoice_number,
          client: r.client,
          amount: parseFloat(r.amount),
          due_date: r.due_date,
          status: r.status,
          days_overdue: parseInt(r.days_overdue) > 0 ? parseInt(r.days_overdue) : 0
        })),
        total_outstanding: result.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0)
      };
    }
    
    case 'matter_status': {
      const result = await query(`
        SELECT status, COUNT(*) as count
        FROM matters
        WHERE firm_id = $1
        GROUP BY status
        ORDER BY count DESC
      `, [user.firmId]);
      
      return {
        report: 'Matter Status Overview',
        data: result.rows.map(r => ({
          status: r.status,
          count: parseInt(r.count)
        })),
        total: result.rows.reduce((sum, r) => sum + parseInt(r.count), 0)
      };
    }
    
    case 'productivity': {
      const timeResult = await query(`
        SELECT 
          SUM(duration_minutes) as total_minutes,
          SUM(CASE WHEN is_billable THEN duration_minutes ELSE 0 END) as billable_minutes,
          COUNT(DISTINCT date) as active_days
        FROM time_entries
        WHERE firm_id = $1 AND date BETWEEN $2 AND $3
      `, [user.firmId, startDt, endDt]);
      
      const matterResult = await query(`
        SELECT COUNT(*) as new_matters
        FROM matters
        WHERE firm_id = $1 AND created_at BETWEEN $2 AND $3
      `, [user.firmId, startDt, endDt]);
      
      const t = timeResult.rows[0];
      return {
        report: 'Productivity Report',
        period: { start: startDt.toISOString().split('T')[0], end: endDt.toISOString().split('T')[0] },
        data: {
          total_hours: ((parseInt(t.total_minutes) || 0) / 60).toFixed(1),
          billable_hours: ((parseInt(t.billable_minutes) || 0) / 60).toFixed(1),
          billable_percentage: t.total_minutes > 0 ? ((t.billable_minutes / t.total_minutes) * 100).toFixed(1) + '%' : '0%',
          active_days: parseInt(t.active_days) || 0,
          new_matters: parseInt(matterResult.rows[0].new_matters) || 0
        }
      };
    }
    
    case 'client_summary': {
      const result = await query(`
        SELECT c.display_name as client,
               COUNT(DISTINCT m.id) as matter_count,
               SUM(i.amount) as total_billed,
               SUM(CASE WHEN i.status = 'paid' THEN i.amount ELSE 0 END) as total_paid
        FROM clients c
        LEFT JOIN matters m ON c.id = m.client_id
        LEFT JOIN invoices i ON c.id = i.client_id
        WHERE c.firm_id = $1 AND c.is_active = true
        GROUP BY c.id, c.display_name
        ORDER BY total_billed DESC NULLS LAST
        LIMIT 20
      `, [user.firmId]);
      
      return {
        report: 'Client Summary',
        data: result.rows.map(r => ({
          client: r.client,
          matters: parseInt(r.matter_count) || 0,
          total_billed: parseFloat(r.total_billed) || 0,
          total_paid: parseFloat(r.total_paid) || 0
        }))
      };
    }
    
    default:
      return { error: `Unknown report type: ${report_type}` };
  }
}

// =============================================================================
// DOCUMENT FUNCTIONS
// =============================================================================
async function listDocuments(args, user) {
  const { matter_id, client_id, search, source, limit = 20 } = args;
  
  let sql = `
    SELECT d.id, d.name, d.file_type, d.file_size, d.status, d.created_at, d.external_source, d.external_url, m.name as matter_name, c.display_name as client_name
    FROM documents d
    LEFT JOIN matters m ON d.matter_id = m.id
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND d.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  if (client_id) {
    sql += ` AND d.client_id = $${idx++}`;
    params.push(client_id);
  }
  if (search) {
    sql += ` AND d.name ILIKE $${idx++}`;
    params.push(`%${search}%`);
  }
  if (source) {
    // Filter by source: 'local', 'onedrive', 'googledrive', 'dropbox'
    if (source === 'local') {
      sql += ` AND d.external_source IS NULL`;
    } else {
      sql += ` AND d.external_source = $${idx++}`;
      params.push(source);
    }
  }
  
  sql += ` ORDER BY d.created_at DESC LIMIT ${Math.min(parseInt(limit), 50)}`;
  
  const result = await query(sql, params);
  
  return {
    documents: result.rows.map(d => ({
      id: d.id,
      name: d.name,
      type: d.file_type,
      size: d.file_size,
      status: d.status,
      matter: d.matter_name,
      client: d.client_name,
      source: d.external_source || 'local',
      external_url: d.external_url,
      uploaded_at: d.created_at
    })),
    count: result.rows.length
  };
}

async function getDocument(args, user) {
  const { document_id } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  
  const result = await query(
    `SELECT d.*, m.name as matter_name, c.display_name as client_name, 
            u.first_name || ' ' || u.last_name as uploaded_by_name
     FROM documents d
     LEFT JOIN matters m ON d.matter_id = m.id
     LEFT JOIN clients c ON d.client_id = c.id
     LEFT JOIN users u ON d.uploaded_by = u.id
     WHERE d.id = $1 AND d.firm_id = $2`,
    [document_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const d = result.rows[0];
  
  return {
    id: d.id,
    name: d.name,
    original_name: d.original_name,
    type: d.type,
    size: d.size,
    status: d.status,
    matter: d.matter_name,
    client: d.client_name,
    uploaded_by: d.uploaded_by_name,
    uploaded_at: d.uploaded_at,
    tags: d.tags,
    ai_summary: d.ai_summary
  };
}

async function readDocumentContent(args, user) {
  const { document_id, max_length = 10000 } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  
  const result = await query(
    `SELECT d.id, d.name, d.type, d.content_text, d.ai_summary, d.path, m.name as matter_name
     FROM documents d
     LEFT JOIN matters m ON d.matter_id = m.id
     WHERE d.id = $1 AND d.firm_id = $2`,
    [document_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = result.rows[0];
  
  // If we have extracted content, return it
  if (doc.content_text) {
    const content = doc.content_text.substring(0, Math.min(parseInt(max_length), 50000));
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matter: doc.matter_name,
      content: content,
      truncated: doc.content_text.length > content.length,
      total_length: doc.content_text.length
    };
  }
  
  // If we have an AI summary but no content, return that
  if (doc.ai_summary) {
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matter: doc.matter_name,
      content: null,
      summary: doc.ai_summary,
      note: 'Full text content not yet extracted. Summary available.'
    };
  }
  
  // No content available - try to extract it now if we have a path
  if (doc.path) {
    try {
      // Dynamic import to avoid circular dependencies
      const { extractTextFromFile } = await import('./documents.js');
      const extractedContent = await extractTextFromFile(doc.path, doc.name);
      
      if (extractedContent && extractedContent.trim().length > 0) {
        // Save the extracted content for future use
        await query(
          'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
          [extractedContent, doc.id]
        );
        
        const content = extractedContent.substring(0, Math.min(parseInt(max_length), 50000));
        return {
          id: doc.id,
          name: doc.name,
          type: doc.type,
          matter: doc.matter_name,
          content: content,
          truncated: extractedContent.length > content.length,
          total_length: extractedContent.length,
          note: 'Content was extracted on-demand'
        };
      }
    } catch (extractError) {
      console.error('On-demand extraction failed:', extractError);
    }
  }
  
  // No content available and extraction failed
  return {
    id: doc.id,
    name: doc.name,
    type: doc.type,
    matter: doc.matter_name,
    content: null,
    note: 'Document content could not be extracted. The document may be an image, scanned PDF, or unsupported format.'
  };
}

async function getMatterDocumentsContent(args, user) {
  const { matter_id, include_content = true } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required' };
  }
  
  // Get matter info
  const matterResult = await query(
    'SELECT name, number FROM matters WHERE id = $1 AND firm_id = $2',
    [matter_id, user.firmId]
  );
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Get all documents for this matter
  const docsResult = await query(
    `SELECT id, name, type, size, status, content_text, ai_summary, uploaded_at
     FROM documents 
     WHERE matter_id = $1 AND firm_id = $2
     ORDER BY uploaded_at DESC`,
    [matter_id, user.firmId]
  );
  
  const documents = docsResult.rows.map(d => {
    const doc = {
      id: d.id,
      name: d.name,
      type: d.type,
      size: d.size,
      status: d.status,
      uploaded_at: d.uploaded_at
    };
    
    if (include_content) {
      if (d.content_text) {
        // Include first 2000 chars as preview
        doc.content_preview = d.content_text.substring(0, 2000);
        doc.has_full_content = true;
        doc.content_length = d.content_text.length;
      } else if (d.ai_summary) {
        doc.summary = d.ai_summary;
        doc.has_full_content = false;
      } else {
        doc.has_full_content = false;
        doc.note = 'Content not extracted';
      }
    }
    
    return doc;
  });
  
  return {
    matter: {
      id: matter_id,
      name: matter.name,
      number: matter.number
    },
    document_count: documents.length,
    documents: documents
  };
}

async function searchDocumentContent(args, user) {
  const { search_term, matter_id, client_id } = args;
  
  if (!search_term || search_term.length < 2) {
    return { error: 'search_term must be at least 2 characters' };
  }
  
  let sql = `
    SELECT d.id, d.name, d.type, d.content_text, d.ai_summary, 
           m.name as matter_name, m.number as matter_number, c.display_name as client_name
    FROM documents d
    LEFT JOIN matters m ON d.matter_id = m.id
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.firm_id = $1 
      AND (d.content_text ILIKE $2 OR d.ai_summary ILIKE $2 OR d.name ILIKE $2)
  `;
  const params = [user.firmId, `%${search_term}%`];
  let idx = 3;
  
  if (matter_id) {
    sql += ` AND d.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  
  if (client_id) {
    sql += ` AND d.client_id = $${idx++}`;
    params.push(client_id);
  }
  
  sql += ' ORDER BY d.uploaded_at DESC LIMIT 20';
  
  const result = await query(sql, params);
  
  // Extract relevant snippets
  const matches = result.rows.map(d => {
    const match = {
      id: d.id,
      name: d.name,
      type: d.type,
      matter: d.matter_name ? `${d.matter_number} - ${d.matter_name}` : null,
      client: d.client_name
    };
    
    // Find snippet with the search term
    if (d.content_text) {
      const lowerContent = d.content_text.toLowerCase();
      const searchPos = lowerContent.indexOf(search_term.toLowerCase());
      if (searchPos >= 0) {
        const start = Math.max(0, searchPos - 100);
        const end = Math.min(d.content_text.length, searchPos + search_term.length + 100);
        match.snippet = '...' + d.content_text.substring(start, end) + '...';
      }
    } else if (d.ai_summary) {
      match.snippet = d.ai_summary.substring(0, 200);
      match.from_summary = true;
    }
    
    return match;
  });
  
  return {
    search_term: search_term,
    matches: matches,
    count: matches.length
  };
}

async function saveUploadedDocument(args, user, req) {
  const { matter_id, client_id, document_name, tags } = args;
  
  // Check if there's an uploaded document in the request
  if (!req?.uploadedDocument) {
    return { error: 'No document has been uploaded in this conversation. Please upload a file first using the paperclip button.' };
  }
  
  const doc = req.uploadedDocument;
  
  // Generate a unique filename
  const timestamp = Date.now();
  const safeName = (document_name || doc.name).replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${timestamp}-${safeName}`;
  
  try {
    // Insert document record (content is stored in content_text, no physical file needed for chat uploads)
    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, size, path,
        content_text, content_extracted_at, tags, status, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, 'final', $11)
      RETURNING id, name`,
      [
        user.firmId,
        matter_id || null,
        client_id || null,
        document_name || doc.name,
        doc.name,
        doc.type,
        doc.size,
        `chat-upload/${filename}`, // Virtual path for chat uploads
        doc.content,
        tags || [],
        user.id
      ]
    );
    
    const savedDoc = result.rows[0];
    
    // Get matter/client names for confirmation
    let locationInfo = '';
    if (matter_id) {
      const matterRes = await query('SELECT name, number FROM matters WHERE id = $1', [matter_id]);
      if (matterRes.rows.length > 0) {
        locationInfo = ` to matter "${matterRes.rows[0].name}" (${matterRes.rows[0].number})`;
      }
    } else if (client_id) {
      const clientRes = await query('SELECT display_name FROM clients WHERE id = $1', [client_id]);
      if (clientRes.rows.length > 0) {
        locationInfo = ` to client "${clientRes.rows[0].display_name}"`;
      }
    }
    
    return {
      success: true,
      message: `Saved document "${savedDoc.name}"${locationInfo}`,
      data: {
        id: savedDoc.id,
        name: savedDoc.name,
        matter_id,
        client_id
      }
    };
  } catch (error) {
    console.error('Error saving uploaded document:', error);
    return { error: 'Failed to save document: ' + error.message };
  }
}

// =============================================================================
// TEAM FUNCTIONS
// =============================================================================
async function listTeamMembers(args, user) {
  const { role, active_only = true } = args;
  
  let sql = `
    SELECT id, first_name, last_name, email, role, phone, hourly_rate, is_active
    FROM users WHERE firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (active_only) {
    sql += ` AND is_active = true`;
  }
  if (role) {
    sql += ` AND role = $${idx++}`;
    params.push(role);
  }
  
  sql += ` ORDER BY last_name, first_name`;
  
  const result = await query(sql, params);
  
  return {
    team: result.rows.map(u => ({
      id: u.id,
      name: `${u.first_name} ${u.last_name}`,
      email: u.email,
      role: u.role,
      phone: u.phone,
      hourly_rate: u.hourly_rate ? parseFloat(u.hourly_rate) : null,
      active: u.is_active
    })),
    count: result.rows.length
  };
}

async function getTeamMember(args, user) {
  const { user_id } = args;
  
  if (!user_id) {
    return { error: 'user_id is required' };
  }
  
  const result = await query(
    `SELECT u.*, 
      (SELECT COUNT(*) FROM matters WHERE responsible_attorney = u.id) as matter_count,
      (SELECT COALESCE(SUM(hours), 0) FROM time_entries WHERE user_id = u.id AND date >= DATE_TRUNC('month', CURRENT_DATE)) as mtd_hours
     FROM users u WHERE u.id = $1 AND u.firm_id = $2`,
    [user_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Team member not found' };
  }
  
  const u = result.rows[0];
  
  return {
    id: u.id,
    name: `${u.first_name} ${u.last_name}`,
    email: u.email,
    role: u.role,
    phone: u.phone,
    hourly_rate: u.hourly_rate ? parseFloat(u.hourly_rate) : null,
    active: u.is_active,
    stats: {
      matter_count: parseInt(u.matter_count),
      mtd_hours: parseFloat(u.mtd_hours)
    }
  };
}

// =============================================================================
// EXPENSE FUNCTIONS
// =============================================================================
async function createExpense(args, user) {
  const { matter_id, amount, description, date, category, billable = true } = args;
  
  if (!matter_id || !amount || !description) {
    return { error: 'matter_id, amount, and description are required' };
  }
  
  // Verify matter access
  const matterCheck = await query('SELECT id, name FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, user.firmId]);
  if (matterCheck.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const expenseDate = date || getTodayInTimezone(DEFAULT_TIMEZONE);
  
  const result = await query(
    `INSERT INTO expenses (firm_id, matter_id, user_id, date, description, amount, category, billable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [user.firmId, matter_id, user.id, expenseDate, description, amount, category || 'other', billable]
  );
  
  return {
    success: true,
    message: `Added expense of $${amount.toFixed(2)} to "${matterCheck.rows[0].name}"`,
    data: { id: result.rows[0].id, amount: parseFloat(result.rows[0].amount) }
  };
}

async function listExpenses(args, user) {
  const { matter_id, start_date, end_date, billable } = args;
  
  let sql = `
    SELECT e.*, m.name as matter_name
    FROM expenses e
    LEFT JOIN matters m ON e.matter_id = m.id
    WHERE e.firm_id = $1
  `;
  const params = [user.firmId];
  let idx = 2;
  
  if (matter_id) {
    sql += ` AND e.matter_id = $${idx++}`;
    params.push(matter_id);
  }
  if (start_date) {
    sql += ` AND e.date >= $${idx++}`;
    params.push(start_date);
  }
  if (end_date) {
    sql += ` AND e.date <= $${idx++}`;
    params.push(end_date);
  }
  if (billable !== undefined) {
    sql += ` AND e.billable = $${idx++}`;
    params.push(billable);
  }
  
  sql += ` ORDER BY e.date DESC LIMIT 50`;
  
  const result = await query(sql, params);
  
  return {
    expenses: result.rows.map(e => ({
      id: e.id,
      date: e.date,
      description: e.description,
      amount: parseFloat(e.amount),
      category: e.category,
      matter: e.matter_name,
      billable: e.billable,
      billed: e.billed
    })),
    total: result.rows.reduce((sum, e) => sum + parseFloat(e.amount), 0)
  };
}

// =============================================================================
// ANALYTICS FUNCTIONS
// =============================================================================
async function getFirmAnalytics(args, user) {
  if (!['owner', 'admin', 'partner', 'billing'].includes(user.role)) {
    return { error: 'You do not have permission to view firm analytics' };
  }
  
  const { time_period = 'current_month' } = args;
  
  let dateFilter;
  switch (time_period) {
    case 'last_week': dateFilter = `>= CURRENT_DATE - INTERVAL '7 days'`; break;
    case 'last_month': dateFilter = `>= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND date < DATE_TRUNC('month', CURRENT_DATE)`; break;
    case 'last_quarter': dateFilter = `>= DATE_TRUNC('quarter', CURRENT_DATE - INTERVAL '3 months')`; break;
    case 'year_to_date': dateFilter = `>= DATE_TRUNC('year', CURRENT_DATE)`; break;
    case 'all_time': dateFilter = `IS NOT NULL`; break;
    default: dateFilter = `>= DATE_TRUNC('month', CURRENT_DATE)`;
  }
  
  const [billing, matters, invoices, clients] = await Promise.all([
    query(`SELECT SUM(hours) as hours, SUM(amount) as revenue, SUM(CASE WHEN billable AND NOT billed THEN amount ELSE 0 END) as unbilled
           FROM time_entries WHERE firm_id = $1 AND date ${dateFilter}`, [user.firmId]),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'active') as active, COUNT(*) FILTER (WHERE priority IN ('urgent', 'high')) as priority, COUNT(*) as total
           FROM matters WHERE firm_id = $1`, [user.firmId]),
    query(`SELECT SUM(amount_due) as outstanding, SUM(CASE WHEN status = 'overdue' THEN amount_due ELSE 0 END) as overdue, SUM(total) as total_invoiced
           FROM invoices WHERE firm_id = $1`, [user.firmId]),
    query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active FROM clients WHERE firm_id = $1`, [user.firmId])
  ]);
  
  return {
    period: time_period,
    billing: {
      hours: parseFloat(billing.rows[0]?.hours || 0),
      revenue: parseFloat(billing.rows[0]?.revenue || 0),
      unbilled: parseFloat(billing.rows[0]?.unbilled || 0)
    },
    matters: {
      total: parseInt(matters.rows[0]?.total || 0),
      active: parseInt(matters.rows[0]?.active || 0),
      priority: parseInt(matters.rows[0]?.priority || 0)
    },
    invoices: {
      total_invoiced: parseFloat(invoices.rows[0]?.total_invoiced || 0),
      outstanding: parseFloat(invoices.rows[0]?.outstanding || 0),
      overdue: parseFloat(invoices.rows[0]?.overdue || 0)
    },
    clients: {
      total: parseInt(clients.rows[0]?.total || 0),
      active: parseInt(clients.rows[0]?.active || 0)
    }
  };
}

async function getUserStats(args, user) {
  const { time_period = 'this_month' } = args;
  
  let dateFilter;
  switch (time_period) {
    case 'today': dateFilter = `= CURRENT_DATE`; break;
    case 'this_week': dateFilter = `>= DATE_TRUNC('week', CURRENT_DATE)`; break;
    case 'this_year': dateFilter = `>= DATE_TRUNC('year', CURRENT_DATE)`; break;
    default: dateFilter = `>= DATE_TRUNC('month', CURRENT_DATE)`;
  }
  
  const [time, matters, events] = await Promise.all([
    query(`SELECT SUM(hours) as hours, SUM(amount) as amount, COUNT(*) as entries
           FROM time_entries WHERE user_id = $1 AND date ${dateFilter}`, [user.id]),
    query(`SELECT COUNT(*) as count FROM matters m
           WHERE m.firm_id = $1 AND m.status = 'active' 
           AND (m.responsible_attorney = $2 OR EXISTS (SELECT 1 FROM matter_assignments WHERE matter_id = m.id AND user_id = $2))`,
          [user.firmId, user.id]),
    query(`SELECT COUNT(*) as upcoming FROM calendar_events 
           WHERE firm_id = $1 AND created_by = $2 AND start_time >= NOW() AND start_time < NOW() + INTERVAL '7 days'`,
          [user.firmId, user.id])
  ]);
  
  return {
    period: time_period,
    time: {
      hours: parseFloat(time.rows[0]?.hours || 0),
      amount: parseFloat(time.rows[0]?.amount || 0),
      entries: parseInt(time.rows[0]?.entries || 0)
    },
    active_matters: parseInt(matters.rows[0]?.count || 0),
    upcoming_events: parseInt(events.rows[0]?.upcoming || 0)
  };
}

async function getMatterSummary(args, user) {
  const { matter_id } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required' };
  }
  
  const matterCheck = await query('SELECT id, name, number FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, user.firmId]);
  if (matterCheck.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const [time, expenses, invoices, events] = await Promise.all([
    query(`SELECT SUM(hours) as hours, SUM(amount) as amount, SUM(CASE WHEN billed THEN amount ELSE 0 END) as billed
           FROM time_entries WHERE matter_id = $1`, [matter_id]),
    query(`SELECT SUM(amount) as total, SUM(CASE WHEN billed THEN amount ELSE 0 END) as billed
           FROM expenses WHERE matter_id = $1`, [matter_id]),
    query(`SELECT SUM(total) as invoiced, SUM(amount_paid) as collected, SUM(amount_due) as outstanding
           FROM invoices WHERE matter_id = $1`, [matter_id]),
    query(`SELECT COUNT(*) as upcoming FROM calendar_events WHERE matter_id = $1 AND start_time >= NOW()`, [matter_id])
  ]);
  
  const matter = matterCheck.rows[0];
  
  return {
    matter: { id: matter.id, name: matter.name, number: matter.number },
    time: {
      hours: parseFloat(time.rows[0]?.hours || 0),
      amount: parseFloat(time.rows[0]?.amount || 0),
      billed: parseFloat(time.rows[0]?.billed || 0)
    },
    expenses: {
      total: parseFloat(expenses.rows[0]?.total || 0),
      billed: parseFloat(expenses.rows[0]?.billed || 0)
    },
    invoices: {
      invoiced: parseFloat(invoices.rows[0]?.invoiced || 0),
      collected: parseFloat(invoices.rows[0]?.collected || 0),
      outstanding: parseFloat(invoices.rows[0]?.outstanding || 0)
    },
    upcoming_events: parseInt(events.rows[0]?.upcoming || 0)
  };
}

async function addMatterNote(args, user) {
  const { matter_id, content } = args;
  
  if (!matter_id || !content) {
    return { error: 'matter_id and content are required' };
  }
  
  const matterCheck = await query('SELECT id, name, ai_summary FROM matters WHERE id = $1 AND firm_id = $2', [matter_id, user.firmId]);
  if (matterCheck.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  // Append to ai_summary field as a note (since there's no dedicated notes table)
  const existingNotes = matterCheck.rows[0].ai_summary || '';
  const timestamp = formatDateTime(new Date());
  const newNote = `\n\n[${timestamp} - ${user.firstName} ${user.lastName}]\n${content}`;
  
  await query('UPDATE matters SET ai_summary = $1 WHERE id = $2', [existingNotes + newNote, matter_id]);
  
  return {
    success: true,
    message: `Added note to matter "${matterCheck.rows[0].name}"`
  };
}

// =============================================================================
// =============================================================================
// AUTONOMOUS AGENT FUNCTIONS
// =============================================================================

// These tools help the AI work on complex, multi-step tasks autonomously

// In-memory task queue for background processing
const activeTasks = new Map();

async function startBackgroundTask(args, user) {
  const { goal, plan, estimated_steps, matter_id, client_id } = args;
  
  try {
    // Create task in database
    const result = await query(
      `INSERT INTO ai_tasks (firm_id, user_id, goal, status, plan, max_iterations, context)
       VALUES ($1, $2, $3, 'running', $4, $5, $6)
       RETURNING id`,
      [
        user.firmId, 
        user.id, 
        goal, 
        JSON.stringify(plan || []),
        Math.min((estimated_steps || 50) * 2, 100),
        JSON.stringify({ matter_id, client_id })
      ]
    );
    
    const taskId = result.rows[0].id;
    
    // Start background processing
    processBackgroundTask(taskId, user, goal, plan);
    
    return {
      status: 'started',
      task_id: taskId,
      message: `Background task started. I'll work on: ${goal}`,
      goal,
      plan,
      estimated_steps: estimated_steps || plan?.length || 10,
      _background_task_started: true
    };
  } catch (error) {
    console.error('Error starting background task:', error);
    return { error: 'Failed to start background task: ' + error.message };
  }
}

// Background task processor
// Helper function to add delay between background task steps
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processBackgroundTask(taskId, user, goal, plan) {
  console.log(`[BACKGROUND] Starting task ${taskId}: ${goal}`);
  
  const startTime = Date.now();
  const maxRuntime = 30 * 60 * 1000; // 30 minutes max (increased for delays)
  let iterations = 0;
  const maxIterations = 100;
  let progress = [];
  
  // Delay between each iteration (30-60 seconds to simulate careful work)
  const STEP_DELAY_MS = 45 * 1000; // 45 seconds between steps
  
  try {
    // Update status to running
    await query(
      `UPDATE ai_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId]
    );
    
    // Build the initial prompt
    const systemPrompt = getSystemPrompt()
      .replace('{{USER_ROLE}}', user.role || 'staff')
      .replace('{{USER_NAME}}', `${user.firstName || ''} ${user.lastName || ''}`);
    
    let messages = [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `You are working on a BACKGROUND TASK. This is a thorough, multi-step task that requires careful execution.

GOAL: ${goal}

PLAN (${(plan || []).length} steps):
${(plan || []).map((step, i) => `${i + 1}. ${step}`).join('\n')}

IMPORTANT INSTRUCTIONS:
1. Work through EACH step systematically - do not skip steps
2. For each step, use the appropriate tools to gather information or take actions
3. After each significant action, use log_work to track your progress  
4. Take your time - this is a background task, there's no rush
5. If you need to retrieve data, actually retrieve it using the tools
6. If you need to analyze something, do a thorough analysis
7. Only call task_complete when you have genuinely completed ALL steps

DO NOT call task_complete prematurely. The user expects a thorough job.

Begin now with Step 1: ${(plan || [])[0] || 'Start the task'}`
      }
    ];
    
    let response = await callAzureOpenAIWithTools(messages, TOOLS);
    let taskCompleted = false;
    let lastProgress = '';
    let stuckCount = 0;
    
    while (!taskCompleted && iterations < maxIterations && (Date.now() - startTime) < maxRuntime) {
      iterations++;
      
      if (!response.tool_calls) {
        // AI responded without tools - should keep working
        // Only mark complete if we've done significant work (5+ iterations) and AI explicitly says done
        const hasExplicitComplete = response.content?.toLowerCase().includes('all steps completed') ||
                                    response.content?.toLowerCase().includes('task complete') ||
                                    response.content?.toLowerCase().includes('i have finished');
        
        if (iterations >= 5 && hasExplicitComplete) {
          taskCompleted = true;
          break;
        }
        
        // Get the current step based on iterations
        const currentStep = plan && plan[Math.min(iterations, plan.length - 1)] || 'continue the task';
        
        // Prompt it to continue with tools
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ 
          role: 'user', 
          content: `You must continue working. You have only completed ${iterations} iterations out of the expected ${(plan || []).length} steps.

Next step: ${currentStep}

Use the appropriate tools to:
- Retrieve data if needed (get_clients, get_matters, get_time_entries, etc.)
- Create or update records if needed
- Log your progress with log_work

Do NOT just describe what you would do - actually use the tools to do it.`
        });
        
        // Add delay before continuing
        console.log(`[BACKGROUND ${taskId}] Prompting to continue. Waiting ${STEP_DELAY_MS/1000}s...`);
        await delay(STEP_DELAY_MS);
        
        response = await callAzureOpenAIWithTools(messages, TOOLS);
        continue;
      }
      
      // Process tool calls
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.tool_calls
      });
      
      for (const toolCall of response.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          functionArgs = {};
        }
        
        console.log(`[BACKGROUND ${taskId}] Tool: ${functionName}`);
        const result = await executeTool(functionName, functionArgs, user, null);
        
        // Track progress
        const progressEntry = {
          iteration: iterations,
          tool: functionName,
          timestamp: new Date().toISOString()
        };
        progress.push(progressEntry);
        
        // Check for completion
        if (result._task_complete) {
          taskCompleted = true;
          
          // Build a proper summary to store
          const completionSummary = `## Summary\n${result.summary}\n\n## Actions Taken\n${(result.actions_taken || []).map(a => `• ${a}`).join('\n')}\n\n## Results\n${result.results || 'Task completed successfully'}${result.recommendations?.length ? `\n\n## Recommendations\n${result.recommendations.map(r => `• ${r}`).join('\n')}` : ''}`;
          
          progress.push({ 
            iteration: iterations, 
            status: 'completed', 
            summary: result.summary,
            actions_taken: result.actions_taken,
            results: result.results,
            recommendations: result.recommendations,
            timestamp: new Date().toISOString()
          });
          
          // Update the task with the proper summary immediately
          await query(
            `UPDATE ai_tasks SET result = $1 WHERE id = $2`,
            [completionSummary, taskId]
          );
        }
        
        // Stuck detection
        const currentProgress = JSON.stringify({ tool: functionName, args: functionArgs });
        if (currentProgress === lastProgress) {
          stuckCount++;
          if (stuckCount >= 3) {
            console.log(`[BACKGROUND ${taskId}] Stuck detected, finishing`);
            taskCompleted = true;
            progress.push({ iteration: iterations, status: 'stuck', timestamp: new Date().toISOString() });
            break;
          }
        } else {
          stuckCount = 0;
          lastProgress = currentProgress;
        }
        
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
        
        // Update progress in database
        await query(
          `UPDATE ai_tasks SET iterations = $1, progress = $2, updated_at = NOW() WHERE id = $3`,
          [iterations, JSON.stringify(progress), taskId]
        );
      }
      
      if (!taskCompleted) {
        // Add delay between steps to work more deliberately
        console.log(`[BACKGROUND ${taskId}] Step ${iterations} complete. Waiting ${STEP_DELAY_MS/1000}s before next step...`);
        await delay(STEP_DELAY_MS);
        
        response = await callAzureOpenAIWithTools(messages, TOOLS);
      }
    }
    
    // Mark task complete
    const finalStatus = taskCompleted ? 'completed' : (iterations >= maxIterations ? 'max_iterations' : 'timeout');
    await query(
      `UPDATE ai_tasks SET status = $1, completed_at = NOW(), iterations = $2, progress = $3, 
       result = $4 WHERE id = $5`,
      [finalStatus, iterations, JSON.stringify(progress), response.content || 'Task completed', taskId]
    );
    
    console.log(`[BACKGROUND] Task ${taskId} finished with status: ${finalStatus}`);
    
  } catch (error) {
    console.error(`[BACKGROUND] Task ${taskId} error:`, error);
    await query(
      `UPDATE ai_tasks SET status = 'error', error = $1, completed_at = NOW() WHERE id = $2`,
      [error.message, taskId]
    );
  }
}

async function thinkAndPlan(args, user) {
  const { goal, analysis, steps, information_needed } = args;
  
  // Log the plan for tracking
  console.log(`[AI PLANNING] Goal: ${goal}`);
  console.log(`[AI PLANNING] Steps: ${steps?.join(', ')}`);
  
  return {
    status: 'plan_created',
    message: 'Plan created successfully. Now execute the steps.',
    plan: {
      goal,
      analysis,
      steps: steps || [],
      information_needed: information_needed || [],
      created_at: new Date().toISOString()
    },
    instruction: 'Now proceed to gather the information needed and execute each step. Use evaluate_progress periodically to check your progress.'
  };
}

async function evaluateProgress(args, user) {
  const { original_goal, completed_steps, remaining_steps, blockers, confidence, should_continue } = args;
  
  console.log(`[AI PROGRESS] Goal: ${original_goal}`);
  console.log(`[AI PROGRESS] Completed: ${completed_steps?.length || 0} steps`);
  console.log(`[AI PROGRESS] Remaining: ${remaining_steps?.length || 0} steps`);
  console.log(`[AI PROGRESS] Confidence: ${confidence}%`);
  console.log(`[AI PROGRESS] Continue: ${should_continue}`);
  
  if (!should_continue) {
    return {
      status: 'stopping',
      message: 'Evaluation indicates stopping. Use task_complete or request_human_input.',
      recommendation: blockers?.length > 0 
        ? 'You have blockers - consider using request_human_input to get guidance.'
        : 'Use task_complete to summarize what you accomplished.'
    };
  }
  
  if (confidence && confidence < 50) {
    return {
      status: 'low_confidence',
      message: 'Your confidence is low. Consider using request_human_input for guidance.',
      recommendation: 'Ask the human for clarification or approval before proceeding with uncertain actions.'
    };
  }
  
  return {
    status: 'continue',
    message: 'Progress evaluation complete. Continue with remaining steps.',
    completed: completed_steps?.length || 0,
    remaining: remaining_steps?.length || 0,
    next_action: remaining_steps?.[0] || 'Complete the task'
  };
}

async function taskComplete(args, user) {
  const { goal, summary, actions_taken, results, recommendations } = args;
  
  console.log(`[AI COMPLETE] Goal: ${goal}`);
  console.log(`[AI COMPLETE] Summary: ${summary}`);
  console.log(`[AI COMPLETE] Actions: ${actions_taken?.length || 0}`);
  
  // Mark that the task is complete - this signals the agent loop to stop
  return {
    status: 'completed',
    goal,
    summary,
    actions_taken: actions_taken || [],
    results: results || 'Task completed successfully',
    recommendations: recommendations || [],
    completed_at: new Date().toISOString(),
    _task_complete: true  // Signal to stop the agent loop
  };
}

async function requestHumanInput(args, user) {
  const { question, context, options, urgency, what_you_would_do } = args;
  
  console.log(`[AI NEEDS INPUT] Question: ${question}`);
  console.log(`[AI NEEDS INPUT] Urgency: ${urgency || 'medium'}`);
  
  // This signals that the AI needs human input before continuing
  return {
    status: 'awaiting_human_input',
    question,
    context,
    options: options || [],
    urgency: urgency || 'medium',
    ai_recommendation: what_you_would_do,
    message: 'I need your input before proceeding.',
    _needs_human_input: true  // Signal to pause and ask user
  };
}

async function logWork(args, user) {
  const { action, result, next_step } = args;
  
  console.log(`[AI WORK LOG] Action: ${action}`);
  if (result) console.log(`[AI WORK LOG] Result: ${result}`);
  if (next_step) console.log(`[AI WORK LOG] Next: ${next_step}`);
  
  return {
    status: 'logged',
    action,
    result: result || 'Completed',
    next_step: next_step || 'Continue with plan',
    timestamp: new Date().toISOString()
  };
}

// =============================================================================
// NAVIGATION FUNCTIONS
// =============================================================================
async function navigateToPage(args, user) {
  const { page } = args;
  
  const pageRoutes = {
    dashboard: { path: '/app', label: 'Dashboard' },
    matters: { path: '/app/matters', label: 'Matters' },
    clients: { path: '/app/clients', label: 'Clients' },
    calendar: { path: '/app/calendar', label: 'Calendar' },
    time: { path: '/app/time', label: 'Time Tracking' },
    billing: { path: '/app/billing', label: 'Billing' },
    documents: { path: '/app/documents', label: 'Documents' },
    team: { path: '/app/team', label: 'Team' },
    reports: { path: '/app/reports', label: 'Reports' },
    analytics: { path: '/app/analytics', label: 'Analytics' },
    settings: { path: '/app/settings', label: 'Settings' },
  };
  
  const route = pageRoutes[page];
  if (!route) {
    return { error: `Unknown page: ${page}` };
  }
  
  return {
    success: true,
    navigation: {
      type: 'page',
      path: route.path,
      label: route.label
    },
    message: `Opening ${route.label}...`
  };
}

async function openMatter(args, user) {
  const { matter_id } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required. Use search_matters to find the matter first.' };
  }
  
  const result = await query(
    `SELECT m.id, m.name, m.number, c.display_name as client_name
     FROM matters m
     LEFT JOIN clients c ON m.client_id = c.id
     WHERE m.id = $1 AND m.firm_id = $2`,
    [matter_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = result.rows[0];
  
  return {
    success: true,
    navigation: {
      type: 'matter',
      path: `/app/matters/${matter_id}`,
      label: matter.name,
      id: matter_id
    },
    message: `Opening matter "${matter.name}" (${matter.number})${matter.client_name ? ` for ${matter.client_name}` : ''}...`
  };
}

async function openClient(args, user) {
  const { client_id } = args;
  
  if (!client_id) {
    return { error: 'client_id is required. Use list_clients to find the client first.' };
  }
  
  const result = await query(
    `SELECT id, display_name, type FROM clients WHERE id = $1 AND firm_id = $2`,
    [client_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const client = result.rows[0];
  
  return {
    success: true,
    navigation: {
      type: 'client',
      path: `/app/clients/${client_id}`,
      label: client.display_name,
      id: client_id
    },
    message: `Opening client "${client.display_name}"...`
  };
}

async function openInvoice(args, user) {
  const { invoice_id } = args;
  
  if (!invoice_id) {
    return { error: 'invoice_id is required. Use list_invoices to find the invoice first.' };
  }
  
  const result = await query(
    `SELECT i.id, i.number, i.total, c.display_name as client_name
     FROM invoices i
     LEFT JOIN clients c ON i.client_id = c.id
     WHERE i.id = $1 AND i.firm_id = $2`,
    [invoice_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  const invoice = result.rows[0];
  
  return {
    success: true,
    navigation: {
      type: 'invoice',
      path: `/app/billing`,
      label: `Invoice ${invoice.number}`,
      id: invoice_id,
      action: 'view_invoice'
    },
    message: `Opening invoice ${invoice.number} ($${parseFloat(invoice.total).toLocaleString()}) for ${invoice.client_name || 'client'}...`
  };
}

async function openNewTimeEntry(args, user) {
  const { matter_id } = args;
  
  let matterInfo = null;
  if (matter_id) {
    const result = await query(
      'SELECT id, name, number FROM matters WHERE id = $1 AND firm_id = $2',
      [matter_id, user.firmId]
    );
    if (result.rows.length > 0) {
      matterInfo = result.rows[0];
    }
  }
  
  return {
    success: true,
    navigation: {
      type: 'form',
      path: '/app/time',
      action: 'new_time_entry',
      prefill: matter_id ? { matter_id } : null,
      label: 'New Time Entry'
    },
    message: matterInfo 
      ? `Opening time entry form for "${matterInfo.name}"...`
      : 'Opening time entry form...'
  };
}

async function openNewCalendarEvent(args, user) {
  const { date, matter_id } = args;
  
  let matterInfo = null;
  if (matter_id) {
    const result = await query(
      'SELECT id, name, number FROM matters WHERE id = $1 AND firm_id = $2',
      [matter_id, user.firmId]
    );
    if (result.rows.length > 0) {
      matterInfo = result.rows[0];
    }
  }
  
  const prefill = {};
  if (matter_id) prefill.matter_id = matter_id;
  if (date) prefill.date = date;
  
  return {
    success: true,
    navigation: {
      type: 'form',
      path: '/app/calendar',
      action: 'new_event',
      prefill: Object.keys(prefill).length > 0 ? prefill : null,
      label: 'New Calendar Event'
    },
    message: matterInfo 
      ? `Opening calendar event form for "${matterInfo.name}"${date ? ` on ${date}` : ''}...`
      : `Opening calendar event form${date ? ` for ${date}` : ''}...`
  };
}

// =============================================================================
// MATTER PERMISSIONS & SHARING FUNCTIONS
// =============================================================================

// Roles that have full access to all matters and can manage permissions
const FULL_ACCESS_ROLES = ['owner', 'admin', 'billing'];

async function getMatterPermissions(args, user) {
  const { matter_id } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required. Use search_matters to find the matter first.' };
  }
  
  // Get matter info including visibility and attorneys
  const matterResult = await query(`
    SELECT 
      m.id, m.name, m.number, m.visibility,
      m.responsible_attorney,
      m.originating_attorney,
      ra.first_name || ' ' || ra.last_name as responsible_attorney_name,
      ra.email as responsible_attorney_email,
      oa.first_name || ' ' || oa.last_name as originating_attorney_name,
      oa.email as originating_attorney_email
    FROM matters m
    LEFT JOIN users ra ON m.responsible_attorney = ra.id
    LEFT JOIN users oa ON m.originating_attorney = oa.id
    WHERE m.id = $1 AND m.firm_id = $2
  `, [matter_id, user.firmId]);
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Check if user can access this matter
  const isAdmin = FULL_ACCESS_ROLES.includes(user.role);
  const isResponsible = matter.responsible_attorney === user.id;
  const isOriginating = matter.originating_attorney === user.id;
  
  // For non-admins, check if they have access to this matter
  if (!isAdmin && !isResponsible && !isOriginating) {
    // Check if user is assigned or has permission
    const accessCheck = await query(`
      SELECT 1 FROM matter_assignments WHERE matter_id = $1 AND user_id = $2
      UNION
      SELECT 1 FROM matter_permissions WHERE matter_id = $1 AND user_id = $2
    `, [matter_id, user.id]);
    
    if (accessCheck.rows.length === 0 && matter.visibility === 'restricted') {
      return { error: 'You do not have access to view this matter\'s permissions' };
    }
  }
  
  // Get explicit permissions
  const permissionsResult = await query(`
    SELECT 
      mp.id as permission_id,
      mp.user_id,
      mp.group_id,
      mp.permission_level,
      mp.can_view_documents,
      mp.can_view_notes,
      mp.can_edit,
      mp.granted_at,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      u.role as user_role,
      g.name as group_name,
      grantor.first_name || ' ' || grantor.last_name as granted_by_name
    FROM matter_permissions mp
    LEFT JOIN users u ON mp.user_id = u.id
    LEFT JOIN groups g ON mp.group_id = g.id
    LEFT JOIN users grantor ON mp.granted_by = grantor.id
    WHERE mp.matter_id = $1
    ORDER BY mp.granted_at DESC
  `, [matter_id]);
  
  // Get assigned users
  const assignmentsResult = await query(`
    SELECT 
      ma.user_id,
      u.first_name || ' ' || u.last_name as user_name,
      u.email as user_email,
      u.role as user_role
    FROM matter_assignments ma
    JOIN users u ON ma.user_id = u.id
    WHERE ma.matter_id = $1
  `, [matter_id]);
  
  // Build human-readable response
  const permissions = permissionsResult.rows.map(p => ({
    permissionId: p.permission_id,
    type: p.user_id ? 'user' : 'group',
    name: p.user_name || p.group_name,
    email: p.user_email || null,
    role: p.user_role || null,
    permissionLevel: p.permission_level,
    canViewDocuments: p.can_view_documents,
    canViewNotes: p.can_view_notes,
    canEdit: p.can_edit,
    grantedBy: p.granted_by_name,
    grantedAt: p.granted_at
  }));
  
  const assignments = assignmentsResult.rows.map(a => ({
    name: a.user_name,
    email: a.user_email,
    role: a.user_role
  }));
  
  // Determine who can manage permissions
  const canManagePermissions = isAdmin || isResponsible;
  
  return {
    matter: {
      name: matter.name,
      number: matter.number,
      visibility: matter.visibility,
      visibilityDescription: matter.visibility === 'firm_wide' 
        ? 'Everyone in the firm can see this matter' 
        : 'Only selected users and groups can see this matter'
    },
    responsibleAttorney: matter.responsible_attorney_name 
      ? { name: matter.responsible_attorney_name, email: matter.responsible_attorney_email }
      : null,
    originatingAttorney: matter.originating_attorney_name
      ? { name: matter.originating_attorney_name, email: matter.originating_attorney_email }
      : null,
    assignedUsers: assignments,
    explicitPermissions: permissions,
    summary: {
      totalPermissions: permissions.length,
      totalAssigned: assignments.length,
      canManagePermissions
    },
    note: matter.visibility === 'firm_wide' 
      ? 'Since this matter is firm_wide, all firm members can see it regardless of explicit permissions.'
      : 'This matter is restricted. Only the people listed above (plus admins/owners/billing) can access it.'
  };
}

async function shareMatter(args, user) {
  const { matter_id, user_id, group_id, permission_level = 'view', can_view_documents = true, can_view_notes = true, can_edit } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required. Use search_matters to find the matter first.' };
  }
  
  if (!user_id && !group_id) {
    return { error: 'Either user_id or group_id is required. Use list_team_members to find users.' };
  }
  
  if (user_id && group_id) {
    return { error: 'Cannot specify both user_id and group_id. Share with one at a time.' };
  }
  
  // Get matter info
  const matterResult = await query(`
    SELECT id, name, number, visibility, responsible_attorney 
    FROM matters WHERE id = $1 AND firm_id = $2
  `, [matter_id, user.firmId]);
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Check if user can manage permissions
  const isAdmin = FULL_ACCESS_ROLES.includes(user.role);
  const isResponsible = matter.responsible_attorney === user.id;
  
  if (!isAdmin && !isResponsible) {
    return { error: 'You do not have permission to share this matter. Only admins, owners, billing users, or the responsible attorney can share matters.' };
  }
  
  // Verify the target user/group exists in the firm
  let targetName = '';
  if (user_id) {
    const userCheck = await query(
      'SELECT id, first_name, last_name, email FROM users WHERE id = $1 AND firm_id = $2 AND is_active = true',
      [user_id, user.firmId]
    );
    if (userCheck.rows.length === 0) {
      return { error: 'User not found or not active in your firm. Use list_team_members to find valid users.' };
    }
    targetName = `${userCheck.rows[0].first_name} ${userCheck.rows[0].last_name}`;
  }
  
  if (group_id) {
    const groupCheck = await query(
      'SELECT id, name FROM groups WHERE id = $1 AND firm_id = $2',
      [group_id, user.firmId]
    );
    if (groupCheck.rows.length === 0) {
      return { error: 'Group not found in your firm.' };
    }
    targetName = groupCheck.rows[0].name + ' (group)';
  }
  
  // Check current permission count (max 20)
  const countResult = await query(
    'SELECT COUNT(*) FROM matter_permissions WHERE matter_id = $1',
    [matter_id]
  );
  if (parseInt(countResult.rows[0].count) >= 20) {
    return { error: 'This matter has reached the maximum of 20 explicit permissions. Remove some permissions first.' };
  }
  
  // Determine can_edit based on permission level if not explicitly set
  const finalCanEdit = can_edit !== undefined ? can_edit : (permission_level === 'edit' || permission_level === 'admin');
  
  // Add permission (upsert)
  try {
    await query(`
      INSERT INTO matter_permissions (
        matter_id, user_id, group_id, permission_level, 
        can_view_documents, can_view_notes, can_edit, granted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (matter_id, user_id) WHERE user_id IS NOT NULL
      DO UPDATE SET 
        permission_level = $4,
        can_view_documents = $5,
        can_view_notes = $6,
        can_edit = $7,
        granted_by = $8,
        granted_at = NOW()
    `, [
      matter_id, 
      user_id || null, 
      group_id || null, 
      permission_level,
      can_view_documents,
      can_view_notes,
      finalCanEdit,
      user.id
    ]);
  } catch (dbError) {
    console.error('Error adding permission:', dbError);
    return { error: 'Failed to add permission. It may already exist for this group.' };
  }
  
  // If matter was firm_wide, change to restricted
  let visibilityChanged = false;
  if (matter.visibility === 'firm_wide') {
    await query(
      'UPDATE matters SET visibility = $1, updated_at = NOW() WHERE id = $2',
      ['restricted', matter_id]
    );
    visibilityChanged = true;
  }
  
  // Log the action
  await query(`
    INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
    VALUES ($1, $2, 'matter.permission_added', 'matter', $3, $4)
  `, [
    user.firmId,
    user.id,
    matter_id,
    JSON.stringify({ targetUserId: user_id, targetGroupId: group_id, permissionLevel: permission_level })
  ]);
  
  return {
    success: true,
    message: `Shared "${matter.name}" (${matter.number}) with ${targetName} at "${permission_level}" level.`,
    details: {
      matterName: matter.name,
      matterNumber: matter.number,
      sharedWith: targetName,
      permissionLevel: permission_level,
      canViewDocuments: can_view_documents,
      canViewNotes: can_view_notes,
      canEdit: finalCanEdit,
      visibilityChangedToRestricted: visibilityChanged
    },
    note: visibilityChanged 
      ? 'The matter visibility was automatically changed from "firm_wide" to "restricted" since you added explicit permissions.'
      : null
  };
}

async function removeMatterPermission(args, user) {
  const { matter_id, user_id, permission_id } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required. Use search_matters to find the matter first.' };
  }
  
  if (!user_id && !permission_id) {
    return { error: 'Either user_id or permission_id is required. Use get_matter_permissions to see current permissions.' };
  }
  
  // Get matter info
  const matterResult = await query(`
    SELECT id, name, number, responsible_attorney 
    FROM matters WHERE id = $1 AND firm_id = $2
  `, [matter_id, user.firmId]);
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Check if user can manage permissions
  const isAdmin = FULL_ACCESS_ROLES.includes(user.role);
  const isResponsible = matter.responsible_attorney === user.id;
  
  if (!isAdmin && !isResponsible) {
    return { error: 'You do not have permission to modify this matter\'s sharing settings. Only admins, owners, billing users, or the responsible attorney can do this.' };
  }
  
  let result;
  let removedName = '';
  
  if (permission_id) {
    // Get the permission info first
    const permInfo = await query(`
      SELECT mp.*, u.first_name, u.last_name, g.name as group_name
      FROM matter_permissions mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN groups g ON mp.group_id = g.id
      WHERE mp.id = $1 AND mp.matter_id = $2
    `, [permission_id, matter_id]);
    
    if (permInfo.rows.length === 0) {
      return { error: 'Permission not found for this matter.' };
    }
    
    removedName = permInfo.rows[0].first_name 
      ? `${permInfo.rows[0].first_name} ${permInfo.rows[0].last_name}`
      : permInfo.rows[0].group_name + ' (group)';
    
    result = await query(
      'DELETE FROM matter_permissions WHERE id = $1 AND matter_id = $2 RETURNING id',
      [permission_id, matter_id]
    );
  } else if (user_id) {
    // Get user name first
    const userInfo = await query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [user_id]
    );
    if (userInfo.rows.length > 0) {
      removedName = `${userInfo.rows[0].first_name} ${userInfo.rows[0].last_name}`;
    }
    
    result = await query(
      'DELETE FROM matter_permissions WHERE matter_id = $1 AND user_id = $2 RETURNING id',
      [matter_id, user_id]
    );
  }
  
  if (!result || result.rows.length === 0) {
    return { error: 'No permission found to remove. The user may not have explicit permission (they might have access through their role or assignments instead).' };
  }
  
  // Log the action
  await query(`
    INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
    VALUES ($1, $2, 'matter.permission_removed', 'matter', $3, $4)
  `, [
    user.firmId,
    user.id,
    matter_id,
    JSON.stringify({ removedUserId: user_id, removedPermissionId: permission_id })
  ]);
  
  return {
    success: true,
    message: `Removed ${removedName}'s access to "${matter.name}" (${matter.number}).`,
    note: 'If the user is an admin, owner, billing user, responsible attorney, or originating attorney, they will still have access regardless of explicit permissions.'
  };
}

async function updateMatterVisibility(args, user) {
  const { matter_id, visibility } = args;
  
  if (!matter_id) {
    return { error: 'matter_id is required. Use search_matters to find the matter first.' };
  }
  
  if (!visibility || !['firm_wide', 'restricted'].includes(visibility)) {
    return { error: 'visibility must be either "firm_wide" or "restricted".' };
  }
  
  // Get matter info
  const matterResult = await query(`
    SELECT id, name, number, visibility, responsible_attorney 
    FROM matters WHERE id = $1 AND firm_id = $2
  `, [matter_id, user.firmId]);
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Check if user can manage permissions
  const isAdmin = FULL_ACCESS_ROLES.includes(user.role);
  const isResponsible = matter.responsible_attorney === user.id;
  
  if (!isAdmin && !isResponsible) {
    return { error: 'You do not have permission to change this matter\'s visibility. Only admins, owners, billing users, or the responsible attorney can do this.' };
  }
  
  // Check if already at desired visibility
  if (matter.visibility === visibility) {
    return {
      success: true,
      message: `"${matter.name}" is already set to "${visibility}".`,
      noChange: true
    };
  }
  
  // Update visibility
  await query(
    'UPDATE matters SET visibility = $1, updated_at = NOW() WHERE id = $2',
    [visibility, matter_id]
  );
  
  // Log the action
  await query(`
    INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
    VALUES ($1, $2, 'matter.visibility_changed', 'matter', $3, $4)
  `, [
    user.firmId,
    user.id,
    matter_id,
    JSON.stringify({ from: matter.visibility, to: visibility })
  ]);
  
  const visibilityDescriptions = {
    firm_wide: 'Everyone in the firm can now see this matter.',
    restricted: 'Only users with explicit permissions, assignments, or special roles (admin/owner/billing/responsible attorney) can see this matter.'
  };
  
  return {
    success: true,
    message: `Changed "${matter.name}" (${matter.number}) visibility from "${matter.visibility}" to "${visibility}".`,
    details: {
      matterName: matter.name,
      matterNumber: matter.number,
      previousVisibility: matter.visibility,
      newVisibility: visibility,
      description: visibilityDescriptions[visibility]
    }
  };
}

// =============================================================================
// EMAIL INTEGRATION FUNCTIONS (OUTLOOK)
// =============================================================================

const MS_TENANT = process.env.MICROSOFT_TENANT || 'common';
const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;

async function getOutlookAccessToken(firmId) {
  const integration = await query(
    `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'outlook' AND is_connected = true`,
    [firmId]
  );
  
  if (integration.rows.length === 0) {
    return null;
  }
  
  let accessToken = integration.rows[0].access_token;
  const refreshToken = integration.rows[0].refresh_token;
  
  // Refresh if expired
  if (new Date(integration.rows[0].token_expires_at) < new Date()) {
    const refreshResponse = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
    
    const newTokens = await refreshResponse.json();
    if (newTokens.access_token) {
      accessToken = newTokens.access_token;
      await query(
        `UPDATE integrations SET access_token = $1, token_expires_at = NOW() + INTERVAL '1 hour' WHERE firm_id = $2 AND provider = 'outlook'`,
        [accessToken, firmId]
      );
    } else {
      return null;
    }
  }
  
  return accessToken;
}

async function getEmails(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  const limit = Math.min(args.limit || 20, 50);
  let url = `https://graph.microsoft.com/v1.0/me/messages?$top=${limit}&$orderby=receivedDateTime desc`;
  
  if (args.search) {
    url += `&$search="${args.search}"`;
  }
  if (args.unread_only) {
    url += `&$filter=isRead eq false`;
  }
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  const data = await response.json();
  
  if (data.error) {
    return { error: `Failed to fetch emails: ${data.error.message}` };
  }
  
  return {
    emails: (data.value || []).map(email => ({
      id: email.id,
      subject: email.subject,
      from: email.from?.emailAddress?.address,
      fromName: email.from?.emailAddress?.name,
      receivedAt: email.receivedDateTime,
      isRead: email.isRead,
      preview: email.bodyPreview?.substring(0, 200),
      hasAttachments: email.hasAttachments
    })),
    count: data.value?.length || 0
  };
}

async function getEmail(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${args.email_id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  const email = await response.json();
  
  if (email.error) {
    return { error: `Failed to fetch email: ${email.error.message}` };
  }
  
  return {
    id: email.id,
    subject: email.subject,
    from: email.from?.emailAddress?.address,
    fromName: email.from?.emailAddress?.name,
    to: email.toRecipients?.map(r => r.emailAddress?.address),
    cc: email.ccRecipients?.map(r => r.emailAddress?.address),
    receivedAt: email.receivedDateTime,
    body: email.body?.content,
    bodyType: email.body?.contentType,
    hasAttachments: email.hasAttachments,
    isRead: email.isRead
  };
}

async function sendEmail(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  const toRecipients = args.to.split(',').map(email => ({
    emailAddress: { address: email.trim() }
  }));
  
  const ccRecipients = args.cc ? args.cc.split(',').map(email => ({
    emailAddress: { address: email.trim() }
  })) : [];
  
  const message = {
    subject: args.subject,
    body: {
      contentType: args.body.includes('<') ? 'HTML' : 'Text',
      content: args.body
    },
    toRecipients,
    ccRecipients
  };
  
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, saveToSentItems: true })
  });
  
  if (!response.ok) {
    const error = await response.json();
    return { error: `Failed to send email: ${error.error?.message || 'Unknown error'}` };
  }
  
  // Log to matter if specified
  if (args.matter_id) {
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'email.sent', 'matter', $3, $4)
    `, [user.firmId, user.id, args.matter_id, JSON.stringify({ to: args.to, subject: args.subject })]);
  }
  
  return {
    success: true,
    message: `Email sent to ${args.to}`,
    subject: args.subject
  };
}

async function replyToEmail(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  const endpoint = args.reply_all 
    ? `https://graph.microsoft.com/v1.0/me/messages/${args.email_id}/replyAll`
    : `https://graph.microsoft.com/v1.0/me/messages/${args.email_id}/reply`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      comment: args.body
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    return { error: `Failed to send reply: ${error.error?.message || 'Unknown error'}` };
  }
  
  return {
    success: true,
    message: args.reply_all ? 'Reply sent to all recipients' : 'Reply sent'
  };
}

async function linkEmailToMatter(args, user) {
  // Verify matter exists
  const matterResult = await query(
    `SELECT id, name, client_id FROM matters WHERE id = $1 AND firm_id = $2`,
    [args.matter_id, user.firmId]
  );
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Fetch email details from Outlook
  const accessToken = await getOutlookAccessToken(user.firmId);
  let emailDetails = null;
  
  if (accessToken) {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${args.email_id}?$select=subject,from,toRecipients,receivedDateTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      emailDetails = await response.json();
    } catch (e) {
      console.error('Failed to fetch email details:', e);
    }
  }
  
  // Store the email-matter link in email_links table
  try {
    await query(`
      INSERT INTO email_links (firm_id, matter_id, client_id, email_id, email_provider, subject, from_address, to_addresses, received_at, linked_by)
      VALUES ($1, $2, $3, $4, 'outlook', $5, $6, $7, $8, $9)
      ON CONFLICT (email_id) WHERE email_id = $4 DO NOTHING
    `, [
      user.firmId,
      args.matter_id,
      matter.client_id,
      args.email_id,
      emailDetails?.subject || 'Unknown Subject',
      emailDetails?.from?.emailAddress?.address || null,
      emailDetails?.toRecipients?.map(r => r.emailAddress?.address) || [],
      emailDetails?.receivedDateTime || null,
      user.id
    ]);
  } catch (e) {
    // Fallback to audit log if email_links table doesn't exist
    await query(`
      INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, 'email.linked', 'matter', $3, $4)
    `, [user.firmId, user.id, args.matter_id, JSON.stringify({ 
      email_id: args.email_id,
      subject: emailDetails?.subject
    })]);
  }
  
  return {
    success: true,
    message: `Email linked to matter "${matter.name}" successfully`,
    data: {
      matter: matter.name,
      subject: emailDetails?.subject || 'Unknown'
    }
  };
}

async function linkEmailToClient(args, user) {
  // Verify client exists
  const clientResult = await query(
    `SELECT id, display_name FROM clients WHERE id = $1 AND firm_id = $2`,
    [args.client_id, user.firmId]
  );
  
  if (clientResult.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const client = clientResult.rows[0];
  
  // Fetch email details from Outlook
  const accessToken = await getOutlookAccessToken(user.firmId);
  let emailDetails = null;
  
  if (accessToken) {
    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${args.email_id}?$select=subject,from,toRecipients,receivedDateTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      emailDetails = await response.json();
    } catch (e) {
      console.error('Failed to fetch email details:', e);
    }
  }
  
  // Store the email-client link
  try {
    await query(`
      INSERT INTO email_links (firm_id, client_id, email_id, email_provider, subject, from_address, to_addresses, received_at, linked_by)
      VALUES ($1, $2, $3, 'outlook', $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `, [
      user.firmId,
      args.client_id,
      args.email_id,
      emailDetails?.subject || 'Unknown Subject',
      emailDetails?.from?.emailAddress?.address || null,
      emailDetails?.toRecipients?.map(r => r.emailAddress?.address) || [],
      emailDetails?.receivedDateTime || null,
      user.id
    ]);
  } catch (e) {
    console.error('Error linking email to client:', e);
  }
  
  return {
    success: true,
    message: `Email linked to client "${client.display_name}" successfully`,
    data: {
      client: client.display_name,
      subject: emailDetails?.subject || 'Unknown'
    }
  };
}

async function getClientCommunications(args, user) {
  const { client_id } = args;
  
  if (!client_id) {
    return { error: 'client_id is required' };
  }
  
  // Get client name
  const clientResult = await query(
    `SELECT display_name FROM clients WHERE id = $1 AND firm_id = $2`,
    [client_id, user.firmId]
  );
  
  if (clientResult.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  // Get linked emails
  const result = await query(
    `SELECT el.*, u.first_name || ' ' || u.last_name as linked_by_name
     FROM email_links el
     LEFT JOIN users u ON el.linked_by = u.id
     WHERE el.firm_id = $1 AND el.client_id = $2
     ORDER BY el.received_at DESC NULLS LAST
     LIMIT 50`,
    [user.firmId, client_id]
  );
  
  return {
    client: clientResult.rows[0].display_name,
    communications: result.rows.map(e => ({
      emailId: e.email_id,
      subject: e.subject,
      from: e.from_address,
      receivedAt: e.received_at,
      linkedBy: e.linked_by_name,
      notes: e.notes
    })),
    count: result.rows.length
  };
}

async function configureAutoEmailLinking(args, user) {
  const { enabled } = args;
  
  // Update the Outlook integration settings
  const result = await query(
    `UPDATE integrations 
     SET settings = jsonb_set(COALESCE(settings, '{}'), '{autoLinkEmails}', $1)
     WHERE firm_id = $2 AND provider = 'outlook'
     RETURNING is_connected`,
    [JSON.stringify(enabled), user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { 
      error: 'Outlook integration not found. Please connect Outlook first in Settings > Integrations.' 
    };
  }
  
  return {
    success: true,
    message: enabled 
      ? 'Auto-email linking is now ENABLED. Emails from your clients will be automatically linked to their profiles.'
      : 'Auto-email linking is now DISABLED. You can still manually link emails to clients.',
    autoLinkEmails: enabled
  };
}

async function checkEmailIntegration(args, user) {
  const integration = await query(
    `SELECT is_connected, account_email, account_name, last_sync_at FROM integrations WHERE firm_id = $1 AND provider = 'outlook'`,
    [user.firmId]
  );
  
  if (integration.rows.length === 0 || !integration.rows[0].is_connected) {
    return {
      connected: false,
      message: 'Outlook is not connected. Go to Settings > Integrations to connect your Outlook account.'
    };
  }
  
  const row = integration.rows[0];
  return {
    connected: true,
    account: row.account_email || row.account_name,
    lastSync: row.last_sync_at
  };
}

// =============================================================================
// QUICKBOOKS INTEGRATION FUNCTIONS
// =============================================================================

const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;
const QB_ENVIRONMENT = process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox';

async function getQuickBooksAccessToken(firmId) {
  const integration = await query(
    `SELECT * FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks' AND is_connected = true`,
    [firmId]
  );
  
  if (integration.rows.length === 0) {
    return null;
  }
  
  const { access_token, refresh_token, settings } = integration.rows[0];
  const realmId = settings?.realmId;
  
  if (!realmId) return null;
  
  // Always refresh QuickBooks tokens (they expire quickly)
  const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');
  const refreshResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`,
    },
    body: new URLSearchParams({
      refresh_token: refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  
  const newTokens = await refreshResponse.json();
  if (newTokens.access_token) {
    await query(
      `UPDATE integrations SET access_token = $1, refresh_token = $2, token_expires_at = NOW() + INTERVAL '1 hour' WHERE firm_id = $3 AND provider = 'quickbooks'`,
      [newTokens.access_token, newTokens.refresh_token || refresh_token, firmId]
    );
    return { accessToken: newTokens.access_token, realmId };
  }
  
  return { accessToken: access_token, realmId };
}

function getQBBaseUrl() {
  return QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

async function getQuickBooksStatus(args, user) {
  const integration = await query(
    `SELECT is_connected, account_name, last_sync_at, settings FROM integrations WHERE firm_id = $1 AND provider = 'quickbooks'`,
    [user.firmId]
  );
  
  if (integration.rows.length === 0 || !integration.rows[0].is_connected) {
    return {
      connected: false,
      message: 'QuickBooks is not connected. Go to Settings > Integrations to connect your QuickBooks account.'
    };
  }
  
  const row = integration.rows[0];
  return {
    connected: true,
    companyName: row.account_name,
    lastSync: row.last_sync_at,
    environment: QB_ENVIRONMENT
  };
}

async function getQuickBooksInvoices(args, user) {
  const tokens = await getQuickBooksAccessToken(user.firmId);
  if (!tokens) {
    return { error: 'QuickBooks not connected. Please connect in Settings > Integrations.' };
  }
  
  const limit = args.limit || 20;
  let queryStr = `SELECT * FROM Invoice ORDER BY TxnDate DESC MAXRESULTS ${limit}`;
  
  const response = await fetch(
    `${getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(queryStr)}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    }
  );
  
  const data = await response.json();
  
  if (data.Fault) {
    return { error: `QuickBooks error: ${data.Fault.Error?.[0]?.Message || 'Unknown error'}` };
  }
  
  const invoices = data.QueryResponse?.Invoice || [];
  return {
    invoices: invoices.map(inv => ({
      id: inv.Id,
      number: inv.DocNumber,
      customerName: inv.CustomerRef?.name,
      date: inv.TxnDate,
      dueDate: inv.DueDate,
      total: parseFloat(inv.TotalAmt),
      balance: parseFloat(inv.Balance),
      status: inv.Balance === 0 ? 'paid' : (new Date(inv.DueDate) < new Date() ? 'overdue' : 'unpaid')
    })),
    count: invoices.length
  };
}

async function getQuickBooksCustomers(args, user) {
  const tokens = await getQuickBooksAccessToken(user.firmId);
  if (!tokens) {
    return { error: 'QuickBooks not connected. Please connect in Settings > Integrations.' };
  }
  
  const limit = args.limit || 20;
  let queryStr = args.search 
    ? `SELECT * FROM Customer WHERE DisplayName LIKE '%${args.search}%' MAXRESULTS ${limit}`
    : `SELECT * FROM Customer MAXRESULTS ${limit}`;
  
  const response = await fetch(
    `${getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(queryStr)}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    }
  );
  
  const data = await response.json();
  
  if (data.Fault) {
    return { error: `QuickBooks error: ${data.Fault.Error?.[0]?.Message || 'Unknown error'}` };
  }
  
  const customers = data.QueryResponse?.Customer || [];
  return {
    customers: customers.map(c => ({
      id: c.Id,
      name: c.DisplayName,
      email: c.PrimaryEmailAddr?.Address,
      phone: c.PrimaryPhone?.FreeFormNumber,
      balance: parseFloat(c.Balance || 0)
    })),
    count: customers.length
  };
}

async function createQuickBooksInvoice(args, user) {
  const tokens = await getQuickBooksAccessToken(user.firmId);
  if (!tokens) {
    return { error: 'QuickBooks not connected. Please connect in Settings > Integrations.' };
  }
  
  // Get the Apex invoice with line items
  const invoiceResult = await query(
    `SELECT i.*, c.display_name as client_name, c.email as client_email
     FROM invoices i
     LEFT JOIN clients c ON i.client_id = c.id
     WHERE i.id = $1 AND i.firm_id = $2`,
    [args.apex_invoice_id, user.firmId]
  );
  
  if (invoiceResult.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  const invoice = invoiceResult.rows[0];
  
  // Check if already synced to QuickBooks
  if (invoice.external_id && invoice.external_source === 'quickbooks') {
    return { 
      success: false, 
      message: `Invoice ${invoice.number} has already been synced to QuickBooks (QB ID: ${invoice.external_id})` 
    };
  }
  
  // Get invoice line items
  const lineItemsResult = await query(
    `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id`,
    [args.apex_invoice_id]
  );
  
  // Try to find or create a customer in QuickBooks
  // First, search for existing customer by name
  const customerSearchResponse = await fetch(
    `${getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${invoice.client_name.replace(/'/g, "\\'")}'`)}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    }
  );
  
  const customerSearchData = await customerSearchResponse.json();
  let customerId;
  
  if (customerSearchData.QueryResponse?.Customer?.length > 0) {
    customerId = customerSearchData.QueryResponse.Customer[0].Id;
  } else {
    // Create new customer in QuickBooks
    const createCustomerResponse = await fetch(
      `${getQBBaseUrl()}/v3/company/${tokens.realmId}/customer`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          DisplayName: invoice.client_name,
          PrimaryEmailAddr: invoice.client_email ? { Address: invoice.client_email } : undefined,
        }),
      }
    );
    
    const createCustomerData = await createCustomerResponse.json();
    
    if (createCustomerData.Fault) {
      return { error: `Failed to create customer in QuickBooks: ${createCustomerData.Fault.Error?.[0]?.Message || 'Unknown error'}` };
    }
    
    customerId = createCustomerData.Customer?.Id;
  }
  
  if (!customerId) {
    return { error: 'Failed to find or create customer in QuickBooks' };
  }
  
  // Build QuickBooks invoice line items
  const qbLineItems = lineItemsResult.rows.map((item, index) => ({
    Id: String(index + 1),
    LineNum: index + 1,
    Amount: parseFloat(item.amount),
    DetailType: 'SalesItemLineDetail',
    SalesItemLineDetail: {
      ItemRef: {
        name: 'Services',
        value: '1',  // Default item - in a real setup, you'd map to actual QB items
      },
      Qty: parseFloat(item.quantity) || 1,
      UnitPrice: parseFloat(item.rate) || parseFloat(item.amount),
    },
    Description: item.description || 'Legal Services',
  }));
  
  // If no line items, create one from the invoice total
  if (qbLineItems.length === 0) {
    qbLineItems.push({
      Id: '1',
      LineNum: 1,
      Amount: parseFloat(invoice.total),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: {
          name: 'Services',
          value: '1',
        },
        Qty: 1,
        UnitPrice: parseFloat(invoice.total),
      },
      Description: `Legal Services - Invoice ${invoice.number}`,
    });
  }
  
  // Create invoice in QuickBooks
  const qbInvoice = {
    CustomerRef: {
      value: customerId,
    },
    DocNumber: invoice.number,
    TxnDate: invoice.issue_date || new Date().toISOString().split('T')[0],
    DueDate: invoice.due_date,
    Line: qbLineItems,
    CustomerMemo: {
      value: invoice.notes || `Invoice from Apex Legal`,
    },
  };
  
  const createInvoiceResponse = await fetch(
    `${getQBBaseUrl()}/v3/company/${tokens.realmId}/invoice`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(qbInvoice),
    }
  );
  
  const createInvoiceData = await createInvoiceResponse.json();
  
  if (createInvoiceData.Fault) {
    return { error: `Failed to create invoice in QuickBooks: ${createInvoiceData.Fault.Error?.[0]?.Message || 'Unknown error'}` };
  }
  
  const qbInvoiceId = createInvoiceData.Invoice?.Id;
  
  // Update Apex invoice with QuickBooks ID
  if (qbInvoiceId) {
    await query(
      `UPDATE invoices SET external_id = $1, external_source = 'quickbooks' WHERE id = $2`,
      [qbInvoiceId, args.apex_invoice_id]
    );
  }
  
  return {
    success: true,
    message: `Invoice ${invoice.number} successfully created in QuickBooks for ${invoice.client_name}`,
    data: {
      apexInvoiceId: args.apex_invoice_id,
      quickbooksInvoiceId: qbInvoiceId,
      customerName: invoice.client_name,
      total: parseFloat(invoice.total),
      lineItems: qbLineItems.length
    }
  };
}

async function syncQuickBooks(args, user) {
  const tokens = await getQuickBooksAccessToken(user.firmId);
  if (!tokens) {
    return { error: 'QuickBooks not connected. Please connect in Settings > Integrations.' };
  }
  
  let syncResults = {
    invoicesChecked: 0,
    paymentsUpdated: 0,
    customersImported: 0,
    errors: []
  };
  
  try {
    // 1. Check for payments on synced invoices
    const syncedInvoices = await query(
      `SELECT id, external_id, number, amount_due FROM invoices 
       WHERE firm_id = $1 AND external_source = 'quickbooks' AND external_id IS NOT NULL AND amount_due > 0`,
      [user.firmId]
    );
    
    for (const invoice of syncedInvoices.rows) {
      try {
        // Get invoice from QuickBooks
        const response = await fetch(
          `${getQBBaseUrl()}/v3/company/${tokens.realmId}/invoice/${invoice.external_id}`,
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              Accept: 'application/json',
            },
          }
        );
        
        const data = await response.json();
        
        if (data.Invoice) {
          const qbBalance = parseFloat(data.Invoice.Balance || 0);
          const apexAmountDue = parseFloat(invoice.amount_due || 0);
          
          // If QuickBooks shows less balance, record the payment
          if (qbBalance < apexAmountDue) {
            const paymentAmount = apexAmountDue - qbBalance;
            
            // Update invoice in Apex
            await query(
              `UPDATE invoices SET 
                 amount_due = $1, 
                 amount_paid = amount_paid + $2,
                 status = CASE WHEN $1 = 0 THEN 'paid' ELSE status END
               WHERE id = $3`,
              [qbBalance, paymentAmount, invoice.id]
            );
            
            syncResults.paymentsUpdated++;
          }
        }
        
        syncResults.invoicesChecked++;
      } catch (err) {
        syncResults.errors.push(`Error syncing invoice ${invoice.number}: ${err.message}`);
      }
    }
    
    // 2. Import new customers from QuickBooks that don't exist in Apex
    const customersResponse = await fetch(
      `${getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer WHERE Active = true MAXRESULTS 100')}`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: 'application/json',
        },
      }
    );
    
    const customersData = await customersResponse.json();
    const qbCustomers = customersData.QueryResponse?.Customer || [];
    
    for (const qbCustomer of qbCustomers) {
      // Check if customer exists in Apex
      const existing = await query(
        `SELECT id FROM clients WHERE firm_id = $1 AND (display_name = $2 OR email = $3)`,
        [user.firmId, qbCustomer.DisplayName, qbCustomer.PrimaryEmailAddr?.Address || '']
      );
      
      if (existing.rows.length === 0 && qbCustomer.DisplayName) {
        // Import customer
        await query(
          `INSERT INTO clients (firm_id, display_name, email, phone, type, external_id, external_source, is_active)
           VALUES ($1, $2, $3, $4, 'company', $5, 'quickbooks', true)`,
          [
            user.firmId,
            qbCustomer.DisplayName,
            qbCustomer.PrimaryEmailAddr?.Address || null,
            qbCustomer.PrimaryPhone?.FreeFormNumber || null,
            qbCustomer.Id
          ]
        );
        syncResults.customersImported++;
      }
    }
    
  } catch (err) {
    syncResults.errors.push(`General sync error: ${err.message}`);
  }
  
  // Update last sync time
  await query(
    `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'quickbooks'`,
    [user.firmId]
  );
  
  return {
    success: true,
    message: `QuickBooks sync completed`,
    data: syncResults
  };
}

async function getQuickBooksBalance(args, user) {
  const tokens = await getQuickBooksAccessToken(user.firmId);
  if (!tokens) {
    return { error: 'QuickBooks not connected. Please connect in Settings > Integrations.' };
  }
  
  // Get account balances
  const response = await fetch(
    `${getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Bank'")}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: 'application/json',
      },
    }
  );
  
  const data = await response.json();
  
  if (data.Fault) {
    return { error: `QuickBooks error: ${data.Fault.Error?.[0]?.Message || 'Unknown error'}` };
  }
  
  const accounts = data.QueryResponse?.Account || [];
  return {
    accounts: accounts.map(a => ({
      name: a.Name,
      type: a.AccountType,
      balance: parseFloat(a.CurrentBalance || 0)
    })),
    totalBalance: accounts.reduce((sum, a) => sum + parseFloat(a.CurrentBalance || 0), 0)
  };
}

// =============================================================================
// INTEGRATION STATUS
// =============================================================================

async function getIntegrationsStatus(args, user) {
  const result = await query(
    `SELECT provider, is_connected, account_email, account_name, last_sync_at, settings FROM integrations WHERE firm_id = $1`,
    [user.firmId]
  );
  
  // All supported integrations with their sync capabilities
  const integrations = {
    outlook: { connected: false, name: 'Microsoft Outlook', description: 'Email and Calendar', syncWith: ['calendar'] },
    onedrive: { connected: false, name: 'OneDrive', description: 'Cloud file storage (Word, Excel, PowerPoint)', syncWith: ['documents'] },
    google: { connected: false, name: 'Google Calendar', description: 'Calendar sync', syncWith: ['calendar'] },
    googledrive: { connected: false, name: 'Google Drive', description: 'Cloud file storage (Google Docs, Sheets)', syncWith: ['documents'] },
    quickbooks: { connected: false, name: 'QuickBooks', description: 'Accounting and invoicing', syncWith: ['billing'] },
    dropbox: { connected: false, name: 'Dropbox', description: 'Cloud file storage', syncWith: ['documents'] },
    docusign: { connected: false, name: 'DocuSign', description: 'E-signatures', syncWith: ['documents'] },
    slack: { connected: false, name: 'Slack', description: 'Team messaging', syncWith: [] },
    zoom: { connected: false, name: 'Zoom', description: 'Video meetings', syncWith: ['calendar'] },
    quicken: { connected: false, name: 'Quicken', description: 'Personal finance', syncWith: ['billing'] }
  };
  
  result.rows.forEach(row => {
    if (integrations[row.provider]) {
      integrations[row.provider].connected = row.is_connected;
      integrations[row.provider].account = row.account_email || row.account_name;
      integrations[row.provider].lastSync = row.last_sync_at;
      // Include sync settings
      const settings = row.settings || {};
      integrations[row.provider].syncSettings = {
        syncCalendar: settings.syncCalendar !== false,
        syncDocuments: settings.syncDocuments !== false,
        syncBilling: settings.syncBilling !== false
      };
    }
  });
  
  // Create a summary
  const connectedList = Object.entries(integrations)
    .filter(([_, v]) => v.connected)
    .map(([k, v]) => v.name);
  
  const notConnectedList = Object.entries(integrations)
    .filter(([_, v]) => !v.connected)
    .map(([k, v]) => v.name);

  // What's synced where
  const syncedData = {
    calendar: result.rows.filter(r => r.is_connected && ['outlook', 'google', 'zoom'].includes(r.provider) && (r.settings?.syncCalendar !== false)).map(r => integrations[r.provider]?.name).filter(Boolean),
    documents: result.rows.filter(r => r.is_connected && ['onedrive', 'googledrive', 'dropbox', 'docusign'].includes(r.provider) && (r.settings?.syncDocuments !== false)).map(r => integrations[r.provider]?.name).filter(Boolean),
    billing: result.rows.filter(r => r.is_connected && ['quickbooks', 'quicken'].includes(r.provider) && (r.settings?.syncBilling !== false)).map(r => integrations[r.provider]?.name).filter(Boolean)
  };
  
  return {
    integrations,
    summary: {
      connectedCount: connectedList.length,
      connected: connectedList,
      notConnected: notConnectedList,
      syncedData
    }
  };
}

// =============================================================================
// MATTER EMAILS
// =============================================================================

async function getMatterEmails(args, user) {
  // Try to get from email_links table first
  try {
    const result = await query(
      `SELECT el.*, m.name as matter_name, u.first_name || ' ' || u.last_name as linked_by_name
       FROM email_links el
       LEFT JOIN matters m ON el.matter_id = m.id
       LEFT JOIN users u ON el.linked_by = u.id
       WHERE el.matter_id = $1 AND el.firm_id = $2
       ORDER BY el.received_at DESC NULLS LAST, el.linked_at DESC
       LIMIT 50`,
      [args.matter_id, user.firmId]
    );
    
    return {
      emails: result.rows.map(e => ({
        id: e.email_id,
        subject: e.subject,
        from: e.from_address,
        receivedAt: e.received_at,
        linkedAt: e.linked_at,
        linkedBy: e.linked_by_name
      })),
      count: result.rows.length
    };
  } catch (e) {
    // Fallback to audit logs if email_links table doesn't exist
    const result = await query(
      `SELECT * FROM audit_logs 
       WHERE resource_type = 'matter' AND resource_id = $1 AND action = 'email.linked' AND firm_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [args.matter_id, user.firmId]
    );
    
    return {
      emails: result.rows.map(e => {
        const details = e.details || {};
        return {
          id: details.email_id,
          subject: details.subject || 'Unknown',
          linkedAt: e.created_at
        };
      }),
      count: result.rows.length
    };
  }
}

// =============================================================================
// OUTLOOK CALENDAR SYNC
// =============================================================================

async function createOutlookEvent(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  // Calculate end time (default 1 hour after start)
  const startTime = new Date(args.start_time);
  const endTime = args.end_time ? new Date(args.end_time) : new Date(startTime.getTime() + 60 * 60 * 1000);
  
  const event = {
    subject: args.title,
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'America/New_York'
    },
    location: args.location ? { displayName: args.location } : undefined,
    body: args.description ? {
      contentType: 'Text',
      content: args.description
    } : undefined
  };
  
  const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });
  
  if (!response.ok) {
    const error = await response.json();
    return { error: `Failed to create Outlook event: ${error.error?.message || 'Unknown error'}` };
  }
  
  const createdEvent = await response.json();
  
  // Also create event in Apex calendar if matter_id provided
  if (args.matter_id) {
    await query(
      `INSERT INTO calendar_events (firm_id, title, start_time, end_time, location, description, type, matter_id, external_id, external_source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'meeting', $7, $8, 'outlook', $9)`,
      [user.firmId, args.title, startTime, endTime, args.location, args.description, args.matter_id, createdEvent.id, user.id]
    );
  }
  
  return {
    success: true,
    message: `Event "${args.title}" created in Outlook calendar`,
    data: {
      outlookEventId: createdEvent.id,
      start: startTime.toISOString(),
      end: endTime.toISOString()
    }
  };
}

async function syncOutlookCalendar(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  // Fetch calendar events from Outlook
  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const eventsResponse = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${oneMonthAgo.toISOString()}&endDateTime=${oneMonthAhead.toISOString()}&$top=100`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  const eventsData = await eventsResponse.json();
  
  if (eventsData.error) {
    return { error: `Failed to fetch Outlook events: ${eventsData.error.message}` };
  }
  
  let syncedCount = 0;
  let skippedCount = 0;
  
  for (const event of eventsData.value || []) {
    // Check if event already exists in Apex
    const existingEvent = await query(
      `SELECT id FROM calendar_events WHERE firm_id = $1 AND external_id = $2`,
      [user.firmId, event.id]
    );
    
    if (existingEvent.rows.length === 0) {
      await query(
        `INSERT INTO calendar_events (firm_id, title, description, start_time, end_time, location, type, external_id, external_source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'meeting', $7, 'outlook', $8)`,
        [
          user.firmId,
          event.subject || 'Untitled Event',
          event.bodyPreview || null,
          event.start?.dateTime,
          event.end?.dateTime,
          event.location?.displayName || null,
          event.id,
          user.id,
        ]
      );
      syncedCount++;
    } else {
      skippedCount++;
    }
  }
  
  // Update last sync time
  await query(
    `UPDATE integrations SET last_sync_at = NOW() WHERE firm_id = $1 AND provider = 'outlook'`,
    [user.firmId]
  );
  
  return {
    success: true,
    message: `Outlook calendar sync completed`,
    data: {
      eventsImported: syncedCount,
      eventsSkipped: skippedCount,
      totalEventsChecked: eventsData.value?.length || 0
    }
  };
}

// =============================================================================
// ADDITIONAL EMAIL FUNCTIONS
// =============================================================================
async function searchEmails(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  const { query, from, subject, limit = 10 } = args;
  
  let searchQuery = '';
  if (query) searchQuery = query;
  if (from) searchQuery = `from:${from}`;
  if (subject) searchQuery = `subject:${subject}`;
  
  const url = `https://graph.microsoft.com/v1.0/me/messages?$search="${encodeURIComponent(searchQuery)}"&$top=${Math.min(limit, 25)}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  const data = await response.json();
  
  if (data.error) {
    return { error: `Failed to search emails: ${data.error.message}` };
  }
  
  return {
    success: true,
    emails: (data.value || []).map(email => ({
      id: email.id,
      subject: email.subject,
      from: email.from?.emailAddress?.name || email.from?.emailAddress?.address,
      fromEmail: email.from?.emailAddress?.address,
      receivedAt: email.receivedDateTime,
      preview: email.bodyPreview?.substring(0, 200)
    })),
    count: data.value?.length || 0
  };
}

async function draftEmail(args, user) {
  const accessToken = await getOutlookAccessToken(user.firmId);
  if (!accessToken) {
    return { error: 'Outlook not connected. Please connect your Outlook account in Settings > Integrations.' };
  }
  
  const { to, subject, body, cc, importance = 'normal' } = args;
  
  const emailPayload = {
    subject,
    body: {
      contentType: 'HTML',
      content: body.replace(/\n/g, '<br>')
    },
    toRecipients: to.split(',').map(email => ({
      emailAddress: { address: email.trim() }
    })),
    importance
  };
  
  if (cc) {
    emailPayload.ccRecipients = cc.split(',').map(email => ({
      emailAddress: { address: email.trim() }
    }));
  }
  
  const response = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(emailPayload)
  });
  
  const result = await response.json();
  
  if (result.error) {
    return { error: `Failed to create draft: ${result.error.message}` };
  }
  
  return {
    success: true,
    message: `Draft email created: "${subject}" to ${to}`,
    draftId: result.id
  };
}

// =============================================================================
// CLOUD STORAGE FUNCTIONS
// =============================================================================
async function getCloudStorageToken(firmId, provider) {
  const result = await query(
    `SELECT access_token, refresh_token, token_expires_at 
     FROM integrations WHERE firm_id = $1 AND provider = $2 AND is_connected = true`,
    [firmId, provider]
  );
  
  if (result.rows.length === 0) return null;
  return result.rows[0].access_token;
}

async function listCloudFiles(args, user) {
  const { provider, folder_path = '', limit = 20 } = args;
  
  const accessToken = await getCloudStorageToken(user.firmId, provider);
  if (!accessToken) {
    return { error: `${provider} not connected. Please connect in Settings > Integrations.` };
  }
  
  let url, response, data;
  
  switch (provider) {
    case 'onedrive':
      url = folder_path 
        ? `https://graph.microsoft.com/v1.0/me/drive/root:/${folder_path}:/children?$top=${limit}`
        : `https://graph.microsoft.com/v1.0/me/drive/root/children?$top=${limit}`;
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      data = await response.json();
      if (data.error) return { error: data.error.message };
      return {
        success: true,
        files: (data.value || []).map(f => ({
          id: f.id, name: f.name, size: f.size, folder: !!f.folder, 
          modified: f.lastModifiedDateTime, webUrl: f.webUrl
        }))
      };
      
    case 'googledrive':
      url = `https://www.googleapis.com/drive/v3/files?pageSize=${limit}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)`;
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      data = await response.json();
      if (data.error) return { error: data.error.message };
      return {
        success: true,
        files: (data.files || []).map(f => ({
          id: f.id, name: f.name, size: f.size, 
          folder: f.mimeType === 'application/vnd.google-apps.folder',
          modified: f.modifiedTime, webUrl: f.webViewLink
        }))
      };
      
    case 'dropbox':
      response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folder_path || '', limit })
      });
      data = await response.json();
      if (data.error) return { error: data.error_summary || data.error };
      return {
        success: true,
        files: (data.entries || []).map(f => ({
          id: f.id, name: f.name, size: f.size,
          folder: f['.tag'] === 'folder', modified: f.server_modified
        }))
      };
      
    default:
      return { error: 'Invalid provider' };
  }
}

async function searchCloudFiles(args, user) {
  const { provider, query: searchQuery } = args;
  
  const accessToken = await getCloudStorageToken(user.firmId, provider);
  if (!accessToken) {
    return { error: `${provider} not connected. Please connect in Settings > Integrations.` };
  }
  
  let url, response, data;
  
  switch (provider) {
    case 'onedrive':
      url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(searchQuery)}')?$top=20`;
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      data = await response.json();
      if (data.error) return { error: data.error.message };
      return {
        success: true,
        files: (data.value || []).map(f => ({
          id: f.id, name: f.name, size: f.size, webUrl: f.webUrl
        }))
      };
      
    case 'googledrive':
      url = `https://www.googleapis.com/drive/v3/files?q=name contains '${searchQuery}'&fields=files(id,name,mimeType,webViewLink)`;
      response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      data = await response.json();
      if (data.error) return { error: data.error.message };
      return {
        success: true,
        files: (data.files || []).map(f => ({ id: f.id, name: f.name, webUrl: f.webViewLink }))
      };
      
    case 'dropbox':
      response = await fetch('https://api.dropboxapi.com/2/files/search_v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      data = await response.json();
      if (data.error) return { error: data.error_summary || data.error };
      return {
        success: true,
        files: (data.matches || []).map(m => ({
          id: m.metadata?.metadata?.id, name: m.metadata?.metadata?.name
        }))
      };
      
    default:
      return { error: 'Invalid provider' };
  }
}

async function getCloudFileInfo(args, user) {
  const { provider, file_id } = args;
  
  const accessToken = await getCloudStorageToken(user.firmId, provider);
  if (!accessToken) {
    return { error: `${provider} not connected. Please connect in Settings > Integrations.` };
  }
  
  let response, data;
  
  switch (provider) {
    case 'onedrive':
      response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      data = await response.json();
      if (data.error) return { error: data.error.message };
      return {
        success: true,
        file: { id: data.id, name: data.name, size: data.size, modified: data.lastModifiedDateTime, webUrl: data.webUrl }
      };
      
    case 'googledrive':
      response = await fetch(`https://www.googleapis.com/drive/v3/files/${file_id}?fields=id,name,size,modifiedTime,webViewLink`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      data = await response.json();
      if (data.error) return { error: data.error.message };
      return {
        success: true,
        file: { id: data.id, name: data.name, size: data.size, modified: data.modifiedTime, webUrl: data.webViewLink }
      };
      
    default:
      return { error: 'Invalid provider or operation not supported' };
  }
}

// =============================================================================
// DOCUSIGN FUNCTIONS
// =============================================================================
async function getDocuSignToken(firmId) {
  const result = await query(
    `SELECT access_token, settings FROM integrations WHERE firm_id = $1 AND provider = 'docusign' AND is_connected = true`,
    [firmId]
  );
  if (result.rows.length === 0) return null;
  return { token: result.rows[0].access_token, settings: result.rows[0].settings };
}

async function getDocuSignStatus(args, user) {
  const auth = await getDocuSignToken(user.firmId);
  if (!auth) {
    return { connected: false, message: 'DocuSign not connected. Please connect in Settings > Integrations.' };
  }
  
  return {
    connected: true,
    accountId: auth.settings?.account_id,
    environment: auth.settings?.environment || 'demo'
  };
}

async function getDocuSignEnvelopes(args, user) {
  const auth = await getDocuSignToken(user.firmId);
  if (!auth) {
    return { error: 'DocuSign not connected. Please connect in Settings > Integrations.' };
  }
  
  const { status, days = 30, limit = 20 } = args;
  const env = auth.settings?.environment || 'demo';
  const apiBase = env === 'production' ? 'https://na1.docusign.net' : 'https://demo.docusign.net';
  const accountId = auth.settings?.account_id;
  
  let url = `${apiBase}/restapi/v2.1/accounts/${accountId}/envelopes?from_date=${new Date(Date.now() - days*24*60*60*1000).toISOString()}&count=${limit}`;
  if (status) url += `&status=${status}`;
  
  const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  const data = await response.json();
  
  if (data.errorCode) {
    return { error: data.message || data.errorCode };
  }
  
  return {
    success: true,
    envelopes: (data.envelopes || []).map(e => ({
      id: e.envelopeId,
      subject: e.emailSubject,
      status: e.status,
      sentDateTime: e.sentDateTime,
      completedDateTime: e.completedDateTime
    })),
    count: data.envelopes?.length || 0
  };
}

async function sendForSignature(args, user) {
  const auth = await getDocuSignToken(user.firmId);
  if (!auth) {
    return { error: 'DocuSign not connected. Please connect in Settings > Integrations.' };
  }
  
  const { document_id, signer_email, signer_name, email_subject, email_body } = args;
  
  // Get document from Apex
  const docResult = await query(
    `SELECT * FROM documents WHERE id = $1 AND firm_id = $2`,
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  
  // For now, return a placeholder - full implementation would upload to DocuSign
  return {
    success: true,
    message: `Document "${doc.name}" queued for signature request to ${signer_name} (${signer_email})`,
    note: 'Full DocuSign envelope creation requires document upload. Please use DocuSign directly for now.',
    document: { id: doc.id, name: doc.name },
    signer: { name: signer_name, email: signer_email }
  };
}

// =============================================================================
// SLACK FUNCTIONS
// =============================================================================
async function getSlackToken(firmId) {
  const result = await query(
    `SELECT access_token, settings, account_name FROM integrations WHERE firm_id = $1 AND provider = 'slack' AND is_connected = true`,
    [firmId]
  );
  if (result.rows.length === 0) return null;
  return { token: result.rows[0].access_token, settings: result.rows[0].settings, workspace: result.rows[0].account_name };
}

async function getSlackStatus(args, user) {
  const auth = await getSlackToken(user.firmId);
  if (!auth) {
    return { connected: false, message: 'Slack not connected. Please connect in Settings > Integrations.' };
  }
  
  return {
    connected: true,
    workspace: auth.workspace,
    teamId: auth.settings?.team_id
  };
}

async function getSlackChannels(args, user) {
  const auth = await getSlackToken(user.firmId);
  if (!auth) {
    return { error: 'Slack not connected. Please connect in Settings > Integrations.' };
  }
  
  const { limit = 20 } = args;
  
  const response = await fetch(`https://slack.com/api/conversations.list?limit=${limit}&types=public_channel,private_channel`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  
  const data = await response.json();
  
  if (!data.ok) {
    return { error: data.error || 'Failed to fetch channels' };
  }
  
  return {
    success: true,
    channels: (data.channels || []).map(c => ({
      id: c.id,
      name: c.name,
      isPrivate: c.is_private,
      memberCount: c.num_members
    }))
  };
}

async function sendSlackMessage(args, user) {
  const auth = await getSlackToken(user.firmId);
  if (!auth) {
    return { error: 'Slack not connected. Please connect in Settings > Integrations.' };
  }
  
  const { channel, message } = args;
  
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel: channel.startsWith('#') ? channel.substring(1) : channel,
      text: message
    })
  });
  
  const data = await response.json();
  
  if (!data.ok) {
    return { error: data.error || 'Failed to send message' };
  }
  
  return {
    success: true,
    message: `Message sent to #${channel}`,
    timestamp: data.ts
  };
}

// =============================================================================
// ZOOM FUNCTIONS
// =============================================================================
async function getZoomToken(firmId) {
  const result = await query(
    `SELECT access_token, account_email, account_name FROM integrations WHERE firm_id = $1 AND provider = 'zoom' AND is_connected = true`,
    [firmId]
  );
  if (result.rows.length === 0) return null;
  return { token: result.rows[0].access_token, email: result.rows[0].account_email, name: result.rows[0].account_name };
}

async function getZoomStatus(args, user) {
  const auth = await getZoomToken(user.firmId);
  if (!auth) {
    return { connected: false, message: 'Zoom not connected. Please connect in Settings > Integrations.' };
  }
  
  return {
    connected: true,
    account: auth.name || auth.email
  };
}

async function getZoomMeetings(args, user) {
  const auth = await getZoomToken(user.firmId);
  if (!auth) {
    return { error: 'Zoom not connected. Please connect in Settings > Integrations.' };
  }
  
  const { type = 'upcoming', limit = 20 } = args;
  
  const response = await fetch(`https://api.zoom.us/v2/users/me/meetings?type=${type}&page_size=${limit}`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  });
  
  const data = await response.json();
  
  if (data.code) {
    return { error: data.message || 'Failed to fetch meetings' };
  }
  
  return {
    success: true,
    meetings: (data.meetings || []).map(m => ({
      id: m.id,
      topic: m.topic,
      startTime: m.start_time,
      duration: m.duration,
      joinUrl: m.join_url
    }))
  };
}

async function createZoomMeeting(args, user) {
  const auth = await getZoomToken(user.firmId);
  if (!auth) {
    return { error: 'Zoom not connected. Please connect in Settings > Integrations.' };
  }
  
  const { topic, start_time, duration = 60, agenda, matter_id } = args;
  
  const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      topic,
      type: 2, // Scheduled meeting
      start_time,
      duration,
      agenda,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        waiting_room: false
      }
    })
  });
  
  const data = await response.json();
  
  if (data.code) {
    return { error: data.message || 'Failed to create meeting' };
  }
  
  // Also create a calendar event in Apex if matter_id provided
  if (matter_id) {
    const endTime = new Date(new Date(start_time).getTime() + duration * 60000).toISOString();
    await query(
      `INSERT INTO calendar_events (firm_id, title, description, start_time, end_time, location, type, external_id, external_source, created_by, matter_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'meeting', $7, 'zoom', $8, $9)`,
      [user.firmId, topic, agenda || '', start_time, endTime, data.join_url, String(data.id), user.id, matter_id]
    );
  }
  
  return {
    success: true,
    message: `Zoom meeting created: "${topic}"`,
    meeting: {
      id: data.id,
      topic: data.topic,
      startTime: data.start_time,
      duration: data.duration,
      joinUrl: data.join_url,
      password: data.password
    }
  };
}

// =============================================================================
// QUICKEN FUNCTIONS
// =============================================================================
async function getQuickenToken(firmId) {
  const result = await query(
    `SELECT access_token, account_email, account_name, last_sync_at FROM integrations WHERE firm_id = $1 AND provider = 'quicken' AND is_connected = true`,
    [firmId]
  );
  if (result.rows.length === 0) return null;
  return { 
    token: result.rows[0].access_token, 
    email: result.rows[0].account_email, 
    name: result.rows[0].account_name,
    lastSync: result.rows[0].last_sync_at
  };
}

async function getQuickenStatus(args, user) {
  const auth = await getQuickenToken(user.firmId);
  if (!auth) {
    return { connected: false, message: 'Quicken not connected. Please connect in Settings > Integrations.' };
  }
  
  return {
    connected: true,
    account: auth.name || auth.email,
    lastSync: auth.lastSync
  };
}

async function getQuickenSummary(args, user) {
  const auth = await getQuickenToken(user.firmId);
  if (!auth) {
    return { error: 'Quicken not connected. Please connect in Settings > Integrations.' };
  }
  
  // Note: Quicken Simplifi API access is limited. This returns placeholder data.
  // In production, you'd integrate with Quicken's actual API endpoints.
  return {
    success: true,
    message: 'Quicken is connected. Financial data can be viewed in your Quicken account.',
    account: auth.name || auth.email,
    lastSync: auth.lastSync,
    note: 'For detailed financial data, please open your Quicken dashboard. Full API access requires Quicken Simplifi subscription.'
  };
}

async function getQuickenTransactions(args, user) {
  const auth = await getQuickenToken(user.firmId);
  if (!auth) {
    return { error: 'Quicken not connected. Please connect in Settings > Integrations.' };
  }
  
  // Placeholder - Quicken API integration would go here
  return {
    success: true,
    message: 'Quicken transaction access connected.',
    account: auth.name || auth.email,
    note: 'Transaction data is available in your connected Quicken account. Full programmatic access requires Quicken API subscription.'
  };
}

async function getQuickenAccounts(args, user) {
  const auth = await getQuickenToken(user.firmId);
  if (!auth) {
    return { error: 'Quicken not connected. Please connect in Settings > Integrations.' };
  }
  
  // Placeholder - Quicken API integration would go here
  return {
    success: true,
    message: 'Quicken accounts connected.',
    account: auth.name || auth.email,
    note: 'Account data is available in your connected Quicken account.'
  };
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================
function getSystemPrompt() {
  // Use timezone-aware date calculations to ensure "today" and "tomorrow"
  // are correct for US Eastern time, regardless of server timezone
  const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
  const tomorrowStr = getTomorrowInTimezone(DEFAULT_TIMEZONE);
  const currentTimeParts = getCurrentTimePartsInTimezone(DEFAULT_TIMEZONE);
  const currentTimeFormatted = `${String(currentTimeParts.hours).padStart(2, '0')}:${String(currentTimeParts.minutes).padStart(2, '0')}`;
  
  return `You are an intelligent AI assistant for Apex Legal, a law firm management platform. You can both answer questions AND take actions on behalf of the user.

## Your Capabilities
You have access to tools for:

### Data Management
- **Time Entries**: Log time, view/edit/delete entries
- **Matters**: Create, view, update, search, close, archive, reopen matters
- **Clients**: Create, view, update, search, archive, reactivate clients
- **Invoices**: Create, view, send invoices, record payments
- **Tasks**: Create, view, update, complete tasks assigned to matters/clients/users
- **Calendar**: Create, view, update, delete events and meetings
- **Documents**: View document info, read document content, search within documents
- **Expenses**: Create and view expenses
- **Team**: View team members
- **Reports**: Generate billing, productivity, time, and client reports
- **Analytics**: View firm stats (admin only) and personal stats

### Matter Permissions & Sharing
- **get_matter_permissions**: See who has access to a matter
- **share_matter**: Share a matter with a user or group
- **remove_matter_permission**: Remove someone's access to a matter
- **update_matter_visibility**: Change a matter between "firm_wide" and "restricted"

### Email Integration (Outlook)
- **get_emails**: Read recent emails from the user's connected Outlook inbox
- **search_emails**: Search for emails by sender, subject, or content
- **get_email**: Get full content of a specific email (use this to read/summarize an email)
- **draft_email**: Create a draft email and save it in Outlook drafts (NOT sent)
- **send_email**: Send an email immediately from the user's Outlook account
- **reply_to_email**: Reply to an email (can save as draft or send immediately)
- **link_email_to_matter**: Link an email to a matter for record keeping
- **link_email_to_client**: Link an email to a client for record keeping
- **get_matter_emails**: Get all emails linked to a specific matter
- **get_client_communications**: Get all emails linked to a specific client
- **configure_auto_email_linking**: Enable/disable automatic email linking to clients based on email address

### Outlook Calendar Sync
- **create_outlook_event**: Create an event in Outlook calendar from Apex
- **sync_outlook_calendar**: Sync calendar events from Outlook to Apex

### QuickBooks Integration
- **get_quickbooks_status**: Check if QuickBooks is connected
- **get_quickbooks_invoices**: Get invoices from QuickBooks
- **get_quickbooks_customers**: Get customers from QuickBooks
- **create_quickbooks_invoice**: Push an Apex invoice to QuickBooks
- **sync_quickbooks**: Trigger a sync with QuickBooks
- **get_quickbooks_balance**: Get account balances

### Integration Status
- **get_integrations_status**: Check status of all integrations and what data is synced

## DATA SYNCHRONIZATION - IMPORTANT
Integrations sync data directly into the site's pages:
- **QuickBooks/Quicken → Billing**: When connected, invoices sync to the Billing page. Use list_invoices with source='quickbooks' to see synced invoices.
- **Google/Outlook Calendar → Calendar**: Events sync to the Calendar page. Check calendar_events for synced events.
- **OneDrive/Google Drive/Dropbox → Documents**: Files sync to the Documents page. Use list_documents with source='onedrive', 'googledrive', or 'dropbox' to see synced files.
- **DocuSign → Documents**: Signed documents appear in the Documents page.

When a user asks about their "invoices", "documents", or "calendar", this INCLUDES synced data from their integrations. You can filter by source if they only want data from a specific integration.

### Document Reading & Search - IMPORTANT
When a user asks about a document by name (e.g. "what's in the buddha boy document?"):
1. FIRST use **list_documents** with the search parameter to find the document and get its ID
2. THEN use **read_document_content** with that document_id to read the full text
3. Answer the user's question based on the document content

Tools:
- **list_documents**: Search for documents by name. Returns document IDs needed for reading.
- **read_document_content**: Read the full text content of a document using its ID.
- **search_document_content**: Search for specific text/keywords across all documents.
- **get_matter_documents_content**: Get all documents for a matter with content previews.

### Cloud Storage (OneDrive, Google Drive, Dropbox)
- **list_cloud_files**: List files from connected cloud storage
- **search_cloud_files**: Search for files in cloud storage
- **get_cloud_file_info**: Get details about a specific file

### DocuSign (E-Signatures)
- **get_docusign_status**: Check DocuSign connection status
- **get_docusign_envelopes**: Get documents sent for signature
- **send_for_signature**: Send a document for electronic signature

### Slack Integration
- **get_slack_status**: Check Slack connection status
- **get_slack_channels**: List available Slack channels
- **send_slack_message**: Send a message to a Slack channel

### Zoom Integration
- **get_zoom_status**: Check Zoom connection status
- **get_zoom_meetings**: Get upcoming Zoom meetings
- **create_zoom_meeting**: Create a new Zoom meeting

### Quicken Integration
- **get_quicken_status**: Check Quicken connection status
- **get_quicken_summary**: Get financial summary from Quicken
- **get_quicken_transactions**: Get recent transactions
- **get_quicken_accounts**: Get account balances

### Matter Lifecycle Management
- **close_matter**: Close a matter (optionally with resolution like 'Settled', 'Won', 'Lost', 'Dismissed')
- **archive_matter**: Archive a closed matter to remove from active lists
- **reopen_matter**: Reopen a closed or archived matter

### Client Management
- **archive_client**: Archive a client to remove from active lists (history preserved)
- **reactivate_client**: Reactivate an archived client

### Task Management
- **create_task**: Create tasks/to-dos linked to matters, clients, or users
- **list_tasks**: Get tasks with filters (status, matter, assignee, due date)
- **complete_task**: Mark a task as complete
- **update_task**: Update task details, priority, assignee, etc.

### Reports & Analytics
- **generate_report**: Generate various reports:
  - billing_summary: Total billed, collected, and outstanding amounts
  - time_by_matter: Hours logged per matter
  - time_by_user: Hours logged per team member
  - outstanding_invoices: All unpaid invoices with aging
  - matter_status: Overview of matters by status
  - productivity: Overall firm productivity metrics
  - client_summary: Client billing and matter overview

### Navigation (Opening Pages & Records)
- **navigate_to_page**: Open pages like matters, clients, calendar, billing, time tracking, etc.
- **open_matter**: Open a specific matter (search first to get the ID)
- **open_client**: Open a specific client (search first to get the ID)
- **open_invoice**: Open a specific invoice
- **open_new_time_entry**: Open the time entry form
- **open_new_calendar_event**: Open the calendar event form

## Guidelines
1. When asked to OPEN, SHOW, GO TO, or PULL UP something:
   - For pages (e.g., "show me my calendar"): use navigate_to_page
   - For specific records (e.g., "open the Smith case"): search first to find the ID, then use open_matter/open_client/etc.
2. When asked to DO something (create, log, add): use the appropriate action tool
3. When asked a QUESTION: fetch data first, then answer naturally
4. For time logging, ALWAYS search for the matter first if you don't have the ID
5. Confirm actions with specific details (names, amounts, dates)
6. Be concise and professional
7. Never expose UUIDs - use names and numbers instead
8. If you're unsure which matter/client the user means, ask for clarification

## Calendar Events - IMPORTANT
When creating calendar events, use create_calendar_event. For start_time, you MUST provide an ISO 8601 datetime string.
- Today is: ${todayStr} (current time: ${currentTimeFormatted} Eastern)
- Tomorrow is: ${tomorrowStr}
- For "tomorrow at 2pm", use: "${tomorrowStr}T14:00:00"
- For "today at 3pm", use: "${todayStr}T15:00:00"
- All times should be specified in Eastern time format (e.g., T14:00:00 for 2pm)

## Matter Permissions System - HOW IT WORKS
Apex Legal uses a Clio-like visibility system for matters:

### Visibility Types
- **firm_wide** (default): Everyone in the firm can see the matter
- **restricted**: Only selected users and groups can access the matter

### Who Always Has Access (regardless of visibility setting)
1. **Owner, Admin, and Billing roles**: Can see ALL matters in the firm - no restrictions apply to them
2. **Responsible Attorney**: The attorney assigned as responsible for the matter always has full access
3. **Originating Attorney**: The attorney who originated the matter always has access (for credit tracking)
4. **Assigned Users**: Users explicitly assigned to work on the matter (in matter_assignments)
5. **Users with Permissions**: Users granted explicit permission (in matter_permissions)
6. **Group Members**: Users in groups that have been granted permission to the matter

### Permission Levels (for restricted matters)
- **view**: Can see the matter and its basic information
- **edit**: Can see and modify the matter
- **admin**: Can see, modify, and manage permissions for the matter

### Additional Permission Controls
- **can_view_documents**: Whether the user can view documents attached to the matter
- **can_view_notes**: Whether the user can view notes on the matter
- **can_edit**: Whether the user can edit the matter details

### Who Can Manage Permissions
Only the following can change visibility or share a matter:
- Owner, Admin, or Billing role users
- The Responsible Attorney of the matter

### How to Share a Matter
1. If matter is "firm_wide", first change visibility to "restricted" (use update_matter_visibility)
2. Add users or groups with share_matter tool
3. Specify the permission level (view, edit, or admin)

### Common Scenarios
- "Share the Smith case with Sarah": Search for the matter, search for Sarah's user, then use share_matter
- "Who can see the Johnson matter?": Use get_matter_permissions to see who has access
- "Remove John from the case": Use remove_matter_permission
- "Make a matter private/restricted": Use update_matter_visibility with visibility="restricted"
- "Make a matter visible to everyone": Use update_matter_visibility with visibility="firm_wide"

## Current User
- Role: {{USER_ROLE}}
- Firm data is isolated - you can only access this firm's data
- Non-admins can only access matters they're assigned to

## AI Attorney Vision
As an AI assistant, you can perform virtually ANY action that a human attorney or paralegal could do in this system:

### Case/Matter Lifecycle
- Open new matters for clients
- Close matters with resolution (Settled, Won, Lost, Dismissed)
- Archive completed matters
- Reopen matters if needed
- Update matter details, status, priority

### Client Management
- Create and update client records
- Archive inactive clients
- Reactivate clients when needed
- Link communications to clients

### Billing & Financial
- Create and send invoices
- Record payments received
- Generate billing reports
- View outstanding balances
- Access QuickBooks data when integrated

### Time Management
- Log time entries to matters
- Edit time entries
- View time by matter, user, or date range
- Generate time reports

### Task Management
- Create tasks linked to matters/clients
- Assign tasks to team members
- Set priorities and due dates
- Mark tasks complete

### Calendar & Scheduling
- Create meetings and events
- Sync with Outlook/Google Calendar
- View upcoming appointments

### Documents
- View documents from local storage and cloud integrations
- Access synced files from OneDrive, Google Drive, Dropbox

### Communications
- Read and search emails (when Outlook connected)
- Draft and send emails
- Link emails to matters and clients
- Auto-link incoming emails to clients

### Reporting & Analytics
- Generate billing summaries
- Time tracking reports by matter/user
- Outstanding invoice aging
- Matter status overviews
- Productivity metrics
- Client revenue summaries

### Team Collaboration
- View team members
- Share matters with team members
- Manage matter permissions

## Background Agent Mode - IMPORTANT

When the user asks for a COMPLEX task that requires multiple steps (5+ actions), you MUST use \`start_background_task\` to run it in the background. This shows a progress bar to the user while you work.

### ALWAYS use start_background_task when user says:
- "run a background agent" or "start background task"
- "review this case/matter"
- "prepare for trial"
- "analyze all documents"
- "audit" or "review" anything
- "generate a report" (complex reports)
- "research" anything
- Any task that will take more than 3-4 tool calls

### How to start a background task:
1. First, think about what steps are needed
2. Call \`start_background_task\` with:
   - goal: What you're trying to accomplish
   - plan: Array of steps you'll take (e.g., ["Search for matter", "Get documents", "Analyze content", "Create summary"])
   - estimated_steps: How many actions you estimate

Example:
\`\`\`
start_background_task({
  goal: "Review the Smith case and prepare a summary",
  plan: ["Find the Smith matter", "Get all documents", "Get time entries", "Get billing info", "Create comprehensive summary"],
  estimated_steps: 10
})
\`\`\`

The user will see a progress bar while you work in the background!

## Quick Tasks (Foreground Mode)

For SIMPLE tasks (1-3 actions), just do them directly:
- Log time entry
- Create a single event
- Search for a matter
- Get client info
- Create a task

### When to Use These Tools:
- **start_background_task**: Complex multi-step tasks (5+ steps), reviews, audits, research, reports
- **think_and_plan**: Quick planning for simpler multi-step work (2-4 steps)
- **evaluate_progress**: During background tasks to check if on track
- **request_human_input**: Uncertain decisions, need approval, missing information
- **task_complete**: When goal is achieved or you've done all you can
- **log_work**: To track significant actions or findings

### Important Guidelines:
- Use start_background_task for anything complex - users love seeing the progress bar!
- For quick tasks, just execute directly without background mode
- If user explicitly asks for "background" anything, ALWAYS use start_background_task
- Don't be afraid to take multiple actions in sequence
- If you hit a blocker, ask for human input rather than guessing

Always act professionally, confirm important actions, and provide clear summaries of what was done.`;
}

// =============================================================================
// MAIN CHAT ENDPOINT
// =============================================================================
// =============================================================================
// BACKGROUND TASK STATUS ENDPOINTS
// =============================================================================

// Get all active/recent tasks for the user (agent history)
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, goal, status, plan, progress, iterations, max_iterations, 
              created_at, started_at, completed_at, result, error, rating,
              EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration_seconds
       FROM ai_tasks 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );
    
    // Format the tasks with duration
    const tasks = result.rows.map(task => ({
      ...task,
      duration: task.duration_seconds ? formatDuration(task.duration_seconds) : null,
      durationSeconds: task.duration_seconds ? Math.round(task.duration_seconds) : null,
      rating: task.rating || null
    }));
    
    res.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Helper to format duration
function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// Rate a task (1-5 stars)
router.post('/tasks/:taskId/rate', authenticate, async (req, res) => {
  try {
    const { rating } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    const result = await query(
      `UPDATE ai_tasks SET rating = $1, updated_at = NOW() 
       WHERE id = $2 AND user_id = $3 
       RETURNING id, rating`,
      [rating, req.params.taskId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ success: true, rating: result.rows[0].rating });
  } catch (error) {
    console.error('Error rating task:', error);
    res.status(500).json({ error: 'Failed to rate task' });
  }
});

// Get specific task status
router.get('/tasks/:taskId', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, goal, status, plan, progress, iterations, max_iterations,
              created_at, started_at, completed_at, result, error
       FROM ai_tasks 
       WHERE id = $1 AND user_id = $2`,
      [req.params.taskId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = result.rows[0];
    
    // Calculate progress percentage
    let progressPercent = 0;
    if (task.status === 'completed') {
      progressPercent = 100;
    } else if (task.status === 'running') {
      const planSteps = task.plan?.length || 10;
      const completedSteps = task.progress?.length || 0;
      progressPercent = Math.min(Math.round((completedSteps / planSteps) * 100), 95);
    }
    
    res.json({ 
      task: {
        ...task,
        progressPercent
      }
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Get active tasks (for the progress bar)
router.get('/tasks/active/current', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, goal, status, plan, progress, iterations, max_iterations, created_at
       FROM ai_tasks 
       WHERE user_id = $1 AND status = 'running'
       ORDER BY created_at DESC 
       LIMIT 1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.json({ active: false });
    }
    
    const task = result.rows[0];
    const planSteps = task.plan?.length || 10;
    const completedSteps = task.progress?.length || 0;
    const progressPercent = Math.min(Math.round((completedSteps / planSteps) * 100), 95);
    
    res.json({ 
      active: true,
      task: {
        id: task.id,
        goal: task.goal,
        status: task.status,
        progressPercent,
        iterations: task.iterations,
        currentStep: task.progress?.[task.progress.length - 1]?.tool || 'Working...'
      }
    });
  } catch (error) {
    console.error('Error fetching active task:', error);
    res.status(500).json({ error: 'Failed to fetch active task' });
  }
});

// =============================================================================
// MAIN CHAT ENDPOINT
// =============================================================================
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { message, conversationHistory = [], fileContext, forceBackground } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    let systemPrompt = getSystemPrompt()
      .replace('{{USER_ROLE}}', req.user.role)
      .replace('{{USER_NAME}}', `${req.user.firstName} ${req.user.lastName}`);
    
    // If forceBackground is enabled, add instruction to use background task
    if (forceBackground) {
      systemPrompt += `

## IMPORTANT: BACKGROUND AGENT MODE IS ENABLED
The user has enabled Background Agent mode. You MUST use the \`start_background_task\` tool for this request.
Do NOT respond directly - instead, call start_background_task with:
- goal: A clear description of what you'll accomplish
- plan: An array of steps you'll take
- estimated_steps: Number of actions needed

This will show a progress bar to the user while you work in the background.
ALWAYS use start_background_task when this mode is enabled, even for simple tasks.`;
    }

    // If there's an uploaded document, add it to the context
    let userMessage = message;
    if (fileContext?.uploadedDocument) {
      const doc = fileContext.uploadedDocument;
      const docContent = doc.content && doc.content.trim().length > 0 
        ? doc.content 
        : '[No text content was extracted from this file. It may be an image or scanned PDF.]';
      
      const docInfo = `
=== UPLOADED DOCUMENT ===
Filename: ${doc.name}
Type: ${doc.type}
Size: ${doc.size} bytes

--- DOCUMENT CONTENT START ---
${docContent}
--- DOCUMENT CONTENT END ---

User's Question/Request: ${message}
=========================

Please analyze the document above and respond to the user's question.`;
      userMessage = docInfo;
      console.log(`[AI Agent] Document uploaded: ${doc.name}, content length: ${(doc.content || '').length} chars`);
      
      // Store the uploaded doc info in the request for potential saving
      req.uploadedDocument = {
        name: doc.name,
        type: doc.type,
        size: doc.size,
        content: doc.content
      };
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userMessage }
    ];

    let response = await callAzureOpenAIWithTools(messages, TOOLS);
    
    let iterations = 0;
    const maxIterations = 25;  // Increased for complex autonomous tasks
    let navigationResult = null; // Track navigation commands
    let taskCompleted = false;  // Track if AI declared task complete
    let needsHumanInput = null; // Track if AI needs human input
    let backgroundTaskStarted = null; // Track if background task was started
    
    while (response.tool_calls && iterations < maxIterations && !taskCompleted) {
      iterations++;
      console.log(`Processing ${response.tool_calls.length} tool calls (iteration ${iterations})`);
      
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.tool_calls
      });
      
      for (const toolCall of response.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.error('Failed to parse tool arguments:', toolCall.function.arguments);
          functionArgs = {};
        }
        
        console.log(`Calling tool: ${functionName} with args:`, JSON.stringify(functionArgs));
        const result = await executeTool(functionName, functionArgs, req.user, req);
        console.log(`Tool ${functionName} result:`, JSON.stringify(result));
        
        // Capture navigation results
        if (result.navigation) {
          navigationResult = result.navigation;
          console.log('Navigation result captured:', navigationResult);
        }
        
        // Check for autonomous agent signals
        if (result._task_complete) {
          taskCompleted = true;
          console.log('Task marked as complete by AI');
        }
        
        if (result._background_task_started) {
          backgroundTaskStarted = {
            taskId: result.task_id,
            goal: result.goal,
            plan: result.plan
          };
          console.log('Background task started:', result.task_id);
        }
        
        if (result._needs_human_input) {
          needsHumanInput = result;
          console.log('AI requesting human input:', result.question);
        }
        
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
      
      response = await callAzureOpenAIWithTools(messages, TOOLS);
    }

    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, details)
       VALUES ($1, $2, 'ai.agent_chat', 'ai', $3)`,
      [req.user.firmId, req.user.id, JSON.stringify({ messageLength: message.length, toolCalls: iterations, hasNavigation: !!navigationResult })]
    ).catch(() => {});

    // Build response with optional navigation and autonomous work info
    const responsePayload = {
      response: response.content,
      toolsUsed: iterations > 0 && !backgroundTaskStarted,
      iterations: iterations,
      taskCompleted: taskCompleted,
      backgroundTaskStarted: !!backgroundTaskStarted
    };
    
    // Include background task info
    if (backgroundTaskStarted) {
      responsePayload.backgroundTask = {
        taskId: backgroundTaskStarted.taskId,
        goal: backgroundTaskStarted.goal,
        plan: backgroundTaskStarted.plan
      };
    }
    
    // Include human input request if AI needs guidance
    if (needsHumanInput) {
      responsePayload.needsHumanInput = {
        question: needsHumanInput.question,
        context: needsHumanInput.context,
        options: needsHumanInput.options,
        urgency: needsHumanInput.urgency,
        aiRecommendation: needsHumanInput.ai_recommendation
      };
    }
    
    // Include navigation if any navigation tool was called
    if (navigationResult) {
      responsePayload.navigation = navigationResult;
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('AI Agent chat error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

async function callAzureOpenAIWithTools(messages, tools) {
  const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_API_KEY,
    },
    body: JSON.stringify({
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Azure OpenAI error:', error);
    throw new Error(`Azure OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const choice = data.choices[0];
  
  return {
    content: choice.message.content,
    tool_calls: choice.message.tool_calls
  };
}

export default router;
