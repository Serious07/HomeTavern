import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthPayload, UserRole } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

/**
 * Middleware для проверки JWT токена
 * Ожидает токен в заголовке Authorization: Bearer <token>
 * Или в query параметре token (для SSE)
 */
export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  console.log('[Auth Middleware] Request to:', req.path);
  console.log('[Auth Middleware] Auth headers:', req.headers.authorization ? 'FOUND' : 'MISSING');
  
  try {
    let token: string | undefined;

    // Сначала пробуем получить токен из заголовка
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('[Auth Middleware] Token from Authorization header');
    }

    // Если нет, пробуем получить из query параметра (для SSE)
    if (!token) {
      token = req.query.token as string | undefined;
      if (token) {
        console.log('[Auth Middleware] Token from query parameter');
      }
    }

    if (!token) {
      console.log('[Auth Middleware] No valid auth header or query token - returning 401');
      res.status(401).json({ error: 'Access token is required' });
      return;
    }

    console.log('[Auth Middleware] Token received, length:', token.length);
    console.log('[Auth Middleware] JWT_SECRET from env:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
    const secret = process.env.JWT_SECRET || 'default-secret';
    const decoded = jwt.verify(token, secret) as AuthPayload;
    
    console.log('[Auth Middleware] Token verified for user:', decoded.username);
    req.user = decoded;
    next();
  } catch (error: any) {
    console.log('[Auth Middleware] Token verification failed:', error.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware для проверки роли администратора
 * Должен использоваться после authenticate
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};
