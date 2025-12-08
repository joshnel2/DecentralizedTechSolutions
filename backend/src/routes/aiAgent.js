import { Router } from 'express';
import { query, withTransaction } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { hasPermission } from '../utils/auth.js';

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
      description: "Get detailed information about a specific matter.",
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
      description: "Create a new legal matter/case. ALL users can create matters - no special permissions required. Just provide a name and optionally other details.",
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
      description: "Get detailed information about a specific client.",
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
      description: "Create a new client. ALL users can create clients - no special permissions required.",
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

  // ===================== INVOICES =====================
  {
    type: "function",
    function: {
      name: "list_invoices",
      description: "Get a list of invoices.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "partial", "void"] },
          client_id: { type: "string", description: "Filter by client" },
          matter_id: { type: "string", description: "Filter by matter" },
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
      description: "Get a list of documents.",
      parameters: {
        type: "object",
        properties: {
          matter_id: { type: "string", description: "Filter by matter" },
          client_id: { type: "string", description: "Filter by client" },
          search: { type: "string", description: "Search by name" },
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
  }
];

// =============================================================================
// TOOL EXECUTION
// =============================================================================
async function executeTool(toolName, args, user) {
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
      
      // Clients
      case 'list_clients': return await listClients(args, user);
      case 'get_client': return await getClient(args, user);
      case 'create_client': return await createClient(args, user);
      case 'update_client': return await updateClient(args, user);
      
      // Invoices
      case 'list_invoices': return await listInvoices(args, user);
      case 'get_invoice': return await getInvoice(args, user);
      case 'create_invoice': return await createInvoice(args, user);
      case 'send_invoice': return await sendInvoice(args, user);
      case 'record_payment': return await recordPayment(args, user);
      
      // Calendar
      case 'get_calendar_events': return await getCalendarEvents(args, user);
      case 'create_calendar_event': return await createCalendarEvent(args, user);
      case 'update_calendar_event': return await updateCalendarEvent(args, user);
      case 'delete_calendar_event': return await deleteCalendarEvent(args, user);
      
      // Documents
      case 'list_documents': return await listDocuments(args, user);
      case 'get_document': return await getDocument(args, user);
      
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
  
  const entryDate = date || new Date().toISOString().split('T')[0];
  
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
  
  return {
    id: m.id,
    name: m.name,
    number: m.number,
    description: m.description,
    status: m.status,
    priority: m.priority,
    type: m.type,
    client: m.client_name,
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
    }
  };
}

async function createMatter(args, user) {
  if (!hasPermission(user.role, 'matters:create')) {
    return { error: 'You do not have permission to create matters' };
  }
  
  const { name, client_id, description, type = 'other', priority = 'medium', billing_type = 'hourly', billing_rate, court_name, case_number } = args;
  
  if (!name) {
    return { error: 'Matter name is required' };
  }
  
  const countResult = await query('SELECT COUNT(*) FROM matters WHERE firm_id = $1', [user.firmId]);
  const count = parseInt(countResult.rows[0].count) + 1;
  const number = `MTR-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
  
  if (client_id) {
    const clientCheck = await query('SELECT id FROM clients WHERE id = $1 AND firm_id = $2', [client_id, user.firmId]);
    if (clientCheck.rows.length === 0) {
      return { error: 'Client not found' };
    }
  }
  
  // Use today's date for open_date
  const openDate = new Date().toISOString().split('T')[0];
  
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
    }
  };
}

async function createClient(args, user) {
  if (!hasPermission(user.role, 'clients:create')) {
    return { error: 'You do not have permission to create clients' };
  }
  
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

// =============================================================================
// INVOICE FUNCTIONS
// =============================================================================
async function listInvoices(args, user) {
  const { status, client_id, matter_id, limit = 20 } = args;
  
  let sql = `
    SELECT i.id, i.number, i.status, i.total, i.amount_due, i.due_date, c.display_name as client_name, m.name as matter_name
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
  
  sql += ` ORDER BY i.created_at DESC LIMIT ${Math.min(parseInt(limit), 50)}`;
  
  const result = await query(sql, params);
  
  return {
    invoices: result.rows.map(i => ({
      id: i.id,
      number: i.number,
      client: i.client_name,
      matter: i.matter_name,
      status: i.status,
      total: parseFloat(i.total),
      amount_due: parseFloat(i.amount_due),
      due_date: i.due_date
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
    
    const dueD = due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
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
       payment_date || new Date().toISOString().split('T')[0], notes || null, user.id]
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
      start: e.start_time,
      end: e.end_time,
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
  let startDate;
  try {
    console.log('Parsing start_time:', start_time);
    
    // Try parsing the date directly first
    startDate = new Date(start_time);
    
    // If the date is invalid, try some alternative formats
    if (isNaN(startDate.getTime())) {
      const today = new Date();
      
      // Check for "tomorrow" keyword
      if (start_time.toLowerCase().includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Try to extract time
        const timeMatch = start_time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2] || '0');
          const meridiem = timeMatch[3]?.toLowerCase();
          
          if (meridiem === 'pm' && hours < 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
          
          startDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hours, minutes);
        } else {
          // Default to 9am tomorrow
          startDate = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9, 0);
        }
      }
      // Check for "today" keyword  
      else if (start_time.toLowerCase().includes('today')) {
        const timeMatch = start_time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2] || '0');
          const meridiem = timeMatch[3]?.toLowerCase();
          
          if (meridiem === 'pm' && hours < 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
          
          startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        }
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
          
          startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        }
      }
    }
    
    console.log('Parsed start date:', startDate);
    
    if (isNaN(startDate.getTime())) {
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
      endDate = new Date(end_time);
      if (isNaN(endDate.getTime())) {
        // If end_time is invalid, default to 1 hour after start
        endDate = new Date(startDate);
        endDate.setHours(endDate.getHours() + 1);
      }
    } catch (e) {
      endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1);
    }
  } else {
    endDate = new Date(startDate);
    if (eventType === 'meeting' || eventType === 'court_date' || eventType === 'deposition') {
      endDate.setHours(endDate.getHours() + 1);
    } else {
      endDate.setMinutes(endDate.getMinutes() + 30);
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
      message: `Created ${eventType} "${title}" scheduled for ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}`,
      data: { id: event.id, title: event.title, start: event.start_time, end: event.end_time, type: event.type }
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
// DOCUMENT FUNCTIONS
// =============================================================================
async function listDocuments(args, user) {
  const { matter_id, client_id, search, limit = 20 } = args;
  
  let sql = `
    SELECT d.id, d.name, d.type, d.size, d.status, d.uploaded_at, m.name as matter_name, c.display_name as client_name
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
  
  sql += ` ORDER BY d.uploaded_at DESC LIMIT ${Math.min(parseInt(limit), 50)}`;
  
  const result = await query(sql, params);
  
  return {
    documents: result.rows.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      size: d.size,
      status: d.status,
      matter: d.matter_name,
      client: d.client_name,
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
  
  const expenseDate = date || new Date().toISOString().split('T')[0];
  
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
  const timestamp = new Date().toLocaleString();
  const newNote = `\n\n[${timestamp} - ${user.firstName} ${user.lastName}]\n${content}`;
  
  await query('UPDATE matters SET ai_summary = $1 WHERE id = $2', [existingNotes + newNote, matter_id]);
  
  return {
    success: true,
    message: `Added note to matter "${matterCheck.rows[0].name}"`
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
// SYSTEM PROMPT
// =============================================================================
function getSystemPrompt() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return `You are an intelligent AI assistant for Apex Legal, a law firm management platform. You can both answer questions AND take actions on behalf of the user.

## Your Capabilities
You have access to tools for:

### Data Management
- **Time Entries**: Log time, view/edit/delete entries
- **Matters**: Create, view, update, search matters
- **Clients**: Create, view, update, search clients
- **Invoices**: Create, view, send invoices, record payments
- **Calendar**: Create, view, update, delete events and meetings
- **Documents**: View document information
- **Expenses**: Create and view expenses
- **Team**: View team members
- **Analytics**: View firm stats (admin only) and personal stats

### Matter Permissions & Sharing
- **get_matter_permissions**: See who has access to a matter
- **share_matter**: Share a matter with a user or group
- **remove_matter_permission**: Remove someone's access to a matter
- **update_matter_visibility**: Change a matter between "firm_wide" and "restricted"

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

## IMPORTANT: Creating Matters and Clients
- When the user asks to CREATE a matter or case, ALWAYS use the create_matter tool. Just ask for a name if they haven't provided one.
- When the user asks to CREATE a client, ALWAYS use the create_client tool.
- DO NOT say you cannot create matters or clients - you CAN and SHOULD use these tools.
- ALL users have permission to create matters and clients, regardless of their role.

## Calendar Events - IMPORTANT
When creating calendar events, use create_calendar_event. For start_time, you MUST provide an ISO 8601 datetime string.
- Today is: ${today.toISOString().split('T')[0]}
- Tomorrow is: ${tomorrow.toISOString().split('T')[0]}
- For "tomorrow at 2pm", use: "${tomorrow.toISOString().split('T')[0]}T14:00:00"
- For "today at 3pm", use: "${today.toISOString().split('T')[0]}T15:00:00"

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

## Important: All users CAN create matters and clients
- ANY user (including paralegals, staff, and billing users) can create new matters and new clients
- This is standard for legal practice management - everyone in the firm should be able to onboard new work
- When viewing existing matters, non-admin users can only see matters they're assigned to or have permission for
- But creating NEW matters is allowed for everyone`;
}

// =============================================================================
// MAIN CHAT ENDPOINT
// =============================================================================
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_DEPLOYMENT) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const systemPrompt = getSystemPrompt()
      .replace('{{USER_ROLE}}', req.user.role)
      .replace('{{USER_NAME}}', `${req.user.firstName} ${req.user.lastName}`);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-10).map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: message }
    ];

    let response = await callAzureOpenAIWithTools(messages, TOOLS);
    
    let iterations = 0;
    const maxIterations = 10;
    let navigationResult = null; // Track navigation commands
    
    while (response.tool_calls && iterations < maxIterations) {
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
        const result = await executeTool(functionName, functionArgs, req.user);
        console.log(`Tool ${functionName} result:`, JSON.stringify(result));
        
        // Capture navigation results
        if (result.navigation) {
          navigationResult = result.navigation;
          console.log('Navigation result captured:', navigationResult);
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

    // Build response with optional navigation
    const responsePayload = {
      response: response.content,
      toolsUsed: iterations > 0
    };
    
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
