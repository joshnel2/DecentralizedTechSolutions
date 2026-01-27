"""
Learning Module - Persistent Style and Preference Learning

This module enables the agent to learn from user feedback and corrections,
maintaining a persistent style guide that improves over time.

Features:
- Reads/writes style_guide.md for persistent preferences
- Detects and records user corrections via diff analysis
- Provides tools for the agent to update its own preferences
- Tracks patterns in user edits to improve future output
- OBSERVATION LEARNING: Learns from successful outcomes
- WORKFLOW LEARNING: Learns sequences of actions that work well
- USER EMULATION: Tracks what the user typically does on similar matters
"""

import os
import json
import re
import difflib
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class StylePreference:
    """A single style preference learned from user feedback"""
    topic: str
    instruction: str
    examples: List[str] = field(default_factory=list)
    source: str = "agent_learned"  # "user_edit", "explicit_feedback", "agent_learned"
    confidence: float = 0.5  # 0.0 to 1.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_used: Optional[str] = None
    use_count: int = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StylePreference":
        return cls(**data)


@dataclass
class EditPattern:
    """A pattern detected in user edits"""
    original_pattern: str
    corrected_pattern: str
    context: str  # What type of document/section
    occurrences: int = 1
    first_seen: str = field(default_factory=lambda: datetime.now().isoformat())
    last_seen: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WorkflowPattern:
    """A sequence of actions that worked well for a type of task"""
    task_type: str  # e.g., "new_matter_intake", "motion_drafting", "discovery_response"
    action_sequence: List[str]  # Ordered list of tool calls / actions
    matter_type: Optional[str] = None  # e.g., "litigation", "contract", "bankruptcy"
    success_count: int = 1
    failure_count: int = 0
    avg_time_seconds: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_used: str = field(default_factory=lambda: datetime.now().isoformat())
    notes: str = ""
    
    @property
    def success_rate(self) -> float:
        total = self.success_count + self.failure_count
        return self.success_count / total if total > 0 else 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['success_rate'] = self.success_rate
        return d


@dataclass
class UserBehaviorPattern:
    """
    Tracks what the user typically does in certain situations.
    This helps the agent emulate the user's decision-making.
    """
    trigger_context: str  # What situation triggers this behavior
    typical_action: str  # What the user typically does
    matter_types: List[str] = field(default_factory=list)
    frequency: int = 1
    priority_level: str = "medium"  # How important this seems to the user
    time_sensitivity: Optional[str] = None  # "immediate", "same_day", "week", "flexible"
    notes: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_seen: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ObservationRecord:
    """
    Records an observation of a successful or unsuccessful outcome.
    Used for learning what works and what doesn't.
    """
    task_description: str
    actions_taken: List[str]
    outcome: str  # "success", "partial", "failure"
    matter_id: Optional[str] = None
    matter_type: Optional[str] = None
    client_feedback: Optional[str] = None  # If user provided feedback
    time_taken_seconds: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    lessons_learned: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class LearningManager:
    """
    Manages persistent learning from user interactions.
    
    Maintains a style_guide.md that the agent reads before every task,
    and updates based on detected patterns in user corrections.
    
    ENHANCED CAPABILITIES:
    - Workflow pattern learning: Learn sequences of actions that work
    - User behavior emulation: Track and emulate user decision patterns
    - Observation learning: Learn from successful/unsuccessful outcomes
    """
    
    def __init__(self, preferences_dir: str = "./case_data/preferences"):
        self.preferences_dir = Path(preferences_dir)
        self.preferences_dir.mkdir(parents=True, exist_ok=True)
        
        # File paths
        self.style_guide_path = self.preferences_dir / "style_guide.md"
        self.preferences_json_path = self.preferences_dir / "preferences.json"
        self.edit_patterns_path = self.preferences_dir / "edit_patterns.json"
        self.workflow_patterns_path = self.preferences_dir / "workflow_patterns.json"
        self.user_behaviors_path = self.preferences_dir / "user_behaviors.json"
        self.observations_path = self.preferences_dir / "observations.json"
        
        # In-memory caches
        self._preferences: Dict[str, StylePreference] = {}
        self._edit_patterns: List[EditPattern] = []
        self._workflow_patterns: Dict[str, WorkflowPattern] = {}
        self._user_behaviors: List[UserBehaviorPattern] = []
        self._observations: List[ObservationRecord] = []
        
        # Load existing data
        self._load_preferences()
        self._load_edit_patterns()
        self._load_workflow_patterns()
        self._load_user_behaviors()
        self._load_observations()
    
    def _load_preferences(self):
        """Load preferences from JSON file"""
        if self.preferences_json_path.exists():
            try:
                with open(self.preferences_json_path, "r") as f:
                    data = json.load(f)
                    for topic, pref_data in data.get("preferences", {}).items():
                        self._preferences[topic] = StylePreference.from_dict(pref_data)
                logger.info(f"Loaded {len(self._preferences)} preferences")
            except Exception as e:
                logger.error(f"Failed to load preferences: {e}")
    
    def _save_preferences(self):
        """Save preferences to JSON file"""
        try:
            data = {
                "preferences": {
                    topic: pref.to_dict() 
                    for topic, pref in self._preferences.items()
                },
                "last_updated": datetime.now().isoformat()
            }
            with open(self.preferences_json_path, "w") as f:
                json.dump(data, f, indent=2)
            
            # Also update the markdown style guide
            self._update_style_guide_md()
        except Exception as e:
            logger.error(f"Failed to save preferences: {e}")
    
    def _load_edit_patterns(self):
        """Load edit patterns from JSON file"""
        if self.edit_patterns_path.exists():
            try:
                with open(self.edit_patterns_path, "r") as f:
                    data = json.load(f)
                    self._edit_patterns = [
                        EditPattern(**p) for p in data.get("patterns", [])
                    ]
                logger.info(f"Loaded {len(self._edit_patterns)} edit patterns")
            except Exception as e:
                logger.error(f"Failed to load edit patterns: {e}")
    
    def _save_edit_patterns(self):
        """Save edit patterns to JSON file"""
        try:
            data = {
                "patterns": [p.to_dict() for p in self._edit_patterns],
                "last_updated": datetime.now().isoformat()
            }
            with open(self.edit_patterns_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save edit patterns: {e}")
    
    def _load_workflow_patterns(self):
        """Load workflow patterns from JSON file"""
        if self.workflow_patterns_path.exists():
            try:
                with open(self.workflow_patterns_path, "r") as f:
                    data = json.load(f)
                    for key, pattern_data in data.get("patterns", {}).items():
                        self._workflow_patterns[key] = WorkflowPattern(**pattern_data)
                logger.info(f"Loaded {len(self._workflow_patterns)} workflow patterns")
            except Exception as e:
                logger.error(f"Failed to load workflow patterns: {e}")
    
    def _save_workflow_patterns(self):
        """Save workflow patterns to JSON file"""
        try:
            data = {
                "patterns": {k: v.to_dict() for k, v in self._workflow_patterns.items()},
                "last_updated": datetime.now().isoformat()
            }
            with open(self.workflow_patterns_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save workflow patterns: {e}")
    
    def _load_user_behaviors(self):
        """Load user behavior patterns from JSON file"""
        if self.user_behaviors_path.exists():
            try:
                with open(self.user_behaviors_path, "r") as f:
                    data = json.load(f)
                    self._user_behaviors = [
                        UserBehaviorPattern(**b) for b in data.get("behaviors", [])
                    ]
                logger.info(f"Loaded {len(self._user_behaviors)} user behavior patterns")
            except Exception as e:
                logger.error(f"Failed to load user behaviors: {e}")
    
    def _save_user_behaviors(self):
        """Save user behavior patterns to JSON file"""
        try:
            data = {
                "behaviors": [b.to_dict() for b in self._user_behaviors],
                "last_updated": datetime.now().isoformat()
            }
            with open(self.user_behaviors_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save user behaviors: {e}")
    
    def _load_observations(self):
        """Load observation records from JSON file"""
        if self.observations_path.exists():
            try:
                with open(self.observations_path, "r") as f:
                    data = json.load(f)
                    self._observations = [
                        ObservationRecord(**o) for o in data.get("observations", [])
                    ]
                logger.info(f"Loaded {len(self._observations)} observations")
            except Exception as e:
                logger.error(f"Failed to load observations: {e}")
    
    def _save_observations(self):
        """Save observation records to JSON file"""
        try:
            # Keep only last 500 observations to prevent unbounded growth
            recent_observations = self._observations[-500:]
            data = {
                "observations": [o.to_dict() for o in recent_observations],
                "last_updated": datetime.now().isoformat()
            }
            with open(self.observations_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save observations: {e}")
    
    def _update_style_guide_md(self):
        """Update the human-readable style guide markdown file"""
        lines = [
            "# Legal Writing Style Guide",
            "",
            "This guide is automatically maintained based on your feedback and edits.",
            "The AI agent reads this before every task to match your preferences.",
            "",
            f"*Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
            "",
            "---",
            ""
        ]
        
        # Group preferences by category
        categories: Dict[str, List[StylePreference]] = {}
        for topic, pref in self._preferences.items():
            category = topic.split(":")[0] if ":" in topic else "General"
            if category not in categories:
                categories[category] = []
            categories[category].append(pref)
        
        # Write each category
        for category, prefs in sorted(categories.items()):
            lines.append(f"## {category}")
            lines.append("")
            
            for pref in sorted(prefs, key=lambda p: -p.confidence):
                lines.append(f"### {pref.topic}")
                lines.append("")
                lines.append(f"**Instruction:** {pref.instruction}")
                lines.append("")
                
                if pref.examples:
                    lines.append("**Examples:**")
                    for example in pref.examples[:3]:  # Limit to 3 examples
                        lines.append(f"- {example}")
                    lines.append("")
                
                confidence_stars = "★" * int(pref.confidence * 5) + "☆" * (5 - int(pref.confidence * 5))
                lines.append(f"*Confidence: {confidence_stars} ({pref.confidence:.0%})*")
                lines.append("")
        
        # Add learned patterns section
        if self._edit_patterns:
            lines.append("---")
            lines.append("")
            lines.append("## Learned Patterns from Your Edits")
            lines.append("")
            
            # Show top patterns by occurrence
            top_patterns = sorted(self._edit_patterns, key=lambda p: -p.occurrences)[:10]
            for pattern in top_patterns:
                lines.append(f"- **Change:** \"{pattern.original_pattern}\" → \"{pattern.corrected_pattern}\"")
                lines.append(f"  - Context: {pattern.context}")
                lines.append(f"  - Seen {pattern.occurrences} time(s)")
                lines.append("")
        
        # Write the file
        with open(self.style_guide_path, "w") as f:
            f.write("\n".join(lines))
        
        logger.info(f"Updated style guide at {self.style_guide_path}")
    
    def get_style_guide_content(self) -> str:
        """Get the full content of the style guide for the system prompt"""
        if self.style_guide_path.exists():
            return self.style_guide_path.read_text()
        else:
            # Create initial style guide
            self._update_style_guide_md()
            return self.style_guide_path.read_text()
    
    def get_preference(self, topic: str) -> Optional[StylePreference]:
        """Get a specific preference by topic"""
        return self._preferences.get(topic)
    
    def update_preference(
        self,
        topic: str,
        instruction: str,
        examples: Optional[List[str]] = None,
        source: str = "agent_learned"
    ) -> Dict[str, Any]:
        """
        Update or create a preference.
        
        This is a TOOL that the agent can call to record preferences
        it discovers during task execution.
        
        Args:
            topic: The topic/category of the preference
            instruction: The instruction to follow
            examples: Optional examples
            source: Where this preference came from
            
        Returns:
            Result dictionary
        """
        existing = self._preferences.get(topic)
        
        if existing:
            # Update existing preference
            existing.instruction = instruction
            if examples:
                existing.examples.extend(examples)
                existing.examples = list(set(existing.examples))[:10]  # Dedupe, limit to 10
            existing.confidence = min(1.0, existing.confidence + 0.1)  # Increase confidence
            existing.use_count += 1
            existing.last_used = datetime.now().isoformat()
        else:
            # Create new preference
            self._preferences[topic] = StylePreference(
                topic=topic,
                instruction=instruction,
                examples=examples or [],
                source=source,
                confidence=0.5
            )
        
        self._save_preferences()
        
        logger.info(f"Updated preference: {topic}")
        
        return {
            "success": True,
            "topic": topic,
            "instruction": instruction,
            "action": "updated" if existing else "created"
        }
    
    def get_all_preferences(self) -> List[StylePreference]:
        """Get all preferences, sorted by confidence"""
        return sorted(
            self._preferences.values(),
            key=lambda p: -p.confidence
        )
    
    def review_user_edits(
        self,
        original_content: str,
        final_content: str,
        document_type: str = "general"
    ) -> Dict[str, Any]:
        """
        Review the difference between agent output and user's final version.
        
        This is the KEY LEARNING FUNCTION. It:
        1. Calculates the diff between original and final
        2. Identifies patterns in the changes
        3. Records these patterns for future reference
        4. Updates preferences based on repeated patterns
        
        Args:
            original_content: What the agent wrote
            final_content: What the user accepted/edited
            document_type: Type of document (motion, memo, etc.)
            
        Returns:
            Analysis of the edits with learned patterns
        """
        if original_content == final_content:
            return {
                "success": True,
                "changes_detected": False,
                "message": "No changes made by user - output was accepted as-is"
            }
        
        # Calculate diff
        original_lines = original_content.splitlines(keepends=True)
        final_lines = final_content.splitlines(keepends=True)
        
        diff = list(difflib.unified_diff(
            original_lines,
            final_lines,
            fromfile="original",
            tofile="final",
            lineterm=""
        ))
        
        # Analyze changes
        additions = []
        deletions = []
        replacements = []
        
        i = 0
        while i < len(diff):
            line = diff[i]
            
            if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
                i += 1
                continue
            
            if line.startswith("-") and not line.startswith("---"):
                deleted = line[1:].strip()
                # Check if next line is an addition (replacement)
                if i + 1 < len(diff) and diff[i + 1].startswith("+"):
                    added = diff[i + 1][1:].strip()
                    if deleted and added:
                        replacements.append((deleted, added))
                    i += 2
                    continue
                elif deleted:
                    deletions.append(deleted)
            elif line.startswith("+") and not line.startswith("+++"):
                added = line[1:].strip()
                if added:
                    additions.append(added)
            
            i += 1
        
        # Record patterns from replacements
        new_patterns = []
        for original, corrected in replacements:
            # Skip very short or very long replacements
            if len(original) < 3 or len(corrected) < 3:
                continue
            if len(original) > 200 or len(corrected) > 200:
                continue
            
            # Check if this pattern already exists
            existing = next(
                (p for p in self._edit_patterns 
                 if p.original_pattern == original and p.corrected_pattern == corrected),
                None
            )
            
            if existing:
                existing.occurrences += 1
                existing.last_seen = datetime.now().isoformat()
            else:
                pattern = EditPattern(
                    original_pattern=original,
                    corrected_pattern=corrected,
                    context=document_type
                )
                self._edit_patterns.append(pattern)
                new_patterns.append(pattern)
        
        # Auto-learn from repeated patterns
        learned_preferences = []
        for pattern in self._edit_patterns:
            if pattern.occurrences >= 3:  # Pattern seen 3+ times
                # Create a preference from this pattern
                topic = f"Terminology:{pattern.context}"
                instruction = f"Use '{pattern.corrected_pattern}' instead of '{pattern.original_pattern}'"
                
                if topic not in self._preferences:
                    self.update_preference(
                        topic=topic,
                        instruction=instruction,
                        examples=[f"'{pattern.original_pattern}' → '{pattern.corrected_pattern}'"],
                        source="user_edit"
                    )
                    learned_preferences.append({
                        "topic": topic,
                        "instruction": instruction
                    })
        
        # Save patterns
        self._save_edit_patterns()
        
        return {
            "success": True,
            "changes_detected": True,
            "statistics": {
                "additions": len(additions),
                "deletions": len(deletions),
                "replacements": len(replacements)
            },
            "replacements": replacements[:10],  # Top 10
            "new_patterns_learned": len(new_patterns),
            "preferences_created": len(learned_preferences),
            "learned_preferences": learned_preferences,
            "message": f"Analyzed {len(replacements)} replacements, learned {len(new_patterns)} new patterns"
        }
    
    def get_relevant_preferences(self, task_description: str) -> List[StylePreference]:
        """
        Get preferences relevant to a specific task.
        
        Uses keyword matching to find applicable preferences.
        """
        task_lower = task_description.lower()
        relevant = []
        
        keywords = {
            "motion": ["motion", "court", "filing", "pleading"],
            "memo": ["memo", "memorandum", "analysis", "research"],
            "letter": ["letter", "correspondence", "client"],
            "brief": ["brief", "argument", "appellate"],
            "contract": ["contract", "agreement", "terms"],
            "discovery": ["discovery", "interrogator", "deposition", "request"],
        }
        
        for pref in self._preferences.values():
            topic_lower = pref.topic.lower()
            instruction_lower = pref.instruction.lower()
            
            # Check if preference matches task
            for category, kws in keywords.items():
                if any(kw in task_lower for kw in kws):
                    if category in topic_lower or any(kw in instruction_lower for kw in kws):
                        relevant.append(pref)
                        break
            
            # Also include high-confidence general preferences
            if pref.confidence >= 0.8 and "general" in topic_lower.lower():
                relevant.append(pref)
        
        # Deduplicate and sort by confidence
        seen = set()
        unique = []
        for pref in relevant:
            if pref.topic not in seen:
                seen.add(pref.topic)
                unique.append(pref)
        
        return sorted(unique, key=lambda p: -p.confidence)
    
    def format_preferences_for_prompt(self, task_description: str) -> str:
        """
        Format relevant preferences as text to include in the system prompt.
        """
        relevant = self.get_relevant_preferences(task_description)
        
        if not relevant:
            return ""
        
        lines = [
            "## YOUR LEARNED PREFERENCES",
            "",
            "Based on past feedback, follow these specific instructions:",
            ""
        ]
        
        for pref in relevant[:10]:  # Limit to top 10
            lines.append(f"- **{pref.topic}**: {pref.instruction}")
        
        lines.append("")
        
        return "\n".join(lines)
    
    # =========================================================================
    # WORKFLOW PATTERN LEARNING
    # =========================================================================
    
    def record_workflow(
        self,
        task_type: str,
        action_sequence: List[str],
        success: bool,
        matter_type: Optional[str] = None,
        time_taken: float = 0.0,
        notes: str = ""
    ) -> Dict[str, Any]:
        """
        Record a workflow pattern from a completed task.
        
        This allows the agent to learn effective sequences of actions
        for different types of legal tasks.
        
        Args:
            task_type: Type of task (e.g., "matter_intake", "motion_drafting")
            action_sequence: List of actions/tools used in order
            success: Whether the workflow was successful
            matter_type: Optional matter type for context-specific learning
            time_taken: How long the workflow took
            notes: Any notes about the workflow
        """
        key = f"{task_type}:{matter_type or 'general'}"
        
        if key in self._workflow_patterns:
            pattern = self._workflow_patterns[key]
            if success:
                pattern.success_count += 1
                # Update average time
                total_time = pattern.avg_time_seconds * (pattern.success_count - 1) + time_taken
                pattern.avg_time_seconds = total_time / pattern.success_count
                # Merge action sequences if different
                if action_sequence != pattern.action_sequence:
                    # Keep the more successful sequence
                    if pattern.success_rate > 0.8:
                        pass  # Keep existing
                    else:
                        pattern.action_sequence = action_sequence
            else:
                pattern.failure_count += 1
            pattern.last_used = datetime.now().isoformat()
            if notes:
                pattern.notes = notes
        else:
            self._workflow_patterns[key] = WorkflowPattern(
                task_type=task_type,
                action_sequence=action_sequence,
                matter_type=matter_type,
                success_count=1 if success else 0,
                failure_count=0 if success else 1,
                avg_time_seconds=time_taken,
                notes=notes
            )
        
        self._save_workflow_patterns()
        
        return {
            "success": True,
            "pattern_key": key,
            "success_rate": self._workflow_patterns[key].success_rate,
            "message": f"Recorded workflow for {task_type}"
        }
    
    def get_recommended_workflow(
        self,
        task_type: str,
        matter_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get the recommended workflow for a task type.
        
        Returns the most successful workflow pattern for the given task type.
        """
        # Try specific matter type first
        key = f"{task_type}:{matter_type}" if matter_type else None
        if key and key in self._workflow_patterns:
            pattern = self._workflow_patterns[key]
            if pattern.success_rate >= 0.5:  # At least 50% success rate
                return {
                    "action_sequence": pattern.action_sequence,
                    "success_rate": pattern.success_rate,
                    "avg_time_seconds": pattern.avg_time_seconds,
                    "notes": pattern.notes,
                    "source": "matter_specific"
                }
        
        # Try general pattern
        general_key = f"{task_type}:general"
        if general_key in self._workflow_patterns:
            pattern = self._workflow_patterns[general_key]
            if pattern.success_rate >= 0.5:
                return {
                    "action_sequence": pattern.action_sequence,
                    "success_rate": pattern.success_rate,
                    "avg_time_seconds": pattern.avg_time_seconds,
                    "notes": pattern.notes,
                    "source": "general"
                }
        
        return None
    
    # =========================================================================
    # USER BEHAVIOR EMULATION
    # =========================================================================
    
    def record_user_behavior(
        self,
        trigger_context: str,
        action_taken: str,
        matter_type: Optional[str] = None,
        priority: str = "medium",
        time_sensitivity: Optional[str] = None,
        notes: str = ""
    ) -> Dict[str, Any]:
        """
        Record a user behavior pattern for emulation.
        
        Tracks what the user typically does in certain situations so the
        agent can emulate their decision-making.
        
        Args:
            trigger_context: What situation triggered this (e.g., "new_document_received")
            action_taken: What the user did (e.g., "review_and_add_to_matter")
            matter_type: Optional matter type for context
            priority: How important this seems ("low", "medium", "high", "urgent")
            time_sensitivity: How time-sensitive ("immediate", "same_day", "week", "flexible")
            notes: Any notes
        """
        # Check if similar behavior exists
        existing = next(
            (b for b in self._user_behaviors 
             if b.trigger_context == trigger_context and b.typical_action == action_taken),
            None
        )
        
        if existing:
            existing.frequency += 1
            existing.last_seen = datetime.now().isoformat()
            if matter_type and matter_type not in existing.matter_types:
                existing.matter_types.append(matter_type)
            existing.priority_level = priority
            existing.time_sensitivity = time_sensitivity
        else:
            self._user_behaviors.append(UserBehaviorPattern(
                trigger_context=trigger_context,
                typical_action=action_taken,
                matter_types=[matter_type] if matter_type else [],
                frequency=1,
                priority_level=priority,
                time_sensitivity=time_sensitivity,
                notes=notes
            ))
        
        self._save_user_behaviors()
        
        return {
            "success": True,
            "trigger": trigger_context,
            "action": action_taken,
            "message": "Recorded user behavior pattern"
        }
    
    def get_user_typical_action(
        self,
        context: str,
        matter_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get what the user typically does in a given context.
        
        Returns the most frequent user action for the given context.
        """
        # Find matching behaviors
        matches = []
        for behavior in self._user_behaviors:
            if context.lower() in behavior.trigger_context.lower():
                # Boost score if matter type matches
                score = behavior.frequency
                if matter_type and matter_type in behavior.matter_types:
                    score *= 1.5
                matches.append((behavior, score))
        
        if not matches:
            return None
        
        # Sort by score and return best match
        matches.sort(key=lambda x: -x[1])
        best = matches[0][0]
        
        return {
            "typical_action": best.typical_action,
            "priority": best.priority_level,
            "time_sensitivity": best.time_sensitivity,
            "frequency": best.frequency,
            "notes": best.notes
        }
    
    def get_user_priorities(self, matter_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get the user's typical priorities sorted by importance.
        
        Returns behaviors sorted by how the user prioritizes them.
        """
        priority_order = {"urgent": 4, "high": 3, "medium": 2, "low": 1}
        
        behaviors = self._user_behaviors
        if matter_type:
            behaviors = [b for b in behaviors if matter_type in b.matter_types or not b.matter_types]
        
        sorted_behaviors = sorted(
            behaviors,
            key=lambda b: (priority_order.get(b.priority_level, 0), b.frequency),
            reverse=True
        )
        
        return [
            {
                "context": b.trigger_context,
                "action": b.typical_action,
                "priority": b.priority_level,
                "frequency": b.frequency
            }
            for b in sorted_behaviors[:10]  # Top 10
        ]
    
    # =========================================================================
    # OBSERVATION LEARNING
    # =========================================================================
    
    def record_observation(
        self,
        task_description: str,
        actions_taken: List[str],
        outcome: str,
        matter_id: Optional[str] = None,
        matter_type: Optional[str] = None,
        time_taken: float = 0.0,
        lessons: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Record an observation for learning.
        
        This allows the agent to learn from both successes and failures.
        
        Args:
            task_description: What was the task
            actions_taken: What actions were performed
            outcome: "success", "partial", "failure"
            matter_id: Optional matter ID
            matter_type: Optional matter type
            time_taken: How long it took
            lessons: What was learned from this
        """
        observation = ObservationRecord(
            task_description=task_description,
            actions_taken=actions_taken,
            outcome=outcome,
            matter_id=matter_id,
            matter_type=matter_type,
            time_taken_seconds=time_taken,
            lessons_learned=lessons or []
        )
        
        self._observations.append(observation)
        self._save_observations()
        
        # If successful, also record as a workflow pattern
        if outcome == "success" and actions_taken:
            # Infer task type from description
            task_type = self._infer_task_type(task_description)
            if task_type:
                self.record_workflow(
                    task_type=task_type,
                    action_sequence=actions_taken,
                    success=True,
                    matter_type=matter_type,
                    time_taken=time_taken
                )
        
        return {
            "success": True,
            "outcome": outcome,
            "lessons_count": len(lessons or []),
            "total_observations": len(self._observations)
        }
    
    def _infer_task_type(self, description: str) -> Optional[str]:
        """Infer task type from description"""
        desc_lower = description.lower()
        
        task_type_keywords = {
            "matter_intake": ["intake", "new matter", "open matter", "onboard"],
            "motion_drafting": ["motion", "draft motion", "file motion"],
            "discovery": ["discovery", "interrogator", "request for production", "deposition"],
            "document_review": ["review document", "analyze document", "summarize document"],
            "client_communication": ["email client", "call client", "client update"],
            "research": ["research", "case law", "statute", "precedent"],
            "deadline_management": ["deadline", "calendar", "due date", "filing date"],
            "billing": ["time entry", "invoice", "billing", "hours"],
            "conflict_check": ["conflict", "conflict check", "adverse party"],
        }
        
        for task_type, keywords in task_type_keywords.items():
            if any(kw in desc_lower for kw in keywords):
                return task_type
        
        return None
    
    def get_lessons_for_task(self, task_description: str) -> List[str]:
        """
        Get relevant lessons learned from past observations.
        
        Returns lessons from similar past tasks.
        """
        task_type = self._infer_task_type(task_description)
        if not task_type:
            return []
        
        lessons = []
        for obs in self._observations[-100:]:  # Check last 100 observations
            obs_task_type = self._infer_task_type(obs.task_description)
            if obs_task_type == task_type and obs.lessons_learned:
                lessons.extend(obs.lessons_learned)
        
        # Deduplicate and return
        return list(set(lessons))[:10]
    
    def get_success_patterns_for_task(self, task_description: str) -> List[Dict[str, Any]]:
        """
        Get successful patterns from past observations for similar tasks.
        """
        task_type = self._infer_task_type(task_description)
        if not task_type:
            return []
        
        patterns = []
        for obs in self._observations[-100:]:
            if obs.outcome == "success":
                obs_task_type = self._infer_task_type(obs.task_description)
                if obs_task_type == task_type:
                    patterns.append({
                        "task": obs.task_description,
                        "actions": obs.actions_taken,
                        "time_taken": obs.time_taken_seconds
                    })
        
        return patterns[:5]  # Return top 5 patterns
    
    # =========================================================================
    # COMBINED CONTEXT FOR AGENT
    # =========================================================================
    
    def get_full_learning_context(self, task_description: str, matter_type: Optional[str] = None) -> str:
        """
        Get the complete learning context for the agent.
        
        Combines preferences, workflow recommendations, user behavior patterns,
        and lessons learned into a single context string for the system prompt.
        """
        lines = []
        
        # Style preferences
        prefs_text = self.format_preferences_for_prompt(task_description)
        if prefs_text:
            lines.append(prefs_text)
        
        # Recommended workflow
        task_type = self._infer_task_type(task_description)
        if task_type:
            workflow = self.get_recommended_workflow(task_type, matter_type)
            if workflow:
                lines.append("## RECOMMENDED WORKFLOW")
                lines.append("")
                lines.append(f"Based on past success ({workflow['success_rate']:.0%} success rate), follow these steps:")
                for i, action in enumerate(workflow['action_sequence'][:10], 1):
                    lines.append(f"{i}. {action}")
                if workflow.get('notes'):
                    lines.append(f"\nNote: {workflow['notes']}")
                lines.append("")
        
        # User behavior guidance
        user_action = self.get_user_typical_action(task_description, matter_type)
        if user_action:
            lines.append("## USER TYPICALLY DOES")
            lines.append("")
            lines.append(f"In similar situations, the user typically: **{user_action['typical_action']}**")
            lines.append(f"- Priority level: {user_action['priority']}")
            if user_action.get('time_sensitivity'):
                lines.append(f"- Time sensitivity: {user_action['time_sensitivity']}")
            lines.append("")
        
        # Lessons learned
        lessons = self.get_lessons_for_task(task_description)
        if lessons:
            lines.append("## LESSONS FROM PAST TASKS")
            lines.append("")
            for lesson in lessons[:5]:
                lines.append(f"- {lesson}")
            lines.append("")
        
        return "\n".join(lines)


# Tool definitions for the agent to update preferences
LEARNING_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_preference",
            "description": "Record a style preference or writing rule. Use this when you detect a pattern the lawyer wants or when correcting your own approach.",
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": "Category:Specific topic (e.g., 'Citations:Bluebook', 'Tone:Motion', 'Terminology:Contract')"
                    },
                    "instruction": {
                        "type": "string",
                        "description": "The rule or preference to follow"
                    },
                    "examples": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Examples demonstrating the preference"
                    }
                },
                "required": ["topic", "instruction"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_style_preferences",
            "description": "Get the current style preferences for a type of document or task",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_description": {
                        "type": "string",
                        "description": "Description of the task to get relevant preferences for"
                    }
                },
                "required": ["task_description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "record_workflow_success",
            "description": "Record a successful workflow pattern. Call this when a sequence of actions successfully completes a task, so you can repeat it in the future.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_type": {
                        "type": "string",
                        "description": "Type of task (e.g., 'matter_intake', 'motion_drafting', 'discovery_response')"
                    },
                    "actions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "The sequence of actions/tools that worked"
                    },
                    "matter_type": {
                        "type": "string",
                        "description": "Optional: Type of matter (e.g., 'litigation', 'contract')"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional: Notes about why this workflow works well"
                    }
                },
                "required": ["task_type", "actions"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_recommended_workflow",
            "description": "Get the recommended workflow for a task type based on past successes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_type": {
                        "type": "string",
                        "description": "Type of task to get workflow for"
                    },
                    "matter_type": {
                        "type": "string",
                        "description": "Optional: Matter type for more specific recommendation"
                    }
                },
                "required": ["task_type"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "record_observation",
            "description": "Record an observation about a task outcome for future learning. Call this after completing (or failing) a task.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_description": {
                        "type": "string",
                        "description": "What was the task"
                    },
                    "actions_taken": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "What actions were performed"
                    },
                    "outcome": {
                        "type": "string",
                        "enum": ["success", "partial", "failure"],
                        "description": "How did it turn out"
                    },
                    "lessons_learned": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "What did you learn from this"
                    }
                },
                "required": ["task_description", "actions_taken", "outcome"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_user_typical_action",
            "description": "Get what the user typically does in a given situation. Use this to emulate the user's decision-making.",
            "parameters": {
                "type": "object",
                "properties": {
                    "context": {
                        "type": "string",
                        "description": "The situation/context to check"
                    },
                    "matter_type": {
                        "type": "string",
                        "description": "Optional: Matter type for more specific recommendation"
                    }
                },
                "required": ["context"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "record_user_behavior",
            "description": "Record what the user typically does in a situation. Use this when you observe the user's decision pattern.",
            "parameters": {
                "type": "object",
                "properties": {
                    "trigger_context": {
                        "type": "string",
                        "description": "What situation triggers this behavior"
                    },
                    "action_taken": {
                        "type": "string",
                        "description": "What the user does"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent"],
                        "description": "How important this seems to the user"
                    },
                    "time_sensitivity": {
                        "type": "string",
                        "enum": ["immediate", "same_day", "week", "flexible"],
                        "description": "How time-sensitive"
                    }
                },
                "required": ["trigger_context", "action_taken"]
            }
        }
    }
]


def execute_learning_tool(
    tool_name: str,
    args: Dict[str, Any],
    learning_manager: LearningManager
) -> Dict[str, Any]:
    """Execute a learning-related tool"""
    if tool_name == "update_preference":
        return learning_manager.update_preference(
            topic=args.get("topic", ""),
            instruction=args.get("instruction", ""),
            examples=args.get("examples", []),
            source="agent_learned"
        )
    elif tool_name == "get_style_preferences":
        prefs = learning_manager.get_relevant_preferences(
            args.get("task_description", "")
        )
        return {
            "success": True,
            "preferences": [p.to_dict() for p in prefs]
        }
    elif tool_name == "record_workflow_success":
        return learning_manager.record_workflow(
            task_type=args.get("task_type", ""),
            action_sequence=args.get("actions", []),
            success=True,
            matter_type=args.get("matter_type"),
            notes=args.get("notes", "")
        )
    elif tool_name == "get_recommended_workflow":
        workflow = learning_manager.get_recommended_workflow(
            task_type=args.get("task_type", ""),
            matter_type=args.get("matter_type")
        )
        if workflow:
            return {"success": True, "workflow": workflow}
        return {"success": True, "workflow": None, "message": "No workflow pattern found for this task type"}
    elif tool_name == "record_observation":
        return learning_manager.record_observation(
            task_description=args.get("task_description", ""),
            actions_taken=args.get("actions_taken", []),
            outcome=args.get("outcome", "partial"),
            lessons=args.get("lessons_learned", [])
        )
    elif tool_name == "get_user_typical_action":
        action = learning_manager.get_user_typical_action(
            context=args.get("context", ""),
            matter_type=args.get("matter_type")
        )
        if action:
            return {"success": True, "user_action": action}
        return {"success": True, "user_action": None, "message": "No user behavior pattern found"}
    elif tool_name == "record_user_behavior":
        return learning_manager.record_user_behavior(
            trigger_context=args.get("trigger_context", ""),
            action_taken=args.get("action_taken", ""),
            priority=args.get("priority", "medium"),
            time_sensitivity=args.get("time_sensitivity")
        )
    else:
        return {"success": False, "error": f"Unknown learning tool: {tool_name}"}
