# Amplifier Legal Agent

A Python-based background agent for autonomous legal document processing. Uses the **Metacognitive Recipe** pattern (Plan → Execute → Critique → Refine) for complex, long-running tasks.

## Overview

This agent can:
- Read legal documents (PDF, DOCX, TXT)
- Write legal memos, summaries, and documents
- Navigate directory structures
- Work autonomously without human intervention
- Self-correct through critique and refinement

## Architecture

```
agent/
├── config.py           # Azure OpenAI configuration (same as Node.js backend)
├── advanced_tools.py   # FileSystem tools with sandboxing
├── legal_workflow.py   # Metacognitive agent (Plan → Execute → Critique → Refine)
├── worker.py           # Background task runner
├── case_data/          # Sandbox directory for file operations
├── logs/               # Agent activity logs
└── pending_tasks.json  # Task queue
```

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

## Metacognitive Pattern

The agent follows the **Plan → Execute → Critique → Refine** pattern:

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
