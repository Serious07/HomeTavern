# HomeTavern V5

AI-powered role-playing companion application. Создавайте персонажей, ведите диалоги с ИИ и погружайтесь в увлекательные ролевые приключения.

## Tech Stack

### Backend
- **Node.js** + **Express.js** - Web framework
- **SQLite** + **better-sqlite3** - Database
- **TypeScript** - Type-safe JavaScript
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **cors** - Cross-Origin Resource Sharing

### Frontend
- **React 18** - UI library
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first CSS
- **Vite** - Build tool
- **Axios** - HTTP client
- **TypeScript** - Type-safe JavaScript

### Integrations
- **llama.cpp** - Local LLM inference server
- **OpenAI-compatible API** - LLM communication

## Project Structure

```
hometavern-v5/
├── server/                 # Backend server
│   ├── src/
│   │   ├── config/        # Database configuration
│   │   ├── middleware/    # Express middleware
│   │   ├── routes/        # API routes
│   │   ├── repositories/  # Data access layer
│   │   ├── services/      # Business logic
│   │   ├── types/         # TypeScript types
│   │   └── index.ts       # Server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
├── client/                 # Frontend client
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   ├── store/         # State management
│   │   ├── utils/         # Utility functions
│   │   ├── App.tsx        # Root component
│   │   └── main.tsx       # Entry point
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vite.config.ts
├── llm-client/            # LLM client library
├── translation-library/   # Translation library
├── plans/                 # Project planning docs
├── package.json           # Root package with scripts
└── README.md
```

## Prerequisites

- **Node.js** 18+ (рекомендуется 20+)
- **npm** 9+
- **llama.cpp** с поддержкой OpenAI-compatible API (порт 1234)

## Installation

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd hometavern-v5
```

### 2. Установка зависимостей сервера

```bash
cd server
npm install
```

### 3. Установка зависимостей клиента

```bash
cd ../client
npm install
```

### 4. Установка корневых зависимостей

```bash
cd ..
npm install
```

## Настройка переменных окружения

### Серверные переменные (.env в server/)

Скопируйте `.env.example` в `.env` и настройте значения:

```bash
cd server
cp .env.example .env
```

**Обязательные переменные:**

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `PORT` | 4000 | Порт сервера |
| `NODE_ENV` | development | Окружение (development/production) |
| `DATABASE_PATH` | ./hometavern.db | Путь к базе данных SQLite |
| `JWT_SECRET` | (сгенерировать) | Секретный ключ для JWT |
| `JWT_EXPIRES_IN` | 7d | Срок действия токена |
| `CORS_ORIGIN` | http://localhost:5173 | Разрешённый origin для CORS |
| `LLM_BASE_URL` | http://localhost:1234/v1 | URL llama.cpp сервера |
| `LLM_MODEL` | qwen-3.5 | Название модели LLM |

**Генерация JWT_SECRET:**

```bash
# Используя Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Или используя OpenSSL
openssl rand -hex 32
```

## Настройка llama.cpp

### Запуск llama.cpp с OpenAI-compatible API

```bash
# Пример запуска с моделью Qwen
./llama-server --model ./models/qwen-3.5.gguf \
  --port 1234 \
  --host 127.0.0.1 \
  --n-ctx 4096 \
  --n-thread 8 \
  --api-key local-model-key
```

**Параметры:**
- `--model`: Путь к файлу модели в формате GGUF
- `--port`: Порт для API (должен быть 1234)
- `--host`: Хост для прослушивания (127.0.0.1 для локального доступа)
- `--n-ctx`: Размер контекстного окна (4096+ для сложных диалогов)
- `--n-thread`: Количество потоков CPU

### Проверка работы API

```bash
# Проверка здоровья сервера
curl http://localhost:1234/v1/health

# Получение списка моделей
curl http://localhost:1234/v1/models

# Тестовый запрос
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-3.5",
    "messages": [{"role": "user", "content": "Привет!"}]
  }'
```

## Запуск проекта

### Быстрый старт (рекомендуется)

Запуск сервера и клиента одновременно:

```bash
npm run dev
```

### Отдельный запуск

**Сервер:**
```bash
npm run server
# или
cd server && npm run dev
```

**Клиент:**
```bash
npm run client
# или
cd client && npm run dev
```

### Сборка для production

```bash
# Сборка сервера
npm run build:server

# Сборка клиента
npm run build:client

# Запуск production сервера
npm start
```

## API Endpoints

### Authentication

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/register` | Регистрация нового пользователя |
| POST | `/api/auth/login` | Вход в систему |
| GET | `/api/auth/me` | Получение текущего пользователя |
| POST | `/api/auth/logout` | Выход из системы |

### Characters

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/characters` | Список персонажей |
| GET | `/api/characters/:id` | Получение персонажа |
| POST | `/api/characters` | Создание персонажа |
| PUT | `/api/characters/:id` | Обновление персонажа |
| DELETE | `/api/characters/:id` | Удаление персонажа |

### Chats

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/chats` | Список чатов |
| GET | `/api/chats/:id` | Получение чата |
| POST | `/api/chats` | Создание чата |
| PUT | `/api/chats/:id` | Обновление чата |
| DELETE | `/api/chats/:id` | Удаление чата |

### Messages

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/messages` | Список сообщений |
| GET | `/api/messages/:id` | Получение сообщения |
| POST | `/api/messages` | Создание сообщения |
| PUT | `/api/messages/:id` | Обновление сообщения |
| DELETE | `/api/messages/:id` | Удаление сообщения |

### Hero

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/hero` | Получение героя |
| PUT | `/api/hero` | Обновление героя |

### Settings

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/settings` | Получение настроек |
| PUT | `/api/settings` | Обновление настроек |

### Admin

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/users` | Список пользователей |
| DELETE | `/api/admin/users/:id` | Удаление пользователя |
| GET | `/api/admin/stats` | Статистика системы |

## Использование приложения

### 1. Регистрация и вход

1. Откройте браузер и перейдите на `http://localhost:3000`
2. Нажмите "Регистрация" и создайте учётную запись
3. Войдите в систему с помощью логина и пароля

### 2. Создание персонажа

1. Перейдите на страницу "Персонажи"
2. Нажмите "Создать персонажа"
3. Заполните информацию:
   - Имя персонажа
   - Описание (внешность, характер, история)
   - Сценарий (контекст для диалогов)
4. Сохраните персонажа

### 3. Создание чата

1. Перейдите на страницу "Чаты"
2. Нажмите "Создать чат"
3. Выберите персонажа для диалога
4. Дайте чату название

### 4. Диалог с персонажем

1. Откройте чат
2. Отправьте сообщение
3. Получите ответ от ИИ на основе персонажа
4. Продолжайте диалог в ролевом стиле

## Troubleshooting

### Сервер не запускается

- Проверьте, что порт 4000 свободен
- Убедитесь, что `.env` файл существует в папке `server/`
- Проверьте пути к базе данных

### Клиент не подключается к серверу

- Убедитесь, что сервер запущен на порту 4000
- Проверьте настройки proxy в `vite.config.ts`
- Проверьте CORS настройки в `.env`

### LLM не отвечает

- Убедитесь, что llama.cpp запущен на порту 1234
- Проверьте `LLM_BASE_URL` в `.env`
- Выполните тестовый запрос через curl

## License

MIT
