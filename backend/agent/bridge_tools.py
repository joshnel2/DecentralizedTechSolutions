"""
Bridge Tools - Access to Node.js Backend Tools

This module provides the Python agent access to ALL the same tools that the
normal AI chat (aiAgent.js) uses. It works by making HTTP calls to the
Node.js backend which has real database-backed implementations.

IMPORTANT: The Node.js backend (toolBridge.js) has REAL implementations for
every tool - actual PostgreSQL queries, Azure file storage, document generation,
conflict checking, deadline calculation, etc. This bridge delegates ALL tool
execution to the backend. No mock data. No placeholders.

Architecture:
  Python Agent -> HTTP POST -> Node.js Backend -> executeTool() -> PostgreSQL/Azure
"""

import os
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


class BackendAPIBridge:
    """
    Bridge to the Node.js backend API.
    
    Makes authenticated HTTP calls to the backend which has real
    tool implementations backed by PostgreSQL, Azure Storage, etc.
    """
    
    def __init__(
        self,
        backend_url: str = "http://localhost:3001",
        auth_token: Optional[str] = None
    ):
        self.backend_url = backend_url.rstrip("/")
        self.auth_token = auth_token or os.environ.get("AGENT_AUTH_TOKEN")
        self._healthy = None  # Cached health status
        
    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """Make an HTTP request to the backend"""
        url = f"{self.backend_url}{endpoint}"
        
        headers = {
            "Content-Type": "application/json"
        }
        
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        body = json.dumps(data).encode("utf-8") if data else None
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode("utf-8") if e.fp else str(e)
            except:
                error_body = str(e)
            logger.error(f"Backend API error {e.code} on {endpoint}: {error_body[:200]}")
            return {"error": f"API error {e.code}: {error_body[:200]}"}
        except urllib.error.URLError as e:
            logger.error(f"Backend connection error on {endpoint}: {e}")
            return {"error": f"Backend unavailable: {e}"}
        except Exception as e:
            logger.error(f"Backend request failed on {endpoint}: {e}")
            return {"error": str(e)}
    
    def check_health(self) -> bool:
        """Check if the backend is reachable and healthy"""
        try:
            result = self._make_request("GET", "/api/health", timeout=5)
            self._healthy = "error" not in result
            return self._healthy
        except:
            self._healthy = False
            return False
    
    def is_healthy(self) -> bool:
        """Return cached health status, or check if unknown"""
        if self._healthy is None:
            return self.check_health()
        return self._healthy
    
    def get(self, endpoint: str, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("GET", endpoint, timeout=timeout)
    
    def post(self, endpoint: str, data: Dict, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("POST", endpoint, data, timeout)
    
    def put(self, endpoint: str, data: Dict, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("PUT", endpoint, data, timeout)
    
    def delete(self, endpoint: str, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("DELETE", endpoint, timeout=timeout)


class ToolExecutor:
    """
    Executes tools by delegating to the Node.js backend.
    
    The backend's toolBridge.js has real implementations for every tool:
    - Database queries against PostgreSQL
    - Azure Storage file operations
    - Real conflict checking across matters/clients
    - Real document generation (DOCX/PDF)
    - Real calendar event creation
    - Real deadline calculation with court rules
    
    This executor simply forwards tool calls to the backend and returns
    the real results. No mocks. No placeholders.
    """
    
    def __init__(
        self,
        backend_url: str = "http://localhost:3001",
        auth_token: Optional[str] = None,
        user_id: Optional[str] = None,
        firm_id: Optional[str] = None
    ):
        self.backend_bridge = BackendAPIBridge(backend_url, auth_token)
        self.user_id = user_id or os.environ.get("AGENT_USER_ID")
        self.firm_id = firm_id or os.environ.get("AGENT_FIRM_ID")
        self._backend_available = None
    
    def check_backend(self) -> bool:
        """Verify backend is available before executing tools"""
        available = self.backend_bridge.check_health()
        self._backend_available = available
        if not available:
            logger.warning("Backend is not available - tool execution will fail")
        return available
    
    def execute(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool by delegating to the Node.js backend.
        
        The backend's executeTool() function in toolBridge.js handles:
        - User context loading and authentication
        - Routing to the correct handler
        - Database queries
        - Error handling and retries
        
        Args:
            tool_name: Name of the tool to execute
            args: Arguments for the tool
            
        Returns:
            Real tool execution result from the backend
        """
        logger.info(f"[ToolExecutor] Executing: {tool_name}")
        
        # Use the internal tool execution endpoint
        # This calls the same executeTool() that the Node.js Amplifier service uses
        result = self.backend_bridge.post(
            "/api/v1/background-agent/execute-tool",
            {
                "toolName": tool_name,
                "params": args,
                "userId": self.user_id,
                "firmId": self.firm_id
            },
            timeout=60  # Some tools (document creation, reports) take time
        )
        
        if "error" in result and "Backend unavailable" in str(result.get("error", "")):
            logger.error(f"[ToolExecutor] Backend unavailable for {tool_name}")
            return {
                "error": f"Backend service is not running. Tool '{tool_name}' requires the Node.js backend. "
                         f"Start the backend with 'npm start' in the backend/ directory.",
                "tool": tool_name,
                "backend_required": True
            }
        
        return result


def get_tool_executor(
    backend_url: Optional[str] = None,
    auth_token: Optional[str] = None,
    user_id: Optional[str] = None,
    firm_id: Optional[str] = None
) -> ToolExecutor:
    """Get a configured tool executor that delegates to the real backend"""
    return ToolExecutor(
        backend_url=backend_url or os.environ.get("BACKEND_URL", "http://localhost:3001"),
        auth_token=auth_token,
        user_id=user_id,
        firm_id=firm_id
    )


def get_tools_in_openai_format() -> List[Dict[str, Any]]:
    """
    Get tool definitions in OpenAI function calling format.
    
    These match the EXACT tool definitions from aiAgent.js / toolBridge.js
    in the Node.js backend. The descriptions and parameters are kept in sync
    so the LLM generates correct tool calls that the backend can execute.
    """
    return LEGAL_TOOLS_OPENAI


# =============================================================================
# TOOL DEFINITIONS IN OPENAI FORMAT
# =============================================================================
# These MUST match the tools in backend/src/routes/aiAgent.js
# They are used by the LLM to decide which tools to call and with what params.
# The actual execution happens in the Node.js backend via ToolExecutor.

LEGAL_TOOLS_OPENAI = [
    # ============== TIME ENTRIES ==============
    {
        "type": "function",
        "function": {
            "name": "log_time",
            "description": "Log billable time for the user on a specific matter. Supports flexible matching - pass a UUID, matter name, or partial name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "UUID or name of the matter"},
                    "hours": {"type": "number", "description": "Hours to log (0.1 to 24)"},
                    "description": {"type": "string", "description": "Description of work performed"},
                    "date": {"type": "string", "description": "Date YYYY-MM-DD (defaults to today)"},
                    "billable": {"type": "boolean", "description": "Whether billable (defaults to true)"}
                },
                "required": ["matter_id", "hours", "description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_time_entries",
            "description": "Get the user's recent time entries.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Number to return (default 20)"},
                    "start_date": {"type": "string", "description": "Filter from date (YYYY-MM-DD)"},
                    "end_date": {"type": "string", "description": "Filter to date (YYYY-MM-DD)"},
                    "matter_id": {"type": "string", "description": "Filter by matter UUID"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_time_entry",
            "description": "Update an existing time entry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "time_entry_id": {"type": "string", "description": "UUID of the time entry to update"},
                    "hours": {"type": "number", "description": "New hours value"},
                    "description": {"type": "string", "description": "New description"},
                    "date": {"type": "string", "description": "New date (YYYY-MM-DD)"},
                    "billable": {"type": "boolean", "description": "Whether billable"}
                },
                "required": ["time_entry_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_time_entry",
            "description": "Delete a time entry. Cannot delete if already billed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "time_entry_id": {"type": "string", "description": "UUID of the time entry to delete"}
                },
                "required": ["time_entry_id"]
            }
        }
    },
    # ============== MATTERS ==============
    {
        "type": "function",
        "function": {
            "name": "list_my_matters",
            "description": "Get matters the user can access. Default to status='active' unless asked for closed matters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["active", "pending", "closed", "on_hold"], "description": "Filter by status"},
                    "limit": {"type": "integer", "description": "Number to return (default 50)"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_matters",
            "description": "Search for matters by name, number, client, or keywords. Uses flexible matching.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Search term - can be partial name, keywords, or phrase"},
                    "status": {"type": "string", "enum": ["active", "pending", "closed", "on_hold"]},
                    "client_id": {"type": "string", "description": "Filter by client UUID"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_matter",
            "description": "Get comprehensive information about a matter including documents, tasks, events, invoices, and billing stats. Supports flexible matching by UUID or name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "UUID or name of the matter"}
                },
                "required": ["matter_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_matter",
            "description": "Create a new legal matter/case.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Matter name (e.g., 'Smith v. Jones')"},
                    "client_id": {"type": "string", "description": "Client UUID"},
                    "description": {"type": "string", "description": "Matter description"},
                    "type": {"type": "string", "description": "Matter type (litigation, contract, etc.)"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "billing_type": {"type": "string", "enum": ["hourly", "flat", "contingency", "retainer", "pro_bono"]},
                    "billing_rate": {"type": "number", "description": "Hourly rate if applicable"}
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_matter",
            "description": "Update an existing matter.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "UUID of the matter"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "status": {"type": "string", "enum": ["active", "pending", "closed", "on_hold"]},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]}
                },
                "required": ["matter_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "close_matter",
            "description": "Close a matter with resolution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "UUID of the matter"},
                    "resolution": {"type": "string", "description": "Resolution outcome"},
                    "closing_notes": {"type": "string", "description": "Notes about closure"}
                },
                "required": ["matter_id"]
            }
        }
    },
    # ============== CLIENTS ==============
    {
        "type": "function",
        "function": {
            "name": "list_clients",
            "description": "Get a list of clients.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Search by name"},
                    "type": {"type": "string", "enum": ["person", "company"]},
                    "limit": {"type": "integer", "description": "Number to return (default 50)"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_client",
            "description": "Get comprehensive information about a client including matters, documents, and billing stats.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "description": "UUID of the client"}
                },
                "required": ["client_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_client",
            "description": "Create a new client.",
            "parameters": {
                "type": "object",
                "properties": {
                    "display_name": {"type": "string", "description": "Full name or company name"},
                    "type": {"type": "string", "enum": ["person", "company"]},
                    "email": {"type": "string", "description": "Email address"},
                    "phone": {"type": "string", "description": "Phone number"},
                    "first_name": {"type": "string", "description": "First name (for person)"},
                    "last_name": {"type": "string", "description": "Last name (for person)"}
                },
                "required": ["display_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_client",
            "description": "Update an existing client.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "description": "UUID of the client"},
                    "display_name": {"type": "string"},
                    "email": {"type": "string"},
                    "phone": {"type": "string"}
                },
                "required": ["client_id"]
            }
        }
    },
    # ============== DOCUMENTS ==============
    {
        "type": "function",
        "function": {
            "name": "list_documents",
            "description": "Get list of documents, optionally filtered by matter or client. Includes files synced from integrations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "Filter by matter"},
                    "client_id": {"type": "string", "description": "Filter by client"},
                    "search": {"type": "string", "description": "Search by name"},
                    "source": {"type": "string", "description": "Filter by source: 'local', 'onedrive', 'googledrive', 'dropbox'"},
                    "limit": {"type": "integer", "description": "Number to return"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_document",
            "description": "Get information about a specific document by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document"}
                },
                "required": ["document_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_document_content",
            "description": "Read the text content of a document by ID. Extracts text from PDF, DOCX, and other formats. Use this to see what's inside documents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document"},
                    "max_length": {"type": "integer", "description": "Max characters to return (default 10000, max 50000)"}
                },
                "required": ["document_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "find_and_read_document",
            "description": "Find a document by name and read its content. Searches flexibly - use partial names, keywords, or descriptions. Case-insensitive.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_name": {"type": "string", "description": "Search term - partial name, keyword, or any part of document name"},
                    "matter_id": {"type": "string", "description": "Optional: limit search to specific matter"},
                    "max_length": {"type": "integer", "description": "Max characters to return (default 10000)"}
                },
                "required": ["document_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_matter_documents_content",
            "description": "Get a summary of all documents attached to a matter, including content previews. Useful for understanding the full picture of a case.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "UUID of the matter"},
                    "include_content": {"type": "boolean", "description": "Include document content previews (default true)"}
                },
                "required": ["matter_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_document",
            "description": "Create a formal Word document (.docx) saved to the platform. Use markdown formatting (# headers, - bullets, **bold**). ALWAYS include matter_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Document name without extension"},
                    "content": {"type": "string", "description": "Full text content with markdown formatting. Write COMPLETE professional legal content."},
                    "matter_id": {"type": "string", "description": "Matter UUID - ALWAYS INCLUDE. Use search_matters to find it."},
                    "client_id": {"type": "string", "description": "Client UUID (only if not attaching to a matter)"},
                    "tags": {"type": "array", "items": {"type": "string"}, "description": "Optional tags"}
                },
                "required": ["name", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_document",
            "description": "Create an edited version of an existing document. CLONES the original and applies changes to the new copy, preserving the original. New doc named 'Original Name (AI)'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "ID of the document to create an edited version of"},
                    "new_content": {"type": "string", "description": "The new/updated content for the edited version"},
                    "new_name": {"type": "string", "description": "Optional: custom name for the new document"}
                },
                "required": ["document_id", "new_content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_document",
            "description": "Permanently delete a document. WARNING: Cannot be undone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document to delete"},
                    "confirm": {"type": "boolean", "description": "Must be true to confirm deletion"}
                },
                "required": ["document_id", "confirm"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "move_document",
            "description": "Move a document to a different matter or client.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document to move"},
                    "new_matter_id": {"type": "string", "description": "UUID of the new matter"},
                    "new_client_id": {"type": "string", "description": "UUID of the new client"}
                },
                "required": ["document_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "rename_document",
            "description": "Rename a document.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document to rename"},
                    "new_name": {"type": "string", "description": "New name for the document"}
                },
                "required": ["document_id", "new_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "share_document",
            "description": "Share a document with a specific user, granting them view or edit access.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document to share"},
                    "user_id": {"type": "string", "description": "UUID of the user to share with"},
                    "permission_level": {"type": "string", "enum": ["view", "edit"], "description": "Access level (default: view)"}
                },
                "required": ["document_id", "user_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_document_versions",
            "description": "Get the version history of a document.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_id": {"type": "string", "description": "UUID of the document"}
                },
                "required": ["document_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_document_content",
            "description": "Search within document contents across all documents in the firm. Find specific clauses, terms, or information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_term": {"type": "string", "description": "Text to search for within documents"},
                    "matter_id": {"type": "string", "description": "Limit to matter"},
                    "client_id": {"type": "string", "description": "Limit to client"}
                },
                "required": ["search_term"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "draft_email_for_matter",
            "description": "Draft a professional email related to a matter. Can save to Outlook drafts and link to matter for record keeping.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "UUID of the matter this email relates to"},
                    "to": {"type": "string", "description": "Recipient email address(es), comma-separated"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Email body - write a complete professional email"},
                    "email_type": {"type": "string", "enum": ["client_update", "demand_letter", "settlement_proposal", "scheduling", "follow_up", "case_status", "document_request", "general"]},
                    "cc": {"type": "string", "description": "CC recipients, comma-separated"},
                    "save_to_outlook": {"type": "boolean", "description": "Save as draft in Outlook (default true if connected)"},
                    "link_to_matter": {"type": "boolean", "description": "Link email to matter for records (default true)"}
                },
                "required": ["matter_id", "subject", "body"]
            }
        }
    },
    # ============== MATTER NOTES ==============
    {
        "type": "function",
        "function": {
            "name": "add_matter_note",
            "description": "Add a quick note to a matter's Notes tab. Use for: case updates, meeting summaries, research findings, status updates, observations. For formal documents, use create_document instead.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "Matter UUID or name"},
                    "content": {"type": "string", "description": "Note content - use markdown for formatting"},
                    "note_type": {"type": "string", "enum": ["general", "case_note", "meeting_note", "research", "status_update", "client_communication", "court_filing", "discovery"]}
                },
                "required": ["matter_id", "content"]
            }
        }
    },
    # ============== CALENDAR ==============
    {
        "type": "function",
        "function": {
            "name": "get_calendar_events",
            "description": "Get upcoming calendar events.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days_ahead": {"type": "integer", "description": "Days to look ahead"},
                    "matter_id": {"type": "string", "description": "Filter by matter"},
                    "type": {"type": "string", "description": "Event type"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_calendar_event",
            "description": "Create a new calendar event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Event title"},
                    "start_time": {"type": "string", "description": "Start datetime ISO 8601"},
                    "end_time": {"type": "string", "description": "End datetime"},
                    "type": {"type": "string", "enum": ["meeting", "court_date", "deadline", "reminder", "deposition"]},
                    "matter_id": {"type": "string", "description": "Associated matter"},
                    "location": {"type": "string", "description": "Event location"}
                },
                "required": ["title", "start_time"]
            }
        }
    },
    # ============== TASKS ==============
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "Get list of tasks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                    "matter_id": {"type": "string", "description": "Filter by matter"},
                    "assigned_to": {"type": "string", "description": "Filter by assignee"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a new task.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Task title"},
                    "due_date": {"type": "string", "description": "Due date YYYY-MM-DD"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
                    "matter_id": {"type": "string", "description": "Link to matter"},
                    "assigned_to": {"type": "string", "description": "Assign to user"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "complete_task",
            "description": "Mark a task as completed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "UUID of the task"}
                },
                "required": ["task_id"]
            }
        }
    },
    # ============== INVOICES ==============
    {
        "type": "function",
        "function": {
            "name": "list_invoices",
            "description": "Get list of invoices.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["draft", "sent", "paid", "overdue"]},
                    "client_id": {"type": "string", "description": "Filter by client"},
                    "matter_id": {"type": "string", "description": "Filter by matter"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_invoice",
            "description": "Create a new invoice.",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "description": "Client UUID (required)"},
                    "matter_id": {"type": "string", "description": "Matter UUID"},
                    "due_date": {"type": "string", "description": "Due date YYYY-MM-DD"},
                    "include_unbilled_time": {"type": "boolean", "description": "Include unbilled time entries"}
                },
                "required": ["client_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_invoice",
            "description": "Mark an invoice as sent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "invoice_id": {"type": "string", "description": "Invoice UUID"}
                },
                "required": ["invoice_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "record_payment",
            "description": "Record a payment against an invoice.",
            "parameters": {
                "type": "object",
                "properties": {
                    "invoice_id": {"type": "string", "description": "Invoice UUID"},
                    "amount": {"type": "number", "description": "Payment amount"},
                    "payment_method": {"type": "string", "description": "Payment method"},
                    "payment_date": {"type": "string", "description": "Date YYYY-MM-DD"}
                },
                "required": ["invoice_id", "amount"]
            }
        }
    },
    # ============== LEGAL TOOLS ==============
    {
        "type": "function",
        "function": {
            "name": "check_conflicts",
            "description": "Check for conflicts of interest by searching all matters, clients, and parties in the firm's database. Returns real matches.",
            "parameters": {
                "type": "object",
                "properties": {
                    "party_names": {"type": "array", "items": {"type": "string"}, "description": "Names of all parties to check"},
                    "matter_description": {"type": "string", "description": "Brief description of the matter"},
                    "check_type": {"type": "string", "enum": ["new_client", "new_matter", "adverse_party"]}
                },
                "required": ["party_names"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_critical_deadline",
            "description": "Set a critical legal deadline with automatic reminders in the calendar (SOL, filing deadline, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "Matter UUID"},
                    "deadline_type": {"type": "string", "enum": [
                        "statute_of_limitations", "filing_deadline", "discovery_cutoff",
                        "court_ordered", "appeal_deadline", "response_deadline"
                    ]},
                    "date": {"type": "string", "description": "Deadline date YYYY-MM-DD"},
                    "description": {"type": "string", "description": "Description of the deadline"},
                    "reminder_days": {"type": "array", "items": {"type": "integer"}, "description": "Days before to remind"}
                },
                "required": ["matter_id", "deadline_type", "date", "description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_upcoming_deadlines",
            "description": "Get upcoming deadlines for a matter or across all matters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "Filter by matter (optional)"},
                    "days_ahead": {"type": "integer", "description": "Days to look ahead (default 30)"}
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "draft_legal_document",
            "description": "Draft a legal document using professional formatting. Creates a real DOCX file saved to the platform.",
            "parameters": {
                "type": "object",
                "properties": {
                    "document_type": {"type": "string", "enum": [
                        "motion", "brief", "memo", "contract", "letter", "pleading",
                        "discovery_request", "discovery_response", "settlement_agreement"
                    ]},
                    "title": {"type": "string", "description": "Document title"},
                    "matter_id": {"type": "string", "description": "Matter to attach to"},
                    "key_facts": {"type": "string", "description": "Key facts to include"},
                    "legal_issues": {"type": "string", "description": "Legal issues or claims"},
                    "requested_action": {"type": "string", "description": "What action is requested"},
                    "tone": {"type": "string", "enum": ["formal", "firm", "cordial", "aggressive"]}
                },
                "required": ["document_type", "title", "matter_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_deadline",
            "description": "Calculate a legal deadline based on court rules (business days, holidays, mailing rules).",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string", "description": "Starting date YYYY-MM-DD"},
                    "days": {"type": "integer", "description": "Number of days to add"},
                    "day_type": {"type": "string", "enum": ["calendar", "business", "court"], "description": "Type of days to count"},
                    "add_mailing_days": {"type": "boolean", "description": "Add 3 days for mailing (Rule 6(d))"}
                },
                "required": ["start_date", "days"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "log_billable_work",
            "description": "Log the work the agent just performed as a billable time entry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "matter_id": {"type": "string", "description": "Matter UUID"},
                    "description": {"type": "string", "description": "Description of work performed"},
                    "hours": {"type": "number", "description": "Hours spent"},
                    "activity_type": {"type": "string", "description": "Type of activity"}
                },
                "required": ["matter_id", "description", "hours"]
            }
        }
    },
    # ============== NY CPLR LEGAL REFERENCE ==============
    {
        "type": "function",
        "function": {
            "name": "lookup_cplr",
            "description": "Look up New York CPLR (Civil Practice Law and Rules) provisions. Returns actual statute text, deadlines, and practice guidance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "article": {"type": "string", "description": "CPLR article number or topic (e.g., '31', 'discovery', 'limitations')"},
                    "section": {"type": "string", "description": "Specific section number (e.g., '3101', '214')"}
                },
                "required": ["article"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_cplr_deadline",
            "description": "Calculate a deadline under NY CPLR rules, accounting for court days and holidays.",
            "parameters": {
                "type": "object",
                "properties": {
                    "trigger_date": {"type": "string", "description": "Date the clock starts (YYYY-MM-DD)"},
                    "period_type": {"type": "string", "description": "Type of period (e.g., 'answer', 'discovery_response', 'appeal')"},
                    "service_method": {"type": "string", "enum": ["personal", "mail", "electronic"], "description": "Method of service"}
                },
                "required": ["trigger_date", "period_type"]
            }
        }
    },
    # ============== REPORTS ==============
    {
        "type": "function",
        "function": {
            "name": "generate_report",
            "description": "Generate various reports (billing summary, time by matter, revenue, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "report_type": {"type": "string", "enum": [
                        "billing_summary", "time_by_matter", "revenue", "outstanding_invoices",
                        "matter_status", "productivity", "client_aging"
                    ]},
                    "start_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "End date YYYY-MM-DD"},
                    "matter_id": {"type": "string", "description": "Filter by matter"},
                    "client_id": {"type": "string", "description": "Filter by client"}
                },
                "required": ["report_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_firm_analytics",
            "description": "Get firm-wide analytics and KPIs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "time_period": {"type": "string", "enum": ["current_month", "last_month", "quarter", "year_to_date"]}
                },
                "required": []
            }
        }
    },
    # ============== TEAM ==============
    {
        "type": "function",
        "function": {
            "name": "list_team_members",
            "description": "Get list of team members in the firm.",
            "parameters": {
                "type": "object",
                "properties": {
                    "role": {"type": "string", "description": "Filter by role"},
                    "active_only": {"type": "boolean", "description": "Only active members"}
                },
                "required": []
            }
        }
    },
]
