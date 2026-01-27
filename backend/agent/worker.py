#!/usr/bin/env python3
"""
Background Worker for Amplifier Legal Agent

This worker runs continuously, polling for new tasks from a JSON file (pending_tasks.json).
When a task is found, it spins up the MetacognitiveAgent and runs the task autonomously.

The worker is designed to:
- Run forever without human intervention
- Handle errors gracefully and continue processing
- Log all activity to agent_logs.txt
- Never use input() or ask for user input
- Stream real-time updates to the Glass Cockpit UI via SSE

Usage:
    python worker.py
"""

import os
import sys
import json
import time
import signal
import logging
import traceback
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from enum import Enum

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import AgentConfig, load_dotenv_if_available
from legal_workflow import MetacognitiveAgent

# Import the Super Lawyer agent (advanced IRAC-based reasoning)
try:
    from lawyer_brain import SuperLawyerAgent
    SUPER_LAWYER_AVAILABLE = True
except ImportError as e:
    print(f"Warning: SuperLawyerAgent not available: {e}")
    SUPER_LAWYER_AVAILABLE = False

# Import streaming support
try:
    from streaming import EventEmitter, StreamingCallbackHandler, EventType
    STREAMING_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Streaming not available: {e}")
    STREAMING_AVAILABLE = False

# Load environment variables
load_dotenv_if_available()


class TaskStatus(Enum):
    """Status of a task in the queue"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Task:
    """A task in the queue"""
    id: str
    goal: str
    status: TaskStatus
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    output_path: Optional[str] = None
    priority: int = 0
    user_id: Optional[str] = None  # User who created/owns the task
    firm_id: Optional[str] = None  # Firm context for the task
    matter_id: Optional[str] = None  # Optional matter context
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "goal": self.goal,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "result": self.result,
            "error": self.error,
            "output_path": self.output_path,
            "priority": self.priority,
            "user_id": self.user_id,
            "firm_id": self.firm_id,
            "matter_id": self.matter_id
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        return cls(
            id=data.get("id", ""),
            goal=data.get("goal", ""),
            status=TaskStatus(data.get("status", "pending")),
            created_at=data.get("created_at", ""),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            result=data.get("result"),
            error=data.get("error"),
            output_path=data.get("output_path"),
            priority=data.get("priority", 0),
            user_id=data.get("user_id"),
            firm_id=data.get("firm_id"),
            matter_id=data.get("matter_id")
        )


class TaskQueue:
    """
    Simple file-based task queue.
    Stores tasks in a JSON file for persistence across restarts.
    """
    
    def __init__(self, queue_file: str = "./pending_tasks.json"):
        self.queue_file = Path(queue_file)
        self._ensure_file_exists()
    
    def _ensure_file_exists(self):
        """Create the queue file if it doesn't exist"""
        if not self.queue_file.exists():
            self.queue_file.parent.mkdir(parents=True, exist_ok=True)
            self._save_tasks([])
    
    def _load_tasks(self) -> List[Dict[str, Any]]:
        """Load tasks from the file"""
        try:
            with open(self.queue_file, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "tasks" in data:
                    return data["tasks"]
                return []
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    
    def _save_tasks(self, tasks: List[Dict[str, Any]]):
        """Save tasks to the file"""
        with open(self.queue_file, "w") as f:
            json.dump({
                "tasks": tasks,
                "last_updated": datetime.now().isoformat()
            }, f, indent=2)
    
    def get_pending_task(self) -> Optional[Task]:
        """Get the next pending task (highest priority first)"""
        tasks = self._load_tasks()
        
        pending = [
            Task.from_dict(t) for t in tasks 
            if t.get("status") == "pending"
        ]
        
        if not pending:
            return None
        
        # Sort by priority (higher first), then by created_at
        pending.sort(key=lambda t: (-t.priority, t.created_at))
        return pending[0]
    
    def update_task(self, task: Task):
        """Update a task in the queue"""
        tasks = self._load_tasks()
        
        for i, t in enumerate(tasks):
            if t.get("id") == task.id:
                tasks[i] = task.to_dict()
                break
        else:
            # Task not found, add it
            tasks.append(task.to_dict())
        
        self._save_tasks(tasks)
    
    def add_task(self, goal: str, priority: int = 0) -> Task:
        """Add a new task to the queue"""
        task = Task(
            id=f"task_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}",
            goal=goal,
            status=TaskStatus.PENDING,
            created_at=datetime.now().isoformat(),
            priority=priority
        )
        
        tasks = self._load_tasks()
        tasks.append(task.to_dict())
        self._save_tasks(tasks)
        
        return task
    
    def get_all_tasks(self) -> List[Task]:
        """Get all tasks"""
        return [Task.from_dict(t) for t in self._load_tasks()]


class AgentLogger:
    """
    Logger that writes to both console and file.
    Used to track agent activity for debugging.
    """
    
    def __init__(self, log_file: str = "./logs/agent_logs.txt"):
        self.log_file = Path(log_file)
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Set up logging
        self.logger = logging.getLogger("AgentWorker")
        self.logger.setLevel(logging.INFO)
        
        # Console handler
        console = logging.StreamHandler()
        console.setLevel(logging.INFO)
        console.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s"
        ))
        self.logger.addHandler(console)
        
        # File handler
        file_handler = logging.FileHandler(self.log_file, mode="a")
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s"
        ))
        self.logger.addHandler(file_handler)
    
    def info(self, message: str):
        self.logger.info(message)
    
    def error(self, message: str):
        self.logger.error(message)
    
    def warning(self, message: str):
        self.logger.warning(message)
    
    def log_task_start(self, task: Task):
        self.info(f"Starting task {task.id}: {task.goal[:100]}...")
    
    def log_task_complete(self, task: Task, result: Dict[str, Any]):
        success = result.get("success", False)
        status = "SUCCESS" if success else "FAILED"
        self.info(f"Task {task.id} {status}: {result.get('summary', 'No summary')[:200]}")
    
    def log_task_error(self, task: Task, error: str):
        self.error(f"Task {task.id} ERROR: {error}")


class BackgroundWorker:
    """
    The main background worker that processes tasks.
    
    Runs in an infinite loop, polling for new tasks and processing them
    using the MetacognitiveAgent.
    
    Supports real-time streaming to the Glass Cockpit UI via SSE.
    """
    
    def __init__(
        self,
        config: Optional[AgentConfig] = None,
        queue_file: str = "./pending_tasks.json",
        log_file: str = "./logs/agent_logs.txt",
        poll_interval: int = 5,
        backend_url: str = "http://localhost:3001"
    ):
        self.config = config or AgentConfig.from_environment()
        self.queue = TaskQueue(queue_file)
        self.logger = AgentLogger(log_file)
        self.poll_interval = poll_interval
        self.running = True
        self.current_task: Optional[Task] = None
        self.backend_url = backend_url
        
        # Current streaming emitter (created per task)
        self.emitter: Optional['EventEmitter'] = None
        self.callback_handler: Optional['StreamingCallbackHandler'] = None
        
        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._handle_shutdown)
        signal.signal(signal.SIGTERM, self._handle_shutdown)
    
    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals gracefully"""
        self.logger.info("Shutdown signal received, stopping worker...")
        self.running = False
        
        # If a task is running, mark it as failed
        if self.current_task and self.current_task.status == TaskStatus.RUNNING:
            self.current_task.status = TaskStatus.PENDING  # Allow retry
            self.current_task.error = "Worker shutdown during execution"
            self.queue.update_task(self.current_task)
    
    def _create_streaming_emitter(self, task_id: str) -> Optional['EventEmitter']:
        """Create a streaming emitter for the task if available"""
        if not STREAMING_AVAILABLE:
            return None
        
        try:
            emitter = EventEmitter(
                task_id=task_id,
                backend_url=self.backend_url
            )
            emitter.start()
            return emitter
        except Exception as e:
            self.logger.warning(f"Failed to create streaming emitter: {e}")
            return None
    
    def _process_task(self, task: Task) -> Dict[str, Any]:
        """
        Process a single task using the SuperLawyerAgent (or MetacognitiveAgent fallback).
        
        The SuperLawyerAgent uses:
        - IRAC methodology (Issue, Rule, Analysis, Conclusion)
        - Self-critique and refinement
        - Learning from user preferences
        - Same tools as the normal AI chat
        
        Streams real-time updates to the Glass Cockpit UI via SSE.
        
        Args:
            task: The task to process
            
        Returns:
            Result dictionary
        """
        self.current_task = task
        
        # Create streaming emitter for this task
        self.emitter = self._create_streaming_emitter(task.id)
        if self.emitter:
            self.callback_handler = StreamingCallbackHandler(self.emitter)
            self.emitter.progress.started_at = datetime.now().isoformat()
            self.logger.info(f"[Task {task.id}] Streaming enabled")
        
        # Update task status to running
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now().isoformat()
        self.queue.update_task(task)
        
        self.logger.log_task_start(task)
        
        try:
            # Emit task start event
            if self.emitter:
                self.emitter.emit(
                    EventType.TASK_START,
                    message=f"Starting: {task.goal[:100]}...",
                    data={"goal": task.goal}
                )
            
            # Create the agent with a streaming-aware logging callback
            def log_callback(message: str):
                self.logger.info(f"[Task {task.id}] {message}")
                
                # Stream the message to UI
                if self.emitter:
                    # Detect message type and emit appropriate event
                    if message.startswith("[THINKING]"):
                        self.emitter.thinking(message[10:].strip())
                    elif message.startswith("[TOOL]"):
                        parts = message[6:].strip().split(":", 1)
                        tool_name = parts[0].strip() if parts else "unknown"
                        description = parts[1].strip() if len(parts) > 1 else ""
                        self.emitter.tool_start(tool_name, description)
                    elif message.startswith("[STEP]"):
                        parts = message[6:].strip().split(":", 1)
                        step_num = int(parts[0].strip()) if parts and parts[0].strip().isdigit() else 1
                        description = parts[1].strip() if len(parts) > 1 else message[6:].strip()
                        self.emitter.step_start(step_num, description)
                    elif message.startswith("[COMPLETE]"):
                        self.emitter.step_complete(
                            self.emitter.progress.completed_steps + 1,
                            message[10:].strip()
                        )
                    elif message.startswith("[PLAN]"):
                        # Parse plan steps
                        plan_text = message[6:].strip()
                        steps = [s.strip() for s in plan_text.split(";") if s.strip()]
                        self.emitter.plan_update(steps)
                    elif message.startswith("[IRAC"):
                        # Extract IRAC phase: [IRAC:ISSUE] content
                        import re
                        match = re.match(r'\[IRAC:(\w+)\](.*)$', message)
                        if match:
                            phase = match.group(1).lower()
                            content = match.group(2).strip()
                            self.emitter.irac_phase(phase, content)
                    elif message.startswith("[CRITIQUE]"):
                        self.emitter.emit(
                            EventType.IRAC_CRITIQUE,
                            message=message[10:].strip(),
                            color="orange"
                        )
                    elif message.startswith("[ARTIFACT]"):
                        parts = message[10:].strip().split(":", 1)
                        name = parts[0].strip() if parts else "document"
                        preview = parts[1].strip() if len(parts) > 1 else ""
                        if preview:
                            self.emitter.artifact_update(name, preview)
                        else:
                            self.emitter.artifact_start(name)
                    elif message.startswith("[PROGRESS]"):
                        parts = message[10:].strip().split("%", 1)
                        if parts and parts[0].strip().isdigit():
                            percent = int(parts[0].strip())
                            status = parts[1].strip() if len(parts) > 1 else ""
                            self.emitter.update_progress(percent, status)
                    elif message.startswith("[ERROR]"):
                        self.emitter.error(message[7:].strip())
                    else:
                        # Generic log message
                        self.emitter.log(message)
            
            # Use SuperLawyerAgent if available (preferred - has IRAC + learning)
            if SUPER_LAWYER_AVAILABLE:
                self.logger.info(f"[Task {task.id}] Using SuperLawyerAgent (IRAC + Learning)")
                self.logger.info(f"[Task {task.id}] User: {task.user_id}, Firm: {task.firm_id}")
                if self.emitter:
                    self.emitter.emit(EventType.STATUS_UPDATE, message="Loading SuperLawyerAgent (IRAC + Learning)")
                
                # Pass user/firm context for personalized learning
                agent = SuperLawyerAgent(
                    self.config, 
                    log_callback,
                    user_id=task.user_id,
                    firm_id=task.firm_id,
                    backend_url=self.backend_url
                )
            else:
                self.logger.info(f"[Task {task.id}] Using MetacognitiveAgent (fallback)")
                if self.emitter:
                    self.emitter.emit(EventType.STATUS_UPDATE, message="Loading MetacognitiveAgent")
                agent = MetacognitiveAgent(self.config, log_callback)
            
            # Run the task
            if self.emitter:
                self.emitter.update_progress(5, "initializing", "Agent initialized, starting work...")
            
            result = agent.run(task.goal)
            
            # Update task with result
            task.result = result
            
            if result.get("success", False):
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.now().isoformat()
                
                # Set output path if files were created
                output_files = result.get("output_files", [])
                if output_files:
                    task.output_path = output_files[0]  # Primary output file
                
                # Emit success event
                if self.emitter:
                    self.emitter.task_complete(
                        result.get("summary", "Task completed successfully"),
                        output_files
                    )
            else:
                task.status = TaskStatus.FAILED
                task.error = result.get("error", "Task did not complete successfully")
                task.completed_at = datetime.now().isoformat()
                
                # Emit failure event
                if self.emitter:
                    self.emitter.task_failed(task.error)
            
            self.queue.update_task(task)
            self.logger.log_task_complete(task, result)
            
            return result
            
        except Exception as e:
            # Log error and update task
            error_msg = f"{type(e).__name__}: {str(e)}"
            stack_trace = traceback.format_exc()
            
            self.logger.log_task_error(task, error_msg)
            self.logger.error(f"Stack trace:\n{stack_trace}")
            
            # Emit error event
            if self.emitter:
                self.emitter.task_failed(error_msg)
            
            task.status = TaskStatus.FAILED
            task.error = error_msg
            task.completed_at = datetime.now().isoformat()
            self.queue.update_task(task)
            
            return {"success": False, "error": error_msg}
        
        finally:
            # Stop streaming emitter
            if self.emitter:
                self.emitter.stop()
                self.emitter = None
                self.callback_handler = None
            
            self.current_task = None
    
    def run_once(self) -> Optional[Dict[str, Any]]:
        """
        Check for and process a single task.
        
        Returns:
            Result if a task was processed, None otherwise
        """
        task = self.queue.get_pending_task()
        
        if task is None:
            return None
        
        return self._process_task(task)
    
    def run(self):
        """
        Run the worker in an infinite loop.
        
        Polls for tasks and processes them until shutdown.
        """
        self.logger.info("=" * 60)
        self.logger.info("Background Worker Started")
        self.logger.info(f"Queue file: {self.queue.queue_file}")
        self.logger.info(f"Poll interval: {self.poll_interval}s")
        self.logger.info(f"Sandbox directory: {self.config.sandbox_directory}")
        self.logger.info("=" * 60)
        
        tasks_processed = 0
        
        while self.running:
            try:
                # Check for pending tasks
                task = self.queue.get_pending_task()
                
                if task:
                    self._process_task(task)
                    tasks_processed += 1
                else:
                    # No tasks, wait before polling again
                    time.sleep(self.poll_interval)
                
            except KeyboardInterrupt:
                break
            except Exception as e:
                self.logger.error(f"Worker error: {e}")
                self.logger.error(traceback.format_exc())
                time.sleep(self.poll_interval)  # Avoid tight error loop
        
        self.logger.info(f"Worker stopped. Processed {tasks_processed} tasks.")


def add_task_to_queue(goal: str, priority: int = 0, queue_file: str = "./pending_tasks.json") -> Task:
    """
    Convenience function to add a task to the queue.
    
    Args:
        goal: The task goal/description
        priority: Priority level (higher = more urgent)
        queue_file: Path to the queue file
        
    Returns:
        The created task
    """
    queue = TaskQueue(queue_file)
    task = queue.add_task(goal, priority)
    print(f"Added task: {task.id}")
    return task


def list_tasks(queue_file: str = "./pending_tasks.json") -> List[Task]:
    """
    List all tasks in the queue.
    
    Args:
        queue_file: Path to the queue file
        
    Returns:
        List of all tasks
    """
    queue = TaskQueue(queue_file)
    tasks = queue.get_all_tasks()
    
    for task in tasks:
        status_emoji = {
            TaskStatus.PENDING: "⏳",
            TaskStatus.RUNNING: "🔄",
            TaskStatus.COMPLETED: "✅",
            TaskStatus.FAILED: "❌",
            TaskStatus.CANCELLED: "🚫"
        }.get(task.status, "❓")
        
        print(f"{status_emoji} [{task.id}] {task.goal[:60]}... ({task.status.value})")
    
    return tasks


def main():
    """Main entry point for the worker"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Amplifier Legal Agent Background Worker")
    parser.add_argument(
        "--add-task", "-a",
        type=str,
        help="Add a task to the queue instead of running the worker"
    )
    parser.add_argument(
        "--list", "-l",
        action="store_true",
        help="List all tasks in the queue"
    )
    parser.add_argument(
        "--run-once", "-1",
        action="store_true",
        help="Process one task and exit"
    )
    parser.add_argument(
        "--queue-file", "-q",
        type=str,
        default="./pending_tasks.json",
        help="Path to the task queue file"
    )
    parser.add_argument(
        "--poll-interval", "-p",
        type=int,
        default=5,
        help="Seconds between polling for tasks"
    )
    parser.add_argument(
        "--agent-type",
        type=str,
        choices=["super_lawyer", "metacognitive", "auto"],
        default="auto",
        help="Which agent to use: super_lawyer (IRAC+learning), metacognitive, or auto (best available)"
    )
    
    args = parser.parse_args()
    
    # Print agent availability info
    if SUPER_LAWYER_AVAILABLE:
        print("✓ SuperLawyerAgent available (IRAC methodology + learning)")
    else:
        print("⚠ SuperLawyerAgent not available, using MetacognitiveAgent")
    
    if args.add_task:
        add_task_to_queue(args.add_task, queue_file=args.queue_file)
        return
    
    if args.list:
        list_tasks(args.queue_file)
        return
    
    try:
        config = AgentConfig.from_environment()
    except ValueError as e:
        print(f"Configuration error: {e}")
        print("\nMake sure these environment variables are set:")
        print("  AZURE_OPENAI_ENDPOINT")
        print("  AZURE_OPENAI_API_KEY")
        print("  AZURE_OPENAI_DEPLOYMENT")
        sys.exit(1)
    
    worker = BackgroundWorker(
        config=config,
        queue_file=args.queue_file,
        poll_interval=args.poll_interval
    )
    
    if args.run_once:
        result = worker.run_once()
        if result:
            print(json.dumps(result, indent=2))
        else:
            print("No pending tasks found.")
    else:
        worker.run()


if __name__ == "__main__":
    main()
