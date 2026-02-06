"""
Amplifier Legal Agent - Super Lawyer Edition

This package contains the autonomous legal document processing agent.
The agent uses IRAC methodology and learns from user feedback.
"""

# Import key components for easy access
from .config import AgentConfig, AzureOpenAIConfig
from .advanced_tools import FileSystemTool, FILESYSTEM_TOOLS, execute_filesystem_tool
from .bridge_tools import BackendAPIBridge, get_tools_in_openai_format, ToolExecutor
from .learning import LearningManager, LEARNING_TOOLS, execute_learning_tool
from .legal_knowledge import LegalKnowledgeBase, get_legal_knowledge_base
from .legal_workflow import MetacognitiveAgent
from .lawyer_brain import SuperLawyerAgent
from .worker import BackgroundWorker
from .streaming import StreamingAgent

# Optional retrieval tools import
try:
    from .retrieval_tools import (
        RetrievalSystem,
        RETRIEVAL_TOOLS,
        get_retrieval_tools_in_openai_format,
        execute_retrieval_tool
    )
    RETRIEVAL_AVAILABLE = True
except ImportError:
    RETRIEVAL_AVAILABLE = False
    print("[Agent] Note: Retrieval tools not available (optional module)")

__version__ = "1.0.0"
__author__ = "Apex Legal Technologies"
__description__ = "Autonomous legal document processing agent"