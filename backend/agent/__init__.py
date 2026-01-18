"""
Amplifier Legal Agent

A Python-based background agent for autonomous legal document processing.
Uses the Metacognitive Recipe pattern (Plan → Execute → Critique → Refine)
and the same Azure OpenAI configuration as the Node.js backend.

Usage:
    # Run the background worker
    python worker.py
    
    # Add a task
    python worker.py --add-task "Summarize all PDFs in the evidence folder"
    
    # List tasks
    python worker.py --list

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

__all__ = [
    "AgentConfig",
    "AzureOpenAIConfig",
    "FileSystemTool",
    "execute_filesystem_tool",
    "MetacognitiveAgent",
    "run_legal_task",
    "BackgroundWorker",
    "TaskQueue",
    "add_task_to_queue",
]

__version__ = "1.0.0"
