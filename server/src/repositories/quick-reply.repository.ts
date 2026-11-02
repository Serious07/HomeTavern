import db from '../config/database';

export interface QuickReply {
  id: number;
  user_id: number;
  message: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Получить все быстрые ответы пользователя в порядке сортировки
 */
export function getQuickRepliesByUserId(userId: number): QuickReply[] {
  const stmt = db.prepare(`
    SELECT * FROM quick_replies
    WHERE user_id = ?
    ORDER BY sort_order ASC, id ASC
  `);
  return stmt.all(userId) as QuickReply[];
}

/**
 * Полностью заменить список быстрых ответов пользователя (в транзакции).
 * Порядок задаётся индексом массива.
 */
export function replaceQuickReplies(userId: number, messages: string[]): QuickReply[] {
  const deleteStmt = db.prepare('DELETE FROM quick_replies WHERE user_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO quick_replies (user_id, message, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `);

  const runInTransaction = db.transaction((msgs: string[]) => {
    deleteStmt.run(userId);
    msgs.forEach((message, index) => {
      insertStmt.run(userId, message, index);
    });
  });

  runInTransaction(messages);
  return getQuickRepliesByUserId(userId);
}
