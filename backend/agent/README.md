# Amplifier Legal Agent - Super Lawyer Edition

A Python-based background agent for autonomous legal document processing. This is the **"Best Lawyer Ever"** AI that uses:

- **IRAC Methodology**: Issue → Rule → Analysis → Conclusion
- **Self-Critique**: Evaluates its own work before finalizing
- **Learning**: Maintains a style guide from user feedback
- **Full Platform Access**: Same tools as the normal AI chat
- **Metacognitive Loop**: Plan → Execute → Critique → Refine

## Overview

This agent can:
- Read legal documents (PDF, DOCX, TXT)
- Draft motions, memos, briefs, and contracts
- Perform legal research with proper Bluebook citations
- Navigate directory structures
- Work autonomously without human intervention
- Self-correct through IRAC-based critique
- Learn from user edits to improve over time

## Architecture

```
agent/
├── config.py           # Azure OpenAI configuration (same as Node.js backend)
├── advanced_tools.py   # FileSystem tools with sandboxing
├── bridge_tools.py     # Bridge to Node.js backend tools (same as normal chat)
├── learning.py         # LearningManager for style preferences
├── lawyer_brain.py     # SuperLawyerAgent with IRAC methodology
├── legal_workflow.py   # MetacognitiveAgent (Plan → Execute → Critique → Refine)
├── worker.py           # Background task runner (uses SuperLawyerAgent)
├── case_data/          # Sandbox directory for file operations
│   └── preferences/    # Style guide and learned preferences
│       ├── style_guide.md      # Human-readable style guide
│       └── preferences.json    # Machine-readable preferences
├── logs/               # Agent activity logs
└── pending_tasks.json  # Task queue
```

## Key Components

### SuperLawyerAgent (`lawyer_brain.py`)
The main agent brain that uses IRAC methodology:
- **Issue**: Precisely frames the legal question
- **Rule**: Cites controlling authority with Bluebook citations
- **Analysis**: Applies law to facts, addresses counterarguments
- **Conclusion**: States conclusion with confidence level

### LearningManager (`learning.py`)
Persistent learning from user feedback:
- Reads `style_guide.md` before every task
- Agent can call `update_preference()` to record new rules
- `review_user_edits()` detects patterns in user corrections
- Auto-learns from repeated edits (3+ occurrences)

### Bridge Tools (`bridge_tools.py`)
Access to ALL platform tools (same as normal AI chat):
- Matters, Clients, Time Entries
- Documents, Calendar, Tasks
- Invoices, Reports, Team
- Legal research, Conflict checks

## Configuration

The agent uses the **same environment variables** as the Node.js backend:

```bash
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_API_KEY="your-api-key"
export AZURE_OPENAI_DEPLOYMENT="gpt-4"
```

Or create a `.env` file in the `backend/` directory.

## Installation

```bash
cd backend/agent
pip install -r requirements.txt
```

## Usage

### Run the Background Worker

The worker runs continuously, polling for new tasks:

```bash
python worker.py
```

Options:
- `--poll-interval 10` - Check for tasks every 10 seconds
- `--queue-file ./my_tasks.json` - Use a different task file

### Add a Task

```bash
python worker.py --add-task "Read all PDFs in the evidence folder and create a summary"
```

### List Tasks

```bash
python worker.py --list
```

### Run One Task

```bash
python worker.py --run-once
```

## IRAC Legal Reasoning

The SuperLawyerAgent follows the **IRAC** methodology for legal analysis:

### I - Issue
- Precisely identifies the legal question
- Frames it narrowly with "The issue is whether..."
- Identifies sub-issues and key facts

### R - Rule
- States the applicable legal rule
- Cites controlling authority (cases, statutes)
- Uses proper **Bluebook 21st Edition** citations
- Lists elements/factors from the rule

### A - Analysis
- Applies the rule to the specific facts
- Addresses **BOTH sides** of the argument
- Uses analogical reasoning from precedent
- No shortcuts - thorough analysis

### C - Conclusion
- States conclusion clearly
- Recommends specific action
- Identifies next steps
- Includes confidence level

## Self-Critique Protocol

After every substantive output, the agent critiques itself:

1. **Strength Check**: Is this argument strong enough? More aggressive?
2. **Citation Check**: Are all legal citations accurate and properly formatted?
3. **Completeness Check**: Did I address all issues? Any gaps?
4. **Persuasion Check**: Would a judge/client be convinced?
5. **Style Check**: Does this match the firm's preferences?

If ANY critique fails, the agent refines and rewrites before finalizing.

## Metacognitive Pattern

The MetacognitiveAgent (fallback) follows **Plan → Execute → Critique → Refine**:

1. **Plan**: Break the goal into specific steps
2. **Execute**: Run each step using tools
3. **Critique**: Evaluate if the step achieved its goal
4. **Refine**: If critique fails, retry with a different approach

This enables autonomous handling of complex, multi-step tasks.

## File System Sandbox

All file operations are restricted to the `case_data/` directory for safety. The agent cannot:
- Access files outside the sandbox
- Delete system files
- Execute arbitrary commands

## Tools Available

- `list_directory` - List files in a directory
- `list_directory_recursive` - Find all files in a tree
- `read_file` - Read file contents (PDF, DOCX, TXT, etc.)
- `write_file` - Create or update files
- `file_exists` - Check if a file exists
- `create_directory` - Create a new directory
- `create_plan` - Break goal into steps
- `report_step_result` - Record step completion
- `critique_step` - Evaluate step success
- `complete_task` - Mark task as done

## Logging

All agent activity is logged to `logs/agent_logs.txt`. This includes:
- Task starts and completions
- Tool executions
- Errors and retries
- Critique results

## Example Tasks

```bash
# Summarize documents
python worker.py -a "Read all files in the depositions folder and create a summary memo"

# Find specific information
python worker.py -a "Search through the contracts folder for any mentions of 'non-compete' clauses"

# Organize files
python worker.py -a "List all PDF files in evidence and create an index.md file"

# Draft documents
python worker.py -a "Review the case notes in case_data/notes.txt and draft a motion summary"
```

## Integration with Node.js Backend

The Python agent can be called from the Node.js backend via:

1. **Task Queue**: Write to `pending_tasks.json` from Node.js
2. **Direct Execution**: Use `child_process` to run `python worker.py --run-once`
3. **HTTP Bridge**: (Future) Expose agent via FastAPI

## Safety Features

- **Sandbox**: All file operations restricted to `case_data/`
- **Max Iterations**: Tasks stop after 50 iterations
- **Max Runtime**: Tasks stop after 1 hour
- **No User Input**: Agent never uses `input()` or waits for user
- **Error Logging**: All errors logged for debugging
- **Graceful Shutdown**: Handles SIGINT/SIGTERM properly
