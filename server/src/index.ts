import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from server/.env BEFORE any other imports
const envPath = path.join(__dirname, '..', '.env');
console.log('[DEBUG] Loading .env from:', envPath);
dotenv.config({ path: envPath });
console.log('[DEBUG] LLM_BASE_URL:', process.env.LLM_BASE_URL);
console.log('[DEBUG] LLM_MODEL:', process.env.LLM_MODEL);

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { userRepository } from './repositories/user.repository';
import { authService } from './services/auth.service';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import characterRoutes from './routes/characters';
import chatRoutes from './routes/chats';
import messageRoutes from './routes/messages';
import heroRoutes from './routes/hero';
import contextRoutes from './routes/context';

const app: Application = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Middleware
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',')
}));

// Увеличиваем лимит размера тела запроса до 100MB для поддержки загрузки аватарок
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'HomeTavern V5 Server is running' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Character routes
app.use('/api/characters', characterRoutes);

// Chat routes
app.use('/api/chats', chatRoutes);

// Message routes
app.use('/api', messageRoutes);

// Hero routes
app.use('/api/hero', heroRoutes);

// Context routes (token usage tracking)
app.use('/api/context', contextRoutes);

// Автоматическое создание администратора при первом запуске
const initializeAdminUser = async () => {
  try {
    const allUsers = userRepository.getAllUsers();
    
    if (allUsers.length === 0) {
      // Создаем первого администратора
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      
      const admin = await authService.createAdmin(adminUsername, adminPassword);
      
      console.log('='.repeat(50));
      console.log('Первый администратор создан автоматически:');
      console.log(`  Логин: ${admin.username}`);
      console.log(`  Пароль: ${adminPassword}`);
      console.log('='.repeat(50));
    } else {
      const adminCount = allUsers.filter(u => u.role === 'admin').length;
      console.log(`В системе уже есть ${adminCount} администратор(ов)`);
    }
  } catch (error) {
    console.error('Ошибка при создании администратора:', error);
  }
};

// Start server
const HOST = '0.0.0.0';

app.listen(PORT, HOST, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Server is also accessible on LAN:`);
  console.log(`  - http://127.0.0.1:${PORT}`);
  console.log(`  - Use your machine's IP address from other devices on the network`);
  
  // Инициализация администратора после запуска сервера
  await initializeAdminUser();
});
