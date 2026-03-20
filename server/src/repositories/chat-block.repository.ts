import db from '../config/database';

export interface ChatBlock {
  id: number;
  chat_id: number;
  title: string;
  summary: string;
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
  summary_translation_hash?: string | null;  // Хэш для кэширования перевода
  original_message_ids: number[];  // Array of message IDs
  start_message_id?: number | null;
  end_message_id?: number | null;
  sort_order: number;
}

export interface UpdateChatBlockParams {
  title?: string;
  summary?: string;
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
    const { chat_id, title, summary, summary_translation_hash, original_message_ids, start_message_id, end_message_id, sort_order } = params;
    
    const stmt = db.prepare(`
      INSERT INTO chat_blocks (chat_id, title, summary, summary_translation_hash, original_message_ids, start_message_id, end_message_id, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    const result = stmt.run(
      chat_id,
      title,
      summary,
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
    const { title, summary, summary_translation_hash, is_compressed, sort_order } = params;
    
    const stmt = db.prepare(`
      UPDATE chat_blocks
      SET title = COALESCE(?, title),
          summary = COALESCE(?, summary),
          summary_translation_hash = COALESCE(?, summary_translation_hash),
          is_compressed = COALESCE(?, is_compressed),
          sort_order = COALESCE(?, sort_order),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      title || null,
      summary || null,
      summary_translation_hash !== undefined ? summary_translation_hash : null,
      is_compressed !== undefined ? is_compressed : null,
      sort_order !== undefined ? sort_order : null,
      id
    );

    return this.getBlockById(id);
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
