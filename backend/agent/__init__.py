"""
Amplifier Legal Agent - Super Lawyer Edition

A Python-based background agent for autonomous legal document processing.
Features:
- IRAC methodology (Issue, Rule, Analysis, Conclusion)
- Self-critique and refinement loops
- Learning from user preferences (style_guide.md)
- Access to all platform tools (same as normal AI chat)
- Metacognitive Recipe pattern (Plan → Execute → Critique → Refine)

Usage:
    # Run the background worker (uses SuperLawyerAgent)
    python worker.py
    
    # Add a task
    python worker.py --add-task "Draft a motion to dismiss for Case XYZ"
    
    # List tasks
    python worker.py --list
    
    # Run a single task directly
    python lawyer_brain.py "Analyze the contract and identify risks"

Configuration:
    Set these environment variables (same as the Node.js aiAgent.js):
    - AZURE_OPENAI_ENDPOINT
    - AZURE_OPENAI_API_KEY
    - AZURE_OPENAI_DEPLOYMENT
"""

from .config import AgentConfig, AzureOpenAIConfig
from .advanced_tools import FileSystemTool, execute_filesystem_tool
from .legal_workflow import MetacognitiveAgent, run_legal_task
from .worker import BackgroundWorker, TaskQueue, add_task_to_queue

# Advanced components
from .bridge_tools import LEGAL_TOOLS, ToolExecutor, get_tool_executor
from .learning import LearningManager, StylePreference
from .lawyer_brain import SuperLawyerAgent, run_super_lawyer_task

__all__ = [
    # Configuration
    "AgentConfig",
    "AzureOpenAIConfig",
    
    # File system tools
    "FileSystemTool",
    "execute_filesystem_tool",
    
    # Agents
    "MetacognitiveAgent",
    "SuperLawyerAgent",
    
    # Task runners
    "run_legal_task",
    "run_super_lawyer_task",
    
    # Worker
    "BackgroundWorker",
    "TaskQueue",
    "add_task_to_queue",
    
    # Tools
    "LEGAL_TOOLS",
    "ToolExecutor",
    "get_tool_executor",
    
    # Learning
    "LearningManager",
    "StylePreference",
]

__version__ = "2.0.0"  # Major upgrade with SuperLawyerAgent
