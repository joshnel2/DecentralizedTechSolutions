"""
Retrieval Tools - Semantic Search for Legal Documents

Provides the background agent with access to the vector search system
via the Node.js backend API. All searches use real database queries
against the firm's actual documents.

NO MOCK DATA. If the backend is unavailable, tools return clear errors.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Try to import bridge tools for API access
try:
    from bridge_tools import BackendAPIBridge
    BRIDGE_AVAILABLE = True
except ImportError:
    BRIDGE_AVAILABLE = False
    logger.warning("Bridge tools not available")


@dataclass
class RetrievalToolDefinition:
    """Definition of a retrieval tool"""
    name: str
    description: str
    parameters: Dict[str, Any]
    required: List[str]
    
    def to_openai_format(self) -> Dict[str, Any]:
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


class RetrievalSystem:
    """
    Retrieval system for legal document search.
    
    All searches are executed via the Node.js backend which has real
    pgvector-based semantic search against the firm's actual documents.
    No mock data. No fallback results.
    """
    
    def __init__(
        self,
        firm_id: str,
        user_id: str,
        backend_bridge: Optional[Any] = None
    ):
        self.firm_id = firm_id
        self.user_id = user_id
        self.backend_bridge = backend_bridge
        
        if not backend_bridge and BRIDGE_AVAILABLE:
            self.backend_bridge = BackendAPIBridge()
    
    def _require_backend(self) -> Dict[str, Any]:
        """Return error if backend is not available"""
        if not self.backend_bridge:
            return {
                "error": "Backend is not available. Semantic search requires the Node.js backend "
                         "to be running with a PostgreSQL database configured with pgvector. "
                         "Start the backend with 'npm start' in the backend/ directory.",
                "backend_required": True
            }
        return None
    
    def search_semantic(
        self,
        query: str,
        limit: int = 10,
        threshold: float = 0.7,
        matter_id: Optional[str] = None,
        document_type: Optional[str] = None,
        include_graph_expansion: bool = True
    ) -> Dict[str, Any]:
        """Search for similar documents using semantic similarity via the real backend."""
        err = self._require_backend()
        if err:
            return err
        
        try:
            response = self.backend_bridge._make_request(
                "POST",
                "/api/search/semantic",
                data={
                    "query": query,
                    "limit": limit,
                    "threshold": threshold,
                    "matterId": matter_id,
                    "documentType": document_type,
                    "includeGraphExpansion": include_graph_expansion
                }
            )
            
            if "error" in response:
                return response
            
            return {
                "success": True,
                "query": query,
                "results": response.get("results", []),
                "count": response.get("count", len(response.get("results", [])))
            }
        except Exception as e:
            logger.error(f"Semantic search error: {e}")
            return {"error": str(e)}
    
    def search_hybrid(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """Hybrid search: semantic + keyword via the real backend."""
        err = self._require_backend()
        if err:
            return err
        
        try:
            response = self.backend_bridge._make_request(
                "POST",
                "/api/search/hybrid",
                data={"query": query, "limit": limit}
            )
            
            if "error" in response:
                return response
            
            return {
                "success": True,
                "query": query,
                "results": response.get("results", []),
                "semanticCount": response.get("semanticCount", 0),
                "keywordCount": response.get("keywordCount", 0)
            }
        except Exception as e:
            logger.error(f"Hybrid search error: {e}")
            return {"error": str(e)}
    
    def find_precedent(
        self,
        legal_issue: str,
        jurisdiction: Optional[str] = None,
        court_level: Optional[str] = None,
        limit: int = 5
    ) -> Dict[str, Any]:
        """Find legal precedent in the firm's actual documents."""
        query_parts = [legal_issue]
        if jurisdiction:
            query_parts.append(f"jurisdiction: {jurisdiction}")
        if court_level:
            query_parts.append(f"court level: {court_level}")
        
        result = self.search_semantic(
            query=" ".join(query_parts),
            limit=limit,
            threshold=0.6,
            document_type="case"
        )
        
        if "error" in result:
            return result
        
        return {
            "success": True,
            "legalIssue": legal_issue,
            "jurisdiction": jurisdiction,
            "courtLevel": court_level,
            "precedents": result.get("results", [])[:limit],
            "count": len(result.get("results", []))
        }
    
    def find_similar_clauses(
        self,
        clause_description: str,
        contract_type: Optional[str] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """Find similar contract clauses in the firm's actual documents."""
        query_parts = [clause_description]
        if contract_type:
            query_parts.append(f"contract type: {contract_type}")
        
        result = self.search_semantic(
            query=" ".join(query_parts),
            limit=limit,
            document_type="contract"
        )
        
        if "error" in result:
            return result
        
        return {
            "success": True,
            "clauseDescription": clause_description,
            "contractType": contract_type,
            "clauses": result.get("results", [])[:limit],
            "count": len(result.get("results", []))
        }
    
    def track_retrieval_feedback(
        self,
        query: str,
        retrieved_document_ids: List[str],
        selected_document_id: Optional[str] = None,
        rating: Optional[int] = None
    ) -> Dict[str, Any]:
        """Track retrieval feedback for the learning system."""
        err = self._require_backend()
        if err:
            return err
        
        try:
            return self.backend_bridge._make_request(
                "POST",
                "/api/retrieval/feedback",
                data={
                    "query": query,
                    "retrievedDocumentIds": retrieved_document_ids,
                    "selectedDocumentId": selected_document_id,
                    "rating": rating
                }
            )
        except Exception as e:
            logger.error(f"Feedback tracking error: {e}")
            return {"error": str(e)}


# =============================================================================
# TOOL DEFINITIONS
# =============================================================================

RETRIEVAL_TOOLS = [
    RetrievalToolDefinition(
        name="search_semantic",
        description="Search for similar documents using semantic similarity against the firm's real document database.",
        parameters={
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results (default: 10)"},
            "threshold": {"type": "number", "description": "Min similarity 0.0-1.0 (default: 0.7)"},
            "matter_id": {"type": "string", "description": "Filter by matter ID"},
            "document_type": {"type": "string", "description": "Filter by document type"},
            "include_graph_expansion": {"type": "boolean", "description": "Include related docs (default: true)"}
        },
        required=["query"]
    ),
    RetrievalToolDefinition(
        name="search_hybrid",
        description="Hybrid search: semantic + keyword. Uses the real document database.",
        parameters={
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results (default: 10)"}
        },
        required=["query"]
    ),
    RetrievalToolDefinition(
        name="find_precedent",
        description="Find legal precedent in the firm's document library.",
        parameters={
            "legal_issue": {"type": "string", "description": "Description of the legal issue"},
            "jurisdiction": {"type": "string", "description": "Filter by jurisdiction"},
            "court_level": {"type": "string", "description": "Filter by court level"},
            "limit": {"type": "integer", "description": "Max results (default: 5)"}
        },
        required=["legal_issue"]
    ),
    RetrievalToolDefinition(
        name="find_similar_clauses",
        description="Find similar contract clauses in the firm's document library.",
        parameters={
            "clause_description": {"type": "string", "description": "Description of the clause"},
            "contract_type": {"type": "string", "description": "Filter by contract type"},
            "limit": {"type": "integer", "description": "Max results (default: 10)"}
        },
        required=["clause_description"]
    ),
    RetrievalToolDefinition(
        name="track_retrieval_feedback",
        description="Track retrieval feedback for learning.",
        parameters={
            "query": {"type": "string", "description": "Original search query"},
            "retrieved_document_ids": {"type": "array", "items": {"type": "string"}, "description": "IDs of retrieved docs"},
            "selected_document_id": {"type": "string", "description": "ID of selected doc"},
            "rating": {"type": "integer", "description": "1-5 quality rating"}
        },
        required=["query", "retrieved_document_ids"]
    )
]


def get_retrieval_tools_in_openai_format() -> List[Dict[str, Any]]:
    return [tool.to_openai_format() for tool in RETRIEVAL_TOOLS]


def execute_retrieval_tool(
    tool_name: str,
    parameters: Dict[str, Any],
    context: Dict[str, Any]
) -> Dict[str, Any]:
    """Execute a retrieval tool against the real backend."""
    firm_id = context.get("firm_id")
    user_id = context.get("user_id")
    backend_bridge = context.get("backend_bridge")
    
    if not firm_id or not user_id:
        return {"error": "Missing firm_id or user_id in context"}
    
    retrieval_system = RetrievalSystem(firm_id, user_id, backend_bridge)
    
    handlers = {
        "search_semantic": retrieval_system.search_semantic,
        "search_hybrid": retrieval_system.search_hybrid,
        "find_precedent": retrieval_system.find_precedent,
        "find_similar_clauses": retrieval_system.find_similar_clauses,
        "track_retrieval_feedback": retrieval_system.track_retrieval_feedback,
    }
    
    handler = handlers.get(tool_name)
    if handler:
        return handler(**parameters)
    
    return {"error": f"Unknown retrieval tool: {tool_name}"}
