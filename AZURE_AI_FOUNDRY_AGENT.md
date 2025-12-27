# Azure AI Foundry Agent Integration

This document describes how to configure and use the Azure AI Foundry Agent for background tasks in Apex Legal.

## Overview

The Azure AI Foundry Agent provides a powerful autonomous agent that can:
- Work continuously for up to **15 minutes** on complex tasks
- Execute **one prompt at a time** with sequential tool calls
- Use Azure AI Foundry's native agent API with function calling
- Track progress in real-time with database checkpoints

## Configuration

### 1. Set Up Azure AI Foundry

1. Go to [Azure AI Studio](https://ai.azure.com) and create a new project
2. Deploy a model (e.g., `gpt-4o`, `gpt-4-turbo`, or `gpt-35-turbo`)
3. Note your project endpoint and deployment name

### 2. Configure Environment Variables

Add these variables to your backend `.env` file:

```bash
# Enable Azure AI Foundry Agent
USE_FOUNDRY_AGENT=true

# Your AI Foundry project endpoint
AZURE_AI_FOUNDRY_ENDPOINT=https://your-project.cognitiveservices.azure.com

# The deployment name (model you deployed)
AZURE_AI_FOUNDRY_DEPLOYMENT=gpt-4o
```

### 3. Authentication Options

Choose one of these authentication methods:

#### Option A: Azure CLI (Development)

```bash
# Just login with Azure CLI
az login

# Ensure you have Contributor role on the AI project
az role assignment create \
  --role "Cognitive Services User" \
  --assignee your-email@example.com \
  --scope /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{resource}
```

#### Option B: Service Principal (Production)

```bash
# Register an application in Azure AD
# Grant it "Cognitive Services User" role on your AI resource

AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-client-id
AZURE_CLIENT_SECRET=your-client-secret
```

## How It Works

### Background Task Flow

1. **User Request**: User sends a message with "background agent" enabled
2. **Task Creation**: System creates a task record in the database
3. **Agent Creation**: Azure AI Foundry creates an agent with custom tools
4. **Conversation Loop**: Agent executes tools one at a time for up to 15 minutes
5. **Progress Tracking**: Each iteration updates the database with progress
6. **Completion**: Final summary is generated and stored

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│  Azure AI       │
│   (AIChat.tsx)  │     │  (aiAgent.js)    │     │  Foundry        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   PostgreSQL     │     │  Agent + Tools  │
                        │   (ai_tasks)     │     │  (15 min loop)  │
                        └──────────────────┘     └─────────────────┘
```

### Available Tools

The Foundry Agent has access to these tools:

| Tool | Description |
|------|-------------|
| `search_matters` | Search for matters by name or client |
| `get_matter` | Get comprehensive matter information |
| `list_clients` | Get a list of clients |
| `get_client` | Get comprehensive client information |
| `log_time` | Log billable time entries |
| `create_event` | Create calendar events |
| `create_task` | Create tasks and to-dos |
| `list_documents` | List documents |
| `read_document_content` | Read document content |
| `create_document` | Create new PDF documents |
| `create_note` | Create notes attached to matters/clients |
| `draft_email_for_matter` | Draft emails for matters |
| `get_firm_overview` | Get firm status overview |

## API Endpoints

### Check Agent Status

```bash
GET /api/v1/agent/status

# Response:
{
  "agentBackend": "foundry",  # or "openai"
  "foundry": {
    "configured": true,
    "endpoint": "***configured***",
    "deployment": "gpt-4o"
  },
  "features": {
    "backgroundAgent": true,
    "maxRuntimeMinutes": 15,
    "functionCalling": true
  }
}
```

### Start Background Task

```bash
POST /api/v1/agent/chat
Content-Type: application/json

{
  "message": "Review the Smith case and prepare a summary",
  "forceBackground": true
}

# Response:
{
  "response": "I'm starting a background task...",
  "backgroundTask": {
    "taskId": "uuid",
    "goal": "Review the Smith case and prepare a summary"
  }
}
```

### Get Task Progress

```bash
GET /api/v1/agent/tasks/{taskId}

# Response:
{
  "id": "uuid",
  "status": "running",  # or "completed", "failed"
  "iterations": 15,
  "progress": { ... },
  "summary": "..." # when complete
}
```

## Fallback Behavior

If Azure AI Foundry is not configured or encounters an error:
- The system automatically falls back to the legacy ReAct agent
- Uses Azure OpenAI direct API for function calling
- Same 15-minute runtime and tool capabilities

## Troubleshooting

### Common Issues

1. **"AZURE_AI_FOUNDRY_ENDPOINT is not configured"**
   - Ensure the environment variable is set correctly
   - Format: `https://<resource-name>.cognitiveservices.azure.com`

2. **Authentication Errors**
   - Check Azure CLI is logged in: `az account show`
   - Verify role assignment on the AI resource
   - For service principal, verify client credentials

3. **Model Not Found**
   - Verify the deployment name matches exactly
   - Check the model is deployed in AI Studio

### Debug Logging

Watch the backend logs for agent activity:

```bash
# Look for these log prefixes:
[FOUNDRY] - Foundry service messages
[FOUNDRY {taskId}] - Task-specific messages
[AGENT] - General agent routing decisions
```

## Performance Notes

- **Iteration Delay**: 2 seconds between API calls to avoid rate limiting
- **Max Iterations**: 500 (roughly 15 minutes with 2s delay)
- **Token Limits**: Configured for 4000 max tokens per response
- **Parallel Calls**: Disabled (one tool at a time for consistency)
