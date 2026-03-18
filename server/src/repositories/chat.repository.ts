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

    return {
      ...chat,
      messages
    };
  }
}

export const chatRepository = new ChatRepository();
