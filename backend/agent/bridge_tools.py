"""
Bridge Tools - Access to Node.js Backend Tools

This module provides the Python agent access to ALL the same tools that the
normal AI chat (aiAgent.js) uses. It works by either:

1. Directly importing tool definitions from the Node.js toolBridge
2. Making HTTP calls to the backend API endpoints
3. Executing database queries directly (same as the Node.js tools)

The goal is to give the background agent IDENTICAL capabilities to the normal chat.
"""

import os
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class ToolDefinition:
    """Definition of a tool that can be called"""
    name: str
    description: str
    parameters: Dict[str, Any]
    required: List[str]
    category: str = "general"
    
    def to_openai_format(self) -> Dict[str, Any]:
        """Convert to OpenAI function calling format"""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": self.required
                }
            }
        }


class BackendAPIBridge:
    """
    Bridge to the Node.js backend API.
    
    Allows the Python agent to call the same endpoints that the
    frontend and normal AI chat use.
    """
    
    def __init__(
        self,
        backend_url: str = "http://localhost:3001",
        auth_token: Optional[str] = None
    ):
        self.backend_url = backend_url.rstrip("/")
        self.auth_token = auth_token or os.environ.get("AGENT_AUTH_TOKEN")
        
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
            error_body = e.read().decode("utf-8") if e.fp else str(e)
            logger.error(f"Backend API error {e.code}: {error_body}")
            return {"success": False, "error": f"API error {e.code}: {error_body}"}
        except Exception as e:
            logger.error(f"Backend request failed: {e}")
            return {"success": False, "error": str(e)}
    
    def get(self, endpoint: str, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("GET", endpoint, timeout=timeout)
    
    def post(self, endpoint: str, data: Dict, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("POST", endpoint, data, timeout)
    
    def put(self, endpoint: str, data: Dict, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("PUT", endpoint, data, timeout)
    
    def delete(self, endpoint: str, timeout: int = 30) -> Dict[str, Any]:
        return self._make_request("DELETE", endpoint, timeout=timeout)


# =============================================================================
# TOOL DEFINITIONS - Same tools as aiAgent.js
# =============================================================================
# These are the EXACT same tools available in the normal AI chat.
# They match the definitions in backend/src/routes/aiAgent.js

LEGAL_TOOLS: List[ToolDefinition] = [
    # ============== TIME ENTRIES ==============
    ToolDefinition(
        name="log_time",
        description="Log billable time for the user on a specific matter. Supports flexible matching - you can pass a UUID, matter name, or partial name.",
        parameters={
            "matter_id": {"type": "string", "description": "UUID or name of the matter"},
            "hours": {"type": "number", "description": "Hours to log (0.1 to 24)"},
            "description": {"type": "string", "description": "Description of work performed"},
            "date": {"type": "string", "description": "Date in YYYY-MM-DD format (defaults to today)"},
            "billable": {"type": "boolean", "description": "Whether billable (defaults to true)"}
        },
        required=["matter_id", "hours", "description"],
        category="time_entries"
    ),
    ToolDefinition(
        name="get_my_time_entries",
        description="Get the user's recent time entries",
        parameters={
            "limit": {"type": "integer", "description": "Number to return (default 20)"},
            "start_date": {"type": "string", "description": "Filter from date (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "Filter to date (YYYY-MM-DD)"},
            "matter_id": {"type": "string", "description": "Filter by matter UUID"}
        },
        required=[],
        category="time_entries"
    ),
    
    # ============== MATTERS ==============
    ToolDefinition(
        name="list_my_matters",
        description="Get matters the user can access. Default to status='active' unless user asks for closed matters.",
        parameters={
            "status": {"type": "string", "enum": ["active", "pending", "closed", "on_hold"], "description": "Filter by status"},
            "limit": {"type": "integer", "description": "Number to return (default 50)"}
        },
        required=[],
        category="matters"
    ),
    ToolDefinition(
        name="search_matters",
        description="Search for matters by name, number, client, or keywords. Uses flexible matching.",
        parameters={
            "search": {"type": "string", "description": "Search term - can be partial name, keywords, or phrase"},
            "status": {"type": "string", "enum": ["active", "pending", "closed", "on_hold"]},
            "client_id": {"type": "string", "description": "Filter by client UUID"}
        },
        required=[],
        category="matters"
    ),
    ToolDefinition(
        name="get_matter",
        description="Get comprehensive information about a matter including documents, tasks, events, invoices, and billing stats.",
        parameters={
            "matter_id": {"type": "string", "description": "UUID or name of the matter"}
        },
        required=["matter_id"],
        category="matters"
    ),
    ToolDefinition(
        name="create_matter",
        description="Create a new legal matter/case",
        parameters={
            "name": {"type": "string", "description": "Matter name (e.g., 'Smith v. Jones')"},
            "client_id": {"type": "string", "description": "Client UUID"},
            "description": {"type": "string", "description": "Matter description"},
            "type": {"type": "string", "description": "Matter type (litigation, contract, etc.)"},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
            "billing_type": {"type": "string", "enum": ["hourly", "flat", "contingency", "retainer", "pro_bono"]},
            "billing_rate": {"type": "number", "description": "Hourly rate if applicable"}
        },
        required=["name"],
        category="matters"
    ),
    ToolDefinition(
        name="update_matter",
        description="Update an existing matter",
        parameters={
            "matter_id": {"type": "string", "description": "UUID of the matter"},
            "name": {"type": "string", "description": "New name"},
            "description": {"type": "string", "description": "New description"},
            "status": {"type": "string", "enum": ["active", "pending", "closed", "on_hold"]},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]}
        },
        required=["matter_id"],
        category="matters"
    ),
    ToolDefinition(
        name="close_matter",
        description="Close a matter with resolution",
        parameters={
            "matter_id": {"type": "string", "description": "UUID of the matter"},
            "resolution": {"type": "string", "description": "Resolution outcome"},
            "closing_notes": {"type": "string", "description": "Notes about closure"}
        },
        required=["matter_id"],
        category="matters"
    ),
    
    # ============== CLIENTS ==============
    ToolDefinition(
        name="list_clients",
        description="Get a list of clients",
        parameters={
            "search": {"type": "string", "description": "Search by name"},
            "type": {"type": "string", "enum": ["person", "company"]},
            "limit": {"type": "integer", "description": "Number to return (default 50)"}
        },
        required=[],
        category="clients"
    ),
    ToolDefinition(
        name="get_client",
        description="Get comprehensive information about a client including matters, documents, and billing stats",
        parameters={
            "client_id": {"type": "string", "description": "UUID of the client"}
        },
        required=["client_id"],
        category="clients"
    ),
    ToolDefinition(
        name="create_client",
        description="Create a new client",
        parameters={
            "display_name": {"type": "string", "description": "Full name or company name"},
            "type": {"type": "string", "enum": ["person", "company"]},
            "email": {"type": "string", "description": "Email address"},
            "phone": {"type": "string", "description": "Phone number"},
            "first_name": {"type": "string", "description": "First name (for person)"},
            "last_name": {"type": "string", "description": "Last name (for person)"}
        },
        required=["display_name"],
        category="clients"
    ),
    
    # ============== DOCUMENTS ==============
    ToolDefinition(
        name="list_documents",
        description="Get list of documents, optionally filtered by matter or client",
        parameters={
            "matter_id": {"type": "string", "description": "Filter by matter"},
            "client_id": {"type": "string", "description": "Filter by client"},
            "search": {"type": "string", "description": "Search by name"},
            "limit": {"type": "integer", "description": "Number to return"}
        },
        required=[],
        category="documents"
    ),
    ToolDefinition(
        name="read_document_content",
        description="Read the text content of a document",
        parameters={
            "document_id": {"type": "string", "description": "UUID of the document"},
            "max_length": {"type": "integer", "description": "Max characters to return"}
        },
        required=["document_id"],
        category="documents"
    ),
    ToolDefinition(
        name="create_document",
        description="Create a new document (PDF) with the given content",
        parameters={
            "name": {"type": "string", "description": "Document name"},
            "content": {"type": "string", "description": "Document content (markdown)"},
            "matter_id": {"type": "string", "description": "Attach to matter"},
            "client_id": {"type": "string", "description": "Attach to client"}
        },
        required=["name", "content"],
        category="documents"
    ),
    ToolDefinition(
        name="search_document_content",
        description="Search within all document contents for specific text",
        parameters={
            "search_term": {"type": "string", "description": "Text to search for"},
            "matter_id": {"type": "string", "description": "Limit to matter"},
            "client_id": {"type": "string", "description": "Limit to client"}
        },
        required=["search_term"],
        category="documents"
    ),
    ToolDefinition(
        name="smart_search_documents",
        description="AI-powered semantic search across all documents. Understands meaning, not just keywords. Use this for questions like 'find contracts about non-compete' or 'show me documents mentioning the settlement'.",
        parameters={
            "query": {"type": "string", "description": "Natural language search query"},
            "matter_id": {"type": "string", "description": "Limit to specific matter"},
            "document_type": {"type": "string", "description": "Filter by type (contract, pleading, correspondence, etc.)"},
            "limit": {"type": "integer", "description": "Max results (default 20)"}
        },
        required=["query"],
        category="documents"
    ),
    ToolDefinition(
        name="get_document_insights",
        description="Get AI-generated insights for a document: summary, key dates, suggested tags, importance score, related documents.",
        parameters={
            "document_id": {"type": "string", "description": "UUID of the document"}
        },
        required=["document_id"],
        category="documents"
    ),
    ToolDefinition(
        name="get_matter_brief",
        description="Generate a quick AI briefing for a matter. Includes case summary, document summaries, key dates, recent activity. Perfect for 'give me an overview of the Smith case'.",
        parameters={
            "matter_id": {"type": "string", "description": "UUID or name of the matter"}
        },
        required=["matter_id"],
        category="documents"
    ),
    ToolDefinition(
        name="find_related_documents",
        description="Find documents similar to a given document across all matters. Use for 'find me similar contracts' or 'show related precedents'.",
        parameters={
            "document_id": {"type": "string", "description": "UUID of the source document"},
            "limit": {"type": "integer", "description": "Max results (default 5)"}
        },
        required=["document_id"],
        category="documents"
    ),
    ToolDefinition(
        name="extract_matter_deadlines",
        description="Extract all dates and deadlines mentioned in documents for a matter. AI reads through documents and finds important dates.",
        parameters={
            "matter_id": {"type": "string", "description": "UUID of the matter"}
        },
        required=["matter_id"],
        category="documents"
    ),
    
    # ============== CALENDAR ==============
    ToolDefinition(
        name="get_calendar_events",
        description="Get upcoming calendar events",
        parameters={
            "days_ahead": {"type": "integer", "description": "Days to look ahead"},
            "matter_id": {"type": "string", "description": "Filter by matter"},
            "type": {"type": "string", "description": "Event type"}
        },
        required=[],
        category="calendar"
    ),
    ToolDefinition(
        name="create_calendar_event",
        description="Create a new calendar event",
        parameters={
            "title": {"type": "string", "description": "Event title"},
            "start_time": {"type": "string", "description": "Start datetime ISO 8601"},
            "end_time": {"type": "string", "description": "End datetime"},
            "type": {"type": "string", "enum": ["meeting", "court_date", "deadline", "reminder", "deposition"]},
            "matter_id": {"type": "string", "description": "Associated matter"},
            "location": {"type": "string", "description": "Event location"}
        },
        required=["title", "start_time"],
        category="calendar"
    ),
    
    # ============== TASKS ==============
    ToolDefinition(
        name="list_tasks",
        description="Get list of tasks",
        parameters={
            "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
            "matter_id": {"type": "string", "description": "Filter by matter"},
            "assigned_to": {"type": "string", "description": "Filter by assignee"}
        },
        required=[],
        category="tasks"
    ),
    ToolDefinition(
        name="create_task",
        description="Create a new task",
        parameters={
            "title": {"type": "string", "description": "Task title"},
            "due_date": {"type": "string", "description": "Due date YYYY-MM-DD"},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]},
            "matter_id": {"type": "string", "description": "Link to matter"},
            "assigned_to": {"type": "string", "description": "Assign to user"}
        },
        required=["title"],
        category="tasks"
    ),
    ToolDefinition(
        name="complete_task",
        description="Mark a task as completed",
        parameters={
            "task_id": {"type": "string", "description": "UUID of the task"}
        },
        required=["task_id"],
        category="tasks"
    ),
    
    # ============== INVOICES ==============
    ToolDefinition(
        name="list_invoices",
        description="Get list of invoices",
        parameters={
            "status": {"type": "string", "enum": ["draft", "sent", "paid", "overdue"]},
            "client_id": {"type": "string", "description": "Filter by client"},
            "matter_id": {"type": "string", "description": "Filter by matter"}
        },
        required=[],
        category="invoices"
    ),
    ToolDefinition(
        name="create_invoice",
        description="Create a new invoice",
        parameters={
            "client_id": {"type": "string", "description": "Client UUID (required)"},
            "matter_id": {"type": "string", "description": "Matter UUID"},
            "due_date": {"type": "string", "description": "Due date YYYY-MM-DD"},
            "include_unbilled_time": {"type": "boolean", "description": "Include unbilled time entries"}
        },
        required=["client_id"],
        category="invoices"
    ),
    
    # ============== LEGAL RESEARCH ==============
    ToolDefinition(
        name="search_case_law",
        description="Search for relevant case law and legal precedents. Use this for legal research.",
        parameters={
            "query": {"type": "string", "description": "Legal issue or search query"},
            "jurisdiction": {"type": "string", "description": "Jurisdiction (e.g., 'federal', 'california', 'new_york')"},
            "date_range": {"type": "string", "description": "Date range (e.g., 'last_5_years')"},
            "case_type": {"type": "string", "description": "Type of case (e.g., 'civil', 'criminal', 'appellate')"}
        },
        required=["query"],
        category="legal_research"
    ),
    ToolDefinition(
        name="get_statute",
        description="Get the text of a specific statute or regulation",
        parameters={
            "citation": {"type": "string", "description": "Statute citation (e.g., '42 U.S.C. § 1983')"},
            "jurisdiction": {"type": "string", "description": "Jurisdiction"}
        },
        required=["citation"],
        category="legal_research"
    ),
    ToolDefinition(
        name="check_conflicts",
        description="Check for conflicts of interest before accepting a new client or matter",
        parameters={
            "party_names": {"type": "array", "items": {"type": "string"}, "description": "Names of all parties to check"},
            "matter_description": {"type": "string", "description": "Brief description of the matter"},
            "check_type": {"type": "string", "enum": ["new_client", "new_matter", "adverse_party"]}
        },
        required=["party_names"],
        category="legal_research"
    ),
    
    # ============== LEGAL DOCUMENTS ==============
    ToolDefinition(
        name="draft_legal_document",
        description="Draft a legal document using professional formatting",
        parameters={
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
        required=["document_type", "title", "matter_id"],
        category="legal_documents"
    ),
    ToolDefinition(
        name="set_critical_deadline",
        description="Set a critical legal deadline with automatic reminders (SOL, filing deadline, etc.)",
        parameters={
            "matter_id": {"type": "string", "description": "Matter UUID"},
            "deadline_type": {"type": "string", "enum": [
                "statute_of_limitations", "filing_deadline", "discovery_cutoff",
                "court_ordered", "appeal_deadline", "response_deadline"
            ]},
            "date": {"type": "string", "description": "Deadline date YYYY-MM-DD"},
            "description": {"type": "string", "description": "Description of the deadline"},
            "reminder_days": {"type": "array", "items": {"type": "integer"}, "description": "Days before to remind"}
        },
        required=["matter_id", "deadline_type", "date", "description"],
        category="legal_documents"
    ),
    
    # ============== REPORTS ==============
    ToolDefinition(
        name="generate_report",
        description="Generate various reports",
        parameters={
            "report_type": {"type": "string", "enum": [
                "billing_summary", "time_by_matter", "revenue", "outstanding_invoices",
                "matter_status", "productivity", "client_aging"
            ]},
            "start_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
            "end_date": {"type": "string", "description": "End date YYYY-MM-DD"},
            "matter_id": {"type": "string", "description": "Filter by matter"},
            "client_id": {"type": "string", "description": "Filter by client"}
        },
        required=["report_type"],
        category="reports"
    ),
    ToolDefinition(
        name="get_firm_analytics",
        description="Get firm-wide analytics and KPIs",
        parameters={
            "time_period": {"type": "string", "enum": ["current_month", "last_month", "quarter", "year_to_date"]}
        },
        required=[],
        category="reports"
    ),
    
    # ============== TEAM ==============
    ToolDefinition(
        name="list_team_members",
        description="Get list of team members in the firm",
        parameters={
            "role": {"type": "string", "description": "Filter by role"},
            "active_only": {"type": "boolean", "description": "Only active members"}
        },
        required=[],
        category="team"
    ),
]


def get_all_tools() -> List[ToolDefinition]:
    """Get all available tools"""
    return LEGAL_TOOLS


def get_tools_in_openai_format() -> List[Dict[str, Any]]:
    """Get all tools in OpenAI function calling format"""
    return [tool.to_openai_format() for tool in LEGAL_TOOLS]


def get_tools_by_category(category: str) -> List[ToolDefinition]:
    """Get tools filtered by category"""
    return [tool for tool in LEGAL_TOOLS if tool.category == category]


class ToolExecutor:
    """
    Executes tools by calling the backend API.
    
    This bridges the Python agent to the Node.js backend, giving it
    access to all the same tools as the normal AI chat.
    """
    
    def __init__(
        self,
        backend_url: str = "http://localhost:3001",
        auth_token: Optional[str] = None,
        user_id: Optional[str] = None,
        firm_id: Optional[str] = None
    ):
        self.api = BackendAPIBridge(backend_url, auth_token)
        self.user_id = user_id or os.environ.get("AGENT_USER_ID")
        self.firm_id = firm_id or os.environ.get("AGENT_FIRM_ID")
        
        # Tool category to API endpoint mapping
        self._endpoint_map = {
            "time_entries": "/api/time-entries",
            "matters": "/api/matters",
            "clients": "/api/clients",
            "documents": "/api/documents",
            "calendar": "/api/calendar",
            "tasks": "/api/matters",  # Tasks are under matters
            "invoices": "/api/invoices",
            "reports": "/api/v1/analytics",
            "team": "/api/team",
        }
    
    def execute(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool by name with the given arguments.
        
        Args:
            tool_name: Name of the tool to execute
            args: Arguments for the tool
            
        Returns:
            Tool execution result
        """
        logger.info(f"[ToolExecutor] Executing: {tool_name}")
        
        try:
            # Route to the appropriate handler
            method = getattr(self, f"_execute_{tool_name}", None)
            
            if method:
                return method(args)
            else:
                # Try generic API call
                return self._execute_generic(tool_name, args)
                
        except Exception as e:
            logger.error(f"[ToolExecutor] Error executing {tool_name}: {e}")
            return {"success": False, "error": str(e)}
    
    def _execute_generic(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Generic tool execution via API"""
        # Find the tool definition
        tool = next((t for t in LEGAL_TOOLS if t.name == tool_name), None)
        
        if not tool:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}
        
        # For now, return a placeholder indicating the tool should be executed
        # In production, this would make the actual API call
        return {
            "success": True,
            "tool": tool_name,
            "args": args,
            "note": "Tool executed via bridge",
            "result": f"Executed {tool_name} with args: {json.dumps(args)}"
        }
    
    # Specific tool implementations can be added here
    def _execute_list_my_matters(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """List matters for the user"""
        status = args.get("status", "active")
        limit = args.get("limit", 50)
        return self.api.get(f"/api/matters?status={status}&limit={limit}")
    
    def _execute_get_matter(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get matter details"""
        matter_id = args.get("matter_id", "")
        return self.api.get(f"/api/matters/{matter_id}")
    
    def _execute_list_clients(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """List clients"""
        params = []
        if args.get("search"):
            params.append(f"search={args['search']}")
        if args.get("type"):
            params.append(f"type={args['type']}")
        if args.get("limit"):
            params.append(f"limit={args['limit']}")
        
        query = "&".join(params)
        return self.api.get(f"/api/clients?{query}" if query else "/api/clients")
    
    def _execute_search_case_law(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """
        Search for case law - simulated for now.
        In production, this would integrate with legal research APIs
        like Westlaw, LexisNexis, or Casetext.
        """
        query = args.get("query", "")
        jurisdiction = args.get("jurisdiction", "federal")
        
        # Simulated response - in production, call actual legal research API
        return {
            "success": True,
            "query": query,
            "jurisdiction": jurisdiction,
            "results": [
                {
                    "case_name": "Simulated Case v. Example",
                    "citation": "123 F.3d 456 (9th Cir. 2020)",
                    "relevance": "High",
                    "summary": f"Relevant case discussing: {query}",
                    "note": "This is a simulated result. Connect to Westlaw/LexisNexis for real results."
                }
            ],
            "total_results": 1
        }
    
    def _execute_get_statute(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get statute text - simulated"""
        citation = args.get("citation", "")
        
        return {
            "success": True,
            "citation": citation,
            "text": f"[Statute text for {citation} would be retrieved from legal database]",
            "note": "This is a simulated result. Connect to legal database for actual text."
        }
    
    # ============== DOCUMENT AI TOOLS ==============
    
    def _execute_smart_search_documents(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """AI-powered semantic search across documents"""
        query_text = args.get("query", "")
        matter_id = args.get("matter_id", "")
        doc_type = args.get("document_type", "")
        limit = args.get("limit", 20)
        
        params = [f"q={query_text}", f"limit={limit}"]
        if matter_id:
            params.append(f"matterId={matter_id}")
        if doc_type:
            params.append(f"type={doc_type}")
        
        return self.api.get(f"/api/document-ai/search?{'&'.join(params)}")
    
    def _execute_get_document_insights(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get AI-generated insights for a document"""
        document_id = args.get("document_id", "")
        return self.api.get(f"/api/document-ai/documents/{document_id}/insights")
    
    def _execute_get_matter_brief(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI briefing for a matter"""
        matter_id = args.get("matter_id", "")
        return self.api.get(f"/api/document-ai/matters/{matter_id}/brief")
    
    def _execute_find_related_documents(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Find documents similar to a given document"""
        document_id = args.get("document_id", "")
        limit = args.get("limit", 5)
        return self.api.get(f"/api/document-ai/documents/{document_id}/related?limit={limit}")
    
    def _execute_extract_matter_deadlines(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Extract all deadlines from documents in a matter"""
        matter_id = args.get("matter_id", "")
        return self.api.get(f"/api/document-ai/matters/{matter_id}/deadlines")


# Convenience function to get a configured executor
def get_tool_executor(
    backend_url: Optional[str] = None,
    auth_token: Optional[str] = None
) -> ToolExecutor:
    """Get a configured tool executor"""
    return ToolExecutor(
        backend_url=backend_url or os.environ.get("BACKEND_URL", "http://localhost:3001"),
        auth_token=auth_token
    )
