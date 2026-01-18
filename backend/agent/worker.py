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
            "priority": self.priority
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
            priority=data.get("priority", 0)
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
    """
    
    def __init__(
        self,
        config: Optional[AgentConfig] = None,
        queue_file: str = "./pending_tasks.json",
        log_file: str = "./logs/agent_logs.txt",
        poll_interval: int = 5
    ):
        self.config = config or AgentConfig.from_environment()
        self.queue = TaskQueue(queue_file)
        self.logger = AgentLogger(log_file)
        self.poll_interval = poll_interval
        self.running = True
        self.current_task: Optional[Task] = None
        
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
    
    def _process_task(self, task: Task) -> Dict[str, Any]:
        """
        Process a single task using the MetacognitiveAgent.
        
        Args:
            task: The task to process
            
        Returns:
            Result dictionary
        """
        self.current_task = task
        
        # Update task status to running
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now().isoformat()
        self.queue.update_task(task)
        
        self.logger.log_task_start(task)
        
        try:
            # Create the agent with a logging callback
            def log_callback(message: str):
                self.logger.info(f"[Task {task.id}] {message}")
            
            agent = MetacognitiveAgent(self.config, log_callback)
            
            # Run the task
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
            else:
                task.status = TaskStatus.FAILED
                task.error = result.get("error", "Task did not complete successfully")
                task.completed_at = datetime.now().isoformat()
            
            self.queue.update_task(task)
            self.logger.log_task_complete(task, result)
            
            return result
            
        except Exception as e:
            # Log error and update task
            error_msg = f"{type(e).__name__}: {str(e)}"
            stack_trace = traceback.format_exc()
            
            self.logger.log_task_error(task, error_msg)
            self.logger.error(f"Stack trace:\n{stack_trace}")
            
            task.status = TaskStatus.FAILED
            task.error = error_msg
            task.completed_at = datetime.now().isoformat()
            self.queue.update_task(task)
            
            return {"success": False, "error": error_msg}
        
        finally:
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
    
    args = parser.parse_args()
    
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
