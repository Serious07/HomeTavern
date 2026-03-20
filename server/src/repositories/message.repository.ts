import db from '../config/database';

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
}

export interface CreateMessageParams {
  chat_id: number;
  role: string;
  content: string;
  translated_content?: string;
  message_id?: string;
  created_at?: string;  // ISO 8601 UTC формат
}

export interface UpdateMessageParams {
  role?: string;
  content?: string;
  translated_content?: string;
  message_id?: string;
  hidden?: number;
  generated_at?: string;
  tokens_per_sec?: number;
  total_tokens?: number;
}

export class MessageRepository {
  /**
   * Получение всех сообщений чата
   */
  getMessagesByChatId(chatId: number): Message[] {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(chatId) as Message[];
  }

  /**
   * Получение сообщения по ID
   */
  getMessageById(id: number): Message | undefined {
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE id = ?
    `);
    return stmt.get(id) as Message | undefined;
  }

  /**
   * Создание сообщения
   */
  createMessage(
    chatId: number,
    role: string,
    content: string,
    translatedContent?: string,
    messageId?: string,
    createdAt?: string  // Явно передаем created_at в формате ISO 8601 UTC
  ): Message {
    const stmt = db.prepare(`
      INSERT INTO messages (chat_id, role, content, translated_content, message_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const createdAtUTC = createdAt || new Date().toISOString();
    const result = stmt.run(chatId, role, content, translatedContent || null, messageId || null, createdAtUTC);
    return this.getMessageById(result.lastInsertRowid as number)!;
  }

  /**
 * Обновление сообщения
 */
  updateMessage(id: number, updates: UpdateMessageParams): Message | undefined {
    const { role, content, translated_content, message_id, hidden, generated_at, tokens_per_sec, total_tokens } = updates;

    const stmt = db.prepare(`
      UPDATE messages
      SET role = COALESCE(?, role),
          content = COALESCE(?, content),
          translated_content = COALESCE(?, translated_content),
          message_id = COALESCE(?, message_id),
          hidden = COALESCE(?, hidden),
          generated_at = COALESCE(?, generated_at),
          tokens_per_sec = COALESCE(?, tokens_per_sec),
          total_tokens = COALESCE(?, total_tokens)
      WHERE id = ?
    `);
    stmt.run(
      role || null,
      content || null,
      translated_content !== undefined ? translated_content : null,
      message_id || null,
      hidden !== undefined ? hidden : null,
      generated_at !== undefined ? generated_at : null,
      tokens_per_sec !== undefined ? tokens_per_sec : null,
      total_tokens !== undefined ? total_tokens : null,
      id
    );

    return this.getMessageById(id);
  }

  /**
   * Удаление сообщения
   */
  deleteMessage(id: number): boolean {
    const stmt = db.prepare(`
      DELETE FROM messages
      WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Скрытие сообщения
   */
  hideMessage(id: number): Message | undefined {
    return this.updateMessage(id, { hidden: 1 });
  }

  /**
   * Показ сообщения
   */
  showMessage(id: number): Message | undefined {
    return this.updateMessage(id, { hidden: 0 });
  }

  /**
   * Обновление перевода сообщения
   */
  updateTranslatedMessage(id: number, translatedContent: string): Message | undefined {
    return this.updateMessage(id, { translated_content: translatedContent });
  }

  /**
   * Перевод сообщения на русский язык
   */
  translateMessage(id: number, translateFn: (text: string) => Promise<string>): Promise<Message | undefined> {
    const message = this.getMessageById(id);
    if (!message) {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve, reject) => {
      translateFn(message.content)
        .then((translatedText) => {
          resolve(this.updateMessage(id, { translated_content: translatedText }));
        })
        .catch(reject);
    });
  }
}

export const messageRepository = new MessageRepository();
