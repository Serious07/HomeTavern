import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { userRepository } from '../repositories/user.repository';

const router = Router();

// Применяем authenticate и requireAdmin ко всем роутам админа
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Получение списка всех пользователей (только админ)
 */
router.get('/users', (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = userRepository.getAllUsers();
    
    // Возвращаем пользователей без хешей паролей
    const usersWithoutPassword = users.map(({ password_hash, ...user }) => user);
    res.status(200).json(usersWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users
 * Создание пользователя (только админ)
 * Body: { username: string, email: string, password: string, role?: 'user' | 'admin' }
 */
router.post('/users', (req: Request, res: Response) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    authService.register(username, password, role || 'user')
      .then((result) => {
        res.status(201).json({
          message: 'User created successfully',
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
 * PUT /api/admin/users/:id
 * Обновление пользователя (только админ)
 * Body: { username?: string, email?: string, role?: 'user' | 'admin' }
 */
router.put('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, email, role } = req.body;

    const user = userRepository.updateUser(parseInt(id), { username, email, role });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password_hash, ...userWithoutPassword } = user;
    res.status(200).json({
      message: 'User updated successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Удаление пользователя (только админ)
 */
router.delete('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const deleted = userRepository.deleteUser(parseInt(id));
    
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/stats
 * Получение статистики (только админ)
 */
router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = userRepository.getAllUsers();
    const adminCount = users.filter(u => u.role === 'admin').length;
    const userCount = users.filter(u => u.role === 'user').length;
    
    res.status(200).json({
      totalUsers: users.length,
      admins: adminCount,
      users: userCount,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
