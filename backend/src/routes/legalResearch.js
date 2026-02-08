/**
 * Legal Research Routes
 * 
 * COMPLETELY ISOLATED from:
 * - ai.js (normal AI chat, uses Azure OpenAI)
 * - aiAgent.js (AI agent tools, uses Azure OpenAI)
 * - backgroundAgent.js (amplifier service, uses Azure OpenAI)
 * - amplifierService.js (background agent engine)
 * 
 * This route:
 * - Uses OpenRouter (Anthropic Claude via OpenRouter)
 * - Has NO imports from amplifier/, ai.js, or aiAgent.js
 * - Has its own isolated database tables
 * - Only shares the auth middleware (users still need to be logged in)
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  runLegalPlugin,
  runLegalPluginStream,
  createSession,
  getSession,
  listSessions,
  saveMessage,
  getSessionMessages,
  deleteSession,
  isConfigured,
  getConfig,
} from '../services/legalResearch/legalResearchService.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =====================================================
// GET /api/legal-research/config
// Returns service configuration (no secrets)
// =====================================================
router.get('/config', (req, res) => {
  try {
    const config = getConfig();
    res.json(config);
  } catch (error) {
    console.error('[LegalResearch] Config error:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

// =====================================================
// GET /api/legal-research/sessions
// List research sessions for the current user
// =====================================================
router.get('/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const sessions = await listSessions(req.user.id, limit, offset);
    res.json({ sessions });
  } catch (error) {
    console.error('[LegalResearch] List sessions error:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// =====================================================
// POST /api/legal-research/sessions
// Create a new research session
// =====================================================
router.post('/sessions', async (req, res) => {
  try {
    const { title, jurisdiction, practiceArea } = req.body;
    const session = await createSession(
      req.user.id,
      title || 'New Research',
      jurisdiction,
      practiceArea
    );
    res.status(201).json({ session });
  } catch (error) {
    console.error('[LegalResearch] Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// =====================================================
// GET /api/legal-research/sessions/:id
// Get a specific session with its messages
// =====================================================
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const messages = await getSessionMessages(req.params.id, req.user.id);
    res.json({ session, messages });
  } catch (error) {
    console.error('[LegalResearch] Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// =====================================================
// DELETE /api/legal-research/sessions/:id
// Delete a research session
// =====================================================
router.delete('/sessions/:id', async (req, res) => {
  try {
    const deleted = await deleteSession(req.params.id, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[LegalResearch] Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// =====================================================
// POST /api/legal-research/chat
// Send a message and get an AI response (non-streaming)
// =====================================================
router.post('/chat', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ 
        error: 'Legal Research is not configured. Set OPENROUTER_API_KEY in environment variables.' 
      });
    }

    const { message, sessionId, model, jurisdiction, practiceArea } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Create or get session
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const session = await createSession(req.user.id, message, jurisdiction, practiceArea);
      activeSessionId = session.id;
    } else {
      // Verify session ownership
      const session = await getSession(activeSessionId, req.user.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
    }

    // Save user message
    await saveMessage(activeSessionId, 'user', message.trim());

    // Get conversation history for context
    const messages = await getSessionMessages(activeSessionId, req.user.id);
    const conversationHistory = (messages || [])
      .filter(m => m.role !== 'system')
      .slice(0, -1) // Exclude the message we just saved (it's the current input)
      .map(m => ({ role: m.role, content: m.content }));

    // Call OpenRouter via the legal research service
    const result = await runLegalPlugin(message.trim(), conversationHistory, { model });

    // Save assistant response
    await saveMessage(activeSessionId, 'assistant', result.content, {
      model: result.model,
      usage: result.usage,
      toolCalls: result.toolCalls,
    });

    res.json({
      sessionId: activeSessionId,
      message: result.content,
      model: result.model,
      usage: result.usage,
      toolCalls: result.toolCalls,
    });

  } catch (error) {
    console.error('[LegalResearch] Chat error:', error);
    res.status(500).json({ error: error.message || 'Failed to process research query' });
  }
});

// =====================================================
// POST /api/legal-research/chat/stream
// Send a message and get a streaming AI response (SSE)
// =====================================================
router.post('/chat/stream', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ 
        error: 'Legal Research is not configured. Set OPENROUTER_API_KEY.' 
      });
    }

    const { message, sessionId, model, jurisdiction, practiceArea } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Create or get session
    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const session = await createSession(req.user.id, message, jurisdiction, practiceArea);
      activeSessionId = session.id;
    } else {
      const session = await getSession(activeSessionId, req.user.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
    }

    // Save user message
    await saveMessage(activeSessionId, 'user', message.trim());

    // Get conversation history
    const messages = await getSessionMessages(activeSessionId, req.user.id);
    const conversationHistory = (messages || [])
      .filter(m => m.role !== 'system')
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.content }));

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send session ID immediately
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId: activeSessionId })}\n\n`);

    // Get streaming response
    const stream = await runLegalPluginStream(message.trim(), conversationHistory, { model });

    let fullContent = '';
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // Save the complete response
              if (fullContent) {
                await saveMessage(activeSessionId, 'assistant', fullContent);
              }
              res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                res.write(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`);
              }
            } catch (e) {
              // Skip unparseable chunks
            }
          }
        }
      }
    } catch (streamError) {
      console.error('[LegalResearch] Stream error:', streamError);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream interrupted' })}\n\n`);
    }

    // If we never got a [DONE] signal but have content, save it
    if (fullContent) {
      try {
        await saveMessage(activeSessionId, 'assistant', fullContent);
      } catch (e) {
        // Message may already be saved
      }
    }

    res.end();

  } catch (error) {
    console.error('[LegalResearch] Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to process research query' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

export default router;
