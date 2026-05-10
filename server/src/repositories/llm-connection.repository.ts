import db from '../config/database';

export interface LlmConnection {
  id: number;
  user_id: number;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  model: string;
  max_tokens: number;
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
}

export interface UpdateLlmConnectionInput {
  name?: string;
  base_url?: string;
  api_key?: string; // only provided when changing the key
  model?: string;
  max_tokens?: number;
}

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
      SELECT id, user_id, name, base_url, api_key_encrypted, model, max_tokens, is_active, created_at, updated_at
      FROM llm_connections
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as LlmConnection[];
    return rows;
  }

  getById(id: number): LlmConnection | null {
    const row = db.prepare(`
      SELECT id, user_id, name, base_url, api_key_encrypted, model, max_tokens, is_active, created_at, updated_at
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
      SELECT id, user_id, name, base_url, api_key_encrypted, model, max_tokens, is_active, created_at, updated_at
      FROM llm_connections
      WHERE user_id = ? AND is_active = 1
      LIMIT 1
    `).get(userId) as LlmConnection | undefined;
    return row || null;
  }

  create(input: CreateLlmConnectionInput): number {
    const encryptedKey = this.encrypt(input.api_key);
    const stmt = db.prepare(`
      INSERT INTO llm_connections (user_id, name, base_url, api_key_encrypted, model, max_tokens, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(
      input.user_id,
      input.name,
      input.base_url,
      encryptedKey,
      input.model,
      input.max_tokens
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