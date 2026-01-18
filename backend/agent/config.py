"""
Azure OpenAI Configuration for Amplifier Background Agent

Uses the SAME environment variables as the Node.js backend (aiAgent.js)
to ensure consistency between the normal AI chat and background agent.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class AzureOpenAIConfig:
    """Azure OpenAI configuration matching the Node.js backend"""
    endpoint: str
    api_key: str
    deployment: str
    api_version: str = "2024-12-01-preview"  # Same as aiAgent.js
    
    @classmethod
    def from_environment(cls) -> "AzureOpenAIConfig":
        """
        Load configuration from environment variables.
        Uses the SAME env vars as the Node.js aiAgent.js:
        - AZURE_OPENAI_ENDPOINT
        - AZURE_OPENAI_API_KEY
        - AZURE_OPENAI_DEPLOYMENT
        """
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
        api_key = os.environ.get("AZURE_OPENAI_API_KEY", "")
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "")
        
        # Validate configuration
        if not endpoint:
            raise ValueError("AZURE_OPENAI_ENDPOINT environment variable is required")
        if not api_key:
            raise ValueError("AZURE_OPENAI_API_KEY environment variable is required")
        if api_key in ("PASTE_YOUR_KEY_HERE", "your-azure-openai-api-key"):
            raise ValueError("AZURE_OPENAI_API_KEY contains a placeholder value")
        if not deployment:
            raise ValueError("AZURE_OPENAI_DEPLOYMENT environment variable is required")
        
        # Normalize endpoint (ensure trailing slash)
        if not endpoint.endswith("/"):
            endpoint = endpoint + "/"
        
        return cls(
            endpoint=endpoint,
            api_key=api_key,
            deployment=deployment
        )
    
    @property
    def chat_completions_url(self) -> str:
        """Build the Azure OpenAI chat completions URL"""
        return f"{self.endpoint}openai/deployments/{self.deployment}/chat/completions?api-version={self.api_version}"
    
    def is_valid(self) -> bool:
        """Check if configuration is valid"""
        return bool(self.endpoint and self.api_key and self.deployment)


@dataclass
class AgentConfig:
    """Configuration for the background agent"""
    # Azure OpenAI
    azure_config: AzureOpenAIConfig
    
    # Agent behavior
    max_iterations: int = 50  # Maximum steps per task
    max_runtime_seconds: int = 3600  # 1 hour max per task
    checkpoint_interval_seconds: int = 30
    
    # File system sandbox
    sandbox_directory: str = "./case_data"
    
    # Logging
    log_file: str = "./logs/agent_logs.txt"
    
    # Task queue
    task_queue_file: str = "./pending_tasks.json"
    poll_interval_seconds: int = 5
    
    # Model parameters (matching aiAgent.js)
    temperature: float = 0.7
    max_tokens: int = 4000
    
    @classmethod
    def from_environment(cls) -> "AgentConfig":
        """Load configuration from environment"""
        return cls(
            azure_config=AzureOpenAIConfig.from_environment(),
            max_iterations=int(os.environ.get("AGENT_MAX_ITERATIONS", "50")),
            max_runtime_seconds=int(os.environ.get("AGENT_MAX_RUNTIME_SECONDS", "3600")),
            sandbox_directory=os.environ.get("AGENT_SANDBOX_DIR", "./case_data"),
            log_file=os.environ.get("AGENT_LOG_FILE", "./logs/agent_logs.txt"),
            task_queue_file=os.environ.get("AGENT_TASK_QUEUE", "./pending_tasks.json"),
        )


def load_dotenv_if_available():
    """Load .env file if python-dotenv is available"""
    try:
        from dotenv import load_dotenv
        # Try to load from parent directory (where backend .env is)
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
            print(f"[Config] Loaded environment from {env_path}")
        else:
            # Try current directory
            load_dotenv()
    except ImportError:
        pass  # dotenv not installed, rely on system env vars


# Auto-load .env on import
load_dotenv_if_available()
