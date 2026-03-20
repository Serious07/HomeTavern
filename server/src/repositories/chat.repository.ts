import db from '../config/database';

export interface Chat {
  id: number;
  user_id: number;
  character_id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}

export interface Message {
  id: number;
  chat_id: number;
  role: string;
  content: string;
  translated_content: string | null;
  message_id: string | null;
  hidden: number;
  created_at: string;
  generated_at?: string | null;
  tokens_per_sec?: number | null;
  total_tokens?: number | null;
  generation_duration?: number | null;  // Время генерации в секундах (вычисляется на сервере)
}

export interface CreateChatParams {
  user_id: number;
  character_id: number;
  title?: string;
}

export interface UpdateChatParams {
  title?: string;
  character_id?: number;
}

export class ChatRepository {
  /**
   * Получение всех чатов пользователя
   */
  getChatsByUserId(userId: number): Chat[] {
    const stmt = db.prepare(`
      SELECT * FROM chats
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);
    return stmt.all(userId) as Chat[];
  }

  /**
   * Получение чата по ID
   */
  getChatById(id: number): Chat | undefined {
    const stmt = db.prepare(`
      SELECT * FROM chats
      WHERE id = ?
    `);
    return stmt.get(id) as Chat | undefined;
  }

  /**
   * Создание чата
   */
  createChat(userId: number, characterId: number, title?: string): Chat {
    const stmt = db.prepare(`
      INSERT INTO chats (user_id, character_id, title)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(userId, characterId, title || null);
    return this.getChatById(result.lastInsertRowid as number)!;
  }

  /**
   * Обновление чата
   */
  updateChat(id: number, updates: UpdateChatParams): Chat | undefined {
    const { title, character_id } = updates;
    
    const stmt = db.prepare(`
      UPDATE chats
      SET title = COALESCE(?, title),
          character_id = COALESCE(?, character_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(title || null, character_id || null, id);
    
    return this.getChatById(id);
  }

  /**
   * Обновление updated_at чата
   */
  updateChatUpdatedAt(id: number): boolean {
    const stmt = db.prepare(`
      UPDATE chats
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Удаление чата
   */
  deleteChat(id: number): boolean {
    const stmt = db.prepare(`
      DELETE FROM chats
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
    * Получение чата с сообщениями
    */
  getChatWithMessages(id: number): ChatWithMessages | undefined {
    const chat = this.getChatById(id);
    if (!chat) return undefined;

    const messagesStmt = db.prepare(`
      SELECT * FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC
    `);
    const messages = messagesStmt.all(id) as Message[];

    // Вычисляем generation_duration для каждого сообщения assistant
    const messagesWithDuration = messages.map(msg => {
      if (msg.role === 'assistant') {
        // Проверяем, есть ли метрики генерации
        if (msg.generated_at && msg.created_at) {
          try {
            const created = new Date(msg.created_at).getTime();
            const generated = new Date(msg.generated_at).getTime();
            const duration = (generated - created) / 1000;  // В секундах
            console.log(`[ChatRepository] Message ${msg.id}: created_at=${msg.created_at}, generated_at=${msg.generated_at}, duration=${duration}s, tokens_per_sec=${msg.tokens_per_sec}`);
            const result = {
              ...msg,
              generation_duration: duration > 0 ? duration : null
            };
            console.log(`[ChatRepository] Message ${msg.id} result:`, { generation_duration: result.generation_duration });
            return result;
          } catch (e) {
            console.error(`[ChatRepository] Error calculating duration for message ${msg.id}:`, e);
            // Если ошибка парсинга даты, возвращаем сообщение без duration
            return msg;
          }
        } else {
          // Если generated_at или created_at нет, но есть tokens_per_sec, значит это сообщение с метриками
          // Но без generated_at - вычисляем duration как 0 или null
          if (msg.tokens_per_sec !== null && msg.tokens_per_sec !== undefined) {
            console.log(`[ChatRepository] Message ${msg.id}: has metrics but missing dates - generated_at=${msg.generated_at}, created_at=${msg.created_at}`);
          }
        }
      }
      return msg;
    });

    return {
      ...chat,
      messages: messagesWithDuration
    };
  }
}

export const chatRepository = new ChatRepository();
