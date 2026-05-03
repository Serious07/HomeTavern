import db from '../config/database';

export interface ChatBlock {
  id: number;
  chat_id: number;
  title: string;
  summary: string;
  summary_translation: string | null;  // Перевод summary на другой язык
  title_translation: string | null;    // Перевод заголовка
  summary_translation_hash: string | null;  // Хэш для кэширования перевода
  original_message_ids: string;  // JSON string: "[1, 2, 3]"
  start_message_id: number | null;
  end_message_id: number | null;
  is_compressed: number;  // 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateChatBlockParams {
  chat_id: number;
  title: string;
  summary: string;
  summary_translation?: string | null;  // Перевод summary на другой язык
  title_translation?: string | null;    // Перевод заголовка
  summary_translation_hash?: string | null;  // Хэш для кэширования перевода
  original_message_ids: number[];  // Array of message IDs
  start_message_id?: number | null;
  end_message_id?: number | null;
  sort_order: number;
}

export interface UpdateChatBlockParams {
  title?: string;
  summary?: string;
  summary_translation?: string | null;  // Перевод summary на другой язык
  title_translation?: string | null;    // Перевод заголовка
  summary_translation_hash?: string | null;
  is_compressed?: number;
  sort_order?: number;
}

export class ChatBlockRepository {
  /**
   * Получение всех блоков для чата
   */
  getBlocksByChatId(chatId: number): ChatBlock[] {
    const stmt = db.prepare(`
      SELECT * FROM chat_blocks
      WHERE chat_id = ?
      ORDER BY sort_order ASC
    `);
    return stmt.all(chatId) as ChatBlock[];
  }

  /**
   * Получение блока по ID
   */
  getBlockById(id: number): ChatBlock | undefined {
    const stmt = db.prepare(`
      SELECT * FROM chat_blocks
      WHERE id = ?
    `);
    return stmt.get(id) as ChatBlock | undefined;
  }

  /**
   * Создание блока
   */
  createBlock(params: CreateChatBlockParams): ChatBlock {
    const { chat_id, title, summary, summary_translation, title_translation, summary_translation_hash, original_message_ids, start_message_id, end_message_id, sort_order } = params;
    
    const stmt = db.prepare(`
      INSERT INTO chat_blocks (chat_id, title, summary, summary_translation, title_translation, summary_translation_hash, original_message_ids, start_message_id, end_message_id, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(
      chat_id,
      title,
      summary,
      summary_translation || null,
      title_translation || null,
      summary_translation_hash || null,
      JSON.stringify(original_message_ids),
      start_message_id || null,
      end_message_id || null,
      sort_order
    );

    return this.getBlockById(result.lastInsertRowid as number)!;
  }

  /**
   * Обновление блока
   */
  updateBlock(id: number, params: UpdateChatBlockParams): ChatBlock | undefined {
    const { title, summary, summary_translation, title_translation, summary_translation_hash, is_compressed, sort_order } = params;
    
    console.log('[ChatBlockRepo] updateBlock called with id:', id, 'params:', JSON.stringify(params));
    
    // Helper: преобразуем undefined и пустые строки в null для COALESCE
    const coalesce = (value: any, fallback: any) => {
      if (value === undefined || value === null || value === '') {
        return fallback;
      }
      return value;
    };
    
    const newTitle = coalesce(title, null);
    const newSummary = coalesce(summary, null);
    const newSummaryTranslation = coalesce(summary_translation, null);
    const newTitleTranslation = coalesce(title_translation, null);
    const newSummaryTranslationHash = coalesce(summary_translation_hash, null);
    const newIsCompressed = coalesce(is_compressed, null);
    const newSortOrder = coalesce(sort_order, null);
    
    console.log('[ChatBlockRepo] coalesced values - title:', JSON.stringify(newTitle), 'summary:', JSON.stringify(newSummary));
    
    const setClauses: string[] = [];
    const values: any[] = [];
    
    if (newTitle !== null) {
      setClauses.push('title = ?');
      values.push(newTitle);
    }
    if (newSummary !== null) {
      setClauses.push('summary = ?');
      values.push(newSummary);
    }
    if (newSummaryTranslation !== null) {
      setClauses.push('summary_translation = ?');
      values.push(newSummaryTranslation);
    }
    if (newTitleTranslation !== null) {
      setClauses.push('title_translation = ?');
      values.push(newTitleTranslation);
    }
    if (newSummaryTranslationHash !== null) {
      setClauses.push('summary_translation_hash = ?');
      values.push(newSummaryTranslationHash);
    }
    if (newIsCompressed !== null) {
      setClauses.push('is_compressed = ?');
      values.push(newIsCompressed);
    }
    if (newSortOrder !== null) {
      setClauses.push('sort_order = ?');
      values.push(newSortOrder);
    }
    
    // Всегда обновляем updated_at
    setClauses.push('updated_at = CURRENT_TIMESTAMP');
    
    console.log('[ChatBlockRepo] setClauses:', setClauses);
    console.log('[ChatBlockRepo] values before id:', JSON.stringify(values));
    
    if (setClauses.length === 1) {
      // Только updated_at, ничего не обновляем
      const stmt = db.prepare(`
        UPDATE chat_blocks
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      const result = stmt.run(id);
      console.log('[ChatBlockRepo] only updated_at, changes:', result.changes);
      return this.getBlockById(id);
    }
    
    const sql = `
      UPDATE chat_blocks
      SET ${setClauses.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    console.log('[ChatBlockRepo] SQL:', sql);
    values.push(id);
    console.log('[ChatBlockRepo] final values:', JSON.stringify(values));
    
    const stmt = db.prepare(sql);
    const result = stmt.run(...values);
    console.log('[ChatBlockRepo] run result, changes:', result.changes);

    const updated = this.getBlockById(id);
    console.log('[ChatBlockRepo] after update, block:', updated ? JSON.stringify({title: updated.title, summary: updated.summary}) : 'not found');
    
    return updated;
  }

  /**
   * Удаление блока
   */
  deleteBlock(id: number): boolean {
    const stmt = db.prepare(`
      DELETE FROM chat_blocks
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Удаление всех блоков для чата
   */
  deleteBlocksByChatId(chatId: number): boolean {
    const stmt = db.prepare(`
      DELETE FROM chat_blocks
      WHERE chat_id = ?
    `);
    const result = stmt.run(chatId);
    return result.changes > 0;
  }

  /**
   * Получение последнего блока для чата (для отката)
   */
  getLastBlock(chatId: number): ChatBlock | undefined {
    const stmt = db.prepare(`
      SELECT * FROM chat_blocks
      WHERE chat_id = ?
      ORDER BY sort_order DESC
      LIMIT 1
    `);
    return stmt.get(chatId) as ChatBlock | undefined;
  }

  /**
   * Получение максимального sort_order для чата
   */
  getMaxSortOrder(chatId: number): number {
    const stmt = db.prepare(`
      SELECT MAX(sort_order) as max_order FROM chat_blocks
      WHERE chat_id = ?
    `);
    const result = stmt.get(chatId) as { max_order: number | null } | undefined;
    return result?.max_order ?? 0;
  }

  /**
   * Получение блоков с start_message_id <= messageId (блоки до указанного сообщения)
   */
  getBlocksBeforeMessage(chatId: number, messageId: number): ChatBlock[] {
    const stmt = db.prepare(`
      SELECT * FROM chat_blocks
      WHERE chat_id = ? AND start_message_id <= ?
      ORDER BY sort_order ASC
    `);
    return stmt.all(chatId, messageId) as ChatBlock[];
  }

  /**
   * Проверка, входит ли сообщение в какой-либо блок
   */
  getBlockForMessage(chatId: number, messageId: number): ChatBlock | undefined {
    const stmt = db.prepare(`
      SELECT * FROM chat_blocks
      WHERE chat_id = ? AND ? IN (
        SELECT CAST(value AS INTEGER) FROM json_each(original_message_ids)
      )
      LIMIT 1
    `);
    return stmt.get(chatId, messageId) as ChatBlock | undefined;
  }
}

export const chatBlockRepository = new ChatBlockRepository();
