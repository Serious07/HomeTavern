import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, CreateUserInput, LoginInput, LoginResponse, AuthPayload, UserRole } from '../types';
import { userRepository } from '../repositories/user.repository';

export interface AuthError extends Error {
  statusCode: number;
}

export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly JWT_EXPIRES_IN = '7d';

  private get JWT_SECRET(): string {
    return process.env.JWT_SECRET || 'default-secret';
  }

  /**
   * Регистрация нового пользователя
   * @param username - Имя пользователя
   * @param password - Пароль
   * @param role - Роль пользователя (по умолчанию 'user')
   * @returns Promise с токеном и данными пользователя
   */
  async register(username: string, password: string, role: UserRole = 'user'): Promise<LoginResponse> {
    // Проверка уникальности имени
    const existingUser = userRepository.findUserByUsername(username);
    if (existingUser) {
      const error = new Error('Имя пользователя уже занято') as AuthError;
      error.statusCode = 409;
      throw error;
    }

    // Хеширование пароля
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Создание пользователя
    const user = userRepository.createUser(username, passwordHash, role);

    // Генерация токена
    const token = this.generateToken(user.id, user.username, user.role);

    // Возврат токена и данных пользователя (без хеша пароля)
    const { password_hash, ...userWithoutPassword } = user;
    return {
      token,
      user: userWithoutPassword,
    };
  }

  /**
   * Вход пользователя
   * @param username - Имя пользователя
   * @param password - Пароль
   * @returns Promise с токеном и данными пользователя
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    // Поиск пользователя
    const user = userRepository.findUserByUsername(username);
    if (!user) {
      const error = new Error('Неверное имя пользователя или пароль') as AuthError;
      error.statusCode = 401;
      throw error;
    }

    // Проверка пароля
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const error = new Error('Неверное имя пользователя или пароль') as AuthError;
      error.statusCode = 401;
      throw error;
    }

    // Генерация токена
    const token = this.generateToken(user.id, user.username, user.role);

    // Возврат токена и данных пользователя
    const { password_hash, ...userWithoutPassword } = user;
    return {
      token,
      user: userWithoutPassword,
    };
  }

  /**
   * Создание JWT токена
   * @param userId - ID пользователя
   * @param username - Имя пользователя
   * @param role - Роль пользователя
   * @returns JWT токен
   */
  generateToken(userId: number, username: string, role: UserRole): string {
    const payload: AuthPayload = {
      userId,
      username,
      role,
    };
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
    });
  }

  /**
   * Проверка JWT токена
   * @param token - Токен для проверки
   * @returns Декодированные данные токена
   */
  verifyToken(token: string): AuthPayload {
    return jwt.verify(token, this.JWT_SECRET) as AuthPayload;
  }

  /**
   * Создание администратора
   * @param username - Имя пользователя
   * @param password - Пароль
   * @returns Promise с данными созданного администратора
   */
  async createAdmin(username: string, password: string): Promise<Omit<User, 'password_hash'>> {
    // Проверка уникальности имени
    const existingUser = userRepository.findUserByUsername(username);
    if (existingUser) {
      return {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        role: existingUser.role,
        created_at: existingUser.created_at,
        updated_at: existingUser.updated_at,
      };
    }

    // Хеширование пароля
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Создание администратора
    const user = userRepository.createUser(username, passwordHash, 'admin');

    // Возврат данных администратора (без хеша пароля)
    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Смена пароля пользователем
   * @param userId - ID пользователя
   * @param oldPassword - Старый пароль
   * @param newPassword - Новый пароль
   * @returns Promise с результатом операции
   */
  async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<{ message: string }> {
    // Поиск пользователя
    const user = userRepository.findUserById(userId);
    if (!user) {
      const error = new Error('Пользователь не найден') as AuthError;
      error.statusCode = 404;
      throw error;
    }

    // Проверка старого пароля
    const isValidPassword = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValidPassword) {
      const error = new Error('Неверный старый пароль') as AuthError;
      error.statusCode = 401;
      throw error;
    }

    // Проверка длины нового пароля
    if (newPassword.length < 6) {
      const error = new Error('Новый пароль должен быть не менее 6 символов') as AuthError;
      error.statusCode = 400;
      throw error;
    }

    // Хеширование нового пароля
    const newPasswordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    // Обновление пароля в базе данных
    userRepository.updateUserPassword(userId, newPasswordHash);

    return { message: 'Пароль успешно изменен' };
  }
}

export const authService = new AuthService();
