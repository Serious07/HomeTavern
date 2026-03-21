import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { userRepository } from '../repositories/user.repository';

const router = Router();

/**
 * POST /api/auth/register
 * Регистрация нового пользователя
 * Body: { username: string, password: string }
 */
router.post('/register', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    authService.register(username, password)
      .then((result) => {
        res.status(201).json({
          message: 'User registered successfully',
          ...result,
        });
      })
      .catch((error: Error & { statusCode?: number }) => {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
      });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Вход пользователя
 * Body: { username: string, password: string }
 */
router.post('/login', (req: Request, res: Response) => {
  console.log('[Auth Route] Login attempt for:', req.body.username);
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    authService.login(username, password)
      .then((result) => {
        console.log('[Auth Route] Login successful, token length:', result.token?.length);
        console.log('[Auth Route] Response data:', { token: result.token ? 'present' : 'missing', user: result.user });
        res.status(200).json({
          message: 'Login successful',
          ...result,
        });
      })
      .catch((error: Error & { statusCode?: number }) => {
        console.log('[Auth Route] Login error:', error.message);
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
      });
  } catch (error) {
    console.log('[Auth Route] Login exception:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Получение текущего пользователя
 */
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = userRepository.findUserById(req.user!.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Выход пользователя (опционально, т.к. JWT stateless)
 */
router.post('/logout', authenticate, (req: AuthenticatedRequest, res: Response) => {
  // JWT stateless, поэтому просто возвращаем успех
  // В будущем можно добавить blacklist токенов
  res.status(200).json({ message: 'Logout successful' });
});

/**
 * POST /api/auth/change-password
 * Смена пароля пользователем
 * Body: { old_password: string, new_password: string }
 */
router.post('/change-password', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { old_password, new_password } = req.body;
    const userId = req.user!.userId;

    if (!old_password || !new_password) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    authService.changePassword(userId, old_password, new_password)
      .then((result) => {
        res.status(200).json({
          message: result.message,
        });
      })
      .catch((error: Error & { statusCode?: number }) => {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({ error: error.message });
      });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
