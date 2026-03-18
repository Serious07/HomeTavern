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
}

export interface CreateMessageParams {
  chat_id: number;
  role: string;
  content: string;
  translated_content?: string;
  message_id?: string;
}

export interface UpdateMessageParams {
  role?: string;
  content?: string;
  translated_content?: string;
  message_id?: string;
  hidden?: number;
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
    messageId?: string
  ): Message {
    const stmt = db.prepare(`
      INSERT INTO messages (chat_id, role, content, translated_content, message_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(chatId, role, content, translatedContent || null, messageId || null);
    return this.getMessageById(result.lastInsertRowid as number)!;
  }

  /**
   * Обновление сообщения
   */
  updateMessage(id: number, updates: UpdateMessageParams): Message | undefined {
    const { role, content, translated_content, message_id, hidden } = updates;

    const stmt = db.prepare(`
      UPDATE messages
      SET role = COALESCE(?, role),
          content = COALESCE(?, content),
          translated_content = COALESCE(?, translated_content),
          message_id = COALESCE(?, message_id),
          hidden = COALESCE(?, hidden)
      WHERE id = ?
    `);
    stmt.run(
      role || null,
      content || null,
      translated_content !== undefined ? translated_content : null,
      message_id || null,
      hidden !== undefined ? hidden : null,
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
