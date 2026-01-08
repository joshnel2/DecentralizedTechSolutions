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
import { extractTextFromFile } from './documents.js';
import { uploadFile, downloadFile, deleteFile, isAzureConfigured } from '../utils/azureStorage.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// Azure OpenAI configuration (works with Azure AI Foundry deployed models)
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
const API_VERSION = '2024-12-01-preview'; // Latest API version for newer models

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
      description: "Get matters the user can access. Default to status='active' unless user asks for closed matters.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "pending", "closed", "on_hold"], description: "Filter by status. Default to 'active'." },
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
  {
    type: "function",
    function: {
      name: "delete_matter",
      description: "Permanently delete a matter. WARNING: This cannot be undone. Only works on matters with no time entries, invoices, or documents. Use close_matter or archive_matter for most cases.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" }
        },
        required: ["matter_id", "confirm"]
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
  {
    type: "function",
    function: {
      name: "delete_client",
      description: "Permanently delete a client. WARNING: This cannot be undone. Only works on clients with no matters, invoices, or documents. Use archive_client for most cases.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" }
        },
        required: ["client_id", "confirm"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_client_note",
      description: "Add a note to a client record. Use this for general client notes, preferences, or important information not tied to a specific matter.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          content: { type: "string", description: "The note content" },
          note_type: { type: "string", enum: ["general", "preference", "important", "contact", "billing"], description: "Type of note (default: general)" }
        },
        required: ["client_id", "content"]
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
  {
    type: "function",
    function: {
      name: "void_invoice",
      description: "Void/cancel an invoice. Use this when an invoice was created in error or needs to be cancelled. Cannot void paid invoices.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "UUID of the invoice to void" },
          reason: { type: "string", description: "Reason for voiding the invoice" }
        },
        required: ["invoice_id", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_invoice",
      description: "Permanently delete a draft invoice. Only works on invoices with status 'draft'. Use void_invoice for sent invoices.",
      parameters: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "UUID of the invoice to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" }
        },
        required: ["invoice_id", "confirm"]
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
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Permanently delete a task.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID of the task to delete" }
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
      description: "Get a list of documents including files synced from integrations (OneDrive, Google Drive, Dropbox).",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Filter by matter" },
          client_id: { type: "string", description: "Filter by client" },
          search: { type: "string", description: "Search by name" },
          source: { type: "string", description: "Filter by source: 'local', 'onedrive', 'googledrive', 'dropbox'" },
          limit: { type: "integer" }
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
      description: "Read the text content of a document by ID. Use this to see what's actually inside a document (contracts, pleadings, letters, etc.). Works best with PDFs, Word docs, and text files.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document" },
          max_length: { type: "number", description: "Max characters to return (default 10000, max 50000)" }
        },
        required: ["document_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_and_read_document",
      description: "Find a document by name and read its content. Use this when user asks about a document by name. Searches flexibly - you can use partial names, keywords, or descriptions. Examples: 'contract', 'Smith', 'engagement', 'letter'. The search is case-insensitive and matches partial names.",
      parameters: {
        type: "object",
        properties: {
          document_name: { type: "string", description: "Search term - can be partial name, keyword, or any part of the document name (e.g., 'Smith', 'contract', 'engagement'). Keep it simple - one or two words work best." },
          matter_id: { type: "string", description: "Optional: limit search to specific matter" },
          max_length: { type: "number", description: "Max characters to return (default 10000)" }
        },
        required: ["document_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_image",
      description: "Analyze an image file to describe its contents. Use for photos, evidence images, property damage, accident scenes, etc. Can identify objects, text, people, scenes, and provide detailed descriptions.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the image document" },
          question: { type: "string", description: "Optional specific question about the image (e.g., 'What damage is visible?' or 'Describe the scene')" }
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
  {
    type: "function",
    function: {
      name: "create_document",
      description: "Create a new professional PDF document. IMPORTANT: You MUST include matter_id to save the document to a matter - without it, the document won't appear in the matter's Documents section. Always find the matter first with search_matters, then include the matter_id here.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Document name without extension (e.g. 'Client Engagement Letter', 'Settlement Agreement')" },
          content: { type: "string", description: "The full text content of the document. Use markdown-style formatting: # for headers, ## for subheaders, - for bullets, **bold** for emphasis. Write COMPLETE professional content." },
          matter_id: { type: "string", description: "Matter UUID - ALWAYS INCLUDE THIS when creating a document for a matter. Find it first with search_matters if needed." },
          client_id: { type: "string", description: "Client UUID (only if not attaching to a matter)" },
          tags: { type: "array", items: { type: "string" }, description: "Optional: tags for the document" }
        },
        required: ["name", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_email_for_matter",
      description: "Draft a professional email related to a matter and optionally save it to Outlook drafts. Use this when asked to draft an email to a client, opposing counsel, or other party about a case. Can also link the email to the matter for record keeping.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter this email relates to" },
          to: { type: "string", description: "Recipient email address(es), comma-separated. Leave empty to just generate draft content." },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content - write a complete professional email" },
          email_type: { 
            type: "string", 
            enum: ["client_update", "demand_letter", "settlement_proposal", "scheduling", "follow_up", "case_status", "document_request", "general"],
            description: "Type of email to help with formatting"
          },
          cc: { type: "string", description: "CC recipients, comma-separated (optional)" },
          save_to_outlook: { type: "boolean", description: "Whether to save as a draft in Outlook (default: true if email connected)" },
          link_to_matter: { type: "boolean", description: "Whether to link this email to the matter for record keeping (default: true)" }
        },
        required: ["matter_id", "subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a note/memo attached to a matter or client. Use for meeting notes, case notes, research notes, etc.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note content (can be markdown)" },
          matter_id: { type: "string", description: "Matter to attach the note to" },
          client_id: { type: "string", description: "Client to attach the note to" },
          note_type: { type: "string", enum: ["general", "meeting", "research", "case_note", "memo"], description: "Type of note" }
        },
        required: ["title", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_document",
      description: "Create an edited version of an existing document. This CLONES the original document and applies your changes to the new copy, preserving the original. The new document will be named 'Original Name (AI)' to indicate it was AI-edited.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "ID of the document to create an edited version of" },
          new_content: { type: "string", description: "The new/updated content for the edited version" },
          new_name: { type: "string", description: "Optional: Custom name for the new document. If not provided, will use 'Original Name (AI)'" }
        },
        required: ["document_id", "new_content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_document",
      description: "Permanently delete a document. WARNING: This cannot be undone.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document to delete" },
          confirm: { type: "boolean", description: "Must be true to confirm deletion" }
        },
        required: ["document_id", "confirm"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_document",
      description: "Move a document to a different matter or client.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document to move" },
          new_matter_id: { type: "string", description: "UUID of the new matter (use null to remove from matter)" },
          new_client_id: { type: "string", description: "UUID of the new client (use null to remove from client)" }
        },
        required: ["document_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "rename_document",
      description: "Rename a document.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document to rename" },
          new_name: { type: "string", description: "New name for the document" }
        },
        required: ["document_id", "new_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "share_document",
      description: "Share a document with a specific user, granting them access to view or edit it.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document to share" },
          user_id: { type: "string", description: "UUID of the user to share with. Use list_team_members to find users." },
          permission_level: { type: "string", enum: ["view", "edit"], description: "Level of access: 'view' (read only) or 'edit' (can modify). Defaults to 'view'." }
        },
        required: ["document_id", "user_id"]
      }
    }
  },
  
  // ===================== VERSION HISTORY =====================
  {
    type: "function",
    function: {
      name: "get_document_versions",
      description: "Get the version history of a document. Shows who edited the document and when, with change details.",
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
      name: "read_version_content",
      description: "Read the text content of a specific version of a document. Use this to see what a document looked like at a particular point in time.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document" },
          version_number: { type: "integer", description: "Version number to read (1 is the original)" },
          max_length: { type: "number", description: "Max characters to return (default 10000)" }
        },
        required: ["document_id", "version_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_versions",
      description: "Compare two versions of a document and show what changed (additions and deletions).",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string", description: "UUID of the document" },
          version1: { type: "integer", description: "First version number (older)" },
          version2: { type: "integer", description: "Second version number (newer)" }
        },
        required: ["document_id", "version1", "version2"]
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
  // NOTE: start_background_task has been removed - AI now executes all tasks immediately
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
      description: "Call this when you have finished a complex task or achieved a goal. Summarize what you accomplished and what you learned.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "The original goal" },
          summary: { type: "string", description: "Summary of what you accomplished" },
          actions_taken: { type: "array", items: { type: "string" }, description: "List of actions you took" },
          results: { type: "string", description: "The results/outcome" },
          recommendations: { type: "array", items: { type: "string" }, description: "Any recommendations for follow-up" },
          key_learnings: { type: "array", items: { type: "string" }, description: "Key insights and learnings from this task" },
          quality_assessment: { type: "string", description: "Overall assessment of the quality of work (rate 1-10 and explain)" },
          improvements_for_next_time: { type: "array", items: { type: "string" }, description: "What you would do differently next time" }
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
      description: "Log a note about work you've done, observations, and learnings. Use this to track progress AND capture insights for self-improvement.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "What action you took or what you observed" },
          result: { type: "string", description: "The result or outcome" },
          next_step: { type: "string", description: "What you plan to do next" },
          reflection: { type: "string", description: "What you learned from this step - insights, better approaches discovered, or what you'd do differently" },
          quality_rating: { type: "number", description: "Rate the quality of this step 1-10" },
          improvement_idea: { type: "string", description: "A specific idea for how to do this better next time" }
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
      description: "Send an email directly through the user's Outlook. Use this when the user wants to send an email immediately. Can attach documents from the firm's document library.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address(es), comma-separated" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (can include HTML)" },
          cc: { type: "string", description: "CC recipients, comma-separated (optional)" },
          importance: { type: "string", enum: ["low", "normal", "high"], description: "Email importance (default: normal)" },
          document_ids: { type: "array", items: { type: "string" }, description: "Array of document IDs from the Documents section to attach (optional)" }
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
  },

  // ===================== NOTIFICATIONS =====================
  {
    type: "function",
    function: {
      name: "send_notification",
      description: "Send a notification to users. Can send in-app, email, or SMS notifications. Use this when you need to alert users about important events, reminders, or updates.",
      parameters: {
        type: "object",
        properties: {
          user_id: { 
            type: "string", 
            description: "UUID of the user to notify, or 'all' for all firm users, or 'self' for the current user" 
          },
          title: { type: "string", description: "Notification title (required)" },
          message: { type: "string", description: "Notification message body" },
          type: { 
            type: "string", 
            enum: ["general", "deadline_reminder", "matter_update", "payment_received", "document_update", "urgent", "ai_insight"],
            description: "Type of notification (affects icon and styling)" 
          },
          priority: { 
            type: "string", 
            enum: ["low", "normal", "high", "urgent"],
            description: "Priority level. Urgent notifications bypass quiet hours." 
          },
          channels: { 
            type: "array", 
            items: { type: "string", enum: ["in_app", "email", "sms"] },
            description: "Delivery channels. Defaults to ['in_app']. Use ['in_app', 'email', 'sms'] for urgent matters." 
          },
          entity_type: { type: "string", description: "Related entity type (matter, client, invoice, etc.)" },
          entity_id: { type: "string", description: "UUID of the related entity" },
          action_url: { type: "string", description: "URL to open when notification is clicked" }
        },
        required: ["title"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_notifications",
      description: "Get user's notifications. Use this to check unread notifications or review notification history.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Number to return (default 20)" },
          unread_only: { type: "boolean", description: "Only return unread notifications" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_notification",
      description: "Schedule a notification to be sent at a future time. Useful for reminders about deadlines, events, or follow-ups.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "UUID of user to notify, 'all', or 'self'" },
          title: { type: "string", description: "Notification title" },
          message: { type: "string", description: "Notification message" },
          scheduled_for: { type: "string", description: "When to send (ISO 8601 format, e.g., '2024-01-15T09:00:00Z')" },
          type: { type: "string", enum: ["deadline_reminder", "calendar_reminder", "follow_up", "general"] },
          channels: { 
            type: "array", 
            items: { type: "string", enum: ["in_app", "email", "sms"] }
          },
          entity_type: { type: "string", description: "Related entity type" },
          entity_id: { type: "string", description: "UUID of related entity" }
        },
        required: ["title", "scheduled_for"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_deadline_reminder",
      description: "Send a reminder about an upcoming deadline. Automatically includes matter details and sends via appropriate channels based on urgency.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "UUID of the matter with the deadline" },
          deadline_date: { type: "string", description: "The deadline date (YYYY-MM-DD)" },
          deadline_description: { type: "string", description: "Description of what's due" },
          user_ids: { 
            type: "array", 
            items: { type: "string" },
            description: "UUIDs of users to notify (defaults to matter team)" 
          },
          include_sms: { type: "boolean", description: "Also send SMS if within 24 hours" }
        },
        required: ["matter_id", "deadline_date", "deadline_description"]
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
      case 'delete_matter': return await deleteMatter(args, user);
      
      // Clients
      case 'list_clients': return await listClients(args, user);
      case 'get_client': return await getClient(args, user);
      case 'create_client': return await createClient(args, user);
      case 'archive_client': return await archiveClient(args, user);
      case 'reactivate_client': return await reactivateClient(args, user);
      case 'update_client': return await updateClient(args, user);
      case 'delete_client': return await deleteClient(args, user);
      case 'add_client_note': return await addClientNote(args, user);
      
      // Invoices
      case 'list_invoices': return await listInvoices(args, user);
      case 'get_invoice': return await getInvoice(args, user);
      case 'create_invoice': return await createInvoice(args, user);
      case 'send_invoice': return await sendInvoice(args, user);
      case 'record_payment': return await recordPayment(args, user);
      case 'void_invoice': return await voidInvoice(args, user);
      case 'delete_invoice': return await deleteInvoice(args, user);
      
      // Tasks
      case 'create_task': return await createTask(args, user);
      case 'list_tasks': return await listTasks(args, user);
      case 'complete_task': return await completeTask(args, user);
      case 'update_task': return await updateTask(args, user);
      case 'delete_task': return await deleteTask(args, user);
      
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
      case 'find_and_read_document': return await findAndReadDocument(args, user);
      case 'analyze_image': return await analyzeImage(args, user);
      case 'get_matter_documents_content': return await getMatterDocumentsContent(args, user);
      case 'search_document_content': return await searchDocumentContent(args, user);
      case 'save_uploaded_document': return await saveUploadedDocument(args, user, req);
      case 'create_document': return await createDocument(args, user);
      case 'create_note': return await createNote(args, user);
      case 'update_document': return await updateDocument(args, user);
      case 'delete_document': return await deleteDocument(args, user);
      case 'move_document': return await moveDocument(args, user);
      case 'rename_document': return await renameDocument(args, user);
      case 'share_document': return await shareDocument(args, user);
      
      // Version History
      case 'get_document_versions': return await getDocumentVersions(args, user);
      case 'read_version_content': return await readVersionContent(args, user);
      case 'compare_versions': return await compareVersions(args, user);
      
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
      
      // Autonomous Agent Tools (background task removed - AI executes immediately)
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
      
      // Outlook Calendar Sync
      case 'create_outlook_event': return await createOutlookEvent(args, user);
      case 'sync_outlook_calendar': return await syncOutlookCalendar(args, user);
      
      // Outlook Emails
      case 'get_emails': return await getEmails(args, user);
      case 'search_emails': return await searchEmails(args, user);
      case 'get_email': return await getEmail(args, user);
      case 'draft_email': return await draftEmail(args, user);
      case 'draft_email_for_matter': return await draftEmailForMatter(args, user);
      case 'send_email': return await sendEmail(args, user);
      case 'reply_to_email': return await replyToEmail(args, user);
      case 'link_email_to_matter': return await linkEmailToMatter(args, user);
      case 'link_email_to_client': return await linkEmailToClient(args, user);
      case 'get_matter_emails': return await getMatterEmails(args, user);
      case 'get_client_communications': return await getClientCommunications(args, user);
      case 'configure_auto_email_linking': return await configureAutoEmailLinking(args, user);
      case 'check_email_integration': return await checkEmailIntegration(args, user);
      
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
      
      // Notifications
      case 'send_notification': return await sendNotification(args, user);
      case 'get_notifications': return await getNotifications(args, user);
      case 'schedule_notification': return await scheduleNotification(args, user);
      case 'send_deadline_reminder': return await sendDeadlineReminder(args, user);
      
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
  
  // Get total count first (before adding limit)
  let countSql = sql.replace('SELECT m.id, m.name, m.number, m.status, m.priority, m.billing_type, c.display_name as client_name', 'SELECT COUNT(*) as total');
  const countParams = [...params]; // copy params before adding limit
  const countResult = await query(countSql, countParams);
  const totalCount = parseInt(countResult.rows[0]?.total || 0);
  
  sql += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
  params.push(parseInt(limit) || 50);
  
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
    count: result.rows.length,
    total: totalCount,
    showing: `${result.rows.length} of ${totalCount}${status ? ` ${status}` : ''} matters`
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
    `SELECT id, name, original_name, type, ai_summary, uploaded_at,
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
    name: d.original_name || d.name,
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

async function deleteMatter(args, user) {
  const { matter_id, confirm } = args;
  
  if (!confirm) {
    return { error: 'You must set confirm: true to delete a matter. This action cannot be undone.' };
  }
  
  // Check if matter exists and belongs to firm
  const matterCheck = await query(
    'SELECT id, name, number FROM matters WHERE id = $1 AND firm_id = $2',
    [matter_id, user.firmId]
  );
  
  if (matterCheck.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterCheck.rows[0];
  
  // Check for dependencies
  const [timeEntries, invoices, documents] = await Promise.all([
    query('SELECT COUNT(*) as count FROM time_entries WHERE matter_id = $1', [matter_id]),
    query('SELECT COUNT(*) as count FROM invoices WHERE matter_id = $1', [matter_id]),
    query('SELECT COUNT(*) as count FROM documents WHERE matter_id = $1', [matter_id])
  ]);
  
  const hasTimeEntries = parseInt(timeEntries.rows[0].count) > 0;
  const hasInvoices = parseInt(invoices.rows[0].count) > 0;
  const hasDocuments = parseInt(documents.rows[0].count) > 0;
  
  if (hasTimeEntries || hasInvoices || hasDocuments) {
    return { 
      error: `Cannot delete matter "${matter.name}" - it has associated records. ` +
             `Time entries: ${timeEntries.rows[0].count}, Invoices: ${invoices.rows[0].count}, Documents: ${documents.rows[0].count}. ` +
             `Use archive_matter instead.`
    };
  }
  
  // Delete associated records first (tasks, notes, etc.)
  await query('DELETE FROM calendar_events WHERE matter_id = $1', [matter_id]);
  await query('DELETE FROM email_links WHERE matter_id = $1', [matter_id]);
  
  // Delete the matter
  await query('DELETE FROM matters WHERE id = $1', [matter_id]);
  
  return {
    success: true,
    message: `Permanently deleted matter "${matter.name}" (${matter.number})`
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
    `SELECT id, name, original_name, type, ai_summary, uploaded_at,
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
        name: d.original_name || d.name,
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

async function deleteClient(args, user) {
  const { client_id, confirm } = args;
  
  if (!confirm) {
    return { error: 'You must set confirm: true to delete a client. This action cannot be undone.' };
  }
  
  // Check if client exists
  const clientCheck = await query(
    'SELECT id, display_name FROM clients WHERE id = $1 AND firm_id = $2',
    [client_id, user.firmId]
  );
  
  if (clientCheck.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const client = clientCheck.rows[0];
  
  // Check for dependencies
  const [matters, invoices, documents] = await Promise.all([
    query('SELECT COUNT(*) as count FROM matters WHERE client_id = $1', [client_id]),
    query('SELECT COUNT(*) as count FROM invoices WHERE client_id = $1', [client_id]),
    query('SELECT COUNT(*) as count FROM documents WHERE client_id = $1', [client_id])
  ]);
  
  const hasMatters = parseInt(matters.rows[0].count) > 0;
  const hasInvoices = parseInt(invoices.rows[0].count) > 0;
  const hasDocuments = parseInt(documents.rows[0].count) > 0;
  
  if (hasMatters || hasInvoices || hasDocuments) {
    return { 
      error: `Cannot delete client "${client.display_name}" - it has associated records. ` +
             `Matters: ${matters.rows[0].count}, Invoices: ${invoices.rows[0].count}, Documents: ${documents.rows[0].count}. ` +
             `Use archive_client instead.`
    };
  }
  
  // Delete associated records
  await query('DELETE FROM email_links WHERE client_id = $1', [client_id]);
  
  // Delete the client
  await query('DELETE FROM clients WHERE id = $1', [client_id]);
  
  return {
    success: true,
    message: `Permanently deleted client "${client.display_name}"`
  };
}

async function addClientNote(args, user) {
  const { client_id, content, note_type = 'general' } = args;
  
  if (!client_id || !content) {
    return { error: 'client_id and content are required' };
  }
  
  // Check if client exists
  const clientCheck = await query(
    'SELECT id, display_name, notes FROM clients WHERE id = $1 AND firm_id = $2',
    [client_id, user.firmId]
  );
  
  if (clientCheck.rows.length === 0) {
    return { error: 'Client not found' };
  }
  
  const client = clientCheck.rows[0];
  
  // Append to existing notes
  const timestamp = new Date().toLocaleString();
  const existingNotes = client.notes || '';
  const newNote = `\n\n[${timestamp} - ${note_type.toUpperCase()}]\n${content}`;
  const updatedNotes = existingNotes + newNote;
  
  await query(
    'UPDATE clients SET notes = $1, updated_at = NOW() WHERE id = $2',
    [updatedNotes, client_id]
  );
  
  return {
    success: true,
    message: `Added ${note_type} note to client "${client.display_name}"`,
    data: { client_id, note_type }
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

async function voidInvoice(args, user) {
  const { invoice_id, reason } = args;
  
  if (!invoice_id || !reason) {
    return { error: 'invoice_id and reason are required' };
  }
  
  const invoiceResult = await query(
    'SELECT * FROM invoices WHERE id = $1 AND firm_id = $2',
    [invoice_id, user.firmId]
  );
  
  if (invoiceResult.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  const invoice = invoiceResult.rows[0];
  
  if (invoice.status === 'paid') {
    return { error: 'Cannot void a paid invoice. Record a refund instead.' };
  }
  
  if (invoice.status === 'void') {
    return { error: 'Invoice is already voided' };
  }
  
  await query(
    `UPDATE invoices SET status = 'void', notes = COALESCE(notes, '') || $1, updated_at = NOW() WHERE id = $2`,
    [`\n[VOIDED: ${reason}]`, invoice_id]
  );
  
  return {
    success: true,
    message: `Voided invoice ${invoice.number}. Reason: ${reason}`,
    data: { invoice_id, status: 'void' }
  };
}

async function deleteInvoice(args, user) {
  const { invoice_id, confirm } = args;
  
  if (!confirm) {
    return { error: 'You must set confirm: true to delete an invoice. This action cannot be undone.' };
  }
  
  const invoiceResult = await query(
    'SELECT * FROM invoices WHERE id = $1 AND firm_id = $2',
    [invoice_id, user.firmId]
  );
  
  if (invoiceResult.rows.length === 0) {
    return { error: 'Invoice not found' };
  }
  
  const invoice = invoiceResult.rows[0];
  
  if (invoice.status !== 'draft') {
    return { error: `Cannot delete invoice with status "${invoice.status}". Only draft invoices can be deleted. Use void_invoice for sent invoices.` };
  }
  
  // Delete the invoice (line_items are stored in JSONB, no separate table)
  await query('DELETE FROM invoices WHERE id = $1', [invoice_id]);
  
  return {
    success: true,
    message: `Permanently deleted draft invoice ${invoice.number}`
  };
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

async function deleteTask(args, user) {
  const { task_id } = args;
  
  if (!task_id) {
    return { error: 'task_id is required' };
  }
  
  const taskResult = await query(
    `SELECT id, title FROM calendar_events WHERE id = $1 AND firm_id = $2 AND type = 'task'`,
    [task_id, user.firmId]
  );
  
  if (taskResult.rows.length === 0) {
    return { error: 'Task not found' };
  }
  
  const task = taskResult.rows[0];
  
  await query('DELETE FROM calendar_events WHERE id = $1', [task_id]);
  
  return {
    success: true,
    message: `Deleted task "${task.title}"`
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
    SELECT d.id, d.name, d.original_name, d.type, d.size, d.status, d.uploaded_at, 
           d.external_source, d.external_url, d.content_text IS NOT NULL as has_content,
           m.name as matter_name, c.display_name as client_name
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
    sql += ` AND (d.name ILIKE $${idx} OR d.original_name ILIKE $${idx++})`;
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
  
  sql += ` ORDER BY d.uploaded_at DESC NULLS LAST LIMIT ${Math.min(parseInt(limit), 50)}`;
  
  const result = await query(sql, params);
  
  return {
    documents: result.rows.map(d => ({
      id: d.id,
      name: d.original_name || d.name,
      type: d.type,
      size: d.size,
      status: d.status,
      matter: d.matter_name,
      client: d.client_name,
      source: d.external_source || 'local',
      external_url: d.external_url,
      has_content: d.has_content,
      uploaded_at: d.uploaded_at
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
    `SELECT d.id, d.name, d.original_name, d.type, d.content_text, d.ai_summary, d.path, 
            d.azure_path, d.external_path, d.folder_path, m.name as matter_name
     FROM documents d
     LEFT JOIN matters m ON d.matter_id = m.id
     WHERE d.id = $1 AND d.firm_id = $2`,
    [document_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = result.rows[0];
  const fileName = doc.original_name || doc.name || 'document';
  
  // If we have extracted content, return it
  if (doc.content_text && doc.content_text.trim().length > 0) {
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
  
  // No stored content - try to extract on-demand
  // FIRST: Try Azure (that's where documents are stored!)
  let fileBuffer = null;
  let extractedContent = null;
  
  try {
    const azureEnabled = await isAzureConfigured();
    if (azureEnabled) {
      // Try multiple possible Azure paths
      const possiblePaths = [
        doc.azure_path,
        doc.external_path,
        doc.path,
        doc.folder_path ? `${doc.folder_path}/${fileName}` : null
      ].filter(Boolean);
      
      for (const azurePath of possiblePaths) {
        try {
          console.log(`[AI Agent] Trying Azure path: ${azurePath}`);
          fileBuffer = await downloadFile(azurePath, user.firmId);
          if (fileBuffer && fileBuffer.length > 0) {
            console.log(`[AI Agent] Got ${fileBuffer.length} bytes from Azure for ${doc.name}`);
            break;
          }
        } catch (e) {
          console.log(`[AI Agent] Azure path ${azurePath} failed: ${e.message}`);
        }
      }
    }
  } catch (azureError) {
    console.error(`[AI Agent] Azure download failed for ${doc.name}:`, azureError.message);
  }
  
  // If we got a buffer from Azure, extract text from it
  if (fileBuffer && fileBuffer.length > 0) {
    try {
      const ext = path.extname(fileName).toLowerCase();
      
      if (ext === '.pdf') {
        // Dynamic import for PDF parsing
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(fileBuffer);
        extractedContent = pdfData.text;
      } else if (ext === '.docx') {
        const mammoth = (await import('mammoth')).default;
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedContent = result.value;
      } else if (['.txt', '.md', '.json', '.csv', '.xml', '.html'].includes(ext)) {
        extractedContent = fileBuffer.toString('utf-8');
      }
      
      if (extractedContent && extractedContent.trim().length > 0) {
        console.log(`[AI Agent] Extracted ${extractedContent.length} chars from Azure file`);
        // Save to database for future use
        await query(
          'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
          [extractedContent.substring(0, 100000), doc.id]
        );
      }
    } catch (extractError) {
      console.error(`[AI Agent] Text extraction from Azure buffer failed:`, extractError.message);
    }
  }
  
  // FALLBACK: Try local file if Azure didn't work
  if (!extractedContent && doc.path) {
    try {
      console.log(`[AI Agent] Falling back to local path: ${doc.path}`);
      extractedContent = await extractTextFromFile(doc.path, fileName);
      
      if (extractedContent && extractedContent.trim().length > 0) {
        // Save to database for future use
        await query(
          'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
          [extractedContent.substring(0, 100000), doc.id]
        );
      }
    } catch (extractError) {
      console.error(`[AI Agent] Local extraction failed for ${doc.name}:`, extractError.message);
    }
  }
  
  // Return extracted content if we got any
  if (extractedContent && extractedContent.trim().length > 0) {
    const content = extractedContent.substring(0, Math.min(parseInt(max_length), 50000));
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matter: doc.matter_name,
      content: content,
      truncated: extractedContent.length > content.length,
      total_length: extractedContent.length,
      note: 'Content extracted on-demand and saved for future use.'
    };
  }
  
  // If we have an AI summary but no extractable content, return that
  if (doc.ai_summary) {
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matter: doc.matter_name,
      content: null,
      summary: doc.ai_summary,
      note: 'Full text content not extractable. Summary available.'
    };
  }
  
  // No content available and extraction failed
  return {
    id: doc.id,
    name: doc.name,
    type: doc.type,
    matter: doc.matter_name,
    content: null,
    note: 'Document content could not be extracted. The file may be a scanned image or unsupported format.'
  };
}

async function findAndReadDocument(args, user) {
  const { document_name, matter_id, max_length = 10000 } = args;
  
  if (!document_name || document_name.length < 2) {
    return { error: 'document_name must be at least 2 characters' };
  }
  
  // Split search term into keywords for flexible matching
  const keywords = document_name.trim().split(/\s+/).filter(k => k.length >= 2);
  
  // Build flexible search - match ANY keyword in name OR original_name
  let sql = `
    SELECT d.id, d.name, d.original_name, d.type, d.content_text, d.ai_summary, d.path,
           d.azure_path, d.external_path, d.folder_path, m.name as matter_name,
           (
             CASE WHEN d.name ILIKE $2 OR d.original_name ILIKE $2 THEN 10 ELSE 0 END +
             CASE WHEN d.name ILIKE $3 OR d.original_name ILIKE $3 THEN 5 ELSE 0 END
           ) as relevance
    FROM documents d
    LEFT JOIN matters m ON d.matter_id = m.id
    WHERE d.firm_id = $1 AND (
      d.name ILIKE $2 OR d.original_name ILIKE $2 OR
      d.name ILIKE $3 OR d.original_name ILIKE $3
  `;
  
  // Full phrase match gets higher priority, individual keywords also match
  const fullPhrase = `%${document_name}%`;
  const firstKeyword = keywords.length > 0 ? `%${keywords[0]}%` : fullPhrase;
  const params = [user.firmId, fullPhrase, firstKeyword];
  let idx = 4;
  
  // Add additional keywords to search
  for (let i = 1; i < keywords.length && i < 4; i++) {
    sql += ` OR d.name ILIKE $${idx} OR d.original_name ILIKE $${idx}`;
    params.push(`%${keywords[i]}%`);
    idx++;
  }
  
  sql += `)`;
  
  if (matter_id) {
    sql += ` AND d.matter_id = $${idx}`;
    params.push(matter_id);
    idx++;
  }
  
  sql += ` ORDER BY relevance DESC, d.uploaded_at DESC NULLS LAST LIMIT 10`;
  
  const result = await query(sql, params);
  
  if (result.rows.length === 0) {
    // Try one more search with just the first keyword
    const fallbackSql = `
      SELECT d.id, d.name, d.original_name, d.type, d.content_text, d.ai_summary, d.path,
             d.azure_path, d.external_path, d.folder_path, m.name as matter_name
      FROM documents d
      LEFT JOIN matters m ON d.matter_id = m.id
      WHERE d.firm_id = $1 AND (d.name ILIKE $2 OR d.original_name ILIKE $2)
      ORDER BY d.uploaded_at DESC NULLS LAST LIMIT 10
    `;
    const fallbackResult = await query(fallbackSql, [user.firmId, `%${keywords[0] || document_name}%`]);
    
    if (fallbackResult.rows.length === 0) {
      return { 
        error: `No documents found matching "${document_name}"`,
        suggestion: 'Try using list_documents to see all available documents, or use a shorter/simpler search term.'
      };
    }
    result.rows = fallbackResult.rows;
  }
  
  // If multiple matches, list them and read the first one
  const matches = result.rows;
  const doc = matches[0];
  const fileName = doc.original_name || doc.name || 'document';
  
  // If we have stored content, return it
  if (doc.content_text && doc.content_text.trim().length > 0) {
    const content = doc.content_text.substring(0, Math.min(parseInt(max_length), 50000));
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matter: doc.matter_name,
      content: content,
      truncated: doc.content_text.length > content.length,
      total_length: doc.content_text.length,
      other_matches: matches.length > 1 ? matches.slice(1).map(m => ({ id: m.id, name: m.name })) : null
    };
  }
  
  // No stored content - try to extract on-demand
  let fileBuffer = null;
  let extractedContent = null;
  
  // Try Azure first
  try {
    const azureEnabled = await isAzureConfigured();
    if (azureEnabled) {
      const possiblePaths = [
        doc.azure_path,
        doc.external_path,
        doc.path,
        doc.folder_path ? `${doc.folder_path}/${fileName}` : null
      ].filter(Boolean);
      
      for (const azurePath of possiblePaths) {
        try {
          fileBuffer = await downloadFile(azurePath, user.firmId);
          if (fileBuffer && fileBuffer.length > 0) {
            console.log(`[AI Agent] Got ${fileBuffer.length} bytes from Azure for ${doc.name}`);
            break;
          }
        } catch (e) {
          // Try next path
        }
      }
    }
  } catch (e) {
    console.error(`[AI Agent] Azure download failed:`, e.message);
  }
  
  // Extract text from buffer
  if (fileBuffer && fileBuffer.length > 0) {
    try {
      const ext = path.extname(fileName).toLowerCase();
      
      if (ext === '.pdf') {
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(fileBuffer);
        extractedContent = pdfData.text;
      } else if (ext === '.docx') {
        const mammoth = (await import('mammoth')).default;
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedContent = result.value;
      } else if (['.txt', '.md', '.json', '.csv', '.xml', '.html'].includes(ext)) {
        extractedContent = fileBuffer.toString('utf-8');
      }
      
      if (extractedContent && extractedContent.trim().length > 0) {
        // Save to database for future use
        await query(
          'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
          [extractedContent.substring(0, 100000), doc.id]
        );
      }
    } catch (e) {
      console.error(`[AI Agent] Text extraction failed:`, e.message);
    }
  }
  
  // Fallback to local file
  if (!extractedContent && doc.path) {
    try {
      extractedContent = await extractTextFromFile(doc.path, fileName);
      if (extractedContent && extractedContent.trim().length > 0) {
        await query(
          'UPDATE documents SET content_text = $1, content_extracted_at = NOW() WHERE id = $2',
          [extractedContent.substring(0, 100000), doc.id]
        );
      }
    } catch (e) {
      console.error(`[AI Agent] Local extraction failed:`, e.message);
    }
  }
  
  if (extractedContent && extractedContent.trim().length > 0) {
    const content = extractedContent.substring(0, Math.min(parseInt(max_length), 50000));
    return {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      matter: doc.matter_name,
      content: content,
      truncated: extractedContent.length > content.length,
      total_length: extractedContent.length,
      note: 'Content extracted on-demand.',
      other_matches: matches.length > 1 ? matches.slice(1).map(m => ({ id: m.id, name: m.name })) : null
    };
  }
  
  // Return what we have even without content
  return {
    id: doc.id,
    name: doc.name,
    type: doc.type,
    matter: doc.matter_name,
    content: null,
    summary: doc.ai_summary || null,
    note: 'Could not extract document content. File may be an image, scanned PDF, or in an unsupported format.',
    other_matches: matches.length > 1 ? matches.slice(1).map(m => ({ id: m.id, name: m.name })) : null
  };
}

async function analyzeImage(args, user) {
  const { document_id, question } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  
  // Get document info
  const result = await query(
    `SELECT d.id, d.name, d.type, d.path, d.azure_path, m.name as matter_name
     FROM documents d
     LEFT JOIN matters m ON d.matter_id = m.id
     WHERE d.id = $1 AND d.firm_id = $2`,
    [document_id, user.firmId]
  );
  
  if (result.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = result.rows[0];
  const ext = path.extname(doc.name).toLowerCase();
  
  // Check if it's an image
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.bmp'];
  if (!imageExtensions.includes(ext)) {
    return { 
      error: `This tool only works with image files. "${doc.name}" is a ${ext} file. Use read_document_content for text documents.`
    };
  }
  
  // Check Azure OpenAI Vision config
  if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
    return { error: 'Azure OpenAI not configured for image analysis.' };
  }
  
  try {
    // Read the image file - try Azure FIRST (that's where docs are stored)
    let imageBuffer = null;
    
    // Try Azure first
    try {
      const azureEnabled = await isAzureConfigured();
      if (azureEnabled) {
        const possiblePaths = [
          doc.azure_path,
          doc.path,
          doc.name
        ].filter(Boolean);
        
        for (const azurePath of possiblePaths) {
          try {
            imageBuffer = await downloadFile(azurePath, user.firmId);
            if (imageBuffer && imageBuffer.length > 0) {
              console.log(`[AI Agent] Got image from Azure: ${azurePath}`);
              break;
            }
          } catch (e) {
            // Try next path
          }
        }
      }
    } catch (e) {
      console.log('[AI Agent] Azure image download failed:', e.message);
    }
    
    // Fallback to local file
    if (!imageBuffer && doc.path) {
      try {
        imageBuffer = await fs.promises.readFile(doc.path);
      } catch (e) {
        // Local file not found
      }
    }
    
    if (!imageBuffer || imageBuffer.length === 0) {
      return { error: 'Could not read image file from Azure or local storage.' };
    }
    
    const base64Image = imageBuffer.toString('base64');
    const mimeType = `image/${ext.replace('.', '').replace('jpg', 'jpeg')}`;
    
    // Build the prompt based on whether user has a specific question
    const userPrompt = question 
      ? `Analyze this image and answer: ${question}`
      : 'Describe this image in detail. Include: what type of image it is, any text visible, objects/people present, setting/location, notable details, and anything that might be legally relevant (damage, evidence, conditions, etc.).';
    
    const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are an expert image analyst for a law firm. Provide detailed, objective descriptions of images. Note any text, damage, conditions, or details that could be relevant to legal matters. Be specific and factual.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure Vision error:', errorText);
      return { error: 'Failed to analyze image. Please try again.' };
    }
    
    const data = await response.json();
    const analysis = data.choices[0]?.message?.content;
    
    if (!analysis) {
      return { error: 'No analysis returned from vision model.' };
    }
    
    return {
      id: doc.id,
      name: doc.name,
      matter: doc.matter_name,
      analysis: analysis,
      question: question || null
    };
    
  } catch (error) {
    console.error('Image analysis error:', error);
    return { error: `Failed to analyze image: ${error.message}` };
  }
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
    `SELECT id, name, original_name, type, size, status, content_text, ai_summary, uploaded_at
     FROM documents 
     WHERE matter_id = $1 AND firm_id = $2
     ORDER BY uploaded_at DESC`,
    [matter_id, user.firmId]
  );
  
  const documents = docsResult.rows.map(d => {
    const doc = {
      id: d.id,
      name: d.original_name || d.name,
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
    SELECT d.id, d.name, d.original_name, d.type, d.content_text, d.ai_summary, 
           m.name as matter_name, m.number as matter_number, c.display_name as client_name
    FROM documents d
    LEFT JOIN matters m ON d.matter_id = m.id
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.firm_id = $1 
      AND (d.content_text ILIKE $2 OR d.ai_summary ILIKE $2 OR d.name ILIKE $2 OR d.original_name ILIKE $2)
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
      name: d.original_name || d.name,
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

async function createDocument(args, user) {
  const { name, content, matter_id, client_id, tags } = args;
  
  if (!name || !content) {
    return { error: 'Document name and content are required' };
  }
  
  try {
    // Add (AI) suffix to indicate this was AI-generated
    // Remove any existing (AI) suffix first to avoid duplication
    let baseName = name.replace(/\s*\(AI\)\s*$/, '').replace(/\.(txt|pdf|doc|docx)$/i, '');
    const docName = `${baseName} (AI).pdf`;
    
    // Generate a unique filename
    const timestamp = Date.now();
    const safeName = baseName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${safeName}_AI.pdf`;
    
    // Create the uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads', 'ai-generated');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filePath = path.join(uploadsDir, filename);
    const relativePath = `uploads/ai-generated/${filename}`;
    
    // Build folder path for Azure based on matter
    let folderPath = 'ai-generated';
    if (matter_id) {
      const matterResult = await query('SELECT name FROM matters WHERE id = $1', [matter_id]);
      if (matterResult.rows.length > 0) {
        const matterName = matterResult.rows[0].name.replace(/[^a-zA-Z0-9 ]/g, '_');
        folderPath = `matters/${matterName}/ai-generated`;
      }
    }
    const azurePath = `${folderPath}/${filename}`;
    
    // Generate PDF using pdfkit
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 }
    });
    
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    
    // Add document title
    doc.fontSize(18).font('Helvetica-Bold').text(baseName, { align: 'center' });
    doc.moveDown(0.5);
    
    // Add metadata line
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
       .text(`Generated by AI Assistant for ${user.firstName} ${user.lastName} • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.moveDown(1.5);
    
    // Add horizontal line
    doc.strokeColor('#cccccc').lineWidth(1)
       .moveTo(72, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(1);
    
    // Add content - handle markdown-like formatting
    doc.fillColor('#000000').fontSize(12).font('Helvetica');
    
    const lines = content.split('\n');
    for (const line of lines) {
      // Handle headers
      if (line.startsWith('### ')) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(12).text(line.replace('### ', ''));
        doc.font('Helvetica').fontSize(12);
      } else if (line.startsWith('## ')) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(14).text(line.replace('## ', ''));
        doc.font('Helvetica').fontSize(12);
      } else if (line.startsWith('# ')) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(16).text(line.replace('# ', ''));
        doc.font('Helvetica').fontSize(12);
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold line
        doc.font('Helvetica-Bold').text(line.replace(/\*\*/g, ''));
        doc.font('Helvetica');
      } else if (line.startsWith('- ') || line.startsWith('• ')) {
        // Bullet point
        doc.text(`  • ${line.substring(2)}`, { indent: 20 });
      } else if (line.match(/^\d+\.\s/)) {
        // Numbered list
        doc.text(`  ${line}`, { indent: 20 });
      } else if (line.trim() === '') {
        doc.moveDown(0.5);
      } else {
        doc.text(line);
      }
    }
    
    // Finalize PDF
    doc.end();
    
    // Wait for the write stream to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Get file size
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Upload to Azure Drive if configured
    let azureResult = null;
    try {
      const azureEnabled = await isAzureConfigured();
      if (azureEnabled) {
        azureResult = await uploadFile(filePath, azurePath, user.firmId);
        console.log(`[AI DOCUMENT] Uploaded to Azure: ${azureResult.path}`);
      }
    } catch (azureError) {
      console.error('[AI DOCUMENT] Azure upload failed (continuing with local):', azureError.message);
    }
    
    // Determine privacy level (Clio-style)
    // Documents in matters inherit 'team' privacy, standalone are 'private'
    const privacyLevel = matter_id ? 'team' : 'private';
    
    // Calculate content hash for versioning
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Insert document record with owner_id set to the user who used the AI
    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, file_type, size, file_size, path,
        content_text, content_extracted_at, content_hash, tags, status, uploaded_by,
        owner_id, privacy_level, folder_path, external_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, 'final', $14, $15, $16, $17, $18)
      RETURNING id, name`,
      [
        user.firmId,
        matter_id || null,
        client_id || null,
        docName,
        docName,
        'application/pdf',
        'pdf',
        fileSize,
        fileSize,
        relativePath,
        content,
        contentHash,
        tags || ['ai-generated'],
        user.id,
        user.id, // owner_id - the user who asked the AI to create it
        privacyLevel,
        folderPath,
        azureResult ? azureResult.path : null
      ]
    );
    
    const savedDoc = result.rows[0];
    
    // Auto-create permission for owner (the user who used the AI)
    try {
      await query(
        `INSERT INTO document_permissions (
          document_id, firm_id, user_id, permission_level,
          can_view, can_download, can_edit, can_delete, can_share, can_manage_permissions,
          created_by
        ) VALUES ($1, $2, $3, 'full', true, true, true, true, true, true, $3)
        ON CONFLICT DO NOTHING`,
        [savedDoc.id, user.firmId, user.id]
      );
    } catch (permError) {
      console.log('[AI DOCUMENT] Permission auto-create skipped');
    }
    
    // Create initial version record
    try {
      const wordCount = content.split(/\s+/).filter(w => w).length;
      await query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, version_label,
          content_text, content_hash, change_summary, change_type,
          word_count, character_count, file_size, created_by, created_by_name, source
        ) VALUES ($1, $2, 1, 'AI Generated', $3, $4, 'Document created by AI Assistant', 'create', $5, $6, $7, $8, $9, 'ai')`,
        [
          savedDoc.id, user.firmId, content, contentHash,
          wordCount, content.length, fileSize,
          user.id, `${user.firstName} ${user.lastName}`
        ]
      );
    } catch (versionError) {
      console.log('[AI DOCUMENT] Initial version creation skipped:', versionError.message);
    }
    
    // Log audit action
    await query(
      `INSERT INTO audit_logs (firm_id, user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, 'document.ai_created', 'document', $3, $4)`,
      [user.firmId, user.id, savedDoc.id, JSON.stringify({ 
        name: docName, 
        size: fileSize, 
        azureUploaded: !!azureResult,
        ownerId: user.id,
        privacyLevel
      })]
    );
    
    // Get matter/client names for confirmation
    let locationInfo = '';
    if (matter_id) {
      const matterRes = await query('SELECT name, number FROM matters WHERE id = $1', [matter_id]);
      if (matterRes.rows.length > 0) {
        locationInfo = ` and attached to matter "${matterRes.rows[0].name}" (${matterRes.rows[0].number})`;
      }
    } else if (client_id) {
      const clientRes = await query('SELECT display_name FROM clients WHERE id = $1', [client_id]);
      if (clientRes.rows.length > 0) {
        locationInfo = ` and attached to client "${clientRes.rows[0].display_name}"`;
      }
    }
    
    const driveInfo = azureResult ? ' The document has been saved to the firm drive.' : '';
    
    return {
      success: true,
      message: `Created PDF document "${savedDoc.name}"${locationInfo}.${driveInfo} You are the owner and have full access to this document.`,
      data: {
        id: savedDoc.id,
        name: savedDoc.name,
        type: 'pdf',
        matter_id,
        client_id,
        owner_id: user.id,
        privacy_level: privacyLevel,
        azure_uploaded: !!azureResult,
        content_preview: content.substring(0, 200) + (content.length > 200 ? '...' : '')
      }
    };
  } catch (error) {
    console.error('Error creating document:', error);
    return { error: 'Failed to create document: ' + error.message };
  }
}

async function createNote(args, user) {
  const { title, content, matter_id, client_id, note_type = 'general' } = args;
  
  if (!title || !content) {
    return { error: 'Note title and content are required' };
  }
  
  try {
    // Create a document with a .md extension for notes
    const timestamp = Date.now();
    const safeName = title.replace(/[^a-zA-Z0-9 .-]/g, '_');
    const filename = `${timestamp}-${safeName}.md`;
    
    // Format the note content with metadata
    const formattedContent = `# ${title}\n\n**Type:** ${note_type}\n**Created:** ${new Date().toLocaleString()}\n**Author:** ${user.firstName} ${user.lastName}\n\n---\n\n${content}`;
    
    // Insert as a document
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
        `${title}.md`,
        `${title}.md`,
        'text/markdown',
        formattedContent.length,
        `notes/${filename}`,
        formattedContent,
        [note_type, 'note'],
        user.id
      ]
    );
    
    const savedNote = result.rows[0];
    
    // Get matter/client names for confirmation
    let locationInfo = '';
    if (matter_id) {
      const matterRes = await query('SELECT name, number FROM matters WHERE id = $1', [matter_id]);
      if (matterRes.rows.length > 0) {
        locationInfo = ` for matter "${matterRes.rows[0].name}" (${matterRes.rows[0].number})`;
      }
    } else if (client_id) {
      const clientRes = await query('SELECT display_name FROM clients WHERE id = $1', [client_id]);
      if (clientRes.rows.length > 0) {
        locationInfo = ` for client "${clientRes.rows[0].display_name}"`;
      }
    }
    
    return {
      success: true,
      message: `Created ${note_type} note "${title}"${locationInfo}`,
      data: {
        id: savedNote.id,
        name: savedNote.name,
        note_type,
        matter_id,
        client_id
      }
    };
  } catch (error) {
    console.error('Error creating note:', error);
    return { error: 'Failed to create note: ' + error.message };
  }
}

async function updateDocument(args, user) {
  const { document_id, new_content, new_name } = args;
  
  if (!document_id || !new_content) {
    return { error: 'document_id and new_content are required' };
  }
  
  try {
    // Get the existing document
    const existing = await query(
      'SELECT id, name, original_name, matter_id, client_id, type, tags, firm_id FROM documents WHERE id = $1',
      [document_id]
    );
    
    if (existing.rows.length === 0) {
      return { error: 'Document not found' };
    }
    
    const originalDoc = existing.rows[0];
    
    // Check permissions
    if (originalDoc.firm_id !== user.firmId) {
      return { error: 'You do not have permission to access this document' };
    }
    
    // Get user's name for the filename
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
    
    // Format: documentname - Username (AI) - Date.extension
    // Extract base name and extension from original
    const origName = originalDoc.original_name || originalDoc.name;
    const hasExt = origName.includes('.');
    const ext = hasExt ? origName.substring(origName.lastIndexOf('.')) : '.txt';
    let baseName = hasExt ? origName.substring(0, origName.lastIndexOf('.')) : origName;
    
    // Remove any existing AI suffix patterns
    baseName = baseName
      .replace(/\s*-\s*[^-]+\s*\(AI\)\s*-\s*\w+\s+\d+,?\s*\d*$/i, '') // Remove "- Name (AI) - Date" pattern
      .replace(/\s*\(AI\)\s*$/i, '')  // Remove "(AI)" suffix
      .replace(/\s*\(AI edited\)\s*$/i, '') // Remove "(AI edited)" suffix
      .trim();
    
    // Format the date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Create the new document name: "DocumentName - Username (AI) - Jan 6, 2024.docx"
    const clonedName = new_name || `${baseName} - ${userName} (AI) - ${dateStr}${ext}`;
    
    // Create a placeholder file path for the new document
    const safeFileName = clonedName.replace(/[^a-z0-9.\-_ ]/gi, '_');
    const newPath = `ai-documents/${Date.now()}-${safeFileName}`;
    
    // Insert the cloned document with the new content
    const result = await query(
      `INSERT INTO documents (
        firm_id, matter_id, client_id, name, original_name, type, 
        size, path, status, tags, content_text, content_extracted_at, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
      RETURNING id, name`,
      [
        user.firmId,
        originalDoc.matter_id,
        originalDoc.client_id,
        clonedName,
        clonedName,
        originalDoc.type || 'text/plain',
        new_content.length,
        newPath,
        'draft',
        originalDoc.tags || [],
        new_content,
        user.id
      ]
    );
    
    const newDoc = result.rows[0];
    
    // Create initial version record for the new document
    try {
      const contentHash = crypto.createHash('sha256').update(new_content).digest('hex');
      await query(
        `INSERT INTO document_versions (
          document_id, firm_id, version_number, version_label,
          content_text, content_hash, change_summary, change_type,
          word_count, character_count, file_size, created_by, created_by_name, source
        ) VALUES ($1, $2, 1, 'AI Generated', $3, $4, $5, 'create', $6, $7, $8, $9, $10, 'ai_generated')`,
        [
          newDoc.id, user.firmId, new_content, contentHash,
          `AI-edited version of "${origName}" created by ${userName}`,
          new_content.split(/\s+/).filter(w => w).length,
          new_content.length,
          new_content.length,
          user.id,
          `${userName} (AI)`
        ]
      );
    } catch (versionError) {
      console.log('[AI Agent] Version record creation skipped:', versionError.message);
    }
    
    return {
      success: true,
      message: `Created AI-edited document: "${clonedName}" (original "${origName}" preserved)`,
      data: {
        original_id: document_id,
        original_name: origName,
        new_id: newDoc.id,
        new_name: clonedName,
        edited_by: `${userName} (AI)`,
        created_at: dateStr,
        content_length: new_content.length,
        word_count: new_content.split(/\s+/).filter(w => w).length,
        preview: new_content.substring(0, 200) + (new_content.length > 200 ? '...' : '')
      }
    };
  } catch (error) {
    console.error('Error creating edited document:', error);
    return { error: 'Failed to create edited document: ' + error.message };
  }
}

async function deleteDocument(args, user) {
  const { document_id, confirm } = args;
  
  if (!confirm) {
    return { error: 'You must set confirm: true to delete a document. This action cannot be undone.' };
  }
  
  const docResult = await query(
    'SELECT id, name, path, azure_path, folder_path, original_name FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  const fileName = doc.original_name || doc.name;
  
  // Delete from database first
  await query('DELETE FROM documents WHERE id = $1', [document_id]);
  
  // Try to delete from Azure (that's where docs are stored)
  try {
    const azureEnabled = await isAzureConfigured();
    if (azureEnabled) {
      const possiblePaths = [
        doc.azure_path,
        doc.folder_path ? `${doc.folder_path}/${fileName}` : null,
        doc.path
      ].filter(Boolean);
      
      for (const azurePath of possiblePaths) {
        try {
          await deleteFile(azurePath, user.firmId);
          console.log(`[AI Agent] Deleted from Azure: ${azurePath}`);
          break;
        } catch (e) {
          // Try next path
        }
      }
    }
  } catch (e) {
    console.error('Error deleting from Azure:', e.message);
  }
  
  // Also try to delete local file if it exists
  if (doc.path) {
    try {
      const filePath = path.join(process.cwd(), doc.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Continue - database record is already deleted
    }
  }
  
  return {
    success: true,
    message: `Permanently deleted document "${doc.name}"`
  };
}

async function moveDocument(args, user) {
  const { document_id, new_matter_id, new_client_id } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  
  const docResult = await query(
    'SELECT id, name, matter_id, client_id FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  
  // Validate new_matter_id if provided
  if (new_matter_id) {
    const matterCheck = await query('SELECT id, name FROM matters WHERE id = $1 AND firm_id = $2', [new_matter_id, user.firmId]);
    if (matterCheck.rows.length === 0) {
      return { error: 'Target matter not found' };
    }
  }
  
  // Validate new_client_id if provided
  if (new_client_id) {
    const clientCheck = await query('SELECT id, display_name FROM clients WHERE id = $1 AND firm_id = $2', [new_client_id, user.firmId]);
    if (clientCheck.rows.length === 0) {
      return { error: 'Target client not found' };
    }
  }
  
  await query(
    'UPDATE documents SET matter_id = $1, client_id = $2, updated_at = NOW() WHERE id = $3',
    [new_matter_id || null, new_client_id || null, document_id]
  );
  
  let moveMessage = `Moved document "${doc.name}"`;
  if (new_matter_id) {
    const matter = await query('SELECT name FROM matters WHERE id = $1', [new_matter_id]);
    moveMessage += ` to matter "${matter.rows[0]?.name || new_matter_id}"`;
  }
  if (new_client_id) {
    const client = await query('SELECT display_name FROM clients WHERE id = $1', [new_client_id]);
    moveMessage += ` to client "${client.rows[0]?.display_name || new_client_id}"`;
  }
  if (!new_matter_id && !new_client_id) {
    moveMessage += ' (removed from matter/client)';
  }
  
  return {
    success: true,
    message: moveMessage,
    data: { document_id, new_matter_id, new_client_id }
  };
}

async function renameDocument(args, user) {
  const { document_id, new_name } = args;
  
  if (!document_id || !new_name) {
    return { error: 'document_id and new_name are required' };
  }
  
  const docResult = await query(
    'SELECT id, name FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const oldName = docResult.rows[0].name;
  
  await query(
    'UPDATE documents SET name = $1, updated_at = NOW() WHERE id = $2',
    [new_name, document_id]
  );
  
  return {
    success: true,
    message: `Renamed document from "${oldName}" to "${new_name}"`,
    data: { document_id, old_name: oldName, new_name }
  };
}

async function shareDocument(args, user) {
  const { document_id, user_id, permission_level = 'view' } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  if (!user_id) {
    return { error: 'user_id is required. Use list_team_members to find users.' };
  }
  
  // Verify document exists and user has access
  const docResult = await query(
    'SELECT id, name, firm_id, owner_id FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  
  // Verify target user exists in same firm
  const targetUser = await query(
    'SELECT id, first_name, last_name, email FROM users WHERE id = $1 AND firm_id = $2',
    [user_id, user.firmId]
  );
  
  if (targetUser.rows.length === 0) {
    return { error: 'User not found in your firm' };
  }
  
  const target = targetUser.rows[0];
  const targetName = `${target.first_name || ''} ${target.last_name || ''}`.trim() || target.email;
  
  // Check if permission already exists
  const existingPerm = await query(
    'SELECT id FROM document_permissions WHERE document_id = $1 AND user_id = $2',
    [document_id, user_id]
  );
  
  if (existingPerm.rows.length > 0) {
    // Update existing permission
    await query(
      `UPDATE document_permissions 
       SET permission_level = $1, updated_at = NOW() 
       WHERE document_id = $2 AND user_id = $3`,
      [permission_level, document_id, user_id]
    );
    
    return {
      success: true,
      message: `Updated ${targetName}'s access to "${doc.name}" to ${permission_level}`,
      data: { document_id, user_id, permission_level, user_name: targetName }
    };
  }
  
  // Create new permission
  await query(
    `INSERT INTO document_permissions (document_id, firm_id, user_id, permission_level, granted_by, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [document_id, user.firmId, user_id, permission_level, user.id]
  );
  
  return {
    success: true,
    message: `Shared "${doc.name}" with ${targetName} (${permission_level} access)`,
    data: { document_id, user_id, permission_level, user_name: targetName }
  };
}

// =============================================================================
// VERSION HISTORY FUNCTIONS
// =============================================================================
async function getDocumentVersions(args, user) {
  const { document_id } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  
  // Verify document access
  const docResult = await query(
    'SELECT id, name, original_name, version FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  
  // Get all versions
  const versionsResult = await query(
    `SELECT 
      dv.id, dv.version_number, dv.version_label, dv.change_summary, dv.change_type,
      dv.word_count, dv.words_added, dv.words_removed, dv.file_size,
      dv.created_by, dv.created_by_name, dv.created_at, dv.source,
      CASE WHEN dv.content_text IS NOT NULL THEN true ELSE false END as has_content
     FROM document_versions dv
     WHERE dv.document_id = $1
     ORDER BY dv.version_number DESC`,
    [document_id]
  );
  
  return {
    document: {
      id: doc.id,
      name: doc.original_name || doc.name,
      current_version: doc.version || 1
    },
    versions: versionsResult.rows.map(v => ({
      version_number: v.version_number,
      label: v.version_label,
      edited_by: v.created_by_name || 'Unknown',
      edited_at: v.created_at,
      change_type: v.change_type,
      change_summary: v.change_summary,
      word_count: v.word_count,
      words_added: v.words_added || 0,
      words_removed: v.words_removed || 0,
      source: v.source,
      has_content: v.has_content
    })),
    total_versions: versionsResult.rows.length,
    note: versionsResult.rows.length > 0 
      ? 'Use read_version_content(document_id, version_number) to read a specific version'
      : 'No version history available for this document'
  };
}

async function readVersionContent(args, user) {
  const { document_id, version_number, max_length = 10000 } = args;
  
  if (!document_id) {
    return { error: 'document_id is required' };
  }
  if (!version_number) {
    return { error: 'version_number is required' };
  }
  
  // Verify document access
  const docResult = await query(
    'SELECT id, name, original_name FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  
  // Get the specific version
  const versionResult = await query(
    `SELECT 
      dv.version_number, dv.version_label, dv.content_text, dv.change_summary,
      dv.created_by_name, dv.created_at, dv.word_count, dv.source
     FROM document_versions dv
     WHERE dv.document_id = $1 AND dv.version_number = $2`,
    [document_id, version_number]
  );
  
  if (versionResult.rows.length === 0) {
    return { error: `Version ${version_number} not found for this document` };
  }
  
  const v = versionResult.rows[0];
  
  if (!v.content_text) {
    return { 
      error: 'Version content not available',
      note: 'The text content for this version was not saved. Only the current version may be readable via read_document_content.'
    };
  }
  
  const content = v.content_text.substring(0, max_length);
  const truncated = v.content_text.length > max_length;
  
  return {
    document: doc.original_name || doc.name,
    version: v.version_number,
    label: v.version_label,
    edited_by: v.created_by_name || 'Unknown',
    edited_at: v.created_at,
    word_count: v.word_count,
    content: content,
    truncated: truncated,
    total_characters: v.content_text.length,
    note: truncated ? `Showing first ${max_length} characters. Use max_length parameter for more.` : null
  };
}

async function compareVersions(args, user) {
  const { document_id, version1, version2 } = args;
  
  if (!document_id || !version1 || !version2) {
    return { error: 'document_id, version1, and version2 are required' };
  }
  
  // Verify document access
  const docResult = await query(
    'SELECT id, name, original_name FROM documents WHERE id = $1 AND firm_id = $2',
    [document_id, user.firmId]
  );
  
  if (docResult.rows.length === 0) {
    return { error: 'Document not found' };
  }
  
  const doc = docResult.rows[0];
  
  // Get both versions
  const versionsResult = await query(
    `SELECT version_number, content_text, created_by_name, created_at, word_count
     FROM document_versions
     WHERE document_id = $1 AND version_number IN ($2, $3)
     ORDER BY version_number`,
    [document_id, version1, version2]
  );
  
  if (versionsResult.rows.length < 2) {
    return { error: 'One or both versions not found' };
  }
  
  const [older, newer] = versionsResult.rows;
  
  if (!older.content_text || !newer.content_text) {
    return { error: 'Content not available for one or both versions' };
  }
  
  // Simple word-level diff
  const oldWords = older.content_text.split(/\s+/).filter(w => w);
  const newWords = newer.content_text.split(/\s+/).filter(w => w);
  
  const oldSet = new Set(oldWords);
  const newSet = new Set(newWords);
  
  const added = newWords.filter(w => !oldSet.has(w));
  const removed = oldWords.filter(w => !newSet.has(w));
  
  return {
    document: doc.original_name || doc.name,
    comparison: {
      older_version: {
        number: older.version_number,
        edited_by: older.created_by_name,
        edited_at: older.created_at,
        word_count: older.word_count
      },
      newer_version: {
        number: newer.version_number,
        edited_by: newer.created_by_name,
        edited_at: newer.created_at,
        word_count: newer.word_count
      }
    },
    changes: {
      words_added: added.length,
      words_removed: removed.length,
      net_change: added.length - removed.length,
      sample_additions: added.slice(0, 20),
      sample_deletions: removed.slice(0, 20)
    },
    summary: `Version ${newer.version_number} has ${added.length} new words and ${removed.length} removed words compared to version ${older.version_number}.`
  };
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

// =============================================================================
// CHECKPOINT HELPERS - Enable resumable long-running tasks
// =============================================================================

async function saveCheckpoint(taskId, state) {
  try {
    await query(
      `UPDATE ai_tasks SET 
       checkpoint = $1,
       checkpoint_at = NOW(),
       current_step = $2,
       updated_at = NOW()
       WHERE id = $3`,
      [
        JSON.stringify(state),
        state.currentStep || null,
        taskId
      ]
    );
    console.log(`[CHECKPOINT] Saved checkpoint for task ${taskId} at step ${state.stepIndex}`);
  } catch (error) {
    console.error(`[CHECKPOINT] Failed to save checkpoint for task ${taskId}:`, error.message);
  }
}

async function loadCheckpoint(taskId) {
  try {
    const result = await query(
      `SELECT checkpoint, goal, plan, context FROM ai_tasks WHERE id = $1`,
      [taskId]
    );
    if (result.rows.length > 0 && result.rows[0].checkpoint) {
      return JSON.parse(result.rows[0].checkpoint);
    }
  } catch (error) {
    console.error(`[CHECKPOINT] Failed to load checkpoint for task ${taskId}:`, error.message);
  }
  return null;
}

// Resume incomplete tasks on server startup (called from server.js)
async function resumeIncompleteTasks() {
  try {
    const incomplete = await query(
      `SELECT id, user_id, firm_id, goal, plan, checkpoint 
       FROM ai_tasks 
       WHERE status = 'running' 
       AND checkpoint IS NOT NULL
       AND started_at > NOW() - INTERVAL '4 hours'`
    );
    
    console.log(`[RESUME] Found ${incomplete.rows.length} incomplete task(s) to resume`);
    
    for (const task of incomplete.rows) {
      // Get user info for the task
      const userResult = await query(
        `SELECT id, firm_id, first_name, last_name, role FROM users WHERE id = $1`,
        [task.user_id]
      );
      
      if (userResult.rows.length > 0) {
        const user = {
          id: userResult.rows[0].id,
          firmId: userResult.rows[0].firm_id,
          firstName: userResult.rows[0].first_name,
          lastName: userResult.rows[0].last_name,
          role: userResult.rows[0].role
        };
        
        const checkpoint = task.checkpoint ? JSON.parse(task.checkpoint) : null;
        const plan = task.plan ? JSON.parse(task.plan) : [];
        
        console.log(`[RESUME] Resuming task ${task.id}: ${task.goal}`);
        
        // Resume from checkpoint
        processBackgroundTask(task.id, user, task.goal, plan, checkpoint);
      }
    }
  } catch (error) {
    console.error('[RESUME] Error resuming incomplete tasks:', error.message);
  }
}

// Track running tasks globally so we can cancel them
const runningAgents = new Map(); // taskId -> { cancelled: boolean, lastActivity: Date, retryState: {...} }

// =============================================================================
// RESILIENCE UTILITIES FOR BACKGROUND AGENT
// =============================================================================

/**
 * Exponential backoff with jitter for retry logic
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelayMs - Base delay in milliseconds (default 1000)
 * @param {number} maxDelayMs - Maximum delay cap (default 60000)
 * @returns {number} - Delay in milliseconds
 */
function calculateBackoff(attempt, baseDelayMs = 1000, maxDelayMs = 60000) {
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add jitter: random 0-25% of the delay
  const jitter = exponentialDelay * 0.25 * Math.random();
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Classify error types for appropriate handling
 * @param {Error} error - The error to classify
 * @returns {Object} - Error classification with retry strategy
 */
function classifyError(error) {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;
  
  // Rate limiting errors - back off significantly
  if (status === 429 || message.includes('429') || message.includes('rate') || message.includes('quota')) {
    return {
      type: 'rate_limit',
      retryable: true,
      backoffMultiplier: 3, // Longer backoff for rate limits
      maxRetries: 15,
      suggestedDelayMs: 15000
    };
  }
  
  // Transient server errors - retry with normal backoff
  if (status >= 500 || message.includes('timeout') || message.includes('econnreset') || 
      message.includes('socket') || message.includes('network') || message.includes('503') ||
      message.includes('502') || message.includes('500') || message.includes('504')) {
    return {
      type: 'transient',
      retryable: true,
      backoffMultiplier: 1,
      maxRetries: 10,
      suggestedDelayMs: 3000
    };
  }
  
  // Content filter / moderation errors - skip and continue
  if (message.includes('content_filter') || message.includes('content filter') || message.includes('moderation')) {
    return {
      type: 'content_filter',
      retryable: false,
      recoverable: true, // Can continue with different approach
      suggestedDelayMs: 1000
    };
  }
  
  // Token limit errors - need to reduce context
  if (message.includes('token') || message.includes('context_length') || message.includes('maximum context')) {
    return {
      type: 'token_limit',
      retryable: true,
      recoverable: true,
      needsContextReduction: true,
      suggestedDelayMs: 1000
    };
  }
  
  // Authentication errors - not retryable
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden')) {
    return {
      type: 'auth',
      retryable: false,
      recoverable: false,
      suggestedDelayMs: 0
    };
  }
  
  // Unknown errors - retry with caution
  return {
    type: 'unknown',
    retryable: true,
    backoffMultiplier: 2,
    maxRetries: 5,
    suggestedDelayMs: 5000
  };
}

/**
 * Smart context reducer - keeps essential info while reducing token count
 * @param {Array} conversationHistory - Full conversation history
 * @param {Object} context - Additional context about what's important
 * @returns {Array} - Reduced conversation history
 */
function reduceConversationContext(conversationHistory, context = {}) {
  if (conversationHistory.length < 20) return conversationHistory;
  
  const systemMsg = conversationHistory[0]; // Always keep system prompt
  const recentMessages = conversationHistory.slice(-30); // Keep last 30 messages
  
  // Summarize early messages
  const earlyMessages = conversationHistory.slice(1, -30);
  const toolResults = earlyMessages.filter(m => m.role === 'tool');
  const successfulTools = toolResults.filter(m => {
    try {
      const content = JSON.parse(m.content);
      return !content.error;
    } catch { return true; }
  });
  
  // Create a summary of what was done
  const actionsSummary = successfulTools.slice(0, 10).map(m => {
    try {
      const content = JSON.parse(m.content);
      return content.message || content.summary || 'Action completed';
    } catch { return 'Action completed'; }
  }).join('; ');
  
  const summaryMessage = {
    role: 'user',
    content: `[CONTEXT SUMMARY - Earlier in this session you performed these actions: ${actionsSummary}]\n\nContinue working on the current task.`
  };
  
  return [systemMsg, summaryMessage, ...recentMessages];
}

/**
 * Detect if agent is stuck in a loop
 * @param {Array} actions - Recent actions taken
 * @param {number} threshold - Number of similar actions to consider stuck
 * @returns {boolean}
 */
function detectStuckLoop(actions, threshold = 4) {
  if (actions.length < threshold) return false;
  
  const recentActions = actions.slice(-threshold);
  const toolNames = recentActions.map(a => a.tool);
  const uniqueTools = new Set(toolNames);
  
  // If same tool called repeatedly with similar results, likely stuck
  if (uniqueTools.size === 1) {
    const results = recentActions.map(a => a.summary);
    const uniqueResults = new Set(results);
    if (uniqueResults.size <= 2) {
      return true;
    }
  }
  
  // Check for alternating pattern (e.g., search -> no results -> search -> no results)
  if (uniqueTools.size === 2 && recentActions.every((a, i) => a.tool === recentActions[i % 2].tool)) {
    return true;
  }
  
  return false;
}

/**
 * Generate recovery prompt when stuck
 * @param {string} goal - Original goal
 * @param {Array} actions - Actions taken so far
 * @param {string} stuckReason - Why we think it's stuck
 * @returns {string} - Recovery prompt
 */
function generateRecoveryPrompt(goal, actions, stuckReason) {
  const recentTools = [...new Set(actions.slice(-5).map(a => a.tool))].join(', ');
  
  const recoveryStrategies = [
    `You seem to be stuck using ${recentTools} repeatedly. Try a COMPLETELY DIFFERENT approach for: "${goal}". What other tools could help?`,
    `Let's change strategy. Instead of ${recentTools}, try: list_documents, create_note, or get_firm_overview to gather new information.`,
    `The current approach isn't working. Step back and think: what's the SIMPLEST first action for: "${goal}"? Call that tool now.`,
    `Reset and refocus. For the goal "${goal}", what's ONE concrete action you can take right now that's different from ${recentTools}?`,
    `You've tried ${actions.length} actions. Document what you've learned so far with create_note, then try a new approach.`
  ];
  
  return recoveryStrategies[Math.floor(Math.random() * recoveryStrategies.length)];
}

async function startBackgroundTask(args, user) {
  const { goal, plan, estimated_steps, matter_id, client_id } = args;
  
  try {
    // CHECK: Is there already a running task for this user?
    const existingTask = await query(
      `SELECT id, goal FROM ai_tasks WHERE user_id = $1 AND status = 'running' LIMIT 1`,
      [user.id]
    );
    
    if (existingTask.rows.length > 0) {
      const existing = existingTask.rows[0];
      console.log(`[AGENT] User ${user.id} already has running task ${existing.id}`);
      return { 
        error: `You already have a background task running: "${existing.goal}". Please wait for it to complete or cancel it first.`,
        existingTaskId: existing.id,
        existingGoal: existing.goal
      };
    }
    
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
        500, // Max iterations for 15-minute session
        JSON.stringify({ matter_id, client_id })
      ]
    );
    
    const taskId = result.rows[0].id;
    
    // Register this agent as running
    runningAgents.set(taskId, { cancelled: false, userId: user.id });
    
    // Start the ReAct agent loop (dynamic, not fixed plan)
    runReActAgent(taskId, user, goal, { matter_id, client_id });
    
    return {
      status: 'started',
      task_id: taskId,
      message: `Background task started. I'll work on: ${goal}`,
      goal,
      plan: plan || ['Working dynamically to achieve the goal...'],
      estimated_steps: estimated_steps || 20,
      _background_task_started: true
    };
  } catch (error) {
    console.error('Error starting background task:', error);
    return { error: 'Failed to start background task: ' + error.message };
  }
}

// Export for use in cancel endpoint
function cancelRunningAgent(taskId) {
  const agent = runningAgents.get(taskId);
  if (agent) {
    agent.cancelled = true;
    console.log(`[AGENT] Marked task ${taskId} for cancellation`);
    return true;
  }
  return false;
}

// =============================================================================
// REACT AGENT - Dynamic autonomous execution
// =============================================================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate default sub-tasks based on the goal when AI planning fails
 * These are reasonable default work items for legal tasks
 */
function generateDefaultSubTasks(goal, context) {
  const goalLower = goal.toLowerCase();
  const subTasks = [];
  
  // Discovery sub-tasks
  if (context.matter_id) {
    subTasks.push(`Get comprehensive details for the specified matter`);
    subTasks.push(`Review all documents attached to this matter`);
  } else if (goalLower.includes('matter') || goalLower.includes('case')) {
    subTasks.push(`Search for the relevant matter by name or keywords`);
    subTasks.push(`Get full matter details including documents and history`);
  } else if (context.client_id) {
    subTasks.push(`Get comprehensive information about the specified client`);
    subTasks.push(`List all matters associated with this client`);
  } else if (goalLower.includes('client')) {
    subTasks.push(`Search for the relevant client`);
    subTasks.push(`Get client details and associated matters`);
  } else {
    subTasks.push(`Search for relevant matters and clients related to the goal`);
    subTasks.push(`Gather information about the firm's current state`);
  }
  
  // Analysis sub-tasks
  if (goalLower.includes('review') || goalLower.includes('analyze') || goalLower.includes('audit')) {
    subTasks.push(`Analyze key documents for important information`);
    subTasks.push(`Identify any issues or items needing attention`);
  }
  
  if (goalLower.includes('document') || goalLower.includes('draft') || goalLower.includes('prepare')) {
    subTasks.push(`Create or prepare necessary documents`);
  }
  
  // Action sub-tasks
  if (goalLower.includes('email') || goalLower.includes('contact') || goalLower.includes('communicate')) {
    subTasks.push(`Draft any necessary communications (emails)`);
  }
  
  if (goalLower.includes('task') || goalLower.includes('todo') || goalLower.includes('follow')) {
    subTasks.push(`Create follow-up tasks for outstanding items`);
  }
  
  if (goalLower.includes('meeting') || goalLower.includes('schedule') || goalLower.includes('calendar')) {
    subTasks.push(`Schedule any necessary meetings or events`);
  }
  
  if (goalLower.includes('time') || goalLower.includes('billing') || goalLower.includes('invoice')) {
    subTasks.push(`Review and log time entries as appropriate`);
  }
  
  // Always include documentation
  subTasks.push(`Document findings and create summary notes`);
  subTasks.push(`Create any remaining follow-up tasks`);
  subTasks.push(`Final review and completion of work`);
  
  // Ensure we have at least 5 sub-tasks
  while (subTasks.length < 5) {
    subTasks.splice(subTasks.length - 1, 0, `Continue working on: ${goal}`);
  }
  
  // Cap at 10 sub-tasks
  return subTasks.slice(0, 10);
}

/**
 * Background Agent - Runs for 15 minutes with separate prompts
 * 
 * RESILIENT DESIGN:
 * - Exponential backoff with jitter for API errors
 * - Error classification for smart retry strategies
 * - Stuck loop detection and recovery
 * - Periodic checkpointing for potential resumption
 * - Smart context management to avoid token limits
 * - Self-healing conversation resets
 * 
 * The backend drives the conversation by sending prompts based on the initial task.
 * Each prompt is a separate API call, but conversation history is maintained.
 * One prompt at a time - waits for response before sending next.
 */
async function runReActAgent(taskId, user, goal, initialContext = {}) {
  console.log(`[AGENT ${taskId}] ========================================`);
  console.log(`[AGENT ${taskId}] Starting RESILIENT 15-minute background agent session`);
  console.log(`[AGENT ${taskId}] Goal: ${goal}`);
  console.log(`[AGENT ${taskId}] ========================================`);
  
  const startTime = Date.now();
  const maxRuntime = 15 * 60 * 1000; // 15 minutes exactly
  const PROMPT_DELAY_MS = 2000; // 2 seconds between prompts
  const CHECKPOINT_INTERVAL = 30000; // Save checkpoint every 30 seconds
  const HEALTH_CHECK_INTERVAL = 60000; // Health check every minute
  
  let promptCount = 0;
  let actions = [];
  let phase = 'planning'; // Phases: planning, discovery, analysis, action, review
  let lastCheckpointTime = Date.now();
  let lastHealthCheckTime = Date.now();
  
  // Sub-task tracking for autonomous planning
  let subTasks = [];
  let currentSubTaskIndex = 0;
  let subTaskProgress = {};
  
  // Resilience state tracking
  let errorState = {
    consecutiveErrors: 0,
    totalErrors: 0,
    lastErrorType: null,
    retryAttempt: 0,
    contextReductions: 0
  };
  
  // Update the running agent state
  runningAgents.set(taskId, { 
    cancelled: false, 
    userId: user.id, 
    lastActivity: new Date(),
    errorState
  });
  
  // Filter out tools that shouldn't be used in background mode
  const AGENT_TOOLS = TOOLS.filter(t => {
    const name = t.function.name;
    return name !== 'task_complete' && 
           name !== 'request_human_input' && 
           name !== 'send_email' &&
           name !== 'start_background_task';
  });
  
  try {
    await query(
      `UPDATE ai_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId]
    );
    
    // =========================================================================
    // PHASE 1: PLANNING - AI generates sub-tasks for broad goals
    // =========================================================================
    console.log(`[AGENT ${taskId}] Starting PLANNING phase - generating sub-tasks...`);
    
    await query(
      `UPDATE ai_tasks SET current_step = $1, progress = $2 WHERE id = $3`,
      ['Planning: Analyzing your request and creating a work plan...', JSON.stringify({
        phase: 'planning',
        progressPercent: 2,
        currentStep: 'Planning: Analyzing your request...',
        subTasks: [],
        currentSubTask: 0,
        status: 'planning'
      }), taskId]
    );
    
    // Ask AI to generate sub-tasks for the goal
    const planningSystemPrompt = `You are a legal AI assistant planning a 15-minute autonomous work session.

Your job is to break down the user's goal into 5-10 specific, actionable sub-tasks that you can complete in 15 minutes.

Each sub-task should be:
- Specific and actionable (e.g., "Search for the Smith matter" not "Review case")
- Achievable with the available tools
- In logical order

Available tools you can use:
- search_matters, get_matter, list_my_matters - Find and examine cases
- list_clients, get_client - Find and examine clients
- list_documents, read_document_content - Review documents
- create_document, create_note - Create documentation
- create_task, create_event - Schedule work
- draft_email_for_matter - Draft (not send) emails
- log_time - Record time spent

RESPOND WITH ONLY A JSON ARRAY of sub-task descriptions. Example:
["Search for the relevant matter by name", "Get full details of the matter including documents", "Review the key documents in the matter", "Create a summary note with findings", "Create follow-up tasks for next steps"]

Do not include any other text. Just the JSON array.`;

    const planningMessages = [
      { role: 'system', content: planningSystemPrompt },
      { role: 'user', content: `Create a detailed work plan for this goal: "${goal}"\n\n${initialContext.matter_id ? `Working on Matter ID: ${initialContext.matter_id}` : ''}${initialContext.client_id ? `\nWorking with Client ID: ${initialContext.client_id}` : ''}` }
    ];
    
    try {
      const planningResponse = await callAzureOpenAIWithTools(planningMessages, []);
      const planContent = planningResponse.content || '';
      
      // Try to parse the JSON array of sub-tasks
      try {
        // Find JSON array in the response
        const jsonMatch = planContent.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          subTasks = JSON.parse(jsonMatch[0]);
          console.log(`[AGENT ${taskId}] Generated ${subTasks.length} sub-tasks:`);
          subTasks.forEach((task, i) => console.log(`[AGENT ${taskId}]   ${i + 1}. ${task}`));
        }
      } catch (parseError) {
        console.log(`[AGENT ${taskId}] Could not parse sub-tasks from response, using default plan`);
      }
    } catch (planError) {
      console.log(`[AGENT ${taskId}] Planning phase failed, using default plan:`, planError.message);
    }
    
    // If no sub-tasks were generated, create default ones based on the goal
    if (subTasks.length === 0) {
      subTasks = generateDefaultSubTasks(goal, initialContext);
      console.log(`[AGENT ${taskId}] Using ${subTasks.length} default sub-tasks`);
    }
    
    // Ensure we have at least a few sub-tasks
    if (subTasks.length < 3) {
      subTasks = [
        'Gather information about the relevant matters and clients',
        'Analyze documents and data related to the goal',
        'Create documentation and notes on findings',
        'Set up follow-up tasks and schedule any needed events',
        'Review and finalize all work completed'
      ];
    }
    
    // Update database with the generated sub-tasks
    await query(
      `UPDATE ai_tasks SET plan = $1, current_step = $2, progress = $3 WHERE id = $4`,
      [JSON.stringify(subTasks), `Starting: ${subTasks[0]}`, JSON.stringify({
        phase: 'discovery',
        progressPercent: 5,
        currentStep: `Starting: ${subTasks[0]}`,
        subTasks: subTasks,
        currentSubTask: 0,
        totalSubTasks: subTasks.length,
        subTaskProgress: subTasks.map((task, i) => ({ 
          index: i, 
          task, 
          status: i === 0 ? 'in_progress' : 'pending',
          actionsCompleted: 0
        })),
        status: 'working'
      }), taskId]
    );
    
    phase = 'discovery';
    
    // =========================================================================
    // PHASE 2+: EXECUTION - Backend-driven sub-task execution
    // The backend feeds ONE sub-task at a time to the AI
    // AI does NOT see future sub-tasks - only the current assignment
    // =========================================================================
    
    // Build context-only system prompt - NO full task list shown to AI
    const buildSystemPrompt = (currentTask, taskNumber, totalTasks) => `You are an AUTONOMOUS legal AI assistant executing a specific task assignment.

OVERALL GOAL: ${goal}

YOUR CURRENT ASSIGNMENT (Task ${taskNumber} of ${totalTasks}):
>>> ${currentTask} <<<

CONTEXT:
${initialContext.matter_id ? `- Working on Matter ID: ${initialContext.matter_id}` : '- No specific matter (search if needed)'}
${initialContext.client_id ? `- Working with Client ID: ${initialContext.client_id}` : ''}

CRITICAL RULES:
1. You MUST call a tool in EVERY response - text-only responses are NOT allowed
2. Focus ONLY on completing your current assignment: "${currentTask}"
3. Work autonomously - do NOT ask for human input or confirmation
4. If something fails, try a different approach
5. You can DRAFT emails (draft_email_for_matter) but NEVER send them
6. Document important findings with create_note
7. Call the most appropriate tool NOW to complete this assignment

AVAILABLE TOOLS:
- search_matters, get_matter, list_my_matters - Find and examine cases
- list_clients, get_client - Find and examine clients  
- list_documents, read_document_content - Review documents
- create_document, create_note - Create documentation
- create_task, create_event - Schedule work
- draft_email_for_matter - Draft (not send) emails
- log_time - Record time spent

Execute your current assignment: "${currentTask}"
Call a tool NOW.`;

    // Start with first sub-task
    let conversationHistory = [
      { role: 'system', content: buildSystemPrompt(subTasks[0], 1, subTasks.length) }
    ];
    
    let consecutiveNoToolCalls = 0;
    
    console.log(`[AGENT ${taskId}] Backend driving execution - feeding sub-task 1/${subTasks.length}: "${subTasks[0]}"`);
    
    // Send explicit initial instruction for sub-task 1
    conversationHistory.push({
      role: 'user',
      content: `Execute Task 1: "${subTasks[0]}"\n\nCall the most appropriate tool to start this task.`
    });
    
    // Main loop - runs for exactly 15 minutes with resilient error handling
    while (true) {
      const elapsed = Date.now() - startTime;
      const remainingMs = maxRuntime - elapsed;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      
      // Check if time is up
      if (elapsed >= maxRuntime) {
        console.log(`[AGENT ${taskId}] 15 minutes reached. Ending session gracefully.`);
        break;
      }
      
      // Check if task was cancelled (fast in-memory check)
      const agentState = runningAgents.get(taskId);
      if (!agentState || agentState.cancelled) {
        console.log(`[AGENT ${taskId}] Task was cancelled. Stopping immediately.`);
        runningAgents.delete(taskId);
        return; // Exit - status already set to cancelled by the cancel endpoint
      }
      
      // Update last activity timestamp
      agentState.lastActivity = new Date();
      
      // Periodic health check
      if (Date.now() - lastHealthCheckTime > HEALTH_CHECK_INTERVAL) {
        lastHealthCheckTime = Date.now();
        console.log(`[AGENT ${taskId}] Health check: ${actions.length} actions, ${errorState.totalErrors} total errors, phase: ${phase}`);
        
        // Check for stuck loop
        if (detectStuckLoop(actions, 4)) {
          console.log(`[AGENT ${taskId}] Stuck loop detected! Initiating recovery...`);
          const recoveryPrompt = generateRecoveryPrompt(goal, actions, 'stuck_loop');
          conversationHistory.push({ role: 'user', content: recoveryPrompt });
          phase = 'recovery';
        }
      }
      
      // Periodic checkpoint save
      if (Date.now() - lastCheckpointTime > CHECKPOINT_INTERVAL) {
        lastCheckpointTime = Date.now();
        await saveCheckpoint(taskId, {
          promptCount,
          phase,
          actions: actions.slice(-20),
          conversationHistoryLength: conversationHistory.length,
          errorState,
          timestamp: new Date().toISOString()
        });
      }
      
      promptCount++;
      const elapsedMinutes = Math.floor(elapsed / 60000);
      const elapsedSeconds = Math.floor(elapsed / 1000);
      
      // Calculate progress percentage based on time elapsed (15 min = 100%)
      // Cap at 95% while still running - 100% only when complete
      const progressPercent = Math.min(Math.round((elapsed / maxRuntime) * 100), 95);
      
      console.log(`[AGENT ${taskId}] --- Prompt #${promptCount} (${elapsedMinutes}m elapsed, ${remainingMinutes}m remaining, ${progressPercent}%) ---`);
      
      // Update progress in database with progressPercent for the progress bar
      await query(
        `UPDATE ai_tasks SET iterations = $1, progress = $2, updated_at = NOW() WHERE id = $3`,
        [promptCount, JSON.stringify({ 
          promptCount,
          phase,
          actions: actions.slice(-10),
          remainingMinutes,
          elapsedSeconds,
          progressPercent,
          errorCount: errorState.totalErrors,
          status: 'working'
        }), taskId]
      );
      
      // Send prompt to AI with resilient error handling
      let response;
      let retryCount = 0;
      const maxRetries = 10;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`[AGENT ${taskId}] Sending prompt to Azure AI... (attempt ${retryCount + 1})`);
          response = await callAzureOpenAIWithTools(conversationHistory, AGENT_TOOLS);
          console.log(`[AGENT ${taskId}] Received response (tool_calls: ${response.tool_calls?.length || 0})`);
          
          // Success! Reset error state
          errorState.consecutiveErrors = 0;
          errorState.retryAttempt = 0;
          break;
          
        } catch (apiError) {
          retryCount++;
          errorState.consecutiveErrors++;
          errorState.totalErrors++;
          errorState.lastErrorType = apiError.message;
          
          // Classify the error for appropriate handling
          const errorClass = classifyError(apiError);
          console.error(`[AGENT ${taskId}] API error (${errorClass.type}, attempt ${retryCount}/${maxRetries}):`, apiError.message);
          
          // Update progress to show we're recovering
          await query(
            `UPDATE ai_tasks SET current_step = $1, updated_at = NOW() WHERE id = $2`,
            [`Recovering from ${errorClass.type} error (attempt ${retryCount})...`, taskId]
          );
          
          // Handle based on error type
          if (!errorClass.retryable) {
            console.error(`[AGENT ${taskId}] Non-retryable error, attempting recovery...`);
            
            if (errorClass.recoverable) {
              // Try to recover by resetting context
              conversationHistory = reduceConversationContext(conversationHistory, { goal });
              errorState.contextReductions++;
              console.log(`[AGENT ${taskId}] Context reduced for recovery (${errorState.contextReductions} times)`);
            } else {
              // Fatal error - can't continue
              throw apiError;
            }
          }
          
          // Handle token limit errors specially
          if (errorClass.needsContextReduction) {
            console.log(`[AGENT ${taskId}] Token limit hit, reducing context...`);
            conversationHistory = reduceConversationContext(conversationHistory, { goal });
            errorState.contextReductions++;
            retryCount--; // Don't count this as a normal retry
          }
          
          // Calculate backoff delay
          const backoffDelay = calculateBackoff(
            retryCount - 1, 
            errorClass.suggestedDelayMs || 2000,
            60000
          ) * (errorClass.backoffMultiplier || 1);
          
          console.log(`[AGENT ${taskId}] Waiting ${Math.round(backoffDelay/1000)}s before retry...`);
          await delay(backoffDelay);
          
          // Check if we should continue (time check)
          const currentElapsed = Date.now() - startTime;
          if (currentElapsed >= maxRuntime - 30000) { // 30 seconds buffer
            console.log(`[AGENT ${taskId}] Running out of time during retry, ending gracefully`);
            break;
          }
        }
      }
      
      // If all retries failed, try a conversation reset as last resort
      if (!response && retryCount >= maxRetries) {
        console.log(`[AGENT ${taskId}] All retries exhausted, performing full conversation reset...`);
        
        // Reset to minimal state
        conversationHistory = [
          conversationHistory[0], // Keep system prompt
          { 
            role: 'user', 
            content: `[RECOVERY MODE] Previous actions summary: ${actions.slice(-5).map(a => a.summary).join('; ')}\n\nContinue working on: "${goal}". Call a simple tool like list_my_matters or get_firm_overview to start fresh.`
          }
        ];
        errorState.consecutiveErrors = 0;
        
        // Try one more time with fresh context
        try {
          response = await callAzureOpenAIWithTools(conversationHistory, AGENT_TOOLS);
        } catch (e) {
          console.error(`[AGENT ${taskId}] Recovery attempt also failed, waiting and continuing...`);
          await delay(10000);
          continue; // Skip this iteration and try again
        }
      }
      
      if (!response) {
        await delay(PROMPT_DELAY_MS);
        continue;
      }
      
      // Handle response
      if (!response.tool_calls || response.tool_calls.length === 0) {
        // No tool call - AI responded with text only
        consecutiveNoToolCalls++;
        console.log(`[AGENT ${taskId}] No tool call (${consecutiveNoToolCalls} consecutive)`);
        
        // Add AI's response to history
        conversationHistory.push({ 
          role: 'assistant', 
          content: response.content || '' 
        });
        
        // Get current sub-task for context
        const currentTaskDesc = subTasks[currentSubTaskIndex] || goal;
        const taskHeader = `[Task ${currentSubTaskIndex + 1}/${subTasks.length}: "${currentTaskDesc}"]`;
        
        // Escalating prompts to force tool usage - always reference current sub-task
        if (consecutiveNoToolCalls >= 5) {
          // After 5 attempts, reset and try a different phase
          consecutiveNoToolCalls = 0;
          
          console.log(`[AGENT ${taskId}] No tool calls after 5 attempts - sending stronger instruction`);
          
          conversationHistory.push({
            role: 'user',
            content: `${taskHeader}

❌ CRITICAL: You have NOT called any tools. Text responses are NOT allowed.

Your assignment: "${currentTaskDesc}"

You MUST call ONE of these tools NOW:
• list_my_matters - get your matters
• get_firm_overview - get firm info
• list_clients - get clients

NO MORE TEXT. Call a tool immediately.`
          });
        } else if (consecutiveNoToolCalls >= 3) {
          // Stronger prompt after 3 attempts
          conversationHistory.push({
            role: 'user',
            content: `${taskHeader}

⚠️ WARNING: ${consecutiveNoToolCalls} responses without a tool call.

Your assignment: "${currentTaskDesc}"

Call a tool NOW:
• list_my_matters (no arguments needed)
• list_clients (no arguments needed)  
• search_matters({ query: "relevant term" })

Execute one of these tools immediately.`
          });
        } else {
          // Standard prompts - reference current sub-task
          conversationHistory.push({
            role: 'user',
            content: `${taskHeader}

You must call a tool now.
Current assignment: "${currentTaskDesc}"
${remainingMinutes} minutes remaining.

Call a tool to continue.`
          });
        }
        
        await delay(PROMPT_DELAY_MS);
        continue;
      }
      
      // Process ONE tool call (sequential, not parallel)
      consecutiveNoToolCalls = 0;
      const toolCall = response.tool_calls[0];
      const functionName = toolCall.function.name;
      let functionArgs;
      try {
        functionArgs = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        functionArgs = {};
      }
      
      console.log(`[AGENT ${taskId}] Executing: ${functionName}(${JSON.stringify(functionArgs).substring(0, 100)}...)`);
      
      // Execute the tool with error handling
      let toolResult;
      try {
        toolResult = await executeTool(functionName, functionArgs, user, null);
      } catch (toolError) {
        console.error(`[AGENT ${taskId}] Tool execution error:`, toolError.message);
        toolResult = { error: `Tool execution failed: ${toolError.message}` };
      }
      
      // Build action summary
      const actionSummary = toolResult.message || toolResult.summary || 
        (toolResult.document ? `Created: ${toolResult.document.name}` : null) ||
        (toolResult.matter ? `Found: ${toolResult.matter.name}` : null) ||
        (toolResult.matters ? `Found ${toolResult.matters.length} matters` : null) ||
        (toolResult.clients ? `Found ${toolResult.clients.length} clients` : null) ||
        (toolResult.time_entry ? `Logged ${toolResult.time_entry.hours}h` : null) ||
        (toolResult.event ? `Created event: ${toolResult.event.title}` : null) ||
        (toolResult.task ? `Created task: ${toolResult.task.title}` : null) ||
        (toolResult.error ? `Error: ${toolResult.error.substring(0, 50)}` : null) ||
        `Executed ${functionName}`;
      
      actions.push({
        prompt: promptCount,
        tool: functionName,
        args: functionArgs,
        summary: actionSummary,
        success: !toolResult.error,
        timestamp: new Date().toISOString(),
        subTaskIndex: currentSubTaskIndex
      });
      
      console.log(`[AGENT ${taskId}] Result: ${actionSummary}`);
      
      // Track actions per sub-task
      if (!subTaskProgress[currentSubTaskIndex]) {
        subTaskProgress[currentSubTaskIndex] = { actions: 0, completed: false };
      }
      subTaskProgress[currentSubTaskIndex].actions++;
      
      // Check if we should advance to the next sub-task
      // Advance after every 3-5 successful actions or after completing a significant action
      const actionsOnCurrentSubTask = subTaskProgress[currentSubTaskIndex].actions;
      const significantActions = ['create_document', 'create_note', 'create_task', 'create_event', 'log_time', 'draft_email_for_matter'];
      const isSignificantAction = significantActions.includes(functionName) && !toolResult.error;
      
      // Time-based sub-task advancement: divide 15 min into chunks based on sub-task count
      const elapsedMs = Date.now() - startTime;
      const timePerSubTask = maxRuntime / subTasks.length;
      const expectedSubTaskByTime = Math.floor(elapsedMs / timePerSubTask);
      
      // Advance to next sub-task if:
      // 1. We've done 5+ actions on this sub-task, OR
      // 2. We've done a significant action after 3+ actions, OR  
      // 3. Time says we should be on a later sub-task
      const shouldAdvanceSubTask = (
        (actionsOnCurrentSubTask >= 5) ||
        (isSignificantAction && actionsOnCurrentSubTask >= 3) ||
        (expectedSubTaskByTime > currentSubTaskIndex && actionsOnCurrentSubTask >= 2)
      ) && currentSubTaskIndex < subTasks.length - 1;
      
      if (shouldAdvanceSubTask) {
        subTaskProgress[currentSubTaskIndex].completed = true;
        currentSubTaskIndex++;
        
        console.log(`[AGENT ${taskId}] ========================================`);
        console.log(`[AGENT ${taskId}] BACKEND ADVANCING: Feeding sub-task ${currentSubTaskIndex + 1}/${subTasks.length}`);
        console.log(`[AGENT ${taskId}] New assignment: "${subTasks[currentSubTaskIndex]}"`);
        console.log(`[AGENT ${taskId}] ========================================`);
        
        // Update database with new sub-task
        await query(
          `UPDATE ai_tasks SET current_step = $1 WHERE id = $2`,
          [`Starting Task ${currentSubTaskIndex + 1}: ${subTasks[currentSubTaskIndex]}`, taskId]
        );
        
        // BACKEND-DRIVEN: Explicitly send the next sub-task assignment
        // The AI receives a new system context focused on the new sub-task
        conversationHistory.push({
          role: 'user',
          content: `✅ TASK ${currentSubTaskIndex} COMPLETE: "${subTasks[currentSubTaskIndex - 1]}"

═══════════════════════════════════════════════════════════
📋 NEW ASSIGNMENT - TASK ${currentSubTaskIndex + 1} of ${subTasks.length}:
>>> ${subTasks[currentSubTaskIndex]} <<<
═══════════════════════════════════════════════════════════

Focus ONLY on this new task. Call a tool NOW to begin.`
        });
      }
      
      // Calculate progress: blend of time-based (70%) and sub-task-based (30%)
      const timeProgress = Math.min((elapsedMs / maxRuntime) * 100, 95);
      const subTaskProgress_pct = Math.min((currentSubTaskIndex / subTasks.length) * 100, 95);
      const blendedProgress = Math.round((timeProgress * 0.7) + (subTaskProgress_pct * 0.3));
      const currentProgressPercent = Math.min(blendedProgress, 95);
      
      // Build sub-task status array for frontend
      const subTaskStatusArray = subTasks.map((task, i) => ({
        index: i,
        task: task,
        status: i < currentSubTaskIndex ? 'completed' : (i === currentSubTaskIndex ? 'in_progress' : 'pending'),
        actionsCompleted: subTaskProgress[i]?.actions || 0
      }));
      
      const currentSubTaskLabel = `Task ${currentSubTaskIndex + 1}/${subTasks.length}: ${subTasks[currentSubTaskIndex]}`;
      
      await query(
        `UPDATE ai_tasks SET current_step = $1, progress = $2 WHERE id = $3`,
        [currentSubTaskLabel, JSON.stringify({
          promptCount,
          phase,
          actions: actions.slice(-10),
          remainingMinutes: Math.ceil((maxRuntime - elapsedMs) / 60000),
          progressPercent: currentProgressPercent,
          currentStep: actionSummary,
          currentSubTask: currentSubTaskIndex,
          totalSubTasks: subTasks.length,
          subTasks: subTasks,
          subTaskProgress: subTaskStatusArray,
          errorCount: errorState.totalErrors,
          status: 'working'
        }), taskId]
      );
      
      // Add to conversation history
      conversationHistory.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: [toolCall]
      });
      
      conversationHistory.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      });
      
      // Check for stuck loop after each action
      if (detectStuckLoop(actions, 4)) {
        console.log(`[AGENT ${taskId}] Stuck loop detected after action, initiating recovery...`);
        const recoveryPrompt = generateRecoveryPrompt(goal, actions, 'repeated_actions');
        conversationHistory.push({ role: 'user', content: recoveryPrompt });
      } else if (!shouldAdvanceSubTask) {
        // BACKEND-DRIVEN: Send next prompt with explicit sub-task context
        // The AI always knows exactly what it should be working on
        const nextPrompt = generateNextPrompt(goal, functionName, toolResult, actions, remainingMinutes, phase, currentSubTaskIndex, subTasks.length, subTasks);
        conversationHistory.push({ role: 'user', content: nextPrompt });
      }
      
      // Smart conversation history management
      if (conversationHistory.length > 50) {
        console.log(`[AGENT ${taskId}] Reducing conversation history (${conversationHistory.length} messages)`);
        conversationHistory = reduceConversationContext(conversationHistory, { goal, actions });
        console.log(`[AGENT ${taskId}] Reduced to ${conversationHistory.length} messages`);
      }
      
      // Delay before next prompt
      await delay(PROMPT_DELAY_MS);
    }
    
    // Session complete - generate final summary
    const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
    const successfulActions = actions.filter(a => a.success).length;
    const completedSubTasks = Object.values(subTaskProgress).filter(p => p.completed).length + (currentSubTaskIndex > 0 ? 0 : 0);
    // Count how many sub-tasks were worked on (at least partially)
    const subTasksWorkedOn = Math.min(currentSubTaskIndex + 1, subTasks.length);
    
    console.log(`[AGENT ${taskId}] ========================================`);
    console.log(`[AGENT ${taskId}] Session complete`);
    console.log(`[AGENT ${taskId}] Duration: ${elapsedMinutes} minutes`);
    console.log(`[AGENT ${taskId}] Prompts sent: ${promptCount}`);
    console.log(`[AGENT ${taskId}] Actions: ${successfulActions}/${actions.length} successful`);
    console.log(`[AGENT ${taskId}] Sub-tasks worked on: ${subTasksWorkedOn}/${subTasks.length}`);
    console.log(`[AGENT ${taskId}] Total errors encountered: ${errorState.totalErrors}`);
    console.log(`[AGENT ${taskId}] Context reductions: ${errorState.contextReductions}`);
    console.log(`[AGENT ${taskId}] ========================================`);
    
    // Build sub-task completion summary
    const subTaskSummary = subTasks.map((task, i) => {
      const progress = subTaskProgress[i];
      const status = i < currentSubTaskIndex ? '✅' : (i === currentSubTaskIndex ? '🔄' : '⏳');
      const actionCount = progress?.actions || 0;
      return `${status} ${i + 1}. ${task} (${actionCount} actions)`;
    }).join('\n');
    
    // Generate a summary using the AI (with retries)
    let summary = '';
    for (let summaryAttempt = 0; summaryAttempt < 3; summaryAttempt++) {
      try {
        // Use a fresh, minimal context for summary generation
        const summaryMessages = [
          { role: 'system', content: 'You are a legal assistant summarizing work completed.' },
          { 
            role: 'user', 
            content: `Summarize this 15-minute background task session.

GOAL: ${goal}

SUB-TASKS PLANNED (${subTasksWorkedOn}/${subTasks.length} completed):
${subTaskSummary}

ACTIONS COMPLETED (${successfulActions} successful out of ${actions.length}):
${actions.slice(-20).map((a, i) => `${i + 1}. ${a.tool}: ${a.summary} ${a.success ? '✓' : '✗'}`).join('\n')}
${actions.length > 20 ? `... and ${actions.length - 20} more actions` : ''}

Provide a concise summary of what was accomplished, progress on each sub-task, and any recommendations.`
          }
        ];
        
        const summaryResponse = await callAzureOpenAIWithTools(summaryMessages, []);
        summary = summaryResponse.content || '';
        break;
      } catch (e) {
        console.log(`[AGENT ${taskId}] Summary generation attempt ${summaryAttempt + 1} failed:`, e.message);
        if (summaryAttempt === 2) {
          // Fallback summary
          summary = `## Task Summary\n\nCompleted ${successfulActions} actions in ${elapsedMinutes} minutes for: "${goal}"\n\n### Sub-Tasks (${subTasksWorkedOn}/${subTasks.length}):\n${subTaskSummary}\n\n### Recent Actions:\n${actions.slice(-10).map(a => `- ${a.summary}`).join('\n')}`;
        }
        await delay(2000);
      }
    }
    
    // Build final sub-task status
    const finalSubTaskStatus = subTasks.map((task, i) => ({
      index: i,
      task: task,
      status: i < currentSubTaskIndex ? 'completed' : (i === currentSubTaskIndex ? 'in_progress' : 'pending'),
      actionsCompleted: subTaskProgress[i]?.actions || 0
    }));
    
    await query(
      `UPDATE ai_tasks SET status = 'completed', result = $1, summary = $2, progress = $3, completed_at = NOW() WHERE id = $4`,
      [JSON.stringify({ 
        actions,
        totalPrompts: promptCount,
        durationMinutes: elapsedMinutes,
        successfulActions,
        subTasksCompleted: subTasksWorkedOn,
        totalSubTasks: subTasks.length,
        totalErrors: errorState.totalErrors,
        contextReductions: errorState.contextReductions
      }), summary, JSON.stringify({
        promptCount,
        phase: 'complete',
        actions: actions.slice(-10),
        progressPercent: 100,
        currentStep: 'Complete',
        currentSubTask: subTasksWorkedOn - 1,
        totalSubTasks: subTasks.length,
        subTasks: subTasks,
        subTaskProgress: finalSubTaskStatus,
        status: 'completed',
        durationMinutes: elapsedMinutes,
        successfulActions,
        totalErrors: errorState.totalErrors
      }), taskId]
    );
    
    // Clean up - remove from running agents
    runningAgents.delete(taskId);
    console.log(`[AGENT ${taskId}] Cleaned up, task complete`);
    
  } catch (error) {
    console.error(`[AGENT ${taskId}] Fatal error:`, error);
    
    // Try to save what we can before failing
    const elapsedMinutes = Math.round((Date.now() - startTime) / 60000);
    const successfulActions = actions.filter(a => a.success).length;
    
    // Create a partial result summary
    const partialSummary = `Task encountered an error after ${elapsedMinutes} minutes and ${promptCount} prompts. ${successfulActions} actions were completed successfully before the error.\n\nError: ${error.message}`;
    
    // Clean up
    runningAgents.delete(taskId);
    
    await query(
      `UPDATE ai_tasks SET status = 'failed', result = $1, error = $2, summary = $3, progress = $4, completed_at = NOW() WHERE id = $5`,
      [JSON.stringify({ 
        actions,
        totalPrompts: promptCount,
        durationMinutes: elapsedMinutes,
        successfulActions,
        errorState
      }), error.message, partialSummary, JSON.stringify({
        promptCount,
        phase: 'error',
        actions: actions.slice(-10),
        progressPercent: Math.min(Math.round(((Date.now() - startTime) / (15 * 60 * 1000)) * 100), 95),
        currentStep: 'Error: ' + error.message,
        status: 'failed',
        successfulActions,
        totalErrors: errorState.totalErrors
      }), taskId]
    );
  }
}

/**
 * Generate initial task prompts based on the goal
 * These guide the AI through different phases of the task
 */
function generateTaskPrompts(goal, context) {
  const goalLower = goal.toLowerCase();
  const prompts = [];
  
  // Discovery phase prompts
  if (context.matter_id) {
    prompts.push(`Start by getting the details of the matter (ID: ${context.matter_id}). Call get_matter to understand what we're working with.`);
  } else if (goalLower.includes('matter') || goalLower.includes('case')) {
    prompts.push(`First, let's find the relevant matter. Use search_matters to locate it.`);
  } else if (context.client_id) {
    prompts.push(`Start by getting information about the client (ID: ${context.client_id}). Call get_client.`);
  } else if (goalLower.includes('client')) {
    prompts.push(`First, find the relevant client. Use list_clients or search.`);
  } else {
    prompts.push(`Let's start by gathering information. Search for any relevant matters, clients, or documents related to: "${goal}"`);
  }
  
  // Analysis phase prompts
  if (goalLower.includes('review') || goalLower.includes('analyze')) {
    prompts.push(`Now review the documents associated with this matter. Use list_documents and read_document_content to analyze them.`);
  }
  
  if (goalLower.includes('document') || goalLower.includes('draft') || goalLower.includes('prepare')) {
    prompts.push(`Based on what you've found, what documents need to be created or reviewed? List them and start working.`);
  }
  
  // Action phase prompts
  if (goalLower.includes('email') || goalLower.includes('contact')) {
    prompts.push(`Draft any necessary emails using draft_email_for_matter. Don't send - just create drafts.`);
  }
  
  if (goalLower.includes('task') || goalLower.includes('todo') || goalLower.includes('follow')) {
    prompts.push(`Create any necessary follow-up tasks using create_task.`);
  }
  
  if (goalLower.includes('time') || goalLower.includes('billing')) {
    prompts.push(`Review and log any time entries that should be recorded.`);
  }
  
  // Always end with documentation
  prompts.push(`Document your findings and any important notes about this work using create_note.`);
  
  return prompts;
}

/**
 * Generate the next prompt based on what just happened
 * Now includes sub-task context for better guidance
 */
function generateNextPrompt(goal, lastTool, lastResult, actions, remainingMinutes, phase, currentSubTask = null, totalSubTasks = null, subTasks = []) {
  const actionCount = actions.length;
  
  // Get current sub-task description
  const currentTaskDesc = subTasks[currentSubTask] || goal;
  const taskHeader = (currentSubTask !== null && totalSubTasks !== null) 
    ? `[Task ${currentSubTask + 1}/${totalSubTasks}: "${currentTaskDesc}"]` 
    : '';
  
  // If there was an error, acknowledge and suggest alternative
  if (lastResult.error) {
    return `${taskHeader}

⚠️ That action failed: ${lastResult.error}

Try a different approach to complete your current task: "${currentTaskDesc}"
Call another tool NOW.`;
  }
  
  // Context-aware follow-up based on what tool was just used
  // Each prompt reminds the AI of its current assignment
  switch (lastTool) {
    case 'get_matter':
    case 'search_matters':
      return `${taskHeader}

✓ Matter information received. 
→ Continue your task: "${currentTaskDesc}"
→ Next step: Check documents, review details, or take action.
Call a tool NOW.`;
    
    case 'get_client':
    case 'list_clients':
      return `${taskHeader}

✓ Client information received.
→ Continue your task: "${currentTaskDesc}"  
→ Next step: Look at their matters, documents, or communications.
Call a tool NOW.`;
    
    case 'list_documents':
      return `${taskHeader}

✓ Documents found.
→ Continue your task: "${currentTaskDesc}"
→ Next step: Use read_document_content on the most relevant ones.
Call a tool NOW.`;
    
    case 'read_document_content':
      return `${taskHeader}

✓ Document content retrieved.
→ Continue your task: "${currentTaskDesc}"
→ Next step: Use this information to take action or gather more data.
Call a tool NOW.`;
    
    case 'create_document':
    case 'create_note':
      return `${taskHeader}

✓ Document/note created successfully.
→ Continue your task: "${currentTaskDesc}"
→ ${remainingMinutes} minutes remaining.
Call a tool NOW.`;
    
    case 'draft_email_for_matter':
      return `${taskHeader}

✓ Email draft created.
→ Continue your task: "${currentTaskDesc}"
Call a tool NOW.`;
    
    case 'create_task':
    case 'create_event':
      return `${taskHeader}

✓ Task/event created.
→ Continue your task: "${currentTaskDesc}"
Call a tool NOW.`;
    
    case 'log_time':
      return `${taskHeader}

✓ Time logged.
→ Continue your task: "${currentTaskDesc}"
Call a tool NOW.`;
    
    default:
      // Generic continuation - always remind of current task
      if (remainingMinutes > 10) {
        return `${taskHeader}

✓ Action completed.
→ Continue your task: "${currentTaskDesc}"
→ ${remainingMinutes} minutes remaining - be thorough.
Call a tool NOW.`;
      } else if (remainingMinutes > 5) {
        return `${taskHeader}

✓ Action completed.
→ ${remainingMinutes} minutes left.
→ Focus on completing: "${currentTaskDesc}"
Call a tool NOW.`;
      } else {
        return `${taskHeader}

⏰ Only ${remainingMinutes} minutes left!
→ Wrap up your current task: "${currentTaskDesc}"
→ Document any important findings with create_note.
Call a tool NOW.`;
      }
  }
}

/**
 * Generate a continuation prompt when the AI hasn't called a tool
 * These prompts keep the agent working for the full 15 minutes
 */
function generateContinuationPrompt(goal, actions, remainingMinutes, phase, currentSubTask = null, subTasks = []) {
  const currentTaskDesc = subTasks[currentSubTask] || goal;
  const taskHeader = (currentSubTask !== null && subTasks.length > 0)
    ? `[Task ${currentSubTask + 1}/${subTasks.length}: "${currentTaskDesc}"]\n\n`
    : '';
  
  if (actions.length === 0) {
    return `${taskHeader}❌ You have NOT called any tools yet.

Your current task: "${currentTaskDesc}"

Call a tool NOW:
• search_matters - find relevant cases
• list_clients - see who's involved
• get_firm_overview - understand current state

Execute a tool immediately.`;
  }
  
  const recentActions = actions.slice(-3).map(a => a.summary).join(', ');
  const actionCount = actions.length;
  
  // Sub-task focused prompts - always remind AI of current assignment
  return `${taskHeader}⚠️ You must call a tool in every response.

Your current task: "${currentTaskDesc}"
Recent progress: ${recentActions}
${remainingMinutes} minutes remaining.

Suggested tools:
• search_matters, list_documents - gather more info
• read_document_content - analyze documents
• create_note, create_task - document findings

Call a tool NOW to continue your task.`;
}

// =============================================================================
// LEGACY Background task processor (kept for backwards compatibility)
// =============================================================================

async function processBackgroundTask(taskId, user, goal, plan, resumeCheckpoint = null) {
  console.log(`[BACKGROUND] ========================================`);
  console.log(`[BACKGROUND] ${resumeCheckpoint ? 'RESUMING' : 'Starting'} task ${taskId}`);
  console.log(`[BACKGROUND] Goal: ${goal}`);
  console.log(`[BACKGROUND] Plan has ${(plan || []).length} steps`);
  if (plan && plan.length > 0) {
    plan.forEach((step, i) => console.log(`[BACKGROUND]   ${i + 1}. ${step}`));
  } else {
    console.log(`[BACKGROUND] WARNING: No plan steps provided!`);
  }
  if (resumeCheckpoint) {
    console.log(`[BACKGROUND] Resuming from step ${resumeCheckpoint.stepIndex + 1}`);
  }
  console.log(`[BACKGROUND] ========================================`);
  
  const startTime = Date.now();
  const maxRuntime = 15 * 60 * 1000; // 15 minutes for background agent sessions
  
  // Restore from checkpoint or start fresh
  let progress = resumeCheckpoint?.progress || [];
  let stepResults = resumeCheckpoint?.stepResults || [];
  let contextData = resumeCheckpoint?.contextData || {};
  let startStepIndex = resumeCheckpoint?.stepIndex || 0;
  
  // Delay between each step - fast enough to get work done, slow enough for UI updates
  // 15 minutes = 900 seconds. With 2 second delays, we can do ~450 steps
  const STEP_DELAY_MS = 2 * 1000; // 2 seconds between steps
  
  try {
    // Update status to running
    await query(
      `UPDATE ai_tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
      [taskId]
    );
    
    // Build the system prompt with attorney mindset
    const baseSystemPrompt = getSystemPrompt()
      .replace('{{USER_ROLE}}', user.role || 'staff')
      .replace('{{USER_NAME}}', `${user.firstName || ''} ${user.lastName || ''}`);
    
    const attorneyInstructions = `

## AUTONOMOUS LEGAL AGENT - INTELLIGENT EXECUTION

You are an intelligent autonomous agent that thinks strategically and executes decisively. You understand legal work and act like a skilled senior attorney.

### CORE PRINCIPLES:

1. **THINK STRATEGICALLY** - Understand the full picture before acting
2. **ACT DECISIVELY** - Call the right tool immediately  
3. **BE THOROUGH** - Complete work to professional standards
4. **ADD VALUE** - Do more than the minimum when helpful
5. **TRACK YOUR TIME** - Always log billable time for substantive work

### INTELLIGENT TOOL SELECTION:

**When you need INFORMATION:**
- "Find/Search/Locate matter" → search_matters
- "Get/Review/Examine matter" → get_matter (with matter_id)
- "Find/Search client" → list_clients
- "Get client details" → get_client (with client_id)
- "Read documents" → read_document_content, get_matter_documents_content

**When you need to CREATE DOCUMENTS:**
- "Draft/Prepare/Create/Write [document]" → create_document (creates PDFs!)
- "Draft email" → draft_email_for_matter
- Always include matter_id if you have it
- Write complete, professional legal content

**When you need to RECORD information:**
- "Add note/Record/Document" → add_matter_note (ALWAYS use this after each step!)
- "Log time/Bill" → log_time (MANDATORY - track all work!)
- "Update matter" → update_matter

**When you need to SCHEDULE:**
- "Schedule/Calendar/Deadline/Meeting" → create_calendar_event
- "Task/To-do/Follow-up/Action item" → create_task

**When you need to CREATE records:**
- "Create/Open new matter" → create_matter
- "Create/Add new client" → create_client

### 🕐 TIME TRACKING - USER CONTROLLED

**IMPORTANT: Do NOT automatically log time. Only log time when the user explicitly tells you how much time to log.**

If the user says something like:
- "Log 0.5 hours for this work" → log_time with hours: 0.5
- "Bill 30 minutes" → log_time with hours: 0.5
- "Track 1 hour" → log_time with hours: 1.0

If the user asks you to track time but doesn't specify the amount:
- Ask them: "How much time should I log for this work?"
- Do NOT guess or estimate the time yourself

When logging time (only when user specifies):
- matter_id: The matter you're working on
- hours: The EXACT amount the user specified
- description: Specific description of work done
- billable: true (unless user says otherwise)

### DOCUMENT CREATION STANDARDS:

When creating documents (which are now PDFs!), produce COMPLETE professional work:

**Agreements/Contracts:**
- Full identification of parties with addresses
- Recitals explaining the context
- Definitions of key terms
- All substantive obligations
- Representations and warranties
- Default and remedies
- Term and termination
- Miscellaneous provisions (notices, governing law, etc.)
- Signature blocks

**Legal Memos:**
- Executive summary with conclusion
- Statement of facts
- Issues presented
- Applicable law
- Analysis/discussion
- Conclusion and recommendations

**Engagement/Retainer Letters:**
- Scope of representation
- Fee arrangement (hourly, flat, contingent)
- Billing practices
- Retainer amount
- Client responsibilities
- Termination provisions

**Client Communications/Emails:**
- Use draft_email_for_matter for case-related emails
- Professional tone, clear action items
- Reference matter/case number

### CREATIVE TASK GENERATION - BE COMPREHENSIVE!

**THINK BIG. Generate LOTS of useful tasks.** Don't just do the minimum - think about everything that would genuinely help the user. Be creative and thorough.

When the user asks for something, brainstorm ALL the related things you could do:
- What documents might be needed?
- What emails should be drafted?
- What calendar events should be scheduled?
- What tasks/reminders should be created?
- What notes should be recorded?
- What information should be gathered first?
- What follow-up actions are needed?

**Example: User says "prepare for the Smith deposition"**
A creative agent might generate 15+ tasks:
1. Search for the Smith matter
2. Get all matter details and documents
3. Read the complaint to understand allegations
4. Read the answer to understand defenses
5. Read any prior discovery responses
6. Read relevant contracts or agreements
7. Identify key witnesses mentioned in documents
8. Draft deposition outline with key topics
9. Draft list of proposed exhibits
10. Create deposition prep checklist document
11. Draft witness preparation memo
12. Schedule deposition prep meeting on calendar
13. Create task to send deposition notice
14. Create task to coordinate court reporter
15. Create task to reserve conference room
16. Add comprehensive notes summarizing prep work
17. Draft email to client about deposition prep

**Example: User says "onboard new client Acme Corp"**
Think of EVERYTHING needed:
1. Create the client record with all details
2. Search for any existing related matters
3. Create the new matter
4. Draft engagement letter with scope and fees
5. Draft conflict check memo
6. Draft welcome email to client
7. Draft fee agreement if separate from engagement
8. Create task for client to sign engagement
9. Create task to set up billing preferences
10. Create task to collect client documents
11. Schedule kickoff call on calendar
12. Create onboarding checklist as tasks
13. Draft internal memo introducing new client
14. Add notes about client preferences and contacts

**The more helpful tasks you create, the more value you provide!**

### DELIVER REAL VALUE - NO BULLSHIT:

**MANDATORY: ALWAYS ADD MATTER NOTES**
After EVERY action, add a note to the matter documenting what you did. No exceptions.
Use add_matter_note with the matter_id after every substantive step.

**NO SLOP. NO FLUFF. ONLY VALUE.**

❌ DON'T write generic filler like:
- "This agreement is entered into..."
- "The parties hereby agree..."
- Template garbage that says nothing

✅ DO write specific, useful content:
- Actual terms that matter
- Real provisions with substance
- Specific names, dates, amounts
- Actionable information

**DOCUMENTS:** Write content a lawyer would actually use. No placeholder sections. Real terms, real language, ready to use.

**NOTES:** State what you did and what matters.

**TIME ENTRIES:** Describe actual work specifically:
- ✅ "Drafted settlement agreement outlining payment terms of $50,000 over 12 months"
- ❌ "Worked on contract matters"

### EXECUTION RULES:

1. **ALWAYS call a tool** - Never respond with only text
2. **USE CONTEXT** - If you have a matter_id or client_id, use it in EVERY tool call
3. **BE SPECIFIC** - Provide complete, detailed arguments to tools
4. **NO QUESTIONS** - Make reasonable assumptions and proceed
5. **QUALITY OVER SPEED** - Take your time to produce impressive work
6. **DOCUMENT EVERYTHING** - Add notes to the matter after each step
7. **TIME TRACKING** - Only log time when the user specifies the amount

DELIVER WORK THAT IMPRESSES. EXECUTE NOW.`;

    const systemPrompt = baseSystemPrompt + attorneyInstructions;
    
    const planSteps = plan || [];
    const totalSteps = planSteps.length;
    
    // Update total step count in database
    await query(
      `UPDATE ai_tasks SET step_count = $1 WHERE id = $2`,
      [totalSteps, taskId]
    );
    
    // =========================================================================
    // SYSTEM-CONTROLLED STEP-BY-STEP EXECUTION WITH PERSISTENT CONTEXT
    // The system iterates through each step, maintaining full conversation history
    // so the AI remembers everything from previous steps
    // =========================================================================
    
    // Initialize or restore conversation - this persists across ALL steps
    let messages;
    
    if (resumeCheckpoint?.messages && resumeCheckpoint.messages.length > 0) {
      // Restore conversation from checkpoint
      messages = resumeCheckpoint.messages;
      console.log(`[BACKGROUND ${taskId}] Restored ${messages.length} messages from checkpoint`);
    } else {
      // Fresh start - initialize conversation with system prompt
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `You are executing a background task with ${totalSteps} steps.

**GOAL:** ${goal}

**PLAN:**
${planSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

I will prompt you for each step one at a time. Execute each step by calling the appropriate tool.
Remember everything from previous steps - you have the full conversation context.

Ready to begin.` }
      ];
      
      // Add initial assistant acknowledgment
      messages.push({ 
        role: 'assistant', 
        content: `I understand. I will execute each of the ${totalSteps} steps for the goal: "${goal}". I'll maintain context throughout and use information from previous steps. Ready for Step 1.` 
      });
    }
    
    for (let stepIndex = startStepIndex; stepIndex < totalSteps; stepIndex++) {
      // Check timeout
      if ((Date.now() - startTime) > maxRuntime) {
        console.log(`[BACKGROUND ${taskId}] Timeout reached at step ${stepIndex + 1}`);
        break;
      }
      
      const currentStep = planSteps[stepIndex];
      const stepNumber = stepIndex + 1;
      
      // Calculate progress as percentage of steps completed
      const progressPercent = Math.round((stepIndex / totalSteps) * 100);
      
      console.log(`[BACKGROUND ${taskId}] ===== STEP ${stepNumber}/${totalSteps} (${progressPercent}%): ${currentStep} =====`);
      
      // Update progress in database with percentage
      await query(
        `UPDATE ai_tasks SET iterations = $1, progress = $2, current_step = $3, updated_at = NOW() WHERE id = $4`,
        [stepNumber, JSON.stringify({ 
          steps: progress, 
          currentStep: currentStep,
          progressPercent: progressPercent,
          completedSteps: stepIndex,
          totalSteps: totalSteps
        }), currentStep, taskId]
      );
      
      // Build the step prompt - simple and direct since AI has full context
      let stepPrompt = `## STEP ${stepNumber} OF ${totalSteps}

**Execute now:** ${currentStep}

Call the appropriate tool to complete this step. You have full context from previous steps.`;
      
      // Add the step prompt to the conversation
      messages.push({ role: 'user', content: stepPrompt });
      
      // Call AI for this step
      console.log(`[BACKGROUND ${taskId}] Step ${stepNumber}: Calling AI...`);
      let response;
      try {
        response = await callAzureOpenAIWithTools(messages, TOOLS);
        console.log(`[BACKGROUND ${taskId}] Step ${stepNumber}: AI response received. Tool calls: ${response.tool_calls?.length || 0}`);
      } catch (apiError) {
        console.error(`[BACKGROUND ${taskId}] Step ${stepNumber}: AI API error:`, apiError.message);
        // Mark step as failed but continue
        progress.push({
          iteration: stepNumber,
          tool: null,
          status: 'api_error',
          error: apiError.message,
          progressPercent: progressPercent,
          timestamp: new Date().toISOString()
        });
        // Remove the failed step prompt and continue
        messages.pop();
        continue;
      }
      
      // Handle the response - may need multiple attempts if AI doesn't use tools
      let attempts = 0;
      const maxAttempts = 3;
      
      while (!response.tool_calls && attempts < maxAttempts) {
        attempts++;
        console.log(`[BACKGROUND ${taskId}] Step ${stepNumber}: No tool call (attempt ${attempts}). Prompting again...`);
        
        // Add the non-tool response to context
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ 
          role: 'user', 
          content: `You must call a tool to complete this step. Execute: ${currentStep}`
        });
        
        await delay(500);
        response = await callAzureOpenAIWithTools(messages, TOOLS);
      }
      
      // Process the tool call if we got one
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolCall = response.tool_calls[0];
        const functionName = toolCall.function.name;
        let functionArgs;
        try {
          functionArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          functionArgs = {};
        }
        
        console.log(`[BACKGROUND ${taskId}] Step ${stepNumber}: Calling ${functionName}`);
        const result = await executeTool(functionName, functionArgs, user, null);
        
        // Add the assistant's tool call to conversation
        messages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: [toolCall]
        });
        
        // Add the tool result to conversation - THIS IS KEY FOR CONTEXT
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
        
        // Also update contextData for backwards compatibility
        if (functionName === 'get_matter' || functionName === 'search_matters') {
          if (result.matter) {
            contextData.matter = result.matter;
            if (result.matter.client_id && !contextData.client) {
              contextData.client = { id: result.matter.client_id, display_name: result.matter.client_name };
            }
          } else if (result.matters && result.matters.length > 0) {
            contextData.matter = result.matters[0];
            if (result.matters[0].client_id && !contextData.client) {
              contextData.client = { id: result.matters[0].client_id, display_name: result.matters[0].client_name };
            }
          }
        }
        if (functionName === 'get_client' || functionName === 'list_clients') {
          if (result.client) {
            contextData.client = result.client;
          } else if (result.clients && result.clients.length > 0) {
            contextData.client = result.clients[0];
          }
        }
        if (functionName === 'create_matter' && result.matter) {
          contextData.matter = result.matter;
        }
        if (functionName === 'create_client' && result.client) {
          contextData.client = result.client;
        }
        if (functionName === 'create_document') {
          if (!contextData.documents) contextData.documents = [];
          contextData.documents.push({
            name: result.document?.name || functionArgs.name,
            id: result.document?.id
          });
        }
        if (functionName === 'create_calendar_event') {
          if (!contextData.events) contextData.events = [];
          contextData.events.push({
            title: result.event?.title || functionArgs.title
          });
        }
        if (functionName === 'create_note') {
          if (!contextData.notes) contextData.notes = [];
          contextData.notes.push({
            title: result.note?.title || functionArgs.title
          });
        }
        if (functionName === 'add_matter_note') {
          if (!contextData.notes) contextData.notes = [];
          contextData.notes.push({
            content: functionArgs.content?.substring(0, 100)
          });
        }
        if (functionName === 'create_task') {
          if (!contextData.tasks) contextData.tasks = [];
          contextData.tasks.push({
            title: result.task?.title || functionArgs.title
          });
        }
        
        // Store step result
        const stepSummary = result.message || result.summary || 
          (result.document ? `Created document: ${result.document.name}` : null) ||
          (result.matter ? `Found matter: ${result.matter.name}` : null) ||
          (result.event ? `Created event: ${result.event.title}` : null) ||
          (result.note ? `Created note: ${result.note.title}` : null) ||
          (functionName === 'create_calendar_event' ? `Created calendar event` : null) ||
          (functionName === 'create_note' ? `Created note` : null) ||
          (functionName === 'add_matter_note' ? `Added note to matter` : null) ||
          `Executed ${functionName}`;
        
        // Add follow-up encouragement message after each completed step
        // This keeps the AI motivated and reminds it of important actions
        const encouragementMessages = [
          "Excellent work! Keep going - you're making great progress.",
          "Perfect execution. Continue with the next step.",
          "Well done! The work is coming together nicely.",
          "Great job on that step. Proceed to the next one.",
          "Solid work. Keep the momentum going."
        ];
        const encouragement = encouragementMessages[stepNumber % encouragementMessages.length];
        
        // Check if this was a substantive action that should have a matter note
        const substantiveActions = ['create_document', 'draft_email_for_matter', 'create_calendar_event', 'create_task', 'log_time', 'update_matter', 'close_matter'];
        const didSubstantiveAction = substantiveActions.includes(functionName);
        const matterId = contextData.matter?.id || functionArgs.matter_id;
        
        // Add follow-up message reminding AI to document work
        let followUpContent = `✅ Step ${stepNumber} complete: ${stepSummary}\n\n${encouragement}`;
        
        if (didSubstantiveAction && matterId && functionName !== 'add_matter_note') {
          followUpContent += `\n\n📝 **REMINDER:** You just completed substantive work. Before proceeding, add a note to the matter documenting what you did using add_matter_note.`;
        }
        
        if (stepIndex < totalSteps - 1) {
          followUpContent += `\n\nProceed immediately to the next step.`;
        }
        
        messages.push({ role: 'user', content: followUpContent });
        
        stepResults.push({
          step: stepNumber,
          stepDescription: currentStep,
          tool: functionName,
          args: functionArgs,
          summary: stepSummary,
          timestamp: new Date().toISOString()
        });
        
        // Calculate progress percentage after completing step
        const completedPercent = Math.round(((stepIndex + 1) / totalSteps) * 100);
        
        // Track progress
        progress.push({
          iteration: stepNumber,
          tool: functionName,
          status: 'completed',
          summary: stepSummary,
          progressPercent: completedPercent,
          timestamp: new Date().toISOString()
        });
        
        // Update progress in database with accurate percentage
        await query(
          `UPDATE ai_tasks SET iterations = $1, progress = $2, current_step = $3, updated_at = NOW() WHERE id = $4`,
          [stepNumber, JSON.stringify({ 
            steps: progress,
            progressPercent: completedPercent,
            completedSteps: stepIndex + 1,
            totalSteps: totalSteps
          }), stepIndex < totalSteps - 1 ? planSteps[stepIndex + 1] : 'Complete', taskId]
        );
        
        console.log(`[BACKGROUND ${taskId}] Step ${stepNumber}/${totalSteps} (${completedPercent}%): Completed - ${stepSummary}`);
        
      } else {
        // AI failed to call a tool after multiple attempts
        console.log(`[BACKGROUND ${taskId}] Step ${stepNumber}: Failed to get tool call after ${maxAttempts} attempts`);
        
        stepResults.push({
          step: stepNumber,
          stepDescription: currentStep,
          tool: null,
          result: { error: 'AI did not execute a tool' },
          summary: 'Step skipped - no tool executed',
          timestamp: new Date().toISOString()
        });
        
        progress.push({
          iteration: stepNumber,
          tool: null,
          status: 'skipped',
          timestamp: new Date().toISOString()
        });
        
        // Update progress even for skipped steps
        await query(
          `UPDATE ai_tasks SET iterations = $1, progress = $2, current_step = $3, updated_at = NOW() WHERE id = $4`,
          [stepNumber, JSON.stringify({ 
            steps: progress,
            progressPercent: Math.round((stepIndex / totalSteps) * 100),
            completedSteps: stepIndex,
            totalSteps: totalSteps,
            currentStep: currentStep
          }), currentStep, taskId]
        );
      }
      
      // Save checkpoint after each step for resumability (including conversation context)
      await saveCheckpoint(taskId, {
        stepIndex: stepIndex + 1, // Next step to execute
        currentStep: stepIndex < totalSteps - 1 ? planSteps[stepIndex + 1] : 'Completed',
        progress,
        stepResults,
        contextData,
        messages: messages // Save full conversation for context restoration
      });
      
      // Delay before next step - gives time for user to see progress
      if (stepIndex < totalSteps - 1) {
        console.log(`[BACKGROUND ${taskId}] Waiting ${STEP_DELAY_MS/1000}s before next step...`);
        await delay(STEP_DELAY_MS);
      }
    }
    
    // =========================================================================
    // FINAL SUMMARY - Ask AI to create comprehensive summary for the user
    // =========================================================================
    
    console.log(`[BACKGROUND ${taskId}] All steps completed. Generating summary...`);
    
    // Count what was accomplished
    const documentsCreated = stepResults.filter(r => r.tool === 'create_document').length + 
                             progress.filter(p => p.tool === 'create_document').length;
    const notesAdded = progress.filter(p => p.tool === 'add_matter_note').length +
                       stepResults.filter(r => r.tool === 'add_matter_note').length;
    const timeLogged = progress.filter(p => p.tool === 'log_time').length +
                       stepResults.filter(r => r.tool === 'log_time').length;
    const eventsCreated = progress.filter(p => p.tool === 'create_calendar_event').length +
                          stepResults.filter(r => r.tool === 'create_calendar_event').length;
    const tasksCreated = progress.filter(p => p.tool === 'create_task').length +
                         stepResults.filter(r => r.tool === 'create_task').length;
    const emailsDrafted = progress.filter(p => p.tool === 'draft_email' || p.tool === 'draft_email_for_matter').length +
                          stepResults.filter(r => r.tool === 'draft_email' || r.tool === 'draft_email_for_matter').length;
    
    const summaryPrompt = `CREATE A COMPREHENSIVE SUMMARY for the user.

ORIGINAL GOAL: ${goal}

WORK COMPLETED:
${stepResults.map((r, i) => `Step ${i + 1}: ${r.stepDescription}
  → ${r.tool}: ${r.summary}`).join('\n\n')}

STATISTICS:
- Total steps completed: ${stepResults.length}
- Documents created (PDFs): ${documentsCreated}
- Emails drafted: ${emailsDrafted}
- Notes added: ${notesAdded}
- Time entries logged: ${timeLogged}
- Calendar events created: ${eventsCreated}
- Tasks created: ${tasksCreated}
- Additional follow-up actions: ${progress.length - stepResults.length}

Call task_complete with a detailed summary that includes:
1. What was accomplished (be specific about documents, notes, etc.)
2. Key actions taken in order
3. What the user should review or do next
4. Any recommendations

This summary will be shown to the user when they click "View Summary".`;

    const summaryMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: summaryPrompt }
    ];
    
    const summaryResponse = await callAzureOpenAIWithTools(summaryMessages, TOOLS);
    
    let finalSummary = '';
    
    if (summaryResponse.tool_calls) {
      const toolCall = summaryResponse.tool_calls[0];
      if (toolCall.function.name === 'task_complete') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          finalSummary = `## Summary\n${args.summary || 'Task completed successfully.'}\n\n`;
          if (args.actions_taken?.length) {
            finalSummary += `## Actions Taken\n${args.actions_taken.map(a => `• ${a}`).join('\n')}\n\n`;
          }
          if (args.results) {
            finalSummary += `## Results\n${args.results}\n\n`;
          }
          if (args.recommendations?.length) {
            finalSummary += `## Recommendations\n${args.recommendations.map(r => `• ${r}`).join('\n')}\n\n`;
          }
        } catch (e) {
          console.error(`[BACKGROUND ${taskId}] Error parsing summary:`, e);
        }
      }
    }
    
    // Always include stats at the end
    const statsSection = `## Work Statistics
• Steps completed: ${stepResults.length}/${totalSteps}
• Documents created (PDFs): ${documentsCreated}
• Emails drafted: ${emailsDrafted}
• Matter notes added: ${notesAdded}
• Time entries logged: ${timeLogged}
• Calendar events: ${eventsCreated}
• Tasks created: ${tasksCreated}`;
    
    if (!finalSummary) {
      // Build summary from step results if AI didn't provide one
      finalSummary = `## Summary\nCompleted background task: ${goal}\n\n`;
      finalSummary += `## Steps Completed\n${stepResults.map((r, i) => `${i + 1}. **${r.stepDescription}**\n   ${r.summary}`).join('\n\n')}\n\n`;
    }
    
    finalSummary += statsSection;
    
    // Mark task complete
    await query(
      `UPDATE ai_tasks SET status = 'completed', completed_at = NOW(), iterations = $1, progress = $2, result = $3 WHERE id = $4`,
      [totalSteps, JSON.stringify({ 
        steps: progress,
        progressPercent: 100,
        completedSteps: totalSteps,
        totalSteps: totalSteps
      }), finalSummary, taskId]
    );
    
    console.log(`[BACKGROUND] Task ${taskId} completed successfully`);
    
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
  const { action, result, next_step, reflection, quality_rating, improvement_idea } = args;
  
  console.log(`[AI WORK LOG] Action: ${action}`);
  if (result) console.log(`[AI WORK LOG] Result: ${result}`);
  if (next_step) console.log(`[AI WORK LOG] Next: ${next_step}`);
  if (reflection) console.log(`[AI WORK LOG] Reflection: ${reflection}`);
  if (quality_rating) console.log(`[AI WORK LOG] Quality: ${quality_rating}/10`);
  if (improvement_idea) console.log(`[AI WORK LOG] Improvement: ${improvement_idea}`);
  
  const response = {
    status: 'logged',
    action,
    result: result || 'Completed',
    next_step: next_step || 'Continue with plan',
    timestamp: new Date().toISOString()
  };
  
  // Include self-improvement data if provided
  if (reflection) {
    response.reflection = reflection;
    response.self_improvement = {
      insight_captured: true,
      quality_rating: quality_rating || null,
      improvement_idea: improvement_idea || null,
      message: 'Great! Your reflection has been captured. Apply this learning to your next step.'
    };
  }
  
  return response;
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

// Helper to get platform settings from database (with caching)
let platformSettingsCache = null;
let platformSettingsCacheTime = 0;
const PLATFORM_CACHE_TTL = 5000; // 5 seconds

async function getPlatformSettings() {
  const now = Date.now();
  if (platformSettingsCache && (now - platformSettingsCacheTime) < PLATFORM_CACHE_TTL) {
    return platformSettingsCache;
  }
  
  try {
    const result = await query('SELECT key, value FROM platform_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    platformSettingsCache = settings;
    platformSettingsCacheTime = now;
    return settings;
  } catch (error) {
    console.log('Platform settings not available, using ENV variables');
    return {};
  }
}

async function getCredential(dbKey, envKey, defaultValue = '') {
  const settings = await getPlatformSettings();
  return settings[dbKey] || process.env[envKey] || defaultValue;
}

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
    // Get credentials from database first, then fall back to env vars
    const MS_TENANT = await getCredential('microsoft_tenant', 'MICROSOFT_TENANT', 'common');
    const MS_CLIENT_ID = await getCredential('microsoft_client_id', 'MICROSOFT_CLIENT_ID');
    const MS_CLIENT_SECRET = await getCredential('microsoft_client_secret', 'MICROSOFT_CLIENT_SECRET');
    
    if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) {
      console.error('Microsoft OAuth credentials not configured');
      return null;
    }
    
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
      console.error('Failed to refresh Outlook token:', newTokens.error_description || newTokens.error);
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
  
  // Handle document attachments
  if (args.document_ids && args.document_ids.length > 0) {
    const attachments = [];
    
    for (const docId of args.document_ids) {
      try {
        // Get document info
        const docResult = await query(
          `SELECT name, original_name, path, azure_path, folder_path, type FROM documents WHERE id = $1 AND firm_id = $2`,
          [docId, user.firmId]
        );
        
        if (docResult.rows.length === 0) continue;
        
        const doc = docResult.rows[0];
        const fileName = doc.original_name || doc.name;
        
        // Try to get file content - Azure FIRST (that's where docs are stored)
        let fileBuffer = null;
        
        // Try Azure first
        try {
          const azureEnabled = await isAzureConfigured();
          if (azureEnabled) {
            const possiblePaths = [
              doc.azure_path,
              doc.folder_path ? `${doc.folder_path}/${fileName}` : null,
              doc.path
            ].filter(Boolean);
            
            for (const azurePath of possiblePaths) {
              try {
                fileBuffer = await downloadFile(azurePath, user.firmId);
                if (fileBuffer && fileBuffer.length > 0) break;
              } catch (e) {
                // Try next path
              }
            }
          }
        } catch (e) {
          console.error('Failed to download from Azure for attachment:', e.message);
        }
        
        // Fallback to local file
        if (!fileBuffer && doc.path) {
          try {
            const fsPromises = await import('fs/promises');
            fileBuffer = await fsPromises.readFile(doc.path);
          } catch (e) {
            // Local file not found
          }
        }
        
        if (fileBuffer) {
          attachments.push({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: fileName,
            contentType: doc.type || 'application/octet-stream',
            contentBytes: fileBuffer.toString('base64')
          });
        }
      } catch (e) {
        console.error(`Failed to attach document ${docId}:`, e.message);
      }
    }
    
    if (attachments.length > 0) {
      message.attachments = attachments;
    }
  }
  
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
    `, [user.firmId, user.id, args.matter_id, JSON.stringify({ to: args.to, subject: args.subject, attachmentCount: args.document_ids?.length || 0 })]);
  }
  
  return {
    success: true,
    message: `Email sent to ${args.to}${args.document_ids?.length ? ` with ${args.document_ids.length} attachment(s)` : ''}`,
    subject: args.subject,
    attachmentCount: args.document_ids?.length || 0
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
  
  // Get credentials from database first, then fall back to env vars
  const QB_CLIENT_ID = await getCredential('quickbooks_client_id', 'QUICKBOOKS_CLIENT_ID');
  const QB_CLIENT_SECRET = await getCredential('quickbooks_client_secret', 'QUICKBOOKS_CLIENT_SECRET');
  
  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    console.error('QuickBooks OAuth credentials not configured');
    return null;
  }
  
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
  
  console.error('Failed to refresh QuickBooks token:', newTokens.error_description || newTokens.error);
  return { accessToken: access_token, realmId };
}

async function getQBBaseUrl() {
  const QB_ENVIRONMENT = await getCredential('quickbooks_environment', 'QUICKBOOKS_ENVIRONMENT', 'sandbox');
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
    `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(queryStr)}`,
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
    `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(queryStr)}`,
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
    `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${invoice.client_name.replace(/'/g, "\\'")}'`)}`,
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
      `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/customer`,
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
    `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/invoice`,
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
          `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/invoice/${invoice.external_id}`,
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
      `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent('SELECT * FROM Customer WHERE Active = true MAXRESULTS 100')}`,
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
    `${await getQBBaseUrl()}/v3/company/${tokens.realmId}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Bank'")}`,
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
  try {
    const { to, subject, body, cc, importance = 'normal' } = args || {};
    
    // Validate required fields
    if (!to) {
      return { error: 'Recipient email address (to) is required to draft an email.' };
    }
    if (!subject) {
      return { error: 'Email subject is required.' };
    }
    if (!body) {
      return { error: 'Email body content is required.' };
    }
    
    const accessToken = await getOutlookAccessToken(user.firmId);
    if (!accessToken) {
      // Still return the draft content even without Outlook - user can copy/paste
      return { 
        success: true,
        email_draft: {
          to,
          subject,
          body,
          cc: cc || null
        },
        saved_to_outlook: false,
        message: `Email draft prepared. To save to Outlook drafts, connect your Microsoft account in Settings > Integrations.`,
        note: 'You can copy this draft and paste it into your email client.'
      };
    }
    
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
      return { error: `Failed to create draft in Outlook: ${result.error.message}` };
    }
    
    return {
      success: true,
      message: `Draft email created: "${subject}" to ${to}`,
      draftId: result.id,
      saved_to_outlook: true
    };
  } catch (error) {
    console.error('draftEmail error:', error);
    return { error: `Failed to draft email: ${error.message}` };
  }
}

async function draftEmailForMatter(args, user) {
  try {
    const { matter_id, to, subject, body, email_type = 'general', cc, save_to_outlook = true, link_to_matter = true } = args || {};
    
    // Validate required fields
    if (!matter_id) {
      return { error: 'matter_id is required. Use search_matters to find the matter first.' };
    }
    if (!subject) {
      return { error: 'Email subject is required. Please specify what the email should be about.' };
    }
    if (!body) {
      return { error: 'Email body content is required. Please specify what the email should say.' };
    }
    
    // Get matter details for context
    const matterResult = await query(
    `SELECT m.*, c.display_name as client_name, c.email as client_email
     FROM matters m
     LEFT JOIN clients c ON m.client_id = c.id
     WHERE m.id = $1 AND m.firm_id = $2`,
    [matter_id, user.firmId]
  );
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Get user's email signature if available (column may not exist in all deployments)
  let signature = '';
  try {
    // Check if email_signature column exists before querying
    const colCheck = await query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name = 'email_signature'`
    );
    if (colCheck.rows.length > 0) {
      const sigResult = await query(
        'SELECT email_signature FROM users WHERE id = $1',
        [user.id]
      );
      if (sigResult.rows.length > 0 && sigResult.rows[0].email_signature) {
        signature = '\n\n' + sigResult.rows[0].email_signature;
      }
    }
  } catch (e) {
    // No signature available - column may not exist
    console.log('Email signature not available:', e.message);
  }
  
  // Format the body with signature
  const fullBody = body + signature;
  
  // Determine recipient - use provided 'to' or fall back to client email
  const recipientEmail = to || matter.client_email;
  
  // Prepare response data
  const response = {
    success: true,
    email_draft: {
      to: recipientEmail || '[recipient email needed]',
      subject: subject,
      body: fullBody,
      cc: cc || null,
      matter: {
        id: matter_id,
        name: matter.name,
        number: matter.number
      },
      client: matter.client_name,
      email_type: email_type
    },
    message: `Email draft prepared for matter "${matter.name}" (${matter.number})`
  };
  
  // Try to save to Outlook if connected and we have a recipient
  if (save_to_outlook && recipientEmail) {
    try {
      const accessToken = await getOutlookAccessToken(user.firmId);
      if (accessToken) {
        const emailPayload = {
          subject,
          body: {
            contentType: 'HTML',
            content: fullBody.replace(/\n/g, '<br>')
          },
          toRecipients: recipientEmail.split(',').map(email => ({
            emailAddress: { address: email.trim() }
          })),
          importance: 'normal'
        };
        
        if (cc) {
          emailPayload.ccRecipients = cc.split(',').map(email => ({
            emailAddress: { address: email.trim() }
          }));
        }
        
        const outlookResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailPayload)
        });
        
        const outlookResult = await outlookResponse.json();
        
        if (!outlookResult.error) {
          response.saved_to_outlook = true;
          response.draft_id = outlookResult.id;
          response.message += '. Draft saved to Outlook.';
          
          // Link email to matter if requested
          if (link_to_matter) {
            try {
              await query(
                `INSERT INTO email_links (firm_id, matter_id, email_id, email_provider, subject, from_address, to_addresses, linked_by, created_at)
                 VALUES ($1, $2, $3, 'outlook', $4, $5, $6, $7, NOW())
                 ON CONFLICT DO NOTHING`,
                [user.firmId, matter_id, outlookResult.id, subject, user.email, recipientEmail.split(','), user.id]
              );
              response.linked_to_matter = true;
              response.message += ' Email linked to matter.';
            } catch (linkError) {
              console.error('Error linking email to matter:', linkError);
            }
          }
        }
      }
    } catch (outlookError) {
      console.error('Error saving to Outlook:', outlookError);
      response.outlook_error = 'Could not save to Outlook (not connected or error occurred)';
    }
  }
  
  // Also save as a document in the matter for record keeping
  try {
    const timestamp = Date.now();
    const docName = `Email Draft - ${subject.substring(0, 50)}`;
    const docContent = `To: ${to || '[recipient]'}\nCC: ${cc || '[none]'}\nSubject: ${subject}\nDate: ${new Date().toLocaleDateString()}\nMatter: ${matter.name} (${matter.number})\n\n---\n\n${fullBody}`;
    
    await query(
      `INSERT INTO documents (
        firm_id, matter_id, name, original_name, type, file_type, size, path,
        content_text, content_extracted_at, tags, status, uploaded_by
      ) VALUES ($1, $2, $3, $4, 'text/plain', 'txt', $5, $6, $7, NOW(), $8, 'final', $9)`,
      [
        user.firmId,
        matter_id,
        `${docName}.txt`,
        `${docName}.txt`,
        docContent.length,
        `email-drafts/${timestamp}-email-draft.txt`,
        docContent,
        ['email-draft', 'ai-generated'],
        user.id
      ]
    );
    response.saved_to_documents = true;
    } catch (docError) {
      console.error('Error saving email draft as document:', docError);
    }
    
    return response;
  } catch (error) {
    console.error('draftEmailForMatter error:', error);
    return { error: `Failed to draft email: ${error.message}` };
  }
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
// NOTIFICATION FUNCTIONS
// =============================================================================
async function sendNotification(args, user) {
  const { 
    user_id, 
    title, 
    message, 
    type = 'general', 
    priority = 'normal',
    channels = ['in_app'],
    entity_type,
    entity_id,
    action_url
  } = args;
  
  if (!title) {
    return { error: 'Title is required for notifications' };
  }
  
  // Determine target user(s)
  let targetUserIds = [];
  if (user_id === 'self' || !user_id) {
    targetUserIds = [user.userId];
  } else if (user_id === 'all') {
    const usersResult = await query(
      `SELECT id FROM users WHERE firm_id = $1`,
      [user.firmId]
    );
    targetUserIds = usersResult.rows.map(u => u.id);
  } else if (Array.isArray(user_id)) {
    targetUserIds = user_id;
  } else {
    targetUserIds = [user_id];
  }
  
  const notifications = [];
  
  for (const targetUserId of targetUserIds) {
    const result = await query(`
      INSERT INTO notifications (
        firm_id, user_id, type, title, message, priority,
        entity_type, entity_id, action_url, triggered_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, title, message, type, priority, created_at
    `, [
      user.firmId, targetUserId, type, title, message, priority,
      entity_type, entity_id, action_url, user.userId
    ]);
    
    notifications.push(result.rows[0]);
    
    // Queue additional delivery channels
    for (const channel of channels) {
      if (channel !== 'in_app') {
        // Get user preferences
        const prefsResult = await query(
          `SELECT sms_enabled, sms_phone, email_immediate FROM notification_preferences WHERE user_id = $1`,
          [targetUserId]
        );
        const prefs = prefsResult.rows[0] || {};
        
        // Get user contact info
        const userResult = await query(
          `SELECT email, phone FROM users WHERE id = $1`,
          [targetUserId]
        );
        const targetUser = userResult.rows[0] || {};
        
        if (channel === 'email' && (prefs.email_immediate || priority === 'urgent')) {
          await query(`
            INSERT INTO notification_deliveries (
              notification_id, firm_id, user_id, channel, status, email_to, email_subject
            ) VALUES ($1, $2, $3, 'email', 'pending', $4, $5)
          `, [result.rows[0].id, user.firmId, targetUserId, targetUser.email, title]);
          
          console.log(`📧 Email queued for ${targetUser.email}: ${title}`);
        }
        
        if (channel === 'sms' && prefs.sms_enabled && (prefs.sms_phone || targetUser.phone)) {
          const phone = prefs.sms_phone || targetUser.phone;
          await query(`
            INSERT INTO notification_deliveries (
              notification_id, firm_id, user_id, channel, status, sms_to
            ) VALUES ($1, $2, $3, 'sms', 'pending', $4)
          `, [result.rows[0].id, user.firmId, targetUserId, phone]);
          
          console.log(`📱 SMS queued for ${phone}: ${title}`);
        }
      }
    }
  }
  
  return {
    success: true,
    message: `Notification sent to ${notifications.length} user(s)`,
    notifications,
    channels_used: channels
  };
}

async function getNotifications(args, user) {
  const { limit = 20, unread_only = false } = args;
  
  let queryStr = `
    SELECT n.id, n.type, n.title, n.message, n.priority, n.entity_type, n.entity_id,
           n.action_url, n.read_at, n.created_at,
           u.name as triggered_by_name
    FROM notifications n
    LEFT JOIN users u ON n.triggered_by = u.id
    WHERE n.user_id = $1 AND n.firm_id = $2
  `;
  const params = [user.userId, user.firmId];
  
  if (unread_only) {
    queryStr += ` AND n.read_at IS NULL`;
  }
  
  queryStr += ` ORDER BY n.created_at DESC LIMIT $3`;
  params.push(limit);
  
  const result = await query(queryStr, params);
  
  // Get unread count
  const countResult = await query(
    `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND firm_id = $2 AND read_at IS NULL`,
    [user.userId, user.firmId]
  );
  
  return {
    notifications: result.rows,
    unread_count: parseInt(countResult.rows[0].count),
    total: result.rows.length
  };
}

async function scheduleNotification(args, user) {
  const { 
    user_id, 
    title, 
    message, 
    scheduled_for,
    type = 'general',
    channels = ['in_app'],
    entity_type,
    entity_id
  } = args;
  
  if (!title || !scheduled_for) {
    return { error: 'Title and scheduled_for are required' };
  }
  
  // Determine target
  let targetUserId = user.userId;
  if (user_id && user_id !== 'self') {
    targetUserId = user_id === 'all' ? null : user_id;
  }
  
  const result = await query(`
    INSERT INTO notifications (
      firm_id, user_id, type, title, message, priority,
      entity_type, entity_id, scheduled_for, triggered_by,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, 'normal', $6, $7, $8, $9, $10)
    RETURNING id, title, scheduled_for
  `, [
    user.firmId, 
    targetUserId || user.userId,
    type, 
    title, 
    message,
    entity_type, 
    entity_id, 
    scheduled_for, 
    user.userId,
    JSON.stringify({ channels, target: user_id === 'all' ? 'all_users' : 'specific' })
  ]);
  
  return {
    success: true,
    message: `Notification scheduled for ${new Date(scheduled_for).toLocaleString()}`,
    notification: result.rows[0]
  };
}

async function sendDeadlineReminder(args, user) {
  const { matter_id, deadline_date, deadline_description, user_ids, include_sms = false } = args;
  
  if (!matter_id || !deadline_date || !deadline_description) {
    return { error: 'matter_id, deadline_date, and deadline_description are required' };
  }
  
  // Get matter details
  const matterResult = await query(
    `SELECT m.name, m.number, c.name as client_name 
     FROM matters m 
     LEFT JOIN clients c ON m.client_id = c.id 
     WHERE m.id = $1 AND m.firm_id = $2`,
    [matter_id, user.firmId]
  );
  
  if (matterResult.rows.length === 0) {
    return { error: 'Matter not found' };
  }
  
  const matter = matterResult.rows[0];
  
  // Determine target users
  let targetUserIds = user_ids;
  if (!targetUserIds || targetUserIds.length === 0) {
    // Default to matter team members
    const teamResult = await query(
      `SELECT user_id FROM matter_team_members WHERE matter_id = $1`,
      [matter_id]
    );
    targetUserIds = teamResult.rows.map(t => t.user_id);
    
    // If no team, notify the assigned attorney or current user
    if (targetUserIds.length === 0) {
      targetUserIds = [user.userId];
    }
  }
  
  // Calculate urgency
  const deadlineTs = new Date(deadline_date).getTime();
  const now = Date.now();
  const hoursUntil = (deadlineTs - now) / (1000 * 60 * 60);
  
  let priority = 'normal';
  if (hoursUntil < 4) {
    priority = 'urgent';
  } else if (hoursUntil < 24) {
    priority = 'high';
  }
  
  // Determine channels
  const channels = ['in_app', 'email'];
  if (include_sms || hoursUntil < 24) {
    channels.push('sms');
  }
  
  // Format the message
  const title = `⏰ Deadline Reminder: ${matter.name}`;
  const message = `${deadline_description}\n\nMatter: ${matter.number ? `#${matter.number} - ` : ''}${matter.name}${matter.client_name ? `\nClient: ${matter.client_name}` : ''}\nDue: ${new Date(deadline_date).toLocaleDateString()}`;
  
  // Send to all target users
  const notifications = [];
  for (const targetUserId of targetUserIds) {
    const result = await sendNotification({
      user_id: targetUserId,
      title,
      message,
      type: 'deadline_reminder',
      priority,
      channels,
      entity_type: 'matter',
      entity_id: matter_id,
      action_url: `/app/matters/${matter_id}`
    }, user);
    
    if (result.success) {
      notifications.push(...result.notifications);
    }
  }
  
  return {
    success: true,
    message: `Deadline reminder sent to ${notifications.length} user(s)`,
    matter: matter.name,
    deadline: deadline_date,
    priority,
    channels_used: channels,
    users_notified: notifications.length
  };
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================
function getSystemPrompt() {
  const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
  
  return `You are a trusted legal assistant at Apex Legal. Today is ${todayStr}. User role: {{USER_ROLE}}.

You're not a chatbot - you're a sharp, experienced assistant who thinks like a human. You've seen how law firms work. You know what matters and what doesn't. You give real advice, not corporate hedging.

HOW TO THINK:

1. LEAD WITH WHAT MATTERS
   Skip the preamble. Start with the most important thing: "You have a motion due Thursday that isn't done yet." Then context. A busy attorney has 30 seconds - make them count.

2. HAVE JUDGMENT
   Don't treat a routine letter the same as a court deadline. Know the difference between "nice to do" and "must do today." Prioritize ruthlessly. If something is urgent, say so plainly. If something can wait, say that too.

3. SYNTHESIZE, DON'T DUMP
   Never list 20 things without a headline. "You're mostly in good shape - 3 things need attention" is better than a wall of text. Give the picture first, details second.

4. BE SPECIFIC AND CONCRETE
   Bad: "Review your upcoming deadlines"
   Good: "The Smith motion is due Thursday. The Garcia contract expires Friday. Call opposing counsel on Morton - they haven't responded in 2 weeks."
   Use names, dates, and numbers. Vague advice is useless advice.

5. HAVE A POINT OF VIEW
   Don't just present options - recommend one. "I'd prioritize the Smith file first because the deadline is closest and the client is difficult." You're a trusted advisor, not a search engine.

6. BE HONEST ABOUT WHAT YOU SEE
   The list_my_matters response has a "total" field - that's the real count. Say "You have 50 active matters, I looked at the 20 most recent" - never misrepresent the numbers. If data looks incomplete, say so. If everything looks fine, say that confidently.

7. THINK ONE STEP AHEAD
   Don't just answer the question - anticipate the next one. If they ask about a matter, mention if there's unbilled time. If there's a deadline soon, flag what's needed to meet it.

8. TALK LIKE A COLLEAGUE
   Skip the formal corporate speak. Be direct and warm, like a trusted colleague who's been working with them for years. "Heads up - Morton hasn't paid in 60 days" not "I would recommend reviewing the accounts receivable status."

9. WHEN IN DOUBT, ACT - DON'T ASK
   If they say "review my matters" - do it immediately. If they say "edit the Smith document" - find the most likely Smith document and do it. If they say "draft a letter to opposing counsel" - find the relevant matter and draft it.
   
   DO NOT ask clarifying questions unless absolutely impossible to proceed. Make smart assumptions:
   - Vague reference to a document? Find the most recent/relevant one.
   - Vague reference to a client or matter? Search and pick the most likely match.
   - Unclear what edits they want? Make sensible improvements based on context.
   - Missing details? Use reasonable defaults.
   
   The AI should be EASIER and FASTER than using the interface. If you ask 3 questions before doing anything, you've failed. Just do the work, show them the result, and let them adjust if needed. Be the assistant who figures it out, not the one who makes them do extra work.

10. DEFAULT TO ACTIVE MATTERS
    When someone asks "what should I do", "review my matters", "what's on my plate" - they mean ACTIVE work, not closed files. ALWAYS call list_my_matters with status: "active" unless they specifically ask about closed matters. Never tell someone their "plate is clear" based on closed matters - that's useless information.

11. UNDERSTAND "RECENT"
    "Recent matters" means matters with RECENT ACTIVITY - where work has been done lately (time entries, documents, emails, updates). Not just the most recently created matters. When asked about recent work, focus on matters that have had actual activity, not old matters that happen to be at the top of a list. Use get_matter to check for recent time entries, recent documents, and recent activity to determine what's truly "recent."

12. DIG DEEPER ON PRIORITIES
    Don't just list matter names. Call get_matter on the top 3-5 most important-looking matters to see what's actually happening inside them - deadlines, unbilled time, pending tasks, recent documents. That's how you give real advice, not surface-level summaries.

13. DRAFT EMAILS PROACTIVELY
    When asked to draft, write, or compose an email - ACTUALLY CREATE IT using draft_email or draft_email_for_matter.
    
    - "Draft an email to the client" → Use draft_email_for_matter with the matter_id, write a complete professional email, and SAVE IT TO OUTLOOK DRAFTS
    - "Write to opposing counsel about..." → Find the matter, get the context, draft a complete email with draft_email_for_matter
    - "Send a follow-up" → Draft it first with draft_email_for_matter (unless they explicitly say "send")
    
    WRITE COMPLETE EMAILS - not outlines or suggestions. Include:
    - Professional greeting
    - Clear, well-structured body
    - Appropriate sign-off
    - Reference to matter/case number when relevant
    
    The email should be READY TO SEND when you create the draft. Don't make the user rewrite it.
    
    If Outlook is connected, the draft appears in their Outlook Drafts folder. If not, show them the complete draft they can copy.

14. CREATE DOCUMENTS IN MATTERS
    When asked to create, draft, or write a document - ALWAYS include the matter_id so it goes in the right place.
    
    - "Create a letter for the Smith case" → First find the Smith matter (search_matters), then create_document WITH matter_id
    - "Draft an engagement letter" → If they're on a matter page, use that matter_id. Otherwise ask which matter or find the most relevant one.
    - "Write a memo about..." → Same - always attach to a matter using matter_id
    
    The document MUST have matter_id set or it won't appear in the matter's Documents section.
    
    ALWAYS:
    1. Find the matter first (use search_matters or list_my_matters if needed)
    2. Call create_document with matter_id included
    3. Write COMPLETE, professional content - not outlines
    
15. FLEXIBLE DOCUMENT SEARCH
    When looking for documents, use simple keywords. The search is flexible:
    - "Smith contract" → search for "Smith" or "contract"  
    - "engagement letter" → search for "engagement"
    - Just use the most distinctive word from what the user said
    
    If the first search doesn't find it, try simpler terms or use list_documents to see what's available.

NEVER fabricate errors or technical issues. If tools return data, use it confidently. Only mention problems if they actually occurred.`;
}

// =============================================================================
// HOT CONTEXT - User-specific awareness injected at conversation start
// =============================================================================
async function buildHotContext(userId, firmId) {
  try {
    const todayStr = getTodayInTimezone(DEFAULT_TIMEZONE);
    const { dayOfWeek } = getDatePartsInTimezone(new Date(), DEFAULT_TIMEZONE);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Run all queries in parallel for performance
    const [
      userResult,
      todayEventsResult,
      weekEventsResult,
      unbilledTimeResult,
      urgentMattersResult,
      overdueInvoicesResult,
      weeklyStatsResult,
      recentActivityResult
    ] = await Promise.all([
      // 1. User info
      query(`SELECT first_name, last_name, role, hourly_rate FROM users WHERE id = $1`, [userId]),
      
      // 2. Today's calendar events
      query(`
        SELECT e.title, e.start_time, e.end_time, e.type, e.location, m.name as matter_name
        FROM calendar_events e
        LEFT JOIN matters m ON e.matter_id = m.id
        WHERE e.firm_id = $1 
          AND e.created_by = $2
          AND DATE(e.start_time AT TIME ZONE 'America/Chicago') = $3::date
        ORDER BY e.start_time
        LIMIT 10
      `, [firmId, userId, todayStr]),
      
      // 3. This week's upcoming events (next 7 days, excluding today)
      query(`
        SELECT e.title, e.start_time, e.type, m.name as matter_name
        FROM calendar_events e
        LEFT JOIN matters m ON e.matter_id = m.id
        WHERE e.firm_id = $1 
          AND e.created_by = $2
          AND e.start_time > NOW()
          AND e.start_time < NOW() + INTERVAL '7 days'
          AND DATE(e.start_time AT TIME ZONE 'America/Chicago') != $3::date
        ORDER BY e.start_time
        LIMIT 5
      `, [firmId, userId, todayStr]),
      
      // 4. Unbilled time (last 7 days for this user)
      query(`
        SELECT 
          SUM(hours) as total_hours,
          SUM(amount) as total_amount,
          COUNT(*) as entry_count
        FROM time_entries
        WHERE firm_id = $1 
          AND user_id = $2
          AND billable = true 
          AND billed = false
          AND date >= CURRENT_DATE - INTERVAL '7 days'
      `, [firmId, userId]),
      
      // 5. Urgent/high priority matters assigned to or responsible by user
      query(`
        SELECT m.name, m.number, m.priority, m.status, c.display_name as client_name
        FROM matters m
        LEFT JOIN clients c ON m.client_id = c.id
        WHERE m.firm_id = $1 
          AND m.status = 'active'
          AND m.priority IN ('urgent', 'high')
          AND (m.responsible_attorney = $2 OR EXISTS(
            SELECT 1 FROM matter_assignments ma WHERE ma.matter_id = m.id AND ma.user_id = $2
          ))
        ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 END
        LIMIT 5
      `, [firmId, userId]),
      
      // 6. Overdue invoices (for matters user is responsible for)
      query(`
        SELECT i.number, i.amount_due, i.due_date, c.display_name as client_name, m.name as matter_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN matters m ON i.matter_id = m.id
        WHERE i.firm_id = $1
          AND i.status IN ('sent', 'overdue')
          AND i.due_date < CURRENT_DATE
          AND (m.responsible_attorney = $2 OR i.created_by = $2)
        ORDER BY i.due_date ASC
        LIMIT 5
      `, [firmId, userId]),
      
      // 7. This week's billable hours (Mon-Sun) for the user
      query(`
        SELECT 
          SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours,
          SUM(hours) as total_hours,
          SUM(CASE WHEN billable THEN amount ELSE 0 END) as billable_amount
        FROM time_entries
        WHERE firm_id = $1 
          AND user_id = $2
          AND date >= DATE_TRUNC('week', CURRENT_DATE)
          AND date <= CURRENT_DATE
      `, [firmId, userId]),
      
      // 8. Recent activity (what did they work on yesterday/recently)
      query(`
        SELECT m.name as matter_name, m.number, SUM(te.hours) as hours, MAX(te.date) as last_date
        FROM time_entries te
        JOIN matters m ON te.matter_id = m.id
        WHERE te.firm_id = $1 
          AND te.user_id = $2
          AND te.date >= CURRENT_DATE - INTERVAL '3 days'
        GROUP BY m.id, m.name, m.number
        ORDER BY MAX(te.date) DESC, SUM(te.hours) DESC
        LIMIT 5
      `, [firmId, userId])
    ]);

    const user = userResult.rows[0];
    const todayEvents = todayEventsResult.rows;
    const weekEvents = weekEventsResult.rows;
    const unbilled = unbilledTimeResult.rows[0];
    const urgentMatters = urgentMattersResult.rows;
    const overdueInvoices = overdueInvoicesResult.rows;
    const weeklyStats = weeklyStatsResult.rows[0];
    const recentActivity = recentActivityResult.rows;

    // Build the hot context string
    let context = `
=== YOUR CURRENT AWARENESS ===
Today: ${dayNames[dayOfWeek]}, ${todayStr}
User: ${user?.first_name || 'Unknown'} ${user?.last_name || ''} (${user?.role || 'staff'})

`;

    // Today's Calendar
    if (todayEvents.length > 0) {
      context += `📅 TODAY'S SCHEDULE:\n`;
      for (const event of todayEvents) {
        const time = formatTime(event.start_time);
        const endTime = event.end_time ? ` - ${formatTime(event.end_time)}` : '';
        context += `• ${time}${endTime}: ${event.title}`;
        if (event.type && event.type !== 'meeting') context += ` (${event.type})`;
        if (event.matter_name) context += ` — ${event.matter_name}`;
        if (event.location) context += ` @ ${event.location}`;
        context += `\n`;
      }
      context += `\n`;
    } else {
      context += `📅 TODAY'S SCHEDULE: No events scheduled\n\n`;
    }

    // Needs Attention Section
    let needsAttention = [];
    
    // Unbilled time
    const unbilledHours = parseFloat(unbilled?.total_hours || 0);
    const unbilledAmount = parseFloat(unbilled?.total_amount || 0);
    if (unbilledHours > 0) {
      needsAttention.push(`${unbilledHours.toFixed(1)} hrs unbilled time ($${unbilledAmount.toLocaleString()}) from last 7 days`);
    }
    
    // Overdue invoices
    if (overdueInvoices.length > 0) {
      const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount_due || 0), 0);
      needsAttention.push(`${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''} ($${totalOverdue.toLocaleString()} total)`);
    }
    
    // Urgent matters
    if (urgentMatters.length > 0) {
      const urgentCount = urgentMatters.filter(m => m.priority === 'urgent').length;
      const highCount = urgentMatters.filter(m => m.priority === 'high').length;
      let matterText = [];
      if (urgentCount > 0) matterText.push(`${urgentCount} urgent`);
      if (highCount > 0) matterText.push(`${highCount} high priority`);
      needsAttention.push(`${matterText.join(', ')} matter${urgentMatters.length > 1 ? 's' : ''}`);
    }
    
    if (needsAttention.length > 0) {
      context += `⚡ NEEDS ATTENTION:\n`;
      for (const item of needsAttention) {
        context += `• ${item}\n`;
      }
      context += `\n`;
    }

    // This Week's Stats
    const billableHours = parseFloat(weeklyStats?.billable_hours || 0);
    const billableAmount = parseFloat(weeklyStats?.billable_amount || 0);
    context += `📊 THIS WEEK:\n`;
    context += `• Billable hours: ${billableHours.toFixed(1)} hrs ($${billableAmount.toLocaleString()})\n`;
    context += `\n`;

    // Urgent/High Priority Matters (details)
    if (urgentMatters.length > 0) {
      context += `🔥 PRIORITY MATTERS:\n`;
      for (const matter of urgentMatters) {
        context += `• ${matter.name} (${matter.number}) — ${matter.priority.toUpperCase()}`;
        if (matter.client_name) context += ` — ${matter.client_name}`;
        context += `\n`;
      }
      context += `\n`;
    }

    // Upcoming This Week
    if (weekEvents.length > 0) {
      context += `📆 COMING UP THIS WEEK:\n`;
      for (const event of weekEvents) {
        context += `• ${formatDateTime(event.start_time)}: ${event.title}`;
        if (event.matter_name) context += ` — ${event.matter_name}`;
        context += `\n`;
      }
      context += `\n`;
    }

    // Recent Work
    if (recentActivity.length > 0) {
      context += `🕐 RECENTLY WORKED ON:\n`;
      for (const activity of recentActivity) {
        context += `• ${activity.matter_name} (${activity.number}) — ${parseFloat(activity.hours).toFixed(1)} hrs\n`;
      }
      context += `\n`;
    }

    context += `=== END AWARENESS ===

Use this awareness to be proactive. If the user just says "hi" or asks what they should focus on, reference this context. But you can still look up ANYTHING using your tools - this is just what you know upfront.
`;

    return context;
  } catch (error) {
    console.error('Error building hot context:', error);
    // Return minimal context on error - don't break the chat
    return `
=== AWARENESS ===
Note: Could not load full context. You can still use tools to look up any information.
=== END AWARENESS ===
`;
  }
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
    
    // Format the tasks with duration and progress percent
    const tasks = result.rows.map(task => {
      // Parse JSON fields if they're strings
      let plan = task.plan;
      let progress = task.progress;
      
      if (typeof plan === 'string') {
        try { plan = JSON.parse(plan); } catch (e) { plan = []; }
      }
      if (typeof progress === 'string') {
        try { progress = JSON.parse(progress); } catch (e) { progress = { steps: [] }; }
      }
      
      // Use stored progress values, or calculate from steps
      const totalSteps = progress?.totalSteps || (Array.isArray(plan) ? plan.length : 10);
      const completedSteps = progress?.completedSteps || (Array.isArray(progress?.steps) ? progress.steps.length : 0);
      
      let progressPercent = 0;
      if (task.status === 'completed') {
        progressPercent = 100;
      } else if (task.status === 'running') {
        progressPercent = progress?.progressPercent || Math.min(Math.round((completedSteps / totalSteps) * 100), 95);
      }
      
      return {
        ...task,
        plan,
        progress,
        duration: task.duration_seconds ? formatDuration(task.duration_seconds) : null,
        durationSeconds: task.duration_seconds ? Math.round(task.duration_seconds) : null,
        rating: task.rating || null,
        progressPercent,
        totalSteps,
        completedSteps
      };
    });
    
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

// Cancel a task (keeps progress) - works on running or stuck tasks
router.post('/tasks/:taskId/cancel', authenticate, async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // Get current task info
    const taskResult = await query(
      `SELECT id, status, goal, progress, iterations FROM ai_tasks 
       WHERE id = $1 AND user_id = $2`,
      [taskId, req.user.id]
    );
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = taskResult.rows[0];
    
    // Allow cancelling tasks that are running, pending, or stuck
    // Only reject if already completed, cancelled, or failed
    if (['completed', 'cancelled', 'failed'].includes(task.status)) {
      return res.status(400).json({ 
        error: 'Task is already finished', 
        status: task.status 
      });
    }
    
    // IMMEDIATELY signal the agent to stop (in-memory flag)
    cancelRunningAgent(taskId);
    
    // Parse existing progress
    let progress = task.progress;
    if (typeof progress === 'string') {
      try { progress = JSON.parse(progress); } catch (e) { progress = {}; }
    }
    
    // Update task to cancelled status - keeps all progress
    const result = await query(
      `UPDATE ai_tasks SET 
        status = 'cancelled',
        completed_at = NOW(),
        progress = $1,
        summary = $2,
        updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, status, goal`,
      [
        JSON.stringify({
          ...progress,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          progressPercent: progress.progressPercent || 0
        }),
        `Task cancelled by user after ${task.iterations || 0} actions. Progress has been saved.`,
        taskId,
        req.user.id
      ]
    );
    
    // Remove from running agents map
    runningAgents.delete(taskId);
    
    console.log(`[AGENT] Task ${taskId} cancelled by user - agent will stop on next iteration`);
    
    res.json({ 
      success: true, 
      message: 'Task cancelled. Progress has been saved.',
      task: result.rows[0]
    });
  } catch (error) {
    console.error('Error cancelling task:', error);
    res.status(500).json({ error: 'Failed to cancel task' });
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
    
    // Parse JSON fields if they're strings
    let plan = task.plan;
    let progress = task.progress;
    
    if (typeof plan === 'string') {
      try { plan = JSON.parse(plan); } catch (e) { plan = []; }
    }
    if (typeof progress === 'string') {
      try { progress = JSON.parse(progress); } catch (e) { progress = { steps: [] }; }
    }
    
    // Use stored progress values, or calculate from steps
    const totalSteps = progress?.totalSteps || (Array.isArray(plan) ? plan.length : 10);
    const completedSteps = progress?.completedSteps || (Array.isArray(progress?.steps) ? progress.steps.length : 0);
    const currentStep = progress?.currentStep || 'Working...';
    
    let progressPercent = 0;
    if (task.status === 'completed') {
      progressPercent = 100;
    } else if (task.status === 'running') {
      progressPercent = progress?.progressPercent || Math.min(Math.round((completedSteps / totalSteps) * 100), 95);
    }
    
    res.json({ 
      task: {
        ...task,
        plan,
        progress,
        progressPercent,
        totalSteps,
        completedSteps,
        currentStep
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
      `SELECT id, goal, status, plan, progress, iterations, max_iterations, created_at, started_at
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
    
    // Check if task has been running too long (15 minutes) - mark as timed out
    // This prevents stuck tasks from blocking the UI indefinitely
    const startedAt = task.started_at ? new Date(task.started_at) : new Date(task.created_at);
    const runningTimeMs = Date.now() - startedAt.getTime();
    const MAX_RUNNING_TIME = 15 * 60 * 1000; // 15 minutes max
    
    if (runningTimeMs > MAX_RUNNING_TIME) {
      // Mark task as timed out
      await query(
        `UPDATE ai_tasks SET status = 'timeout', completed_at = NOW(), 
         error = 'Task timed out after 15 minutes. It may have completed partially.' WHERE id = $1`,
        [task.id]
      );
      // Also remove from running agents map in case it's still there
      runningAgents.delete(task.id);
      return res.json({ active: false });
    }
    
    // Parse JSON fields if they're strings
    let plan = task.plan;
    let progress = task.progress;
    
    if (typeof plan === 'string') {
      try { plan = JSON.parse(plan); } catch (e) { plan = []; }
    }
    if (typeof progress === 'string') {
      try { progress = JSON.parse(progress); } catch (e) { progress = { steps: [] }; }
    }
    
    // Use the stored progressPercent if available, otherwise calculate from steps
    const totalSteps = progress?.totalSteps || (Array.isArray(plan) ? plan.length : 10);
    const completedSteps = progress?.completedSteps || (Array.isArray(progress?.steps) ? progress.steps.length : 0);
    const progressPercent = progress?.progressPercent || Math.min(Math.round((completedSteps / totalSteps) * 100), 95);
    
    // Get the current step info from progress data or task
    const currentStep = progress?.currentStep || task.current_step || 'Working...';
    
    // Extract sub-task information from progress
    const currentSubTask = progress?.currentSubTask ?? 0;
    const totalSubTasks = progress?.totalSubTasks ?? 0;
    const subTasks = progress?.subTasks ?? [];
    const subTaskProgress = progress?.subTaskProgress ?? [];
    
    res.json({ 
      active: true,
      task: {
        id: task.id,
        goal: task.goal,
        status: task.status,
        progressPercent,
        iterations: task.iterations,
        totalSteps,
        completedSteps,
        currentStep,
        // Sub-task tracking for the progress bar
        currentSubTask,
        totalSubTasks,
        subTasks,
        subTaskProgress
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
    const { message, conversationHistory = [], fileContext } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Build hot context (user-specific awareness) - only for new conversations
    // If there's conversation history, the context was already in the first message
    let hotContext = '';
    if (conversationHistory.length === 0) {
      hotContext = await buildHotContext(req.user.id, req.user.firmId);
      console.log(`[AI Agent] Built hot context for user ${req.user.id} (${hotContext.length} chars)`);
    }

    const baseSystemPrompt = getSystemPrompt()
      .replace('{{USER_ROLE}}', req.user.role)
      .replace('{{USER_NAME}}', `${req.user.firstName} ${req.user.lastName}`);
    
    // Combine base system prompt with hot context
    const systemPrompt = hotContext 
      ? `${baseSystemPrompt}\n\n${hotContext}`
      : baseSystemPrompt;

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
    const maxIterations = 50;  // Allow plenty of iterations for complex tasks
    let navigationResult = null; // Track navigation commands
    let taskCompleted = false;  // Track if AI declared task complete
    let needsHumanInput = null; // Track if AI needs human input
    
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
        
        // Check for task completion signal
        if (result._task_complete) {
          taskCompleted = true;
          console.log('Task marked as complete by AI');
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

    // Build response
    const responsePayload = {
      response: response.content,
      toolsUsed: iterations > 0,
      iterations: iterations,
      taskCompleted: taskCompleted
    };
    
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
    
    // Provide specific, honest error messages based on the error type
    let userMessage = 'Something went wrong. Please try again.';
    let errorCode = 'unknown_error';
    
    if (error.status === 429) {
      userMessage = 'The AI service is temporarily overloaded. Please wait a moment and try again.';
      errorCode = 'rate_limited';
    } else if (error.status === 503 || error.status === 502) {
      userMessage = 'The AI service is temporarily unavailable. Please try again in a few seconds.';
      errorCode = 'service_unavailable';
    } else if (error.status === 500) {
      userMessage = 'The AI service encountered an internal error. Please try again.';
      errorCode = 'service_error';
    } else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      userMessage = 'The request took too long. Please try a simpler question or try again.';
      errorCode = 'timeout';
    } else if (error.message?.includes('not configured')) {
      userMessage = 'AI service is not configured. Please contact your administrator.';
      errorCode = 'not_configured';
    } else if (error.retryable === false) {
      userMessage = `AI service error: ${error.message}`;
      errorCode = 'api_error';
    }
    
    res.status(error.status || 500).json({ 
      error: userMessage,
      errorCode,
      retryable: error.retryable !== false
    });
  }
});

async function callAzureOpenAIWithTools(messages, tools, retryOptions = {}) {
  const url = `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;
  
  // Retry configuration
  const maxRetries = retryOptions.maxRetries ?? 3;
  const baseDelay = retryOptions.baseDelay ?? 1000;
  const maxDelay = retryOptions.maxDelay ?? 10000;
  
  if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
    throw new Error('Azure OpenAI not configured');
  }
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500, maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_API_KEY,
        },
        body: JSON.stringify({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          parallel_tool_calls: false,
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AZURE AI] Error ${response.status}:`, errorText);
        
        // Parse error for better message
        let errorMessage = `Azure OpenAI API error: ${response.status}`;
        let errorCode = null;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
          errorCode = errorJson.error?.code;
        } catch (e) {}
        
        // Check if this is a retryable error
        const isRetryable = 
          response.status === 429 || // Rate limited
          response.status === 500 || // Internal server error
          response.status === 502 || // Bad gateway
          response.status === 503 || // Service unavailable
          response.status === 504 || // Gateway timeout
          errorCode === 'rate_limit_exceeded' ||
          errorCode === 'server_error';
        
        if (isRetryable && attempt < maxRetries) {
          // Check for Retry-After header
          const retryAfter = response.headers.get('Retry-After');
          if (retryAfter) {
            const retryDelay = parseInt(retryAfter, 10) * 1000 || baseDelay;
            console.log(`[AZURE AI] Rate limited. Retry-After: ${retryAfter}s`);
            await new Promise(resolve => setTimeout(resolve, Math.min(retryDelay, maxDelay)));
          }
          lastError = new Error(errorMessage);
          lastError.status = response.status;
          lastError.retryable = true;
          continue; // Retry
        }
        
        // Non-retryable error or max retries exceeded
        const error = new Error(errorMessage);
        error.status = response.status;
        error.retryable = false;
        throw error;
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        console.error('[AZURE AI] No choices in response:', JSON.stringify(data).substring(0, 500));
        
        // This might be a transient issue, retry if we can
        if (attempt < maxRetries) {
          lastError = new Error('Azure OpenAI returned no response');
          lastError.retryable = true;
          continue;
        }
        throw new Error('Azure OpenAI returned no response');
      }
      
      const choice = data.choices[0];
      console.log(`[AZURE AI] Success - got response with ${choice.message.tool_calls?.length || 0} tool calls${attempt > 0 ? ` (after ${attempt} retries)` : ''}`);
      
      return {
        content: choice.message.content,
        tool_calls: choice.message.tool_calls
      };
      
    } catch (error) {
      // Network errors (fetch failed) are retryable
      if (error.name === 'TypeError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        console.error(`[AZURE AI] Network error on attempt ${attempt + 1}:`, error.message);
        if (attempt < maxRetries) {
          lastError = error;
          lastError.retryable = true;
          continue;
        }
      }
      
      // If this is already a processed error with status, rethrow it
      if (error.status !== undefined) {
        throw error;
      }
      
      // Unknown error
      lastError = error;
      if (attempt >= maxRetries) {
        throw error;
      }
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('Failed to get AI response after retries');
}

// Named exports for server.js
export { resumeIncompleteTasks };

export default router;
