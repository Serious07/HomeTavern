/**
 * Context Repository - Работа с кэшированными данными о токенах в БД
 * 
 * Таблица chats имеет следующие поля для кэширования:
 * - context_tokens_used: INTEGER - количество использованных токенов
 * - context_last_synced: DATETIME - время последней синхронизации
 */

import db from '../config/database';

export interface ContextCache {
  chat_id: number;
  context_tokens_used: number;
  context_last_synced: string;
}

export class ContextRepository {
  /**
   * Получение кэшированных данных о токенах для чата
   */
  getCachedStats(chatId: number): ContextCache | undefined {
    const stmt = db.prepare(`
      SELECT 
        id as chat_id,
        context_tokens_used,
        context_last_synced
      FROM chats
      WHERE id = ?
        AND context_tokens_used IS NOT NULL
        AND context_last_synced IS NOT NULL
    `);
    return stmt.get(chatId) as ContextCache | undefined;
  }

  /**
   * Обновление кэшированных данных о токенах для чата
   */
  updateCachedStats(chatId: number, tokensUsed: number, syncedAt: string): boolean {
    const stmt = db.prepare(`
      UPDATE chats
      SET 
        context_tokens_used = ?,
        context_last_synced = ?
      WHERE id = ?
    `);
    const result = stmt.run(tokensUsed, syncedAt, chatId);
    return result.changes > 0;
  }

  /**
   * Инициализация полей токенов для чата (если еще не инициализированы)
   */
  initializeChat(chatId: number): boolean {
    const stmt = db.prepare(`
      UPDATE chats
      SET 
        context_tokens_used = COALESCE(context_tokens_used, 0),
        context_last_synced = COALESCE(context_last_synced, CURRENT_TIMESTAMP)
      WHERE id = ?
        AND (context_tokens_used IS NULL OR context_last_synced IS NULL)
    `);
    const result = stmt.run(chatId);
    return result.changes > 0;
  }

  /**
   * Сброс кэша для чата (для принудительной синхронизации)
   */
  resetCache(chatId: number): boolean {
    const stmt = db.prepare(`
      UPDATE chats
      SET 
        context_tokens_used = NULL,
        context_last_synced = NULL
      WHERE id = ?
    `);
    const result = stmt.run(chatId);
    return result.changes > 0;
  }

  /**
   * Получение всех чатов с кэшированными данными о токенах
   */
  getAllCachedStats(): ContextCache[] {
    const stmt = db.prepare(`
      SELECT 
        id as chat_id,
        context_tokens_used,
        context_last_synced
      FROM chats
      WHERE context_tokens_used IS NOT NULL
        AND context_last_synced IS NOT NULL
      ORDER BY context_last_synced DESC
    `);
    return stmt.all() as ContextCache[];
  }

  /**
   * Обновление токенов для всех чатов (пакетная синхронизация)
   */
  bulkUpdateStats(updates: { chatId: number; tokens: number }[]): boolean {
    if (updates.length === 0) return false;

    const now = new Date().toISOString();
    let successCount = 0;

    const stmt = db.prepare(`
      UPDATE chats
      SET 
        context_tokens_used = ?,
        context_last_synced = ?
      WHERE id = ?
    `);

    try {
      db.transaction(() => {
        for (const update of updates) {
          const result = stmt.run(update.tokens, now, update.chatId);
          if (result.changes > 0) {
            successCount++;
          }
        }
      })();
    } catch (error) {
      console.error('[ContextRepository] Bulk update failed:', error);
      return false;
    }

    return successCount === updates.length;
  }
}

export const contextRepository = new ContextRepository();
