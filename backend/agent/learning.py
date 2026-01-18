"""
Learning Module - Persistent Style and Preference Learning

This module enables the agent to learn from user feedback and corrections,
maintaining a persistent style guide that improves over time.

Features:
- Reads/writes style_guide.md for persistent preferences
- Detects and records user corrections via diff analysis
- Provides tools for the agent to update its own preferences
- Tracks patterns in user edits to improve future output
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


class LearningManager:
    """
    Manages persistent learning from user interactions.
    
    Maintains a style_guide.md that the agent reads before every task,
    and updates based on detected patterns in user corrections.
    """
    
    def __init__(self, preferences_dir: str = "./case_data/preferences"):
        self.preferences_dir = Path(preferences_dir)
        self.preferences_dir.mkdir(parents=True, exist_ok=True)
        
        # File paths
        self.style_guide_path = self.preferences_dir / "style_guide.md"
        self.preferences_json_path = self.preferences_dir / "preferences.json"
        self.edit_patterns_path = self.preferences_dir / "edit_patterns.json"
        
        # In-memory caches
        self._preferences: Dict[str, StylePreference] = {}
        self._edit_patterns: List[EditPattern] = []
        
        # Load existing data
        self._load_preferences()
        self._load_edit_patterns()
    
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
    else:
        return {"success": False, "error": f"Unknown learning tool: {tool_name}"}
