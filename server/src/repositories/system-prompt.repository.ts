import db from '../config/database';

export interface SystemPrompt {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSystemPromptData {
  user_id: number;
  name: string;
  description: string | null;
  prompt_text: string;
  is_active?: number;
}

export interface UpdateSystemPromptData {
  name?: string;
  description?: string | null;
  prompt_text?: string;
  is_active?: number;
}

/**
 * Получить все системные промпты пользователя
 */
export function getSystemPromptsByUserId(userId: number): SystemPrompt[] {
  const stmt = db.prepare(`
    SELECT * FROM system_prompts
    WHERE user_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(userId) as SystemPrompt[];
}

/**
 * Получить активный системный промпт пользователя
 */
export function getActiveSystemPrompt(userId: number): SystemPrompt | null {
  const stmt = db.prepare(`
    SELECT * FROM system_prompts
    WHERE user_id = ? AND is_active = 1
    LIMIT 1
  `);
  return stmt.get(userId) as SystemPrompt | null;
}

/**
 * Получить системный промпт по ID
 */
export function getSystemPromptById(id: number): SystemPrompt | null {
  const stmt = db.prepare(`
    SELECT * FROM system_prompts
    WHERE id = ?
  `);
  return stmt.get(id) as SystemPrompt | null;
}

/**
 * Создать системный промпт
 */
export function createSystemPrompt(userId: number, data: CreateSystemPromptData): number {
  const stmt = db.prepare(`
    INSERT INTO system_prompts (user_id, name, description, prompt_text, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  const result = stmt.run(
    data.user_id,
    data.name,
    data.description || null,
    data.prompt_text,
    data.is_active || 0
  );
  
  return result.lastInsertRowid as number;
}

/**
 * Обновить системный промпт
 */
export function updateSystemPrompt(id: number, data: UpdateSystemPromptData): void {
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.prompt_text !== undefined) {
    updates.push('prompt_text = ?');
    values.push(data.prompt_text);
  }
  if (data.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(data.is_active);
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    values.push(id);

    const stmt = db.prepare(`
      UPDATE system_prompts
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    stmt.run(...values);
  }
}

/**
 * Удалить системный промпт
 */
export function deleteSystemPrompt(id: number): void {
  const stmt = db.prepare(`
    DELETE FROM system_prompts
    WHERE id = ?
  `);
  stmt.run(id);
}

/**
 * Активировать системный промпт (и деактивировать остальные у пользователя)
 */
export function activateSystemPrompt(id: number, userId: number): void {
  // Сначала деактивируем все промпты пользователя
  const deactivateStmt = db.prepare(`
    UPDATE system_prompts
    SET is_active = 0, updated_at = datetime('now')
    WHERE user_id = ?
  `);
  deactivateStmt.run(userId);

  // Затем активируем выбранный промпт
  const activateStmt = db.prepare(`
    UPDATE system_prompts
    SET is_active = 1, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `);
  activateStmt.run(id, userId);
}

/**
 * Деактивировать все промпты пользователя
 */
export function deactivateAllUserPrompts(userId: number): void {
  const stmt = db.prepare(`
    UPDATE system_prompts
    SET is_active = 0, updated_at = datetime('now')
    WHERE user_id = ?
  `);
  stmt.run(userId);
}

/**
 * Проверить, принадлежит ли промпт пользователю
 */
export function isPromptOwnedByUser(promptId: number, userId: number): boolean {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM system_prompts
    WHERE id = ? AND user_id = ?
  `);
  const result = stmt.get(promptId, userId) as { count: number };
  return result.count > 0;
}
