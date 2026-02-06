"""
Legal Workflow with Metacognitive Loop

Implements the Plan → Execute → Critique → Refine pattern for autonomous
long-running legal tasks. The agent breaks complex tasks into steps,
executes each step, evaluates its own output, and refines if needed.

This is the "Amplifier Metacognitive Recipe" pattern adapted for legal work.
"""

import os
import json
import time
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime
from enum import Enum

from config import AgentConfig, AzureOpenAIConfig
from advanced_tools import FileSystemTool, FILESYSTEM_TOOLS, execute_filesystem_tool

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class StepStatus(Enum):
    """Status of a workflow step"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class WorkflowStep:
    """A single step in the workflow plan"""
    id: int
    description: str
    status: StepStatus = StepStatus.PENDING
    result: Optional[str] = None
    error: Optional[str] = None
    critique: Optional[str] = None
    refined: bool = False
    attempts: int = 0
    max_attempts: int = 3
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "description": self.description,
            "status": self.status.value,
            "result": self.result,
            "error": self.error,
            "critique": self.critique,
            "refined": self.refined,
            "attempts": self.attempts
        }


@dataclass
class WorkflowPlan:
    """The complete workflow plan"""
    goal: str
    steps: List[WorkflowStep] = field(default_factory=list)
    current_step_index: int = 0
    status: str = "planning"
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    final_result: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "goal": self.goal,
            "steps": [s.to_dict() for s in self.steps],
            "current_step_index": self.current_step_index,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "final_result": self.final_result
        }
    
    @property
    def progress_percent(self) -> float:
        if not self.steps:
            return 0.0
        completed = sum(1 for s in self.steps if s.status == StepStatus.COMPLETED)
        return (completed / len(self.steps)) * 100


class AzureOpenAIClient:
    """
    Client for Azure OpenAI API.
    Uses the same configuration as the Node.js aiAgent.js.
    """
    
    def __init__(self, config: AzureOpenAIConfig):
        self.config = config
        self._session = None
    
    def _get_session(self):
        """Get or create HTTP session"""
        if self._session is None:
            import urllib.request
            import ssl
            # Create SSL context that works with Azure
            self._ssl_context = ssl.create_default_context()
        return self._ssl_context
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> Dict[str, Any]:
        """
        Call Azure OpenAI chat completions API.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            tools: Optional list of tool definitions
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response
            
        Returns:
            API response dict
        """
        import urllib.request
        import urllib.error
        
        url = self.config.chat_completions_url
        
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
            "api-key": self.config.api_key
        }
        
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        
        max_retries = 6  # Up from 3: push through transient failures
        for attempt in range(max_retries):
            try:
                ssl_context = self._get_session()
                with urllib.request.urlopen(request, context=ssl_context, timeout=180) as response:
                    response_data = json.loads(response.read().decode("utf-8"))
                    return response_data
            except urllib.error.HTTPError as e:
                error_body = e.read().decode("utf-8") if e.fp else str(e)
                
                if e.code == 429:  # Rate limit
                    retry_after = int(e.headers.get("Retry-After", 30))
                    logger.warning(f"Rate limited, waiting {retry_after}s...")
                    time.sleep(retry_after)
                    continue
                elif e.code in (500, 502, 503, 504):  # Server errors
                    logger.warning(f"Server error {e.code}, retrying in {2 ** attempt}s...")
                    time.sleep(2 ** attempt)
                    continue
                else:
                    raise RuntimeError(f"Azure OpenAI API error {e.code}: {error_body}")
            except Exception as e:
                if attempt < max_retries - 1:
                    logger.warning(f"Request failed, retrying: {e}")
                    time.sleep(2 ** attempt)
                    continue
                raise
        
        raise RuntimeError("Max retries exceeded for Azure OpenAI API")


class MetacognitiveAgent:
    """
    An autonomous agent that uses the Metacognitive Recipe pattern:
    Plan → Execute → Critique → Refine
    
    This agent can work on complex legal tasks without human intervention,
    breaking them into steps and self-correcting as needed.
    """
    
    # System prompt for the agent
    SYSTEM_PROMPT = """You are an autonomous legal AI agent. You work WITHOUT human supervision on legal document processing tasks.

Your capabilities:
- Read files from the case_data directory (PDFs, text files, documents)
- Write legal documents, memos, and summaries
- List and navigate directory structures
- Extract and analyze legal information

AUTONOMOUS OPERATION RULES:
1. NEVER ask for user input or clarification
2. Make reasonable assumptions when information is ambiguous
3. If a step fails, try an alternative approach
4. Log all significant actions and decisions
5. Complete the entire task before stopping

When planning, break complex tasks into specific, actionable steps.
When executing, call the appropriate tools to complete each step.
When critiquing, evaluate if the step achieved its goal.
When refining, adjust your approach if the critique found issues.

You have access to these file system tools:
- list_directory: List files in a directory
- list_directory_recursive: Find all files in a directory tree
- read_file: Read file contents (supports .txt, .md, .pdf, .docx)
- write_file: Create or update files
- file_exists: Check if a file exists
- create_directory: Create a new directory

Always respond with structured JSON when asked to plan or critique."""

    def __init__(
        self,
        config: AgentConfig,
        log_callback: Optional[Callable[[str], None]] = None
    ):
        self.config = config
        self.client = AzureOpenAIClient(config.azure_config)
        self.fs_tool = FileSystemTool(config.sandbox_directory)
        self.log_callback = log_callback or (lambda msg: logger.info(msg))
        
        # Combined tools (filesystem + planning/critique + optional retrieval)
        self.tools = FILESYSTEM_TOOLS + self._get_metacognitive_tools()
        
        # Add retrieval tools if available
        try:
            from retrieval_tools import get_retrieval_tools_in_openai_format
            retrieval_tools = get_retrieval_tools_in_openai_format()
            self.tools.extend(retrieval_tools)
            self.log_callback(f"MetacognitiveAgent: Added {len(retrieval_tools)} retrieval tools")
        except ImportError as e:
            self.log_callback(f"MetacognitiveAgent: Retrieval tools not available: {e}")
        
        # Current workflow state
        self.plan: Optional[WorkflowPlan] = None
        self.messages: List[Dict[str, str]] = []
        self.iteration_count = 0
        self.start_time: Optional[float] = None
    
    def _get_metacognitive_tools(self) -> List[Dict]:
        """Get the metacognitive planning and critique tools"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "create_plan",
                    "description": "Create a step-by-step plan for completing the task. Call this first to break down the goal.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "goal": {
                                "type": "string",
                                "description": "The overall goal to accomplish"
                            },
                            "steps": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "List of steps to complete the goal"
                            },
                            "reasoning": {
                                "type": "string",
                                "description": "Explanation of why this plan makes sense"
                            }
                        },
                        "required": ["goal", "steps"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "report_step_result",
                    "description": "Report the result of completing a step. Call this after each step to record what was done.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "step_id": {
                                "type": "integer",
                                "description": "The step number (1-indexed)"
                            },
                            "result": {
                                "type": "string",
                                "description": "What was accomplished in this step"
                            },
                            "success": {
                                "type": "boolean",
                                "description": "Whether the step was successful"
                            }
                        },
                        "required": ["step_id", "result", "success"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "critique_step",
                    "description": "Critique your own work on a step. Evaluate if the step actually achieved its goal.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "step_id": {
                                "type": "integer",
                                "description": "The step number to critique"
                            },
                            "achieved_goal": {
                                "type": "boolean",
                                "description": "Did the step achieve its intended goal?"
                            },
                            "issues_found": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Any issues or problems found"
                            },
                            "needs_refinement": {
                                "type": "boolean",
                                "description": "Does this step need to be redone?"
                            },
                            "refinement_approach": {
                                "type": "string",
                                "description": "How to fix the issues if refinement is needed"
                            }
                        },
                        "required": ["step_id", "achieved_goal"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "complete_task",
                    "description": "Mark the entire task as complete. Call this when all steps are done.",
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
                                "description": "Paths to any files created"
                            },
                            "success": {
                                "type": "boolean",
                                "description": "Whether the task was successful overall"
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
    
    def _check_limits(self) -> bool:
        """Check if we're within iteration and time limits"""
        if self.iteration_count >= self.config.max_iterations:
            self._log(f"Max iterations reached ({self.config.max_iterations})")
            return False
        
        if self.start_time:
            elapsed = time.time() - self.start_time
            if elapsed >= self.config.max_runtime_seconds:
                self._log(f"Max runtime reached ({self.config.max_runtime_seconds}s)")
                return False
        
        return True
    
    def _execute_tool(self, tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool call"""
        self._log(f"Executing tool: {tool_name}")
        
        # Filesystem tools
        if tool_name in ("list_directory", "list_directory_recursive", "read_file", 
                         "write_file", "file_exists", "create_directory", 
                         "get_file_info", "append_file"):
            return execute_filesystem_tool(tool_name, args, self.fs_tool)
        
        # Metacognitive tools
        if tool_name == "create_plan":
            return self._handle_create_plan(args)
        elif tool_name == "report_step_result":
            return self._handle_report_step_result(args)
        elif tool_name == "critique_step":
            return self._handle_critique_step(args)
        elif tool_name == "complete_task":
            return self._handle_complete_task(args)
        
        # Retrieval tools
        try:
            from retrieval_tools import RETRIEVAL_TOOLS, execute_retrieval_tool
            retrieval_tool_names = [tool.name for tool in RETRIEVAL_TOOLS]
            if tool_name in retrieval_tool_names:
                # MetacognitiveAgent doesn't have firm/user context by default
                # Use sandbox context for testing
                context = {
                    'firm_id': 'test-firm',
                    'user_id': 'test-user',
                    'backend_bridge': None
                }
                self._log(f"Executing retrieval tool: {tool_name}")
                return execute_retrieval_tool(tool_name, args, context)
        except ImportError:
            pass
        
        return {"success": False, "error": f"Unknown tool: {tool_name}"}
    
    def _handle_create_plan(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle the create_plan tool call"""
        goal = args.get("goal", "")
        steps = args.get("steps", [])
        reasoning = args.get("reasoning", "")
        
        self.plan = WorkflowPlan(goal=goal)
        for i, step_desc in enumerate(steps, 1):
            self.plan.steps.append(WorkflowStep(id=i, description=step_desc))
        
        self.plan.status = "executing"
        self._log(f"Created plan with {len(steps)} steps: {reasoning}")
        
        return {
            "success": True,
            "plan": self.plan.to_dict(),
            "message": f"Plan created with {len(steps)} steps. Now execute step 1."
        }
    
    def _handle_report_step_result(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle the report_step_result tool call"""
        step_id = args.get("step_id", 0)
        result = args.get("result", "")
        success = args.get("success", True)
        
        if not self.plan or step_id < 1 or step_id > len(self.plan.steps):
            return {"success": False, "error": f"Invalid step_id: {step_id}"}
        
        step = self.plan.steps[step_id - 1]
        step.result = result
        step.status = StepStatus.COMPLETED if success else StepStatus.FAILED
        step.attempts += 1
        
        self._log(f"Step {step_id} {'completed' if success else 'failed'}: {result[:100]}")
        
        # Move to next step if successful
        if success and self.plan.current_step_index < len(self.plan.steps):
            self.plan.current_step_index = step_id
        
        return {
            "success": True,
            "step_id": step_id,
            "step_status": step.status.value,
            "next_action": "critique_step" if success else "retry or skip",
            "remaining_steps": len(self.plan.steps) - step_id
        }
    
    def _handle_critique_step(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle the critique_step tool call"""
        step_id = args.get("step_id", 0)
        achieved_goal = args.get("achieved_goal", True)
        issues_found = args.get("issues_found", [])
        needs_refinement = args.get("needs_refinement", False)
        refinement_approach = args.get("refinement_approach", "")
        
        if not self.plan or step_id < 1 or step_id > len(self.plan.steps):
            return {"success": False, "error": f"Invalid step_id: {step_id}"}
        
        step = self.plan.steps[step_id - 1]
        step.critique = json.dumps({
            "achieved_goal": achieved_goal,
            "issues": issues_found,
            "needs_refinement": needs_refinement
        })
        
        self._log(f"Critique step {step_id}: achieved={achieved_goal}, needs_refinement={needs_refinement}")
        
        if needs_refinement and step.attempts < step.max_attempts:
            step.status = StepStatus.PENDING
            step.refined = True
            return {
                "success": True,
                "action": "refine",
                "message": f"Re-execute step {step_id} with approach: {refinement_approach}",
                "attempts_remaining": step.max_attempts - step.attempts
            }
        elif needs_refinement:
            self._log(f"Step {step_id} failed after {step.attempts} attempts, moving on")
            step.status = StepStatus.FAILED
            return {
                "success": True,
                "action": "skip",
                "message": f"Max attempts reached for step {step_id}, moving to next step"
            }
        else:
            # Step is good, move to next
            next_step = step_id + 1
            if next_step <= len(self.plan.steps):
                return {
                    "success": True,
                    "action": "next",
                    "message": f"Step {step_id} passed critique. Execute step {next_step}."
                }
            else:
                return {
                    "success": True,
                    "action": "complete",
                    "message": "All steps completed. Call complete_task."
                }
    
    def _handle_complete_task(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle the complete_task tool call"""
        summary = args.get("summary", "")
        output_files = args.get("output_files", [])
        success = args.get("success", True)
        
        if self.plan:
            self.plan.status = "completed" if success else "failed"
            self.plan.completed_at = datetime.now()
            self.plan.final_result = summary
        
        self._log(f"Task completed: {summary[:200]}")
        
        return {
            "success": True,
            "task_complete": True,
            "summary": summary,
            "output_files": output_files,
            "overall_success": success
        }
    
    def run(self, goal: str) -> Dict[str, Any]:
        """
        Run the metacognitive workflow for a goal.
        
        Args:
            goal: The task goal to accomplish
            
        Returns:
            Final result dictionary
        """
        self.start_time = time.time()
        self.iteration_count = 0
        self.plan = None
        
        self._log(f"Starting task: {goal}")
        
        # Initialize conversation with system prompt and goal
        self.messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            {"role": "user", "content": f"""TASK: {goal}

Instructions:
1. First, call create_plan to break this task into steps
2. Then execute each step using the file system tools
3. After each step, call report_step_result to record what was done
4. Call critique_step to evaluate your work
5. If critique finds issues, refine and retry
6. When all steps are done, call complete_task

BEGIN NOW. Start by calling create_plan."""}
        ]
        
        try:
            while self._check_limits():
                self.iteration_count += 1
                self._log(f"Iteration {self.iteration_count}")
                
                # Call Azure OpenAI
                try:
                    response = self.client.chat_completion(
                        messages=self.messages,
                        tools=self.tools,
                        temperature=self.config.temperature,
                        max_tokens=self.config.max_tokens
                    )
                except Exception as e:
                    self._log(f"API error: {e}")
                    time.sleep(5)
                    continue
                
                # Get the assistant's response
                choice = response.get("choices", [{}])[0]
                message = choice.get("message", {})
                finish_reason = choice.get("finish_reason", "")
                
                # Add assistant message to history
                self.messages.append(message)
                
                # Check for tool calls
                tool_calls = message.get("tool_calls", [])
                
                if tool_calls:
                    # Execute each tool call
                    for tool_call in tool_calls:
                        tool_name = tool_call.get("function", {}).get("name", "")
                        try:
                            tool_args = json.loads(
                                tool_call.get("function", {}).get("arguments", "{}")
                            )
                        except json.JSONDecodeError:
                            tool_args = {}
                        
                        # Execute the tool
                        result = self._execute_tool(tool_name, tool_args)
                        
                        # Add tool result to messages
                        self.messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.get("id", ""),
                            "content": json.dumps(result)
                        })
                        
                        # Check if task is complete
                        if tool_name == "complete_task":
                            return {
                                "success": result.get("overall_success", True),
                                "summary": result.get("summary", ""),
                                "output_files": result.get("output_files", []),
                                "iterations": self.iteration_count,
                                "plan": self.plan.to_dict() if self.plan else None,
                                "elapsed_seconds": time.time() - self.start_time
                            }
                
                elif finish_reason == "stop" and message.get("content"):
                    # Model responded with text instead of tool call
                    content = message.get("content", "")
                    self._log(f"Model response (no tool call): {content[:200]}")
                    
                    # Prompt to continue with tools
                    self.messages.append({
                        "role": "user",
                        "content": "Continue executing the task. Use the tools to make progress. Do not just describe what to do - actually call the tools."
                    })
                
                # Compact message history if too long (raised threshold)
                if len(self.messages) > 70:
                    self._compact_messages()
            
            # Reached limits without completing
            return {
                "success": False,
                "error": "Task did not complete within limits",
                "iterations": self.iteration_count,
                "plan": self.plan.to_dict() if self.plan else None,
                "elapsed_seconds": time.time() - self.start_time
            }
            
        except Exception as e:
            self._log(f"Error during execution: {e}")
            return {
                "success": False,
                "error": str(e),
                "iterations": self.iteration_count,
                "plan": self.plan.to_dict() if self.plan else None,
                "elapsed_seconds": time.time() - self.start_time if self.start_time else 0
            }
    
    def _compact_messages(self):
        """Compact message history to prevent context overflow - keep more context"""
        # Keep system message, first user message, and last 50 messages
        if len(self.messages) > 55:
            system_msg = self.messages[0]
            first_user = self.messages[1]
            recent = self.messages[-50:]
            
            # Create a summary message
            summary = {
                "role": "system",
                "content": f"[Previous conversation compacted. {len(self.messages) - 32} messages removed. Current progress: iteration {self.iteration_count}, plan status: {self.plan.status if self.plan else 'unknown'}]"
            }
            
            self.messages = [system_msg, first_user, summary] + recent
            self._log("Compacted message history")


def run_legal_task(goal: str, config: Optional[AgentConfig] = None) -> Dict[str, Any]:
    """
    Convenience function to run a legal task.
    
    Args:
        goal: The task goal
        config: Optional agent configuration
        
    Returns:
        Task result
    """
    if config is None:
        config = AgentConfig.from_environment()
    
    agent = MetacognitiveAgent(config)
    return agent.run(goal)


if __name__ == "__main__":
    # Test the agent with a simple task
    import sys
    
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
    else:
        task = "List all files in the case_data directory and create a summary.txt file listing them"
    
    print(f"Running task: {task}")
    result = run_legal_task(task)
    print(json.dumps(result, indent=2))
