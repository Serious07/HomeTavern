import db from '../config/database';

export interface LlmConnection {
  id: number;
  user_id: number;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  model: string;
  max_tokens: number;
  /**
   * Размер контекста модели в токенах, указанный пользователем.
   * null = не задано вручную, тогда лимит определяется автоматически.
   * Не путать с max_tokens - это лимит ВЫВОДА, а не размер окна.
   */
  context_length: number | null;
  /** Enable reasoning/thinking mode (1=enabled, 0=disabled). Default: 1 */
  reasoning: number;
  /** Reasoning effort: low | medium | high | xhigh. Default: 'medium'. Используется только когда reasoning включён */
  reasoning_effort: string;
  /** Enable strict role alternation (merge consecutive same-role messages). Default: 0 */
  strict_role_alternation: number;
  /**
   * Параметры сэмплирования. NULL у top_k/min_p = «не отправлять поле провайдеру».
   * temperature/top_p отправляются всегда: без них локальные движки декодируют
   * жадно и начинают повторять предыдущий ход дословно.
   */
  temperature: number | null;
  top_p: number | null;
  top_k: number | null;
  min_p: number | null;
  /** 'reasoning_effort' (default) | 'chat_template_kwargs' | 'none' */
  thinking_control: string;
  /** 'auto' (default) | 'legacy' | 'none' */
  stop_tokens_mode: string;
  /** Защита от дословного повтора предыдущего хода (1 = включена, default) */
  repetition_guard: number;
  /** Авто-ретрай с другим сэмплированием при обнаружении повтора (1 = включён, default) */
  repetition_auto_retry: number;
  is_active: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface CreateLlmConnectionInput {
  user_id: number;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  max_tokens: number;
  context_length?: number | null;
  reasoning?: number;
  /** low | medium | high | xhigh */
  reasoning_effort?: string;
  strict_role_alternation?: number;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  min_p?: number | null;
  thinking_control?: string;
  stop_tokens_mode?: string;
  repetition_guard?: number;
  repetition_auto_retry?: number;
}

export interface UpdateLlmConnectionInput {
  name?: string;
  base_url?: string;
  api_key?: string; // only provided when changing the key
  model?: string;
  max_tokens?: number;
  /** null очищает значение и возвращает к автоопределению */
  context_length?: number | null;
  reasoning?: number;
  /** low | medium | high | xhigh */
  reasoning_effort?: string;
  strict_role_alternation?: number;
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
  min_p?: number | null;
  thinking_control?: string;
  stop_tokens_mode?: string;
  repetition_guard?: number;
  repetition_auto_retry?: number;
}

/**
 * Единый список колонок для всех SELECT по llm_connections.
 * Раньше он был продублирован в трёх запросах, из-за чего новая колонка
 * обязана была добавляться сразу в три места.
 */
const CONNECTION_COLUMNS = `id, user_id, name, base_url, api_key_encrypted, model, max_tokens, context_length, reasoning, reasoning_effort, strict_role_alternation, temperature, top_p, top_k, min_p, thinking_control, stop_tokens_mode, repetition_guard, repetition_auto_retry, is_active, created_at, updated_at`;

class LlmConnectionRepository {
  /**
   * Encrypt simple values (no real encryption, just obfuscation for storage)
   * In production, use proper encryption (AES-256)
   */
  private encrypt(value: string): string {
    return Buffer.from(value).toString('base64');
  }

  /**
   * Decrypt previously obfuscated values
   */
  private decrypt(value: string): string {
    return Buffer.from(value, 'base64').toString('utf-8');
  }

  getAllByUserId(userId: number): LlmConnection[] {
    const rows = db.prepare(`
      SELECT ${CONNECTION_COLUMNS}
      FROM llm_connections
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as LlmConnection[];
    return rows;
  }

  getById(id: number): LlmConnection | null {
    const row = db.prepare(`
      SELECT ${CONNECTION_COLUMNS}
      FROM llm_connections
      WHERE id = ?
    `).get(id) as LlmConnection | undefined;
    return row || null;
  }

  getByIdWithDecryptedKey(id: number): (LlmConnection & { api_key_decrypted: string }) | null {
    const conn = this.getById(id);
    if (!conn) return null;
    return {
      ...conn,
      api_key_decrypted: conn.api_key_encrypted ? this.decrypt(conn.api_key_encrypted) : '',
    };
  }

  getActiveByUserId(userId: number): LlmConnection | null {
    const row = db.prepare(`
      SELECT ${CONNECTION_COLUMNS}
      FROM llm_connections
      WHERE user_id = ? AND is_active = 1
      LIMIT 1
    `).get(userId) as LlmConnection | undefined;
    return row || null;
  }

  create(input: CreateLlmConnectionInput): number {
    const encryptedKey = this.encrypt(input.api_key);
    const reasoning = input.reasoning ?? 1; // Default: reasoning enabled
    const reasoningEffort = input.reasoning_effort ?? 'medium'; // Default: medium
    const strictRoleAlternation = input.strict_role_alternation ?? 0; // Default: disabled
    // Сэмплирование по умолчанию: без него локальные движки декодируют жадно
    const temperature = input.temperature ?? 0.8;
    const topP = input.top_p ?? 0.95;
    const thinkingControl = input.thinking_control ?? 'reasoning_effort';
    const stopTokensMode = input.stop_tokens_mode ?? 'auto';
    const repetitionGuard = input.repetition_guard ?? 1;
    const repetitionAutoRetry = input.repetition_auto_retry ?? 1;

    const stmt = db.prepare(`
      INSERT INTO llm_connections (user_id, name, base_url, api_key_encrypted, model, max_tokens, context_length, reasoning, reasoning_effort, strict_role_alternation, temperature, top_p, top_k, min_p, thinking_control, stop_tokens_mode, repetition_guard, repetition_auto_retry, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(
      input.user_id,
      input.name,
      input.base_url,
      encryptedKey,
      input.model,
      input.max_tokens,
      input.context_length ?? null,
      reasoning,
      reasoningEffort,
      strictRoleAlternation,
      temperature,
      topP,
      input.top_k ?? null,
      input.min_p ?? null,
      thinkingControl,
      stopTokensMode,
      repetitionGuard,
      repetitionAutoRetry
    );
    return result.lastInsertRowid as number;
  }

  update(id: number, input: UpdateLlmConnectionInput, userId: number): void {
    const updates: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    if (input.base_url !== undefined) {
      updates.push('base_url = ?');
      params.push(input.base_url);
    }
    if (input.api_key !== undefined) {
      updates.push('api_key_encrypted = ?');
      params.push(this.encrypt(input.api_key));
    }
    if (input.model !== undefined) {
      updates.push('model = ?');
      params.push(input.model);
    }
    if (input.max_tokens !== undefined) {
      updates.push('max_tokens = ?');
      params.push(input.max_tokens);
    }
    if (input.context_length !== undefined) {
      updates.push('context_length = ?');
      params.push(input.context_length);
    }
    if (input.reasoning !== undefined) {
      updates.push('reasoning = ?');
      params.push(input.reasoning);
    }
    if (input.reasoning_effort !== undefined) {
      updates.push('reasoning_effort = ?');
      params.push(input.reasoning_effort);
    }
    if (input.strict_role_alternation !== undefined) {
      updates.push('strict_role_alternation = ?');
      params.push(input.strict_role_alternation);
    }
    if (input.temperature !== undefined) {
      updates.push('temperature = ?');
      params.push(input.temperature);
    }
    if (input.top_p !== undefined) {
      updates.push('top_p = ?');
      params.push(input.top_p);
    }
    if (input.top_k !== undefined) {
      updates.push('top_k = ?');
      params.push(input.top_k);
    }
    if (input.min_p !== undefined) {
      updates.push('min_p = ?');
      params.push(input.min_p);
    }
    if (input.thinking_control !== undefined) {
      updates.push('thinking_control = ?');
      params.push(input.thinking_control);
    }
    if (input.stop_tokens_mode !== undefined) {
      updates.push('stop_tokens_mode = ?');
      params.push(input.stop_tokens_mode);
    }
    if (input.repetition_guard !== undefined) {
      updates.push('repetition_guard = ?');
      params.push(input.repetition_guard);
    }
    if (input.repetition_auto_retry !== undefined) {
      updates.push('repetition_auto_retry = ?');
      params.push(input.repetition_auto_retry);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    db.prepare(`
      UPDATE llm_connections
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...params, id, userId);
  }

  activate(id: number, userId: number): void {
    // Deactivate all first
    db.prepare(`UPDATE llm_connections SET is_active = 0 WHERE user_id = ?`).run(userId);
    // Activate the selected one
    db.prepare(`UPDATE llm_connections SET is_active = 1 WHERE id = ? AND user_id = ?`).run(id, userId);
  }

  delete(id: number, userId: number): void {
    db.prepare(`DELETE FROM llm_connections WHERE id = ? AND user_id = ?`).run(id, userId);
  }

  /**
   * Create initial connections from .env settings for a user
   */
  createFromEnv(userId: number, connections: Omit<CreateLlmConnectionInput, 'user_id'>[]): number[] {
    const ids: number[] = [];
    for (const conn of connections) {
      ids.push(this.create({ ...conn, user_id: userId }));
    }
    return ids;
  }
}

export const llmConnectionRepository = new LlmConnectionRepository();