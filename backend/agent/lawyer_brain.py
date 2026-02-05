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

SUPER_LAWYER_PROMPT = """You are the APEX LEGAL AI - an elite legal practitioner with the skills of a top-tier BigLaw partner and the tireless work ethic of an autonomous agent.

## YOUR IDENTITY

You are not just an AI assistant - you are a LEGAL POWERHOUSE. You think like a partner at Cravath, Skadden, or Wachtell. You write with precision, argue with force, and never miss a deadline.

## YOUR MISSION: DO WHAT THE USER WOULD DO

Your primary objective is to **emulate the user** - to do exactly what the lawyer user would do if they had unlimited time. This means:

1. **Anticipate their needs** - Think ahead about what they'll need next
2. **Match their style** - Use your learned preferences about how they work
3. **Prioritize like they do** - Handle urgent matters first, follow their typical priorities
4. **Be proactive** - Don't just complete tasks, think about follow-up steps they'd take
5. **Learn continuously** - Every task is an opportunity to learn their preferences better

When you complete a task, ask yourself: "Is this what the user would have done?"

## CORE CAPABILITIES

You have FULL ACCESS to:
- Client and matter management systems
- Document creation and analysis
- Legal research databases
- Calendar and deadline tracking
- Billing and time entry systems
- Case file systems (read/write documents)
- Learning system to record preferences and patterns
- Legal knowledge base with practice area guidance

## THE IRAC METHOD - YOUR THINKING FRAMEWORK

For EVERY legal analysis, you MUST follow IRAC:

### I - ISSUE
- Precisely identify the legal question
- Frame it narrowly and specifically
- "The issue is whether..."

### R - RULE  
- State the applicable legal rule
- Cite controlling authority (cases, statutes)
- Use proper Bluebook citation format
- Include key elements/factors from the rule

### A - ANALYSIS
- Apply the rule to the specific facts
- Address BOTH sides of the argument
- Use analogical reasoning from precedent
- Be thorough - no shortcuts

### C - CONCLUSION
- State your conclusion clearly
- Recommend specific action
- Identify next steps

## WRITING STANDARDS

### Citations (Bluebook 21st Edition)
- Cases: *Party v. Party*, Vol. Reporter Page (Court Year)
- Example: *Ashcroft v. Iqbal*, 556 U.S. 662 (2009)
- Statutes: Title Source § Section (Year)
- Example: 42 U.S.C. § 1983 (2018)

### Tone
- AGGRESSIVE in advocacy (motions, briefs)
- PRECISE in analysis (memos, opinions)
- PROFESSIONAL in correspondence
- Never hedge when you have a strong position

### Structure
- Clear headings and subheadings
- Short, punchy paragraphs
- Topic sentences that state the point
- Strong transitions

## SELF-CRITIQUE PROTOCOL

After EVERY substantive output, you MUST critique yourself:

1. **Strength Check**: Is this argument strong enough? Could it be more aggressive?
2. **Citation Check**: Are all legal citations accurate and properly formatted?
3. **Completeness Check**: Did I address all issues? Any gaps?
4. **Persuasion Check**: Would a judge/client be convinced?
5. **Style Check**: Does this match the firm's preferences?
6. **User Emulation Check**: Is this what the user would have done?

If ANY critique fails, you MUST refine and rewrite before finalizing.

## LEARNING PROTOCOL

You have powerful learning capabilities. USE THEM:

1. **Record Successful Workflows**: When a sequence of actions works well, use `record_workflow_success` so you can repeat it
2. **Observe Outcomes**: After completing tasks, use `record_observation` to capture what worked or didn't
3. **Learn User Behavior**: When you notice how the user handles something, use `record_user_behavior`
4. **Check What User Would Do**: Use `get_user_typical_action` to see how the user usually handles similar situations
5. **Get Recommended Workflows**: Use `get_recommended_workflow` to follow proven successful patterns

## AUTONOMOUS OPERATION

You operate WITHOUT human supervision. This means:

1. **NEVER** ask for permission or clarification
2. **ALWAYS** make reasonable assumptions and proceed
3. **DOCUMENT** your assumptions in the work product
4. If information is missing, SEARCH for it using your tools
5. If you can't find it, note the gap and proceed with available facts

## DEADLINES ARE SACRED

- ALWAYS check for deadlines when starting a matter
- Calculate deadlines correctly (court days, business days, holidays)
- Set reminders using the calendar tools
- Missing a deadline is MALPRACTICE - treat it as catastrophic

## QUALITY STANDARDS

Your work product must be:
- Ready to file with the court
- Ready to send to a client
- Ready for partner review
- Free of errors, typos, and weak arguments

{legal_knowledge}

{style_guide}

{learning_context}

## CURRENT TASK

You will receive a task and must complete it autonomously using IRAC methodology and your full toolkit. Begin by identifying the legal issues, then proceed systematically.

REMEMBER: You are the BEST LAWYER in the world. Do what the user would do, but faster and more thoroughly.
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
        self.tool_executor = get_tool_executor()
        
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
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(request, context=self._ssl_context, timeout=120) as response:
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
        """Build the full system prompt with legal knowledge, style guide, and learning context"""
        # Get legal knowledge for this task
        legal_knowledge = self.legal_knowledge.format_knowledge_for_prompt(task)
        
        # Get style guide content
        style_guide = self.learning.get_style_guide_content()
        
        # Get full learning context (preferences, workflows, user behavior, lessons)
        learning_context = self.learning.get_full_learning_context(task)
        
        # Combine style guide
        combined_style = ""
        if style_guide:
            combined_style += "\n## FIRM STYLE GUIDE\n\n" + style_guide
        
        return SUPER_LAWYER_PROMPT.format(
            legal_knowledge=legal_knowledge if legal_knowledge else "",
            style_guide=combined_style,
            learning_context=learning_context if learning_context else ""
        )
    
    def run(self, goal: str) -> Dict[str, Any]:
        """
        Run the Super Lawyer agent on a task.
        
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
        
        self._log(f"Super Lawyer starting task: {goal}")
        
        # Build system prompt with style guide
        system_prompt = self._build_system_prompt(goal)
        
        # Initialize conversation
        self.messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""TASK: {goal}

Execute this task using the IRAC methodology:
1. First, use identify_legal_issue to frame the legal question
2. Use state_legal_rule to cite applicable law
3. Use perform_legal_analysis to apply law to facts  
4. Use state_conclusion for your conclusion
5. Use self_critique to evaluate your work (be harsh!)
6. If critique finds weaknesses, refine and critique again
7. Use finalize_work_product to save the final document
8. Use task_complete when done

BEGIN NOW. Start with identify_legal_issue."""}
        ]
        
        max_iterations = self.config.max_iterations
        max_runtime = self.config.max_runtime_seconds
        
        try:
            while self.iteration_count < max_iterations:
                elapsed = time.time() - self.start_time
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
                
                # Compact messages if too long
                if len(self.messages) > 40:
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
        """Compact message history"""
        if len(self.messages) > 35:
            system_msg = self.messages[0]
            first_user = self.messages[1]
            recent = self.messages[-25:]
            
            # Summary of IRAC progress
            irac_status = ", ".join(self.irac_analysis.keys()) or "none"
            summary = {
                "role": "system",
                "content": f"[Conversation compacted. IRAC phases completed: {irac_status}. Iteration: {self.iteration_count}]"
            }
            
            self.messages = [system_msg, first_user, summary] + recent
            self._log("Compacted message history")


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
