"""
Retrieval Tools - Semantic Search for Legal Documents

Provides the background agent with access to the vector search system.
Enables the agent to:
- Search firm's documents for similar cases
- Find precedent in the firm's library
- Retrieve contract templates and clauses
- Follow citation chains in legal documents

All operations respect tenant isolation and privacy boundaries.
"""

import os
import json
import logging
import hashlib
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

# Try to import bridge tools for API access
try:
    from bridge_tools import BackendAPIBridge
    BRIDGE_AVAILABLE = True
except ImportError:
    BRIDGE_AVAILABLE = False
    logger.warning("Bridge tools not available - using direct database access")


@dataclass
class RetrievalToolDefinition:
    """Definition of a retrieval tool"""
    name: str
    description: str
    parameters: Dict[str, Any]
    required: List[str]
    
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


class RetrievalSystem:
    """
    Retrieval system for legal document search.
    
    Provides semantic search capabilities to the background agent.
    All searches are tenant-isolated (firm-specific).
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
        
        # If no bridge provided, try to create one
        if not backend_bridge and BRIDGE_AVAILABLE:
            self.backend_bridge = BackendAPIBridge()
    
    def search_semantic(
        self,
        query: str,
        limit: int = 10,
        threshold: float = 0.7,
        matter_id: Optional[str] = None,
        document_type: Optional[str] = None,
        include_graph_expansion: bool = True
    ) -> Dict[str, Any]:
        """
        Search for similar documents using semantic similarity.
        
        Args:
            query: Search query (legal question, clause description, etc.)
            limit: Maximum number of results
            threshold: Minimum similarity score (0.0-1.0)
            matter_id: Filter by specific matter
            document_type: Filter by document type
            include_graph_expansion: Include related documents via citation graph
        
        Returns:
            Search results with similarity scores and document info
        """
        try:
            if self.backend_bridge:
                # Use backend API
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
                
                if response.get("success"):
                    return {
                        "success": True,
                        "query": query,
                        "results": response.get("results", []),
                        "count": response.get("count", 0)
                    }
                else:
                    logger.error(f"Backend search failed: {response.get('error')}")
                    return {"success": False, "error": response.get("error")}
            else:
                # Fallback: direct database access (simplified)
                # In production, this would use pgvector queries
                logger.warning("Using fallback search (backend bridge not available)")
                return self._fallback_search(query, limit)
                
        except Exception as e:
            logger.error(f"Semantic search error: {e}")
            return {"success": False, "error": str(e)}
    
    def search_hybrid(
        self,
        query: str,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Hybrid search: semantic + keyword.
        
        Args:
            query: Search query
            limit: Maximum number of results
        
        Returns:
            Combined results from semantic and keyword search
        """
        try:
            if self.backend_bridge:
                response = self.backend_bridge._make_request(
                    "POST",
                    "/api/search/hybrid",
                    data={
                        "query": query,
                        "limit": limit
                    }
                )
                
                if response.get("success"):
                    return {
                        "success": True,
                        "query": query,
                        "results": response.get("results", []),
                        "semanticCount": response.get("semanticCount", 0),
                        "keywordCount": response.get("keywordCount", 0)
                    }
                else:
                    return {"success": False, "error": response.get("error")}
            else:
                logger.warning("Using fallback hybrid search")
                return self._fallback_hybrid_search(query, limit)
                
        except Exception as e:
            logger.error(f"Hybrid search error: {e}")
            return {"success": False, "error": str(e)}
    
    def find_precedent(
        self,
        legal_issue: str,
        jurisdiction: Optional[str] = None,
        court_level: Optional[str] = None,
        limit: int = 5
    ) -> Dict[str, Any]:
        """
        Find legal precedent in the firm's documents.
        
        Args:
            legal_issue: Description of the legal issue
            jurisdiction: Filter by jurisdiction (e.g., "NY", "CA", "Federal")
            court_level: Filter by court level (e.g., "Supreme", "Appellate", "District")
            limit: Maximum number of precedent documents
        
        Returns:
            Precedent documents with relevance scores
        """
        # Build enhanced query for precedent search
        query_parts = [legal_issue]
        
        if jurisdiction:
            query_parts.append(f"jurisdiction: {jurisdiction}")
        
        if court_level:
            query_parts.append(f"court level: {court_level}")
        
        query = " ".join(query_parts)
        
        # Search with emphasis on case law and citations
        result = self.search_semantic(
            query=query,
            limit=limit,
            threshold=0.6,  # Lower threshold for broader precedent search
            document_type="case"  # Prioritize case documents
        )
        
        if result.get("success"):
            # Filter and enhance results for precedent
            precedent_results = []
            for res in result.get("results", []):
                # Check if document appears to be case law
                is_case_law = self._is_case_law_document(res)
                
                precedent_results.append({
                    **res,
                    "isCaseLaw": is_case_law,
                    "precedentStrength": self._calculate_precedent_strength(res, jurisdiction, court_level)
                })
            
            # Sort by precedent strength
            precedent_results.sort(key=lambda x: x["precedentStrength"], reverse=True)
            
            return {
                "success": True,
                "legalIssue": legal_issue,
                "jurisdiction": jurisdiction,
                "courtLevel": court_level,
                "precedents": precedent_results[:limit],
                "count": len(precedent_results)
            }
        else:
            return result
    
    def find_similar_clauses(
        self,
        clause_description: str,
        contract_type: Optional[str] = None,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Find similar contract clauses in the firm's documents.
        
        Args:
            clause_description: Description of the clause or its purpose
            contract_type: Filter by contract type (e.g., "NDA", "Employment", "License")
            limit: Maximum number of clauses
        
        Returns:
            Similar clauses with context and relevance
        """
        query_parts = [clause_description]
        
        if contract_type:
            query_parts.append(f"contract type: {contract_type}")
        
        query = " ".join(query_parts)
        
        result = self.search_semantic(
            query=query,
            limit=limit,
            document_type="contract"  # Prioritize contract documents
        )
        
        if result.get("success"):
            # Extract clause-like text chunks
            clause_results = []
            for res in result.get("results", []):
                # Extract potential clauses from the text
                clauses = self._extract_clauses(res.get("chunkText", ""))
                
                for clause in clauses[:3]:  # Top 3 clauses per document
                    clause_results.append({
                        "documentId": res.get("documentId"),
                        "documentName": res.get("documentName"),
                        "clauseText": clause,
                        "similarity": res.get("similarity", 0),
                        "context": f"From {res.get('documentName')}"
                    })
            
            # Sort by similarity
            clause_results.sort(key=lambda x: x["similarity"], reverse=True)
            
            return {
                "success": True,
                "clauseDescription": clause_description,
                "contractType": contract_type,
                "clauses": clause_results[:limit],
                "count": len(clause_results)
            }
        else:
            return result
    
    def track_retrieval_feedback(
        self,
        query: str,
        retrieved_document_ids: List[str],
        selected_document_id: Optional[str] = None,
        rating: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Track retrieval feedback for learning system.
        
        Args:
            query: Original search query
            retrieved_document_ids: IDs of retrieved documents
            selected_document_id: ID of document selected/used (if any)
            rating: 1-5 rating of retrieval quality (optional)
        
        Returns:
            Feedback tracking result
        """
        try:
            if self.backend_bridge:
                response = self.backend_bridge._make_request(
                    "POST",
                    "/api/retrieval/feedback",
                    data={
                        "query": query,
                        "retrievedDocumentIds": retrieved_document_ids,
                        "selectedDocumentId": selected_document_id,
                        "rating": rating
                    }
                )
                return response
            else:
                # Log feedback locally
                query_hash = hashlib.sha256(query.encode()).hexdigest()
                
                feedback_log = {
                    "query_hash": query_hash,
                    "query": query,
                    "retrieved_document_ids": retrieved_document_ids,
                    "selected_document_id": selected_document_id,
                    "rating": rating,
                    "timestamp": datetime.now().isoformat(),
                    "firm_id": self.firm_id,
                    "user_id": self.user_id
                }
                
                # Save to local log file
                log_path = f"./logs/retrieval_feedback_{self.firm_id}.json"
                os.makedirs(os.path.dirname(log_path), exist_ok=True)
                
                existing_feedback = []
                if os.path.exists(log_path):
                    with open(log_path, "r") as f:
                        try:
                            existing_feedback = json.load(f)
                        except json.JSONDecodeError:
                            existing_feedback = []
                
                existing_feedback.append(feedback_log)
                
                with open(log_path, "w") as f:
                    json.dump(existing_feedback, f, indent=2)
                
                return {"success": True, "message": "Feedback logged locally"}
                
        except Exception as e:
            logger.error(f"Feedback tracking error: {e}")
            return {"success": False, "error": str(e)}
    
    # =============================================================================
    # HELPER METHODS
    # =============================================================================
    
    def _fallback_search(self, query: str, limit: int) -> Dict[str, Any]:
        """Fallback search when backend bridge is not available"""
        # This would connect directly to PostgreSQL with pgvector
        # For now, return mock results
        return {
            "success": True,
            "query": query,
            "results": [
                {
                    "documentId": "mock-doc-1",
                    "documentName": "Sample Contract",
                    "similarity": 0.85,
                    "chunkText": f"Relevant text for: {query}",
                    "source": "fallback",
                    "message": "Backend bridge not available - using mock results"
                }
            ],
            "count": 1
        }
    
    def _fallback_hybrid_search(self, query: str, limit: int) -> Dict[str, Any]:
        """Fallback hybrid search"""
        return {
            "success": True,
            "query": query,
            "results": [
                {
                    "documentId": "mock-hybrid-1",
                    "documentName": "Hybrid Search Result",
                    "relevance": 0.9,
                    "chunkText": f"Hybrid result for: {query}",
                    "source": "hybrid_fallback"
                }
            ],
            "semanticCount": 1,
            "keywordCount": 0
        }
    
    def _is_case_law_document(self, document_result: Dict[str, Any]) -> bool:
        """Check if document appears to be case law"""
        text = document_result.get("chunkText", "").lower()
        document_name = document_result.get("documentName", "").lower()
        
        # Case law indicators
        indicators = [
            "v.",  # Case citation format
            "court",
            "judge",
            "opinion",
            "ruling",
            "appeal",
            "district court",
            "circuit court",
            "supreme court"
        ]
        
        for indicator in indicators:
            if indicator in text or indicator in document_name:
                return True
        
        return False
    
    def _calculate_precedent_strength(
        self,
        document_result: Dict[str, Any],
        jurisdiction: Optional[str],
        court_level: Optional[str]
    ) -> float:
        """Calculate strength of precedent based on various factors"""
        strength = document_result.get("similarity", 0.5)
        
        # Jurisdiction match bonus
        text = document_result.get("chunkText", "").lower()
        if jurisdiction:
            if jurisdiction.lower() in text:
                strength += 0.2
        
        # Court level hierarchy bonus
        if court_level:
            court_level_lower = court_level.lower()
            if court_level_lower == "supreme" and "supreme court" in text:
                strength += 0.3
            elif court_level_lower == "appellate" and "appeal" in text:
                strength += 0.2
            elif court_level_lower == "district" and "district court" in text:
                strength += 0.1
        
        # Recency bonus (if we had dates)
        # More recent cases get higher weight
        
        return min(strength, 1.0)  # Cap at 1.0
    
    def _extract_clauses(self, text: str) -> List[str]:
        """Extract potential clauses from contract text"""
        clauses = []
        
        # Simple clause detection based on legal document structure
        lines = text.split('\n')
        current_clause = []
        
        for line in lines:
            line = line.strip()
            
            # Clause indicators
            if (line.startswith(('§', 'Section', 'ARTICLE', 'Clause', 'Subsection')) or
                re.match(r'^\d+\.\s+[A-Z]', line) or
                re.match(r'^[A-Z][A-Z\s]+\.$', line)):
                
                # Save previous clause
                if current_clause:
                    clauses.append('\n'.join(current_clause))
                    current_clause = []
            
            if line:  # Add non-empty lines to current clause
                current_clause.append(line)
        
        # Add last clause
        if current_clause:
            clauses.append('\n'.join(current_clause))
        
        return clauses


# =============================================================================
# TOOL DEFINITIONS FOR OPENAI FUNCTION CALLING
# =============================================================================

RETRIEVAL_TOOLS = [
    RetrievalToolDefinition(
        name="search_semantic",
        description="Search for similar documents using semantic similarity. Use for finding precedent, similar cases, or related documents based on meaning rather than keywords.",
        parameters={
            "query": {"type": "string", "description": "Search query (legal question, clause description, etc.)"},
            "limit": {"type": "integer", "description": "Maximum number of results (default: 10)"},
            "threshold": {"type": "number", "description": "Minimum similarity score 0.0-1.0 (default: 0.7)"},
            "matter_id": {"type": "string", "description": "Filter by specific matter ID (optional)"},
            "document_type": {"type": "string", "description": "Filter by document type (optional)"},
            "include_graph_expansion": {"type": "boolean", "description": "Include related documents via citation graph (default: true)"}
        },
        required=["query"]
    ),
    RetrievalToolDefinition(
        name="search_hybrid",
        description="Hybrid search: semantic + keyword. Returns combined results from both methods. Use when you want comprehensive search coverage.",
        parameters={
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Maximum number of results (default: 10)"}
        },
        required=["query"]
    ),
    RetrievalToolDefinition(
        name="find_precedent",
        description="Find legal precedent in the firm's documents. Specifically optimized for case law search with jurisdiction and court level filtering.",
        parameters={
            "legal_issue": {"type": "string", "description": "Description of the legal issue"},
            "jurisdiction": {"type": "string", "description": "Filter by jurisdiction (e.g., 'NY', 'CA', 'Federal')"},
            "court_level": {"type": "string", "description": "Filter by court level (e.g., 'Supreme', 'Appellate', 'District')"},
            "limit": {"type": "integer", "description": "Maximum number of precedent documents (default: 5)"}
        },
        required=["legal_issue"]
    ),
    RetrievalToolDefinition(
        name="find_similar_clauses",
        description="Find similar contract clauses in the firm's documents. Extracts clauses from contracts for comparison and reuse.",
        parameters={
            "clause_description": {"type": "string", "description": "Description of the clause or its purpose"},
            "contract_type": {"type": "string", "description": "Filter by contract type (e.g., 'NDA', 'Employment', 'License')"},
            "limit": {"type": "integer", "description": "Maximum number of clauses (default: 10)"}
        },
        required=["clause_description"]
    ),
    RetrievalToolDefinition(
        name="track_retrieval_feedback",
        description="Track retrieval feedback for the learning system. Call after successful retrievals to improve future searches.",
        parameters={
            "query": {"type": "string", "description": "Original search query"},
            "retrieved_document_ids": {"type": "array", "items": {"type": "string"}, "description": "IDs of retrieved documents"},
            "selected_document_id": {"type": "string", "description": "ID of document selected/used (if any)"},
            "rating": {"type": "integer", "description": "1-5 rating of retrieval quality (optional)"}
        },
        required=["query", "retrieved_document_ids"]
    )
]


def get_retrieval_tools_in_openai_format() -> List[Dict[str, Any]]:
    """Get retrieval tools in OpenAI function calling format"""
    return [tool.to_openai_format() for tool in RETRIEVAL_TOOLS]


def execute_retrieval_tool(
    tool_name: str,
    parameters: Dict[str, Any],
    context: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Execute a retrieval tool.
    
    Args:
        tool_name: Name of the tool to execute
        parameters: Tool parameters
        context: Execution context (must include firm_id, user_id, backend_bridge)
    
    Returns:
        Tool execution result
    """
    firm_id = context.get("firm_id")
    user_id = context.get("user_id")
    backend_bridge = context.get("backend_bridge")
    
    if not firm_id or not user_id:
        return {"success": False, "error": "Missing firm_id or user_id in context"}
    
    retrieval_system = RetrievalSystem(firm_id, user_id, backend_bridge)
    
    if tool_name == "search_semantic":
        return retrieval_system.search_semantic(**parameters)
    
    elif tool_name == "search_hybrid":
        return retrieval_system.search_hybrid(**parameters)
    
    elif tool_name == "find_precedent":
        return retrieval_system.find_precedent(**parameters)
    
    elif tool_name == "find_similar_clauses":
        return retrieval_system.find_similar_clauses(**parameters)
    
    elif tool_name == "track_retrieval_feedback":
        return retrieval_system.track_retrieval_feedback(**parameters)
    
    else:
        return {"success": False, "error": f"Unknown retrieval tool: {tool_name}"}


# Optional: Integration with existing tool system
def integrate_with_existing_tools():
    """Integrate retrieval tools with the existing tool system"""
    try:
        from bridge_tools import LEGAL_TOOLS, ToolExecutor
        
        # Add retrieval tools to existing legal tools
        for tool_def in RETRIEVAL_TOOLS:
            LEGAL_TOOLS.append(tool_def.to_openai_format())
        
        # Extend ToolExecutor to handle retrieval tools
        original_execute = ToolExecutor.execute
        
        def extended_execute(tool_name, parameters, context):
            if tool_name in [t.name for t in RETRIEVAL_TOOLS]:
                return execute_retrieval_tool(tool_name, parameters, context)
            else:
                return original_execute(tool_name, parameters, context)
        
        ToolExecutor.execute = extended_execute
        logger.info("Retrieval tools integrated with existing tool system")
        
    except ImportError:
        logger.warning("Could not integrate with existing tools - bridge_tools not available")


# Auto-integrate if possible
try:
    integrate_with_existing_tools()
except Exception as e:
    logger.warning(f"Auto-integration failed: {e}")