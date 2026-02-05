"""
Agent Streaming - Real-time Event Emission for Glass Cockpit UI

This module provides real-time streaming of agent activity to the frontend,
enabling a "Glass Cockpit" view similar to the Cursor IDE Agent pane.

Event Types:
- PLAN_UPDATE: Agent creates/updates its step plan
- THOUGHT_START/THOUGHT_END: Agent reasoning phases
- TOOL_USE: Tool execution (reading files, calling APIs)
- PROGRESS: Calculated percentage of completion
- LOG: General log messages
- ERROR: Error events
- COMPLETE: Task completion

Transport Options:
1. HTTP POST to Node.js SSE endpoint (default)
2. WebSocket connection
3. File-based for debugging
"""

import os
import json
import time
import logging
import threading
import queue
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)


class EventType(Enum):
    """Types of events the agent can emit"""
    # Planning events
    PLAN_UPDATE = "plan_update"
    PLAN_STEP_START = "plan_step_start"
    PLAN_STEP_COMPLETE = "plan_step_complete"
    
    # Thinking events
    THOUGHT_START = "thought_start"
    THOUGHT_END = "thought_end"
    THOUGHT_UPDATE = "thought_update"
    
    # Tool events
    TOOL_START = "tool_start"
    TOOL_END = "tool_end"
    TOOL_ERROR = "tool_error"
    
    # IRAC events (for legal analysis)
    IRAC_ISSUE = "irac_issue"
    IRAC_RULE = "irac_rule"
    IRAC_ANALYSIS = "irac_analysis"
    IRAC_CONCLUSION = "irac_conclusion"
    IRAC_CRITIQUE = "irac_critique"
    
    # Progress events
    PROGRESS = "progress"
    STATUS_UPDATE = "status_update"
    
    # General events
    LOG = "log"
    WARNING = "warning"
    ERROR = "error"
    
    # Lifecycle events
    TASK_START = "task_start"
    TASK_COMPLETE = "task_complete"
    TASK_FAILED = "task_failed"
    
    # Artifact events (documents being created)
    ARTIFACT_START = "artifact_start"
    ARTIFACT_UPDATE = "artifact_update"
    ARTIFACT_COMPLETE = "artifact_complete"


@dataclass
class AgentEvent:
    """A single event from the agent"""
    type: EventType
    task_id: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    data: Dict[str, Any] = field(default_factory=dict)
    
    # Display properties
    message: str = ""
    icon: str = ""  # Icon name for UI
    color: str = ""  # Color hint for UI
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "task_id": self.task_id,
            "timestamp": self.timestamp,
            "data": self.data,
            "message": self.message,
            "icon": self.icon,
            "color": self.color
        }
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict())


@dataclass
class AgentProgress:
    """Current progress state of the agent"""
    task_id: str
    status: str = "initializing"
    current_step: str = ""
    progress_percent: int = 0
    total_steps: int = 0
    completed_steps: int = 0
    current_phase: str = ""  # "planning", "executing", "critiquing", "refining"
    
    # IRAC progress (for legal tasks)
    irac_phase: str = ""  # "issue", "rule", "analysis", "conclusion", "critique"
    
    # Timing
    started_at: str = ""
    elapsed_seconds: float = 0
    
    # Current artifact being worked on
    current_artifact: str = ""
    artifact_preview: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class EventEmitter:
    """
    Emits events to the frontend via HTTP/WebSocket.
    
    This is the core component that bridges the Python agent
    to the real-time UI.
    """
    
    def __init__(
        self,
        task_id: str,
        backend_url: str = "http://localhost:3001",
        buffer_size: int = 100,
        flush_interval: float = 0.1
    ):
        self.task_id = task_id
        self.backend_url = backend_url.rstrip("/")
        self.buffer_size = buffer_size
        self.flush_interval = flush_interval
        
        # Event buffer for batching
        self._buffer: List[AgentEvent] = []
        self._buffer_lock = threading.Lock()
        
        # Progress state
        self.progress = AgentProgress(task_id=task_id)
        
        # Subscribers (local callbacks)
        self._subscribers: List[Callable[[AgentEvent], None]] = []
        
        # Background flusher thread
        self._running = False
        self._flush_thread: Optional[threading.Thread] = None
        
        # Event history for reconnection
        self._event_history: List[AgentEvent] = []
        self._max_history = 500
    
    def start(self):
        """Start the event emitter"""
        self._running = True
        self._flush_thread = threading.Thread(target=self._flush_loop, daemon=True)
        self._flush_thread.start()
        
        # Emit task start event
        self.emit(EventType.TASK_START, message="Task started", icon="rocket")
    
    def stop(self):
        """Stop the event emitter"""
        self._running = False
        self._flush_buffer()  # Flush remaining events
        if self._flush_thread:
            self._flush_thread.join(timeout=2)
    
    def subscribe(self, callback: Callable[[AgentEvent], None]):
        """Add a local subscriber for events"""
        self._subscribers.append(callback)
    
    def emit(
        self,
        event_type: EventType,
        message: str = "",
        data: Optional[Dict[str, Any]] = None,
        icon: str = "",
        color: str = ""
    ):
        """Emit an event"""
        event = AgentEvent(
            type=event_type,
            task_id=self.task_id,
            message=message,
            data=data or {},
            icon=icon or self._get_default_icon(event_type),
            color=color or self._get_default_color(event_type)
        )
        
        # Add to buffer
        with self._buffer_lock:
            self._buffer.append(event)
            
            # Also add to history
            self._event_history.append(event)
            if len(self._event_history) > self._max_history:
                self._event_history = self._event_history[-self._max_history:]
        
        # Notify local subscribers
        for subscriber in self._subscribers:
            try:
                subscriber(event)
            except Exception as e:
                logger.error(f"Subscriber error: {e}")
        
        # Immediate flush for important events
        if event_type in (EventType.TASK_COMPLETE, EventType.TASK_FAILED, 
                          EventType.ERROR, EventType.ARTIFACT_COMPLETE):
            self._flush_buffer()
    
    def _get_default_icon(self, event_type: EventType) -> str:
        """Get default icon for event type"""
        icons = {
            EventType.PLAN_UPDATE: "list",
            EventType.PLAN_STEP_START: "play",
            EventType.PLAN_STEP_COMPLETE: "check",
            EventType.THOUGHT_START: "brain",
            EventType.THOUGHT_END: "brain",
            EventType.TOOL_START: "tool",
            EventType.TOOL_END: "check-circle",
            EventType.TOOL_ERROR: "alert-triangle",
            EventType.IRAC_ISSUE: "help-circle",
            EventType.IRAC_RULE: "book",
            EventType.IRAC_ANALYSIS: "search",
            EventType.IRAC_CONCLUSION: "check-square",
            EventType.IRAC_CRITIQUE: "eye",
            EventType.PROGRESS: "activity",
            EventType.STATUS_UPDATE: "info",
            EventType.LOG: "file-text",
            EventType.WARNING: "alert-triangle",
            EventType.ERROR: "x-circle",
            EventType.TASK_START: "rocket",
            EventType.TASK_COMPLETE: "check-circle",
            EventType.TASK_FAILED: "x-circle",
            EventType.ARTIFACT_START: "file-plus",
            EventType.ARTIFACT_UPDATE: "edit",
            EventType.ARTIFACT_COMPLETE: "file-check",
        }
        return icons.get(event_type, "circle")
    
    def _get_default_color(self, event_type: EventType) -> str:
        """Get default color for event type"""
        colors = {
            EventType.THOUGHT_START: "gray",
            EventType.THOUGHT_END: "gray",
            EventType.TOOL_START: "blue",
            EventType.TOOL_END: "blue",
            EventType.TOOL_ERROR: "red",
            EventType.ERROR: "red",
            EventType.WARNING: "orange",
            EventType.TASK_COMPLETE: "green",
            EventType.TASK_FAILED: "red",
            EventType.IRAC_ISSUE: "purple",
            EventType.IRAC_RULE: "indigo",
            EventType.IRAC_ANALYSIS: "blue",
            EventType.IRAC_CONCLUSION: "green",
            EventType.IRAC_CRITIQUE: "orange",
            EventType.ARTIFACT_COMPLETE: "green",
        }
        return colors.get(event_type, "default")
    
    def _flush_loop(self):
        """Background thread to flush events periodically"""
        while self._running:
            time.sleep(self.flush_interval)
            self._flush_buffer()
    
    def _flush_buffer(self):
        """Send buffered events to the backend"""
        with self._buffer_lock:
            if not self._buffer:
                return
            
            events = self._buffer.copy()
            self._buffer.clear()
        
        try:
            self._send_events(events)
        except Exception as e:
            logger.error(f"Failed to send events: {e}")
    
    def _send_events(self, events: List[AgentEvent]):
        """Send events to the Node.js backend via HTTP POST"""
        if not events:
            return
        
        url = f"{self.backend_url}/api/v1/background-agent/stream/{self.task_id}/events"
        
        data = {
            "events": [e.to_dict() for e in events],
            "progress": self.progress.to_dict()
        }
        
        body = json.dumps(data).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                pass  # Success
        except urllib.error.HTTPError as e:
            # Log but don't raise - streaming is best-effort
            logger.debug(f"Event stream HTTP error: {e.code}")
        except Exception as e:
            logger.debug(f"Event stream error: {e}")
    
    # =========================================================================
    # Convenience methods for common events
    # =========================================================================
    
    def update_progress(
        self,
        percent: int,
        status: str = "",
        current_step: str = ""
    ):
        """Update and emit progress"""
        self.progress.progress_percent = min(100, max(0, percent))
        if status:
            self.progress.status = status
        if current_step:
            self.progress.current_step = current_step
        
        self.emit(
            EventType.PROGRESS,
            message=f"{percent}% - {current_step or status}",
            data=self.progress.to_dict()
        )
    
    def thinking(self, thought: str = ""):
        """Emit a thinking event"""
        self.emit(
            EventType.THOUGHT_START,
            message=thought or "Thinking...",
            icon="brain",
            color="gray"
        )
    
    def thinking_complete(self, result: str = ""):
        """Emit thinking complete event"""
        self.emit(
            EventType.THOUGHT_END,
            message=result or "Done thinking",
            icon="brain",
            color="gray"
        )
    
    def tool_start(self, tool_name: str, description: str = ""):
        """Emit tool start event"""
        tool_messages = {
            "read_file": f"Reading {description}...",
            "write_file": f"Writing {description}...",
            "list_directory": f"Listing {description or 'directory'}...",
            "search_matters": "Searching matters...",
            "get_matter": f"Getting matter {description}...",
            "create_document": f"Creating {description}...",
            "search_case_law": "Researching case law...",
        }
        
        message = tool_messages.get(tool_name, f"Executing {tool_name}...")
        
        self.emit(
            EventType.TOOL_START,
            message=message,
            data={"tool": tool_name, "args": description},
            icon="tool",
            color="blue"
        )
    
    def tool_complete(self, tool_name: str, success: bool = True, result: str = ""):
        """Emit tool complete event"""
        self.emit(
            EventType.TOOL_END if success else EventType.TOOL_ERROR,
            message=result or f"{tool_name} complete",
            data={"tool": tool_name, "success": success},
            icon="check-circle" if success else "x-circle",
            color="blue" if success else "red"
        )
    
    def plan_update(self, steps: List[str], current_step: int = 0):
        """Emit plan update event"""
        self.progress.total_steps = len(steps)
        self.progress.completed_steps = current_step
        
        self.emit(
            EventType.PLAN_UPDATE,
            message=f"Plan: {len(steps)} steps",
            data={"steps": steps, "current": current_step}
        )
    
    def step_start(self, step_num: int, description: str):
        """Emit step start event"""
        self.progress.current_step = description
        
        self.emit(
            EventType.PLAN_STEP_START,
            message=f"Step {step_num}: {description}",
            data={"step": step_num, "description": description}
        )
    
    def step_complete(self, step_num: int, result: str = ""):
        """Emit step complete event"""
        self.progress.completed_steps = step_num
        
        # Update progress percentage
        if self.progress.total_steps > 0:
            self.progress.progress_percent = int(
                (step_num / self.progress.total_steps) * 100
            )
        
        self.emit(
            EventType.PLAN_STEP_COMPLETE,
            message=f"Step {step_num} complete: {result}",
            data={"step": step_num, "result": result}
        )
    
    def irac_phase(self, phase: str, content: str = ""):
        """Emit IRAC phase event"""
        self.progress.irac_phase = phase
        
        phase_events = {
            "issue": EventType.IRAC_ISSUE,
            "rule": EventType.IRAC_RULE,
            "analysis": EventType.IRAC_ANALYSIS,
            "conclusion": EventType.IRAC_CONCLUSION,
            "critique": EventType.IRAC_CRITIQUE,
        }
        
        event_type = phase_events.get(phase, EventType.STATUS_UPDATE)
        
        self.emit(
            event_type,
            message=f"IRAC {phase.upper()}: {content[:100]}..." if content else f"IRAC {phase.upper()}",
            data={"phase": phase, "content": content}
        )
    
    def artifact_start(self, name: str, artifact_type: str = "document"):
        """Emit artifact creation start"""
        self.progress.current_artifact = name
        
        self.emit(
            EventType.ARTIFACT_START,
            message=f"Creating {artifact_type}: {name}",
            data={"name": name, "type": artifact_type}
        )
    
    def artifact_update(self, name: str, preview: str = ""):
        """Emit artifact update with preview"""
        self.progress.artifact_preview = preview[:500] if preview else ""
        
        self.emit(
            EventType.ARTIFACT_UPDATE,
            message=f"Updating {name}...",
            data={"name": name, "preview": preview[:500]}
        )
    
    def artifact_complete(self, name: str, path: str = ""):
        """Emit artifact complete"""
        self.emit(
            EventType.ARTIFACT_COMPLETE,
            message=f"Completed: {name}",
            data={"name": name, "path": path},
            color="green"
        )
    
    def log(self, message: str, level: str = "info"):
        """Emit a log message"""
        event_type = {
            "info": EventType.LOG,
            "warning": EventType.WARNING,
            "error": EventType.ERROR
        }.get(level, EventType.LOG)
        
        self.emit(event_type, message=message)
    
    def error(self, message: str, details: str = ""):
        """Emit an error event"""
        self.emit(
            EventType.ERROR,
            message=message,
            data={"details": details},
            color="red"
        )
    
    def task_complete(self, summary: str, output_files: List[str] = None):
        """Emit task complete event"""
        self.progress.status = "completed"
        self.progress.progress_percent = 100
        
        self.emit(
            EventType.TASK_COMPLETE,
            message=summary,
            data={"output_files": output_files or []},
            color="green"
        )
    
    def task_failed(self, error: str):
        """Emit task failed event"""
        self.progress.status = "failed"
        
        self.emit(
            EventType.TASK_FAILED,
            message=error,
            color="red"
        )
    
    def get_history(self) -> List[Dict[str, Any]]:
        """Get event history for reconnection"""
        return [e.to_dict() for e in self._event_history]


class StreamingCallbackHandler:
    """
    Callback handler that wraps the agent and emits events.
    
    Use this to wrap tool calls and agent iterations to
    automatically emit streaming events.
    """
    
    def __init__(self, emitter: EventEmitter):
        self.emitter = emitter
        self._tool_start_times: Dict[str, float] = {}
    
    def on_agent_start(self, goal: str):
        """Called when agent starts a task"""
        self.emitter.emit(
            EventType.TASK_START,
            message=f"Starting: {goal[:100]}...",
            data={"goal": goal}
        )
    
    def on_plan_created(self, steps: List[str]):
        """Called when agent creates a plan"""
        self.emitter.plan_update(steps, 0)
    
    def on_step_start(self, step_num: int, description: str):
        """Called when agent starts a step"""
        self.emitter.step_start(step_num, description)
    
    def on_step_complete(self, step_num: int, result: str):
        """Called when agent completes a step"""
        self.emitter.step_complete(step_num, result)
    
    def on_thinking_start(self, thought: str = ""):
        """Called when agent starts thinking"""
        self.emitter.thinking(thought)
    
    def on_thinking_end(self, result: str = ""):
        """Called when agent finishes thinking"""
        self.emitter.thinking_complete(result)
    
    def on_tool_start(self, tool_name: str, args: Dict[str, Any]):
        """Called when a tool starts executing"""
        self._tool_start_times[tool_name] = time.time()
        
        # Create a description from args
        description = ""
        if "path" in args:
            description = args["path"]
        elif "matter_id" in args:
            description = args["matter_id"]
        elif "name" in args:
            description = args["name"]
        elif "query" in args:
            description = args["query"]
        
        self.emitter.tool_start(tool_name, description)
    
    def on_tool_end(self, tool_name: str, result: Dict[str, Any]):
        """Called when a tool finishes executing"""
        duration = time.time() - self._tool_start_times.pop(tool_name, time.time())
        success = result.get("success", True) if isinstance(result, dict) else True
        
        self.emitter.tool_complete(
            tool_name,
            success=success,
            result=f"Completed in {duration:.1f}s"
        )
    
    def on_irac_phase(self, phase: str, content: str):
        """Called when IRAC phase is reached"""
        self.emitter.irac_phase(phase, content)
    
    def on_critique(self, grade: str, needs_refinement: bool):
        """Called when self-critique is performed"""
        self.emitter.emit(
            EventType.IRAC_CRITIQUE,
            message=f"Self-Critique: Grade {grade}" + (" - Refining..." if needs_refinement else " - Approved"),
            data={"grade": grade, "needs_refinement": needs_refinement},
            color="orange" if needs_refinement else "green"
        )
    
    def on_artifact_created(self, name: str, path: str):
        """Called when an artifact is created"""
        self.emitter.artifact_complete(name, path)
    
    def on_agent_complete(self, summary: str, output_files: List[str]):
        """Called when agent completes the task"""
        self.emitter.task_complete(summary, output_files)
    
    def on_agent_error(self, error: str):
        """Called when agent encounters an error"""
        self.emitter.task_failed(error)


def create_streaming_emitter(task_id: str, backend_url: str = None) -> EventEmitter:
    """Factory function to create a configured emitter"""
    return EventEmitter(
        task_id=task_id,
        backend_url=backend_url or os.environ.get("BACKEND_URL", "http://localhost:3001")
    )
