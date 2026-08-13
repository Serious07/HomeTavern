import { Router, Request, Response } from 'express';
import { llmConnectionRepository, CreateLlmConnectionInput, UpdateLlmConnectionInput } from '../repositories/llm-connection.repository';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { llmService } from '../services/llm.service';

const router = Router();

/**
 * GET /api/llm-connections
 * Returns all LLM connections for the authenticated user (without decrypted API keys)
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const connections = llmConnectionRepository.getAllByUserId(userId);

    // Return connections without decrypted keys
    const safeConnections = connections.map(conn => ({
      ...conn,
      api_key_masked: conn.api_key_encrypted
        ? '••••••••' + conn.api_key_encrypted.slice(-4)
        : null,
      has_api_key: !!conn.api_key_encrypted,
    }));

    res.status(200).json(safeConnections);
  } catch (error) {
    console.error('[LLM Connections Route] Error getting connections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/llm-connections/:id
 * Returns a single LLM connection by ID (without decrypted API key)
 */
router.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }

    const conn = llmConnectionRepository.getById(id);
    if (!conn || conn.user_id !== userId) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const safeConn = {
      ...conn,
      api_key_masked: conn.api_key_encrypted
        ? '••••••••' + conn.api_key_encrypted.slice(-4)
        : null,
      has_api_key: !!conn.api_key_encrypted,
    };

    res.status(200).json(safeConn);
  } catch (error) {
    console.error('[LLM Connections Route] Error getting connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/llm-connections/active
 * Returns the currently active LLM connection (with decrypted API key)
 */
router.get('/active', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const conn = llmConnectionRepository.getActiveByUserId(userId);

    if (!conn) {
      return res.status(404).json({ error: 'No active connection found' });
    }

    const decrypted = llmConnectionRepository.getByIdWithDecryptedKey(conn.id);
    if (!decrypted) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.status(200).json(decrypted);
  } catch (error) {
    console.error('[LLM Connections Route] Error getting active connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/llm-connections
 * Creates a new LLM connection for the authenticated user
 */
router.post('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, base_url, api_key, model, max_tokens, reasoning, strict_role_alternation }: CreateLlmConnectionInput = req.body;

    if (!name || !base_url || !api_key || !model) {
      return res.status(400).json({
        error: 'Name, base_url, api_key, and model are required'
      });
    }

    const id = llmConnectionRepository.create({
      user_id: userId,
      name,
      base_url,
      api_key,
      model,
      max_tokens: max_tokens || 64000,
      reasoning: reasoning ?? 1,
      strict_role_alternation: strict_role_alternation ?? 0,
    });

    const conn = llmConnectionRepository.getById(id);
    res.status(201).json({
      ...conn,
      api_key_masked: '••••••••',
      has_api_key: true,
    });
  } catch (error) {
    console.error('[LLM Connections Route] Error creating connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/llm-connections/:id
 * Updates an existing LLM connection
 */
router.put('/:id', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }

    const existing = llmConnectionRepository.getById(id);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const updates: UpdateLlmConnectionInput = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.base_url !== undefined) updates.base_url = req.body.base_url;
    if (req.body.api_key !== undefined && req.body.api_key.length > 0) updates.api_key = req.body.api_key;
    if (req.body.model !== undefined) updates.model = req.body.model;
    if (req.body.max_tokens !== undefined) updates.max_tokens = req.body.max_tokens;
    if (req.body.reasoning !== undefined) updates.reasoning = req.body.reasoning;
    if (req.body.strict_role_alternation !== undefined) updates.strict_role_alternation = req.body.strict_role_alternation;

    llmConnectionRepository.update(id, updates, userId);

    // If key fields (base_url, api_key, model, max_tokens) were updated on the active
    // connection, re-switch so LLMService picks up the new values immediately.
    const activeConnAfterUpdate = llmConnectionRepository.getActiveByUserId(userId);
    if (activeConnAfterUpdate && activeConnAfterUpdate.id === id) {
      if (updates.base_url !== undefined || updates.api_key !== undefined ||
          updates.model !== undefined || updates.max_tokens !== undefined) {
        await llmService.switchToConnection(userId, id);
      }
    }

    // If reasoning was updated and this is the active connection, notify LLMService
    if (updates.reasoning !== undefined) {
      const userIdForCheck = (req as AuthenticatedRequest).user!.userId;
      const activeConn = llmConnectionRepository.getActiveByUserId(userIdForCheck);
      if (activeConn && activeConn.id === id) {
        llmService.setReasoning(updates.reasoning !== 0);
      }
    }

    // If strict_role_alternation was updated and this is the active connection, notify LLMService
    if (updates.strict_role_alternation !== undefined) {
      const userIdForCheck = (req as AuthenticatedRequest).user!.userId;
      const activeConn = llmConnectionRepository.getActiveByUserId(userIdForCheck);
      if (activeConn && activeConn.id === id) {
        llmService.setStrictRoleAlternation(updates.strict_role_alternation !== 0);
      }
    }

    const conn = llmConnectionRepository.getById(id);
    if (!conn) {
      return res.status(404).json({ error: 'Connection not found after update' });
    }
    res.status(200).json({
      ...conn,
      api_key_masked: conn.api_key_encrypted ? '••••••••' : null,
      has_api_key: !!conn.api_key_encrypted,
    });
  } catch (error) {
    console.error('[LLM Connections Route] Error updating connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/llm-connections/:id/activate
 * Activates an LLM connection (makes it the primary one)
 */
router.put('/:id/activate', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }

    const existing = llmConnectionRepository.getById(id);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    llmConnectionRepository.activate(id, userId);

    const updated = llmConnectionRepository.getById(id);
    if (!updated) {
      return res.status(404).json({ error: 'Connection not found after activation' });
    }
    res.status(200).json({
      ...updated,
      api_key_masked: updated.api_key_encrypted ? '••••••••' : null,
      has_api_key: !!updated.api_key_encrypted,
    });
  } catch (error) {
    console.error('[LLM Connections Route] Error activating connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/llm-connections/switch
 * Switches the active connection for the LLM service (without updating DB is_active)
 */
router.post('/switch', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { connection_id } = req.body;

    if (!connection_id) {
      return res.status(400).json({ error: 'connection_id is required' });
    }

    const result = await llmService.switchToConnection(userId, connection_id);
    
    if (result.success) {
      // Also activate in DB
      llmConnectionRepository.activate(connection_id, userId);
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('[LLM Connections Route] Error switching connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/llm-connections/:id/decrypt
 * Returns a single LLM connection with decrypted API key (for testing/editing)
 */
router.get('/:id/decrypt', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }

    const conn = llmConnectionRepository.getById(id);
    if (!conn || conn.user_id !== userId) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const withDecryptedKey = llmConnectionRepository.getByIdWithDecryptedKey(id);
    if (!withDecryptedKey) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.status(200).json({
      ...withDecryptedKey,
      api_key_masked: withDecryptedKey.api_key_encrypted
        ? '••••••••' + withDecryptedKey.api_key_encrypted.slice(-4)
        : null,
      has_api_key: !!withDecryptedKey.api_key_encrypted,
    });
  } catch (error) {
    console.error('[LLM Connections Route] Error getting decrypted connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/llm-connections/:id/show-key
 * Returns only the decrypted API key (for display purposes)
 */
router.get('/:id/show-key', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }

    const conn = llmConnectionRepository.getById(id);
    if (!conn || conn.user_id !== userId) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const withDecryptedKey = llmConnectionRepository.getByIdWithDecryptedKey(id);
    if (!withDecryptedKey) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.status(200).json({ api_key_decrypted: withDecryptedKey.api_key_decrypted || '' });
  } catch (error) {
    console.error('[LLM Connections Route] Error getting show-key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/llm-connections/:id
 * Deletes an LLM connection
 */
router.delete('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid connection ID' });
    }

    const existing = llmConnectionRepository.getById(id);
    if (!existing || existing.user_id !== userId) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    llmConnectionRepository.delete(id, userId);
    res.status(200).json({ message: 'Connection deleted successfully' });
  } catch (error) {
    console.error('[LLM Connections Route] Error deleting connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/llm-connections/test
 * Tests connectivity to an LLM endpoint without saving
 */
router.post('/test', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { base_url, api_key, model } = req.body;

    if (!base_url || !api_key || !model) {
      return res.status(400).json({ error: 'base_url, api_key, and model are required' });
    }

    const startTime = Date.now();
    const cleanBaseUrl = base_url.replace(/\/+$/, '');

    try {
      const response = await fetch(`${cleanBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }),
      });

      const responseTime = Date.now() - startTime;
      const data: any = await response.json().catch(() => null);

      if (response.ok && data && data.choices) {
        res.status(200).json({
          success: true,
          message: 'Connection successful',
          response_time_ms: responseTime,
          model_response: (data.choices[0] as any)?.message?.content?.substring(0, 50) || 'Response received',
        });
      } else {
        // Server responded but with error or unexpected format - connection worked
        res.status(200).json({
          success: true,
          message: 'Connection successful (server returned HTTP ' + response.status + ', but endpoint is reachable)',
          response_time_ms: responseTime,
          server_status: response.status,
          server_error: (data as any)?.error || 'Server responded with non-200 status',
        });
      }
    } catch (testError: any) {
      const responseTime = Date.now() - startTime;
      const errorMessage = testError.message || '';

      if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        res.status(408).json({
          success: false,
          message: 'Connection timeout',
          response_time_ms: responseTime,
          error: 'The request timed out. Check if the server is running and accessible.',
        });
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND') || errorMessage.includes('fetch failed')) {
        res.status(400).json({
          success: false,
          message: 'Connection failed',
          response_time_ms: responseTime,
          error: `Cannot connect to ${base_url}. Check the URL and make sure the server is running.`,
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Connection failed',
          response_time_ms: responseTime,
          error: errorMessage || 'Unknown error occurred',
        });
      }
    }
  } catch (error) {
    console.error('[LLM Connections Route] Error testing connection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;