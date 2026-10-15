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
 * Поле «размер контекста» приходит из формы строкой. Пустая строка, ноль и мусор
 * должны превращаться в null - это режим автоопределения, а не «ноль токенов
 * контекста»: ноль ниже по коду означает «лимит неизвестен».
 */
function normalizeContextLength(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

/**
 * Reasoning effort приходит из формы строкой. Допустимы только low / medium / high / xhigh.
 * Всё остальное (пустая строка, мусор, 'none') превращается в 'medium' - значение
 * по умолчанию. 'none' здесь не является допустым значением: поле reasoning_effort
 * отправляется провайдеру только когда reasoning включён, поэтому хранить 'none'
 * в подключении смысла нет.
 */
function normalizeReasoningEffort(raw: unknown): string {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') return value;
  return 'medium';
}

/**
 * Числовые параметры сэмплирования приходят из формы строками. Пустая строка
 * приводит к def (для top_k/min_p def = null, то есть «не отправлять поле»),
 * всё остальное зажимается в допустимый диапазон, чтобы случайный ввод не
 * уложил генерацию в temperature=0 (жадный декодинг = повторы) или в 10.
 */
function normalizeSamplingNumber(raw: unknown, min: number, max: number, def: number | null): number | null {
  if (raw === null || raw === undefined || raw === '') return def;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return def;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Строковые режимы (thinking_control, stop_tokens_mode): принимаем только
 * известные значения, иначе - дефолт. Неизвестная строка ушла бы прямо в тело
 * запроса к провайдеру.
 */
function normalizeChoice(raw: unknown, allowed: string[], def: string): string {
  const value = String(raw ?? '').trim().toLowerCase();
  return allowed.includes(value) ? value : def;
}

/** Флаг 0/1 (SQLite boolean) */
function normalizeFlag(raw: unknown, def: number): number {
  if (raw === undefined || raw === null || raw === '') return def;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const value = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(value)) return 0;
  if (['1', 'true', 'on', 'yes'].includes(value)) return 1;
  return def;
}

/**
 * POST /api/llm-connections
 * Creates a new LLM connection for the authenticated user
 */
router.post('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, base_url, api_key, model, max_tokens, reasoning, reasoning_effort, strict_role_alternation }: CreateLlmConnectionInput = req.body;

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
      context_length: normalizeContextLength(req.body.context_length),
      reasoning: reasoning ?? 1,
      reasoning_effort: normalizeReasoningEffort(reasoning_effort),
      strict_role_alternation: strict_role_alternation ?? 0,
      temperature: normalizeSamplingNumber(req.body.temperature, 0.01, 2, 0.8),
      top_p: normalizeSamplingNumber(req.body.top_p, 0.01, 1, 0.95),
      top_k: normalizeSamplingNumber(req.body.top_k, 1, 1000, null),
      min_p: normalizeSamplingNumber(req.body.min_p, 0, 1, null),
      thinking_control: normalizeChoice(req.body.thinking_control, ['reasoning_effort', 'chat_template_kwargs', 'none'], 'reasoning_effort'),
      stop_tokens_mode: normalizeChoice(req.body.stop_tokens_mode, ['auto', 'legacy', 'none'], 'auto'),
      repetition_guard: normalizeFlag(req.body.repetition_guard, 1),
      repetition_auto_retry: normalizeFlag(req.body.repetition_auto_retry, 1),
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
    if (req.body.context_length !== undefined) {
      updates.context_length = normalizeContextLength(req.body.context_length);
    }
    if (req.body.reasoning !== undefined) updates.reasoning = req.body.reasoning;
    if (req.body.reasoning_effort !== undefined) {
      updates.reasoning_effort = normalizeReasoningEffort(req.body.reasoning_effort);
    }
    if (req.body.strict_role_alternation !== undefined) updates.strict_role_alternation = req.body.strict_role_alternation;
    if (req.body.temperature !== undefined) {
      updates.temperature = normalizeSamplingNumber(req.body.temperature, 0.01, 2, 0.8);
    }
    if (req.body.top_p !== undefined) {
      updates.top_p = normalizeSamplingNumber(req.body.top_p, 0.01, 1, 0.95);
    }
    if (req.body.top_k !== undefined) {
      updates.top_k = normalizeSamplingNumber(req.body.top_k, 1, 1000, null);
    }
    if (req.body.min_p !== undefined) {
      updates.min_p = normalizeSamplingNumber(req.body.min_p, 0, 1, null);
    }
    if (req.body.thinking_control !== undefined) {
      updates.thinking_control = normalizeChoice(req.body.thinking_control, ['reasoning_effort', 'chat_template_kwargs', 'none'], 'reasoning_effort');
    }
    if (req.body.stop_tokens_mode !== undefined) {
      updates.stop_tokens_mode = normalizeChoice(req.body.stop_tokens_mode, ['auto', 'legacy', 'none'], 'auto');
    }
    if (req.body.repetition_guard !== undefined) {
      updates.repetition_guard = normalizeFlag(req.body.repetition_guard, 1);
    }
    if (req.body.repetition_auto_retry !== undefined) {
      updates.repetition_auto_retry = normalizeFlag(req.body.repetition_auto_retry, 1);
    }

    llmConnectionRepository.update(id, updates, userId);

    // If key fields (base_url, api_key, model, max_tokens) were updated on the active
    // connection, re-switch so LLMService picks up the new values immediately.
    const activeConnAfterUpdate = llmConnectionRepository.getActiveByUserId(userId);
    if (activeConnAfterUpdate && activeConnAfterUpdate.id === id) {
      if (updates.base_url !== undefined || updates.api_key !== undefined ||
          updates.model !== undefined || updates.max_tokens !== undefined ||
          updates.temperature !== undefined || updates.top_p !== undefined ||
          updates.top_k !== undefined || updates.min_p !== undefined ||
          updates.thinking_control !== undefined || updates.stop_tokens_mode !== undefined ||
          updates.repetition_guard !== undefined || updates.repetition_auto_retry !== undefined) {
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

    // If reasoning_effort was updated and this is the active connection, notify LLMService
    if (updates.reasoning_effort !== undefined) {
      const userIdForCheck = (req as AuthenticatedRequest).user!.userId;
      const activeConn = llmConnectionRepository.getActiveByUserId(userIdForCheck);
      if (activeConn && activeConn.id === id) {
        llmService.setReasoningEffort(updates.reasoning_effort!);
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