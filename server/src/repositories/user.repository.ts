import db from '../config/database';
import { User, CreateUserInput, UserRole } from '../types';

export const userRepository = {
  /**
   * Получить всех пользователей
   */
  getAllUsers: (): User[] => {
    const stmt = db.prepare('SELECT * FROM users');
    return stmt.all() as User[];
  },

  /**
   * Найти пользователя по ID
   */
  findUserById: (id: number): User | undefined => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | undefined;
  },

  /**
   * Найти пользователя по имени
   */
  findUserByUsername: (username: string): User | undefined => {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | undefined;
  },

  /**
   * Найти пользователя по email
   */
  findUserByEmail: (email: string): User | undefined => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as User | undefined;
  },

  /**
   * Создать нового пользователя
   */
  createUser: (username: string, passwordHash: string, role: UserRole = 'user'): User => {
    const email = `${username}@example.com`; // Генерируем email по умолчанию
    const stmt = db.prepare(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(username, email, passwordHash, role);
    return {
      id: Number(result.lastInsertRowid),
      username,
      email,
      password_hash: passwordHash,
      role,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },

  /**
   * Обновить данные пользователя
   */
  updateUser: (id: number, updates: { username?: string; email?: string; role?: UserRole }): User | undefined => {
    const existingUser = userRepository.findUserById(id);
    if (!existingUser) {
      return undefined;
    }

    const { username = existingUser.username, email = existingUser.email, role = existingUser.role } = updates;
    
    const stmt = db.prepare(
      'UPDATE users SET username = ?, email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(username, email, role, id);
    return userRepository.findUserById(id);
  },

  /**
   * Удалить пользователя
   */
  deleteUser: (id: number): boolean => {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },
};
