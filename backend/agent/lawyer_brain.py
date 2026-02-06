"""
Super Lawyer Brain - Advanced Legal Reasoning Agent

This module implements a sophisticated legal AI agent that uses:
- IRAC methodology (Issue, Rule, Analysis, Conclusion)
- Self-critique and refinement loops
- Persistent learning from user preferences
- Access to all platform tools via the bridge

The agent thinks like the "best lawyer ever" - thorough, precise, and aggressive.
"""

import os
import json
import time
import logging
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
from dataclasses import dataclass

from config import AgentConfig, AzureOpenAIConfig
from advanced_tools import FileSystemTool, FILESYSTEM_TOOLS, execute_filesystem_tool
from bridge_tools import (
    LEGAL_TOOLS, get_tools_in_openai_format, ToolExecutor, get_tool_executor
)
from learning import LearningManager, LEARNING_TOOLS, execute_learning_tool
from legal_knowledge import (
    LegalKnowledgeBase, get_legal_knowledge_base,
    LEGAL_KNOWLEDGE_TOOLS, execute_legal_knowledge_tool
)

logger = logging.getLogger(__name__)


# =============================================================================
# SUPER LAWYER SYSTEM PROMPT
# =============================================================================

SUPER_LAWYER_PROMPT = """You are the APEX LEGAL AI - an autonomous legal agent with full platform access.

## MISSION
Emulate what the user (a practicing attorney) would do: match their style, anticipate needs, prioritize like they do, and be proactive about follow-up steps.

## IRAC METHODOLOGY
For legal analysis, follow IRAC:
- **Issue**: Frame the legal question precisely ("The issue is whether...")
- **Rule**: State the applicable rule with proper Bluebook citations
- **Analysis**: Apply rule to facts, address both sides, use analogical reasoning
- **Conclusion**: State conclusion, recommend action, identify next steps

## CITATION INTEGRITY
- Use Bluebook 21st Edition format: *Party v. Party*, Vol. Reporter Page (Court Year)
- Use `lookup_cplr` for NY CPLR provisions and `calculate_cplr_deadline` for NY deadlines
- Use `search_semantic` and `find_precedent` to find authority in the firm's document library
- **CRITICAL**: Only cite cases/statutes you have verified through tools or that you are certain exist from your training. If you cannot verify a citation, mark it as [UNVERIFIED - needs cite check] rather than fabricating one. A fake citation is worse than no citation.

## AUTONOMOUS OPERATION WITH UNCERTAINTY FLAGGING
You operate autonomously without waiting for human input. However:
1. **Make reasonable assumptions** and proceed - do NOT stop to ask questions
2. **Flag uncertainties** in your output with [NEEDS REVIEW: reason] so the attorney can check
3. **Search before assuming** - use tools to find missing information before guessing
4. **Note gaps** - if critical facts are unavailable, note them and proceed with what you have
5. **Document assumptions** - state what you assumed and why in the work product

This lets you keep working while giving the supervising attorney clear signals about what needs their attention.

## SELF-CRITIQUE
After substantive work, critique yourself on: argument strength, citation accuracy, completeness, persuasion, and style fit. If grade is below B, refine before finalizing.

## DEADLINES
Always check for deadlines when starting a matter. Use `calculate_deadline` or `calculate_cplr_deadline` for accurate calculation. Set reminders with `create_calendar_event`. Missing a deadline is malpractice.

## WRITING
- Aggressive in advocacy, precise in analysis, professional in correspondence
- Clear headings, short paragraphs, strong topic sentences

{legal_knowledge}

{style_guide}

{learning_context}
"""


@dataclass
class IRACStep:
    """A step in the IRAC analysis"""
    phase: str  # "issue", "rule", "analysis", "conclusion", "critique"
    content: str
    completed: bool = False
    critique_passed: bool = False
    refinement_needed: bool = False
    refinement_notes: str = ""


class SuperLawyerAgent:
    """
    The Super Lawyer Agent - an advanced legal AI that combines:
    - IRAC methodology for legal reasoning
    - Self-critique and refinement
    - Learning from user preferences
    - Full access to platform tools
    
    This is the "brain" of the background agent system.
    """
    
    def __init__(
        self,
        config: AgentConfig,
        log_callback: Optional[Callable[[str], None]] = None,
        preferences_dir: str = "./case_data/preferences",
        user_id: Optional[str] = None,
        firm_id: Optional[str] = None,
        backend_url: Optional[str] = None
    ):
        self.config = config
        self.log_callback = log_callback or (lambda msg: logger.info(msg))
        self.user_id = user_id
        self.firm_id = firm_id
        self.backend_url = backend_url or os.environ.get("BACKEND_URL", "http://localhost:3001")
        
        # Initialize components with user/firm context for personalized learning
        self.learning = LearningManager(
            preferences_dir=preferences_dir,
            user_id=user_id,
            firm_id=firm_id,
            backend_url=self.backend_url
        )
        self.legal_knowledge = get_legal_knowledge_base()
        self.fs_tool = FileSystemTool(config.sandbox_directory)
        self.tool_executor = get_tool_executor(
            backend_url=self.backend_url,
            user_id=user_id,
            firm_id=firm_id
        )
        
        # Task time management for 30-minute optimization
        self.task_complexity = None
        self.time_budget = None
        self.time_warnings_given = set()
        
        # Azure OpenAI client (same as legal_workflow.py)
        self._init_azure_client()
        
        # Combine all tools
        self.tools = self._build_tool_list()
        
        # State
        self.messages: List[Dict[str, str]] = []
        self.irac_analysis: Dict[str, IRACStep] = {}
        self.iteration_count = 0
        self.start_time: Optional[float] = None
        self.actions_taken: List[str] = []  # Track actions for observation learning
        self.current_task: str = ""  # Current task description
        self.estimated_completion_time: Optional[float] = None
        
        self._log(f"SuperLawyerAgent initialized for user={user_id}, firm={firm_id}")
    
    def _init_azure_client(self):
        """Initialize Azure OpenAI client"""
        import urllib.request
        import ssl
        self._ssl_context = ssl.create_default_context()
    
    def _call_azure_openai(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> Dict[str, Any]:
        """Call Azure OpenAI API"""
        import urllib.request
        import urllib.error
        
        url = self.config.azure_config.chat_completions_url
        
        body = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        if tools:
            body["tools"] = tools
            body["tool_choice"] = "auto"
            body["parallel_tool_calls"] = False
        
        headers = {
            "Content-Type": "application/json",
            "api-key": self.config.azure_config.api_key
        }
        
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        
        max_retries = 6  # Up from 3: push through transient failures
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(request, context=self._ssl_context, timeout=180) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                error_body = e.read().decode("utf-8") if e.fp else str(e)
                
                if e.code == 429:  # Rate limit
                    retry_after = int(e.headers.get("Retry-After", 30))
                    self._log(f"Rate limited, waiting {retry_after}s...")
                    time.sleep(retry_after)
                    continue
                elif e.code in (500, 502, 503, 504):
                    self._log(f"Server error {e.code}, retrying...")
                    time.sleep(2 ** attempt)
                    continue
                else:
                    raise RuntimeError(f"Azure OpenAI API error {e.code}: {error_body}")
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise
        
        raise RuntimeError("Max retries exceeded for Azure OpenAI API")
    
    def _build_tool_list(self) -> List[Dict[str, Any]]:
        """Build the complete list of tools available to the agent"""
        tools = []
        
        # Filesystem tools
        tools.extend(FILESYSTEM_TOOLS)
        
        # Legal/platform tools (from bridge)
        tools.extend(get_tools_in_openai_format())
        
        # Learning tools (enhanced with workflow and observation learning)
        tools.extend(LEARNING_TOOLS)
        
        # Legal knowledge tools
        tools.extend(LEGAL_KNOWLEDGE_TOOLS)
        
        # IRAC-specific tools
        tools.extend(self._get_irac_tools())
        
        # Retrieval tools for semantic search and document lookup
        try:
            from retrieval_tools import get_retrieval_tools_in_openai_format
            retrieval_tools = get_retrieval_tools_in_openai_format()
            tools.extend(retrieval_tools)
            self._log(f"Added {len(retrieval_tools)} retrieval tools")
        except ImportError as e:
            self._log(f"Retrieval tools not available: {e}")
        
        return tools
    
    def _get_irac_tools(self) -> List[Dict[str, Any]]:
        """Tools for the IRAC methodology"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "identify_legal_issue",
                    "description": "IRAC Step 1: Identify and frame the legal issue precisely. Use 'The issue is whether...' format.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "issue_statement": {
                                "type": "string",
                                "description": "The precise legal issue statement"
                            },
                            "sub_issues": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Any sub-issues that need to be addressed"
                            },
                            "key_facts": {
                                "type": "string",
                                "description": "The key facts relevant to this issue"
                            }
                        },
                        "required": ["issue_statement"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "state_legal_rule",
                    "description": "IRAC Step 2: State the applicable legal rule with proper citations.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rule_statement": {
                                "type": "string",
                                "description": "The legal rule that applies"
                            },
                            "primary_authority": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Primary authorities (cases, statutes) with Bluebook citations"
                            },
                            "elements_or_factors": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Elements or factors of the rule"
                            }
                        },
                        "required": ["rule_statement", "primary_authority"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "perform_legal_analysis",
                    "description": "IRAC Step 3: Apply the rule to the facts. Address both sides.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "analysis": {
                                "type": "string",
                                "description": "Detailed analysis applying rule to facts"
                            },
                            "favorable_arguments": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Arguments in favor of our position"
                            },
                            "counterarguments": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Counterarguments and how to address them"
                            },
                            "analogous_cases": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Analogous cases supporting our position"
                            }
                        },
                        "required": ["analysis", "favorable_arguments"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "state_conclusion",
                    "description": "IRAC Step 4: State the conclusion and recommended action.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "conclusion": {
                                "type": "string",
                                "description": "Clear statement of conclusion"
                            },
                            "recommendation": {
                                "type": "string",
                                "description": "Recommended course of action"
                            },
                            "next_steps": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Specific next steps to take"
                            },
                            "confidence_level": {
                                "type": "string",
                                "enum": ["high", "medium", "low"],
                                "description": "Confidence in the conclusion"
                            }
                        },
                        "required": ["conclusion", "recommendation"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "self_critique",
                    "description": "Critique your own work before finalizing. Be harsh - find weaknesses.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "strength_assessment": {
                                "type": "string",
                                "description": "Is the argument strong enough? Should it be more aggressive?"
                            },
                            "citation_check": {
                                "type": "boolean",
                                "description": "Are all citations accurate and properly formatted?"
                            },
                            "completeness_check": {
                                "type": "boolean",
                                "description": "Were all issues addressed? Any gaps?"
                            },
                            "weaknesses_found": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Weaknesses identified in the work"
                            },
                            "refinements_needed": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Specific refinements to make"
                            },
                            "overall_grade": {
                                "type": "string",
                                "enum": ["A", "B", "C", "needs_work"],
                                "description": "Overall grade for the work"
                            }
                        },
                        "required": ["strength_assessment", "citation_check", "completeness_check", "overall_grade"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "finalize_work_product",
                    "description": "Finalize and save the completed work product.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "Title of the document"
                            },
                            "content": {
                                "type": "string",
                                "description": "The final work product content"
                            },
                            "document_type": {
                                "type": "string",
                                "description": "Type of document"
                            },
                            "save_path": {
                                "type": "string",
                                "description": "Path to save the document"
                            },
                            "matter_id": {
                                "type": "string",
                                "description": "Matter to attach to (optional)"
                            }
                        },
                        "required": ["title", "content", "document_type"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "task_complete",
                    "description": "Mark the task as complete with a summary.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "summary": {
                                "type": "string",
                                "description": "Summary of what was accomplished"
                            },
                            "output_files": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Files created"
                            },
                            "irac_summary": {
                                "type": "object",
                                "description": "Summary of IRAC analysis"
                            },
                            "success": {
                                "type": "boolean",
                                "description": "Whether task was successful"
                            }
                        },
                        "required": ["summary", "success"]
                    }
                }
            }
        ]
    
    def _log(self, message: str):
        """Log a message"""
        timestamp = datetime.now().isoformat()
        formatted = f"[{timestamp}] {message}"
        self.log_callback(formatted)
        logger.info(message)
    
    def _estimate_task_complexity(self, goal: str) -> str:
        """Estimate task complexity for time budgeting"""
        goal_lower = goal.lower()
        
        # Simple tasks (5-15 minutes)
        simple_keywords = ['simple', 'quick', 'check', 'review', 'verify', 'look up', 
                          'find', 'search', 'read', 'summarize brief', 'check status']
        if any(k in goal_lower for k in simple_keywords):
            return 'simple'
        
        # Moderate tasks (15-30 minutes)  
        moderate_keywords = ['draft', 'create', 'update', 'summarize', 'analyze',
                           'prepare', 'organize', 'compile', 'review and comment',
                           'brief analysis', 'memo', 'letter', 'email draft']
        if any(k in goal_lower for k in moderate_keywords):
            return 'moderate'
        
        # Complex tasks (30-45 minutes)
        complex_keywords = ['comprehensive', 'full review', 'deep analysis', 
                          'strategic assessment', 'draft motion', 'draft brief',
                          'legal research', 'case strategy', 'negotiation prep',
                          'discovery plan', 'trial prep']
        if any(k in goal_lower for k in complex_keywords):
            return 'complex'
        
        # Default to moderate for legal tasks
        return 'moderate'
    
    def _get_time_budget_for_complexity(self, complexity: str) -> int:
        """Get time budget in seconds based on complexity"""
        budgets = {
            'simple': self.config.fast_task_max_runtime,  # 30 minutes
            'moderate': 3600,  # 60 minutes
            'complex': self.config.max_runtime_seconds    # 90 minutes
        }
        return budgets.get(complexity, 3600)  # Default 60 minutes
    
    def _check_time_warnings(self, elapsed: float, budget: int) -> bool:
        """Check if time warnings should be issued, return True if should continue"""
        remaining = budget - elapsed
        
        # Critical: Less than 1 minute remaining
        if remaining < 60 and 'critical' not in self.time_warnings_given:
            self._log(f"⏰ CRITICAL: Less than 1 minute remaining! Starting finalization.")
            self.time_warnings_given.add('critical')
            # Signal to wrap up quickly
            return False  # Time to finish
        
        # Warning: Less than 5 minutes remaining  
        elif remaining < 300 and 'warning' not in self.time_warnings_given:
            self._log(f"⚠️  WARNING: Less than 5 minutes remaining. Consider wrapping up.")
            self.time_warnings_given.add('warning')
        
        # Notice: Less than 10 minutes remaining
        elif remaining < 600 and 'notice' not in self.time_warnings_given:
            self._log(f"ℹ️  NOTICE: Less than 10 minutes remaining. On track for 30-minute task.")
            self.time_warnings_given.add('notice')
            
        return True  # Continue working
    
    def _execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool call"""
        self._log(f"Executing tool: {tool_name}")
        
        # Track action for observation learning
        self.actions_taken.append(tool_name)
        
        # Filesystem tools
        if tool_name in ("list_directory", "list_directory_recursive", "read_file",
                         "write_file", "file_exists", "create_directory"):
            return execute_filesystem_tool(tool_name, args, self.fs_tool)
        
        # Learning tools (expanded set)
        if tool_name in ("update_preference", "get_style_preferences", 
                         "record_workflow_success", "get_recommended_workflow",
                         "record_observation", "get_user_typical_action",
                         "record_user_behavior"):
            return execute_learning_tool(tool_name, args, self.learning)
        
        # Legal knowledge tools
        if tool_name in ("get_practice_area_knowledge", "get_legal_procedure",
                         "get_intake_checklist"):
            return execute_legal_knowledge_tool(tool_name, args, self.legal_knowledge)
        
        # IRAC tools
        if tool_name == "identify_legal_issue":
            return self._handle_identify_issue(args)
        elif tool_name == "state_legal_rule":
            return self._handle_state_rule(args)
        elif tool_name == "perform_legal_analysis":
            return self._handle_analysis(args)
        elif tool_name == "state_conclusion":
            return self._handle_conclusion(args)
        elif tool_name == "self_critique":
            return self._handle_critique(args)
        elif tool_name == "finalize_work_product":
            return self._handle_finalize(args)
        elif tool_name == "task_complete":
            return self._handle_task_complete(args)
        
        # Retrieval tools
        try:
            from retrieval_tools import RETRIEVAL_TOOLS, execute_retrieval_tool
            retrieval_tool_names = [tool.name for tool in RETRIEVAL_TOOLS]
            if tool_name in retrieval_tool_names:
                context = {
                    'firm_id': self.firm_id,
                    'user_id': self.user_id,
                    'backend_bridge': self.tool_executor.backend_bridge if hasattr(self.tool_executor, 'backend_bridge') else None
                }
                return execute_retrieval_tool(tool_name, args, context)
        except ImportError:
            pass
        
        # Legal/platform tools
        return self.tool_executor.execute(tool_name, args)
    
    def _handle_identify_issue(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle IRAC Issue identification"""
        self.irac_analysis["issue"] = IRACStep(
            phase="issue",
            content=json.dumps(args),
            completed=True
        )
        self._log(f"IRAC Issue: {args.get('issue_statement', '')[:100]}")
        return {
            "success": True,
            "phase": "issue",
            "recorded": True,
            "next_step": "Now state the legal rule with citations using state_legal_rule"
        }
    
    def _handle_state_rule(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle IRAC Rule statement"""
        self.irac_analysis["rule"] = IRACStep(
            phase="rule",
            content=json.dumps(args),
            completed=True
        )
        self._log(f"IRAC Rule stated with {len(args.get('primary_authority', []))} citations")
        return {
            "success": True,
            "phase": "rule",
            "recorded": True,
            "next_step": "Now apply the rule to facts using perform_legal_analysis"
        }
    
    def _handle_analysis(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle IRAC Analysis"""
        self.irac_analysis["analysis"] = IRACStep(
            phase="analysis",
            content=json.dumps(args),
            completed=True
        )
        num_favorable = len(args.get("favorable_arguments", []))
        num_counter = len(args.get("counterarguments", []))
        self._log(f"IRAC Analysis: {num_favorable} favorable args, {num_counter} counterarguments addressed")
        return {
            "success": True,
            "phase": "analysis",
            "recorded": True,
            "next_step": "Now state your conclusion using state_conclusion"
        }
    
    def _handle_conclusion(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle IRAC Conclusion"""
        self.irac_analysis["conclusion"] = IRACStep(
            phase="conclusion",
            content=json.dumps(args),
            completed=True
        )
        self._log(f"IRAC Conclusion: {args.get('conclusion', '')[:100]}")
        return {
            "success": True,
            "phase": "conclusion",
            "recorded": True,
            "next_step": "Now critique your work using self_critique before finalizing"
        }
    
    def _handle_critique(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle self-critique"""
        grade = args.get("overall_grade", "needs_work")
        weaknesses = args.get("weaknesses_found", [])
        refinements = args.get("refinements_needed", [])
        
        self.irac_analysis["critique"] = IRACStep(
            phase="critique",
            content=json.dumps(args),
            completed=True,
            critique_passed=grade in ("A", "B"),
            refinement_needed=grade == "needs_work" or len(refinements) > 0
        )
        
        self._log(f"Self-Critique: Grade={grade}, Weaknesses={len(weaknesses)}")
        
        if grade == "needs_work":
            return {
                "success": True,
                "phase": "critique",
                "grade": grade,
                "needs_refinement": True,
                "refinements": refinements,
                "next_step": "Refine your work to address the weaknesses, then critique again"
            }
        else:
            return {
                "success": True,
                "phase": "critique",
                "grade": grade,
                "needs_refinement": False,
                "next_step": "Work product approved. Use finalize_work_product to save it."
            }
    
    def _handle_finalize(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle finalizing work product"""
        title = args.get("title", "Untitled")
        content = args.get("content", "")
        doc_type = args.get("document_type", "document")
        save_path = args.get("save_path", f"output/{title.replace(' ', '_')}.md")
        
        # Write the file
        result = self.fs_tool.write_file(save_path, content, overwrite=True)
        
        if result.get("success"):
            self._log(f"Finalized: {title} -> {save_path}")
            return {
                "success": True,
                "title": title,
                "path": save_path,
                "size": len(content),
                "document_type": doc_type
            }
        else:
            return result
    
    def _handle_task_complete(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle task completion"""
        success = args.get("success", True)
        summary = args.get("summary", "")
        
        self._log(f"Task completed: {summary[:100]}")
        
        # Record observation for future learning
        elapsed = time.time() - self.start_time if self.start_time else 0
        try:
            self.learning.record_observation(
                task_description=self.current_task,
                actions_taken=self.actions_taken,
                outcome="success" if success else "partial",
                time_taken=elapsed,
                lessons=args.get("irac_summary", {}).get("lessons", []) if isinstance(args.get("irac_summary"), dict) else []
            )
        except Exception as e:
            logger.warning(f"Failed to record observation: {e}")
        
        return {
            "success": True,
            "task_complete": True,
            "summary": summary,
            "output_files": args.get("output_files", []),
            "irac_phases_completed": list(self.irac_analysis.keys())
        }
    
    def _build_system_prompt(self, task: str) -> str:
        """Build a context-efficient system prompt.
        
        Optimizations:
        - Only include legal knowledge if task matches a practice area
        - Truncate style guide to relevant preferences only
        - Limit learning context to top-N most relevant patterns
        - Total prompt kept under ~3000 tokens to leave room for conversation
        """
        # Get legal knowledge ONLY if relevant to this task
        legal_knowledge = self.legal_knowledge.format_knowledge_for_prompt(task)
        if legal_knowledge:
            # Truncate to key sections only (workflow + deadlines)
            lines = legal_knowledge.split("\n")
            if len(lines) > 25:
                legal_knowledge = "\n".join(lines[:25]) + "\n..."
        
        # Get RELEVANT style preferences (not the full guide)
        style_section = ""
        relevant_prefs = self.learning.get_relevant_preferences(task)
        if relevant_prefs:
            pref_lines = ["## STYLE PREFERENCES"]
            for pref in relevant_prefs[:5]:  # Top 5 only
                pref_lines.append(f"- **{pref.topic}**: {pref.instruction}")
            style_section = "\n".join(pref_lines)
        
        # Get compact learning context
        learning_context = self.learning.get_full_learning_context(task)
        if learning_context and len(learning_context) > 1500:
            # Truncate learning context to keep prompt manageable
            learning_context = learning_context[:1500] + "\n..."
        
        return SUPER_LAWYER_PROMPT.format(
            legal_knowledge=legal_knowledge or "",
            style_guide=style_section,
            learning_context=learning_context or ""
        )
    
    def run(self, goal: str) -> Dict[str, Any]:
        """
        Run the Super Lawyer agent on a task - OPTIMIZED FOR 30-MINUTE TASKS
        
        Args:
            goal: The legal task to complete
            
        Returns:
            Result dictionary
        """
        self.start_time = time.time()
        self.iteration_count = 0
        self.irac_analysis = {}
        self.actions_taken = []  # Reset actions tracking
        self.current_task = goal  # Track current task for observation learning
        self.time_warnings_given = set()  # Reset time warnings
        
        # ESTIMATE COMPLEXITY AND SET TIME BUDGET
        self.task_complexity = self._estimate_task_complexity(goal)
        self.time_budget = self._get_time_budget_for_complexity(self.task_complexity)
        
        self._log(f"Super Lawyer starting {self.task_complexity} task: {goal}")
        self._log(f"⏱️  Time budget: {self.time_budget//60} minutes")
        
        # Build system prompt with style guide
        system_prompt = self._build_system_prompt(goal)
        
        # Initialize conversation - concise to save context window
        self.messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""TASK: {goal}

Complexity: {self.task_complexity} | Budget: {self.time_budget//60} min

Steps: identify_legal_issue → state_legal_rule → perform_legal_analysis → state_conclusion → self_critique → finalize_work_product → task_complete

Use platform tools (search_matters, list_documents, search_semantic, etc.) to gather real data. Use lookup_cplr for NY law. Mark unverified citations with [UNVERIFIED].

BEGIN. Start with identify_legal_issue or gather facts with tools."""}
        ]
        
        # Set limits based on complexity - generous to encourage thoroughness
        if self.task_complexity == 'simple':
            max_iterations = self.config.fast_task_max_iterations  # 60
        elif self.task_complexity == 'moderate':
            max_iterations = 90  # Between simple and complex
        else:
            max_iterations = self.config.max_iterations  # 120
        
        max_runtime = self.time_budget  # Use calculated time budget
        
        try:
            while self.iteration_count < max_iterations:
                elapsed = time.time() - self.start_time
                
                # Check time warnings and early termination
                if not self._check_time_warnings(elapsed, max_runtime):
                    self._log("⏰ Time critical - starting finalization sequence")
                    # Force completion within final minute
                    break
                
                if elapsed >= max_runtime:
                    self._log(f"Max runtime reached ({max_runtime}s)")
                    break
                
                self.iteration_count += 1
                self._log(f"Iteration {self.iteration_count}")
                
                # Call Azure OpenAI
                try:
                    response = self._call_azure_openai(
                        messages=self.messages,
                        tools=self.tools,
                        temperature=self.config.temperature,
                        max_tokens=self.config.max_tokens
                    )
                except Exception as e:
                    self._log(f"API error: {e}")
                    time.sleep(5)
                    continue
                
                # Process response
                choice = response.get("choices", [{}])[0]
                message = choice.get("message", {})
                
                self.messages.append(message)
                
                # Handle tool calls
                tool_calls = message.get("tool_calls", [])
                
                if tool_calls:
                    for tool_call in tool_calls:
                        tool_name = tool_call.get("function", {}).get("name", "")
                        try:
                            tool_args = json.loads(
                                tool_call.get("function", {}).get("arguments", "{}")
                            )
                        except json.JSONDecodeError:
                            tool_args = {}
                        
                        result = self._execute_tool(tool_name, tool_args)
                        
                        self.messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.get("id", ""),
                            "content": json.dumps(result)
                        })
                        
                        # Check if task is complete
                        if tool_name == "task_complete":
                            return {
                                "success": result.get("success", True),
                                "summary": result.get("summary", ""),
                                "output_files": result.get("output_files", []),
                                "irac_analysis": {
                                    k: json.loads(v.content) 
                                    for k, v in self.irac_analysis.items()
                                },
                                "iterations": self.iteration_count,
                                "elapsed_seconds": time.time() - self.start_time
                            }
                
                elif message.get("content"):
                    # Text-only response, prompt to use tools
                    self.messages.append({
                        "role": "user",
                        "content": "Use the IRAC tools to complete this task. Call the appropriate tool now."
                    })
                
                # Compact messages proactively to avoid context overflow
                if len(self.messages) > 45:
                    self._compact_messages()
            
            # Max iterations reached
            return {
                "success": False,
                "error": "Max iterations reached",
                "irac_analysis": {
                    k: json.loads(v.content) 
                    for k, v in self.irac_analysis.items()
                },
                "iterations": self.iteration_count,
                "elapsed_seconds": time.time() - self.start_time
            }
            
        except Exception as e:
            self._log(f"Error: {e}")
            return {
                "success": False,
                "error": str(e),
                "iterations": self.iteration_count,
                "elapsed_seconds": time.time() - self.start_time if self.start_time else 0
            }
    
    def _compact_messages(self):
        """Smart compaction that preserves IRAC analysis context.
        
        Instead of blindly keeping the last N messages, this:
        1. Always keeps system prompt + initial task
        2. Builds a structured summary of IRAC progress with actual content
        3. Keeps only the most recent messages for active work
        """
        if len(self.messages) <= 40:
            return
        
        system_msg = self.messages[0]
        first_user = self.messages[1]
        
        # Build a rich summary of completed IRAC phases
        irac_summaries = []
        for phase, step in self.irac_analysis.items():
            try:
                content = json.loads(step.content)
                if phase == "issue":
                    irac_summaries.append(f"ISSUE: {content.get('issue_statement', '')[:200]}")
                elif phase == "rule":
                    authorities = content.get('primary_authority', [])
                    irac_summaries.append(f"RULE: {content.get('rule_statement', '')[:150]}. Authorities: {'; '.join(authorities[:3])}")
                elif phase == "analysis":
                    irac_summaries.append(f"ANALYSIS: {content.get('analysis', '')[:200]}")
                elif phase == "conclusion":
                    irac_summaries.append(f"CONCLUSION: {content.get('conclusion', '')[:150]}")
                elif phase == "critique":
                    irac_summaries.append(f"CRITIQUE: Grade={content.get('overall_grade', '?')}")
            except (json.JSONDecodeError, AttributeError):
                irac_summaries.append(f"{phase.upper()}: completed")
        
        irac_text = "\n".join(irac_summaries) if irac_summaries else "No IRAC phases completed yet."
        
        # Track what actions have been taken
        actions_text = f"Actions taken: {', '.join(self.actions_taken[-15:])}" if self.actions_taken else ""
        
        elapsed = time.time() - self.start_time if self.start_time else 0
        
        summary = {
            "role": "system",
            "content": f"""[CONTEXT SUMMARY - {len(self.messages) - 30} earlier messages compacted]
Iteration: {self.iteration_count} | Elapsed: {elapsed:.0f}s
{irac_text}
{actions_text}
Continue from where you left off. Use task_complete when done."""
        }
        
        # Keep last 30 messages (reduced from 40 to leave more room)
        recent = self.messages[-30:]
        self.messages = [system_msg, first_user, summary] + recent
        self._log(f"Compacted messages: preserved {len(irac_summaries)} IRAC phases")


def run_super_lawyer_task(goal: str, config: Optional[AgentConfig] = None) -> Dict[str, Any]:
    """
    Convenience function to run a task with the Super Lawyer agent.
    
    Args:
        goal: The legal task to complete
        config: Optional agent configuration
        
    Returns:
        Task result
    """
    if config is None:
        config = AgentConfig.from_environment()
    
    agent = SuperLawyerAgent(config)
    return agent.run(goal)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
    else:
        task = "Analyze the case notes in case_data/sample_case_notes.txt and draft a motion strategy memo"
    
    print(f"Running Super Lawyer on: {task}")
    result = run_super_lawyer_task(task)
    print(json.dumps(result, indent=2, default=str))
