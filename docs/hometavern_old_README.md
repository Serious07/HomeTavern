# HomeTavern

AI-powered role-playing companion application. Создавайте персонажей, ведите диалоги с ИИ и погружайтесь в увлекательные ролевые приключения.

## Tech Stack

### Backend
- **Node.js** + **Express.js** - Web framework
- **SQLite** + **better-sqlite3** - Database
- **TypeScript** - Type-safe JavaScript
- **JWT** - Authentication
- **bcrypt** - Password hashing
- **cors** - Cross-Origin Resource Sharing
- **Server-Sent Events (SSE)** - Real-time streaming of LLM responses

### Frontend
- **React 18** - UI library
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first CSS
- **Vite** - Build tool
- **TypeScript** - Type-safe JavaScript
- **React Context** - State management (AuthContext, EcoModeContext)

### Integrations
- **llama.cpp** - Local LLM inference server with OpenAI-compatible API
- **Translation Library** - Multi-provider translation (Google, LibreTranslate, Yandex) for Russian ↔ English

### Features
- **Automatic Translation** - Messages are automatically translated between Russian and English
- **SSE Streaming** - Real-time streaming of LLM responses with reasoning tokens
- **Context Monitoring** - Real-time token usage tracking with llama.cpp
- **Eco Mode** - Resource optimization for LLM inference
- **Smart History Compression** - Automatically summarizes long conversation histories to save tokens

## Project Structure

```
hometavern-v5/
├── server/                 # Backend server
│   ├── src/
│   │   ├── config/        # Database configuration
│   │   ├── middleware/    # Express middleware (auth, error)
│   │   ├── routes/        # API routes (auth, characters, chats, messages, hero, context, admin, settings, compression)
│   │   ├── repositories/  # Data access layer (user, character, chat, message, hero.variation, context, chat-block)
│   │   ├── services/      # Business logic (auth, character, chat, message, llm, context, translation, compression)
│   │   ├── types/         # TypeScript types
│   │   └── index.ts       # Server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
├── client/                 # Frontend client
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── auth/      # Authentication components
│   │   │   ├── characters/ # Character editor
│   │   │   ├── chat/      # Chat components (MessageList, MessageInput, StreamingResponse, ContextStatsDisplay, ChatBlock, EditBlockModal, SelectionToolbar)
│   │   │   ├── common/    # Reusable UI components (AppHeader)
│   │   │   └── hero/      # Hero profile components
│   │   ├── constants/     # Application constants
│   │   ├── contexts/      # React contexts (AuthContext, EcoModeContext)
│   │   ├── hooks/         # Custom React hooks (useAuth, useContextStats, useCompression)
│   │   ├── pages/         # Page components (CharactersPage, ChatPage, HeroPage, HomePage, LoginPage, RegisterPage, SettingsPage)
│   │   ├── services/      # API services
│   │   ├── store/         # State management
│   │   ├── types/         # TypeScript type definitions (including compression)
│   │   ├── utils/         # Utility functions
│   │   ├── App.tsx        # Root component with routing
│   │   └── main.tsx       # Entry point
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.ts
│   └── tsconfig.json
├── llm-client/            # LLM client library (Node.js)
│   ├── nodejs/
│   │   ├── src/
│   │   │   ├── client.ts  # LLM client implementation
│   │   │   ├── index.ts   # Exports
│   │   │   └── types.ts   # Type definitions
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── README.md
│   ├── ARCHITECTURE.md
│   └── INSTALLATION.md
├── translation-library/   # Translation library (Node.js + Python)
│   ├── nodejs/
│   │   ├── src/translation-library/
│   │   │   ├── index.ts   # Main export
│   │   │   ├── types.ts   # Type definitions
│   │   │   ├── chunker.ts # Text chunking for translation
│   │   │   └── translators/ # Translation providers (Google, LibreTranslate, Yandex)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── python/
│   │   ├── src/translation_library/
│   │   │   ├── __init__.py
│   │   │   ├── core.py    # Core translation logic
│   │   │   ├── types.py   # Type definitions
│   │   │   ├── chunker.py # Text chunking for translation
│   │   │   └── translators/ # Translation providers
│   │   ├── pyproject.toml
│   │   └── README.md
│   ├── README.md
│   └── ARCHITECTURE.md
├── docs/                   # Additional documentation
│   └── README_LLAMA_CPP_SERVER.md
├── plans/                 # Project planning docs
│   ├── architecture.md
│   ├── chat-stats-panel.md
│   ├── markdown-chat-improvement.md
│   └── smart-history-compression.md
├── start.bat              # Quick start script for Windows
├── package.json           # Root package with scripts
└── README.md
```

## Prerequisites

- **Node.js** 18+ (рекомендуется 20+)
- **npm** 9+
- **llama.cpp** с поддержкой OpenAI-compatible API (порт 8080)

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
| `LLM_BASE_URL` | http://localhost:8080/v1 | URL llama.cpp сервера |
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
  --port 8080 \
  --host 127.0.0.1 \
  --n-ctx 8192 \
  --n-thread 8
```

**Важно:** Для Qwen 3.5 с включенным Reasoning необходимо установить `--n-ctx` не менее 8192 токенов. Для ещё более длинных диалогов можно увеличить до 16384 или 32768.

**Параметры:**
- `--model`: Путь к файлу модели в формате GGUF
- `--port`: Порт для API (должен быть 8080)
- `--host`: Хост для прослушивания (127.0.0.1 для локального доступа)
- `--n-ctx`: Размер контекстного окна (8192+ для Qwen 3.5 с Reasoning)
- `--n-thread`: Количество потоков CPU

### Проверка работы API

```bash
# Проверка здоровья сервера
curl http://localhost:8080/health

# Получение списка моделей
curl http://localhost:8080/models

# Тестовый запрос
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-3.5",
    "messages": [{"role": "user", "content": "Привет!"}]
  }'

# Получение информации о контексте (для мониторинга токенов)
curl http://localhost:8080/props
curl http://localhost:8080/slots
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

### Health Check

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/health` | Проверка здоровья сервера |

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
| POST | `/api/characters/import` | Импорт персонажа из SillyTavern формата |

### Chats

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/chats` | Список чатов |
| GET | `/api/chats/:id` | Получение чата |
| POST | `/api/chats` | Создание чата |
| PUT | `/api/chats/:id` | Обновление чата |
| DELETE | `/api/chats/:id` | Удаление чата |
| GET | `/api/chats/:chatId/stream` | SSE поток для генерации ответа (потоковая передача) |
| POST | `/api/chats/generate` | Генерация ответа от LLM с SSE потоком |

### Messages

**Примечание:** Messages API использует вложенный путь `/api/chats/:chatId/messages`

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/chats/:chatId/messages` | Получение сообщений чата |
| POST | `/api/chats/:chatId/messages` | Создание сообщения |
| PUT | `/api/chats/:chatId/messages/:id` | Обновление сообщения |
| DELETE | `/api/chats/:chatId/messages/:id` | Удаление сообщения |
| PUT | `/api/chats/:chatId/messages/:id/hide` | Скрытие сообщения |
| PUT | `/api/chats/:chatId/messages/:id/show` | Показ сообщения |
| POST | `/api/chats/:chatId/messages/:id/translate` | Перевод сообщения на русский язык |

### Hero (Профиль главного героя)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/hero` | Получить все вариации героя |
| GET | `/api/hero/active` | Получить активную вариацию героя |
| GET | `/api/hero/profile` | Получить профиль героя для LLM |
| POST | `/api/hero` | Создать новую вариацию героя |
| PUT | `/api/hero` | Обновить профиль героя (совместимость) |
| PUT | `/api/hero/:id` | Обновить вариацию героя |
| PUT | `/api/hero/:id/activate` | Установить активную вариацию героя |
| DELETE | `/api/hero/:id` | Удалить вариацию героя |

**Описание:**
- **Вариации героя** позволяют создавать несколько профилей главного героя (например, разные персонажи для разных ролевых игр)
- **Активная вариация** используется во всех чатах для контекста LLM
- **Профиль героя** автоматически подставляется в системный промпт персонажей
- Плейсхолдеры `{{user}}`, `{user}` и их варианты в промптах автоматически заменяются на имя активного героя

### Token Usage Tracking (Context Monitoring)

HomeTavern включает встроенный мониторинг использования токенов контекста llama.cpp.

**API Endpoints:**
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/context/stats/:chatId` | Получить статистику токенов для чата |
| POST | `/api/context/sync/:chatId` | Принудительная синхронизация с llama.cpp |
| GET | `/api/context/slots` | Получить список активных слотов |
| GET | `/api/context/props` | Получить настройки контекста сервера |

### Compression (Smart History Compression)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compression/auto` | Автоматически сжать историю чата |
| POST | `/api/compression/select` | Сжать выбранный диапазон сообщений |
| PUT | `/api/compression/block/:id` | Обновить блок (title, summary, is_compressed) |
| DELETE | `/api/compression/block/:id` | Удалить блок сжатия |
| DELETE | `/api/compression/undo/:chatId` | Отменить последнее сжатие |
| GET | `/api/compression/blocks/:chatId` | Получить все блоки сжатия для чата |

### Settings

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/settings` | Получение настроек (не реализовано) |
| PUT | `/api/settings` | Обновление настроек (не реализовано) |

### Admin

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/users` | Список пользователей |
| POST | `/api/admin/users` | Создание пользователя |
| PUT | `/api/admin/users/:id` | Обновление пользователя |
| DELETE | `/api/admin/users/:id` | Удаление пользователя |
| GET | `/api/admin/stats` | Статистика системы |

## Additional Libraries

### llm-client

Библиотека клиента LLM для Node.js, предоставляющая удобный интерфейс для взаимодействия с llama.cpp сервером.

**Функциональность:**
- Поддержка OpenAI-compatible API
- Стриминг ответов с SSE
- Поддержка reasoning tokens
- Типизированные запросы и ответы

**Документация:**
- [`README.md`](llm-client/README.md) - Основное руководство
- [`ARCHITECTURE.md`](llm-client/ARCHITECTURE.md) - Архитектура библиотеки
- [`INSTALLATION.md`](llm-client/INSTALLATION.md) - Инструкция по установке

### translation-library

Мультиплатформенная библиотека перевода с поддержкой Node.js и Python. Поддерживает несколько провайдеров: Google Translate, LibreTranslate, Yandex Translate.

**Функциональность:**
- Автоматическое определение языка
- Перевод между русским и английским
- Чанкинг текста для перевода длинных сообщений
- Поддержка нескольких провайдеров
- Асинхронный режим работы

**Структура:**
- **Node.js версия:** `translation-library/nodejs/`
- **Python версия:** `translation-library/python/`

**Документация:**
- [`README.md`](translation-library/README.md) - Основное руководство
- [`ARCHITECTURE.md`](translation-library/ARCHITECTURE.md) - Архитектура библиотеки

### docs/

Дополнительная документация проекта:
- [`README_LLAMA_CPP_SERVER.md`](docs/README_LLAMA_CPP_SERVER.md) - Подробное руководство по настройке llama.cpp сервера

### start.bat

Windows batch script для быстрого запуска проекта. Запускает сервер и клиент одновременно в отдельных терминалах.

**Использование:**
```bash
start.bat
```

## Использование приложения

### 1. Регистрация и вход

1. Откройте браузер и перейдите на `http://localhost:3000`
2. Нажмите "Регистрация" и создайте учётную запись
3. Войдите в систему с помощью логина и пароля

### 2. Настройка профиля героя (рекомендуется)

1. Перейдите на страницу "Профиль героя" (иконка человека в header)
2. Нажмите "+ Новый профиль"
3. Заполните информацию:
   - **Имя героя** - обязательно, будет использоваться в промптах вместо `{{user}}`
   - **Описание** - возраст, внешность, характер, особенности, история
4. Нажмите "Создать"
5. Создайте несколько вариаций для разных ролевых сценариев
6. Выберите активный профиль кнопкой "Активировать"

**Важно:** Активный профиль героя автоматически используется во всех чатах для:
- Подстановки имени в системные промпты персонажей
- Контекста о вашем персонаже для LLM

### 3. Создание персонажа

1. Перейдите на страницу "Персонажи"
2. Нажмите "Создать персонажа"
3. Заполните информацию:
   - Имя персонажа
   - Описание (внешность, характер, история)
   - Сценарий (контекст для диалогов)
   - **Системный промпт** - используйте `{{user}}` или `{user}` для ссылки на имя героя
4. Сохраните персонажа

### 4. Создание чата

1. Перейдите на страницу "Чаты"
2. Нажмите "Создать чат" (или "Чат" на карточке персонажа)
3. Выберите персонажа для диалога
4. Дайте чату название

### 5. Диалог с персонажем

1. Откройте чат
2. Отправьте сообщение
3. Получите ответ от ИИ на основе персонажа
4. Продолжайте диалог в ролевом стиле

**Примечание:** В сообщениях и промптах плейсхолдеры `{{user}}`, `{user}`, `{{USER}}` автоматически заменяются на имя вашего активного героя.

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

- Убедитесь, что llama.cpp запущен на порту 8080
- Проверьте `LLM_BASE_URL` в `.env` (должно быть `http://localhost:8080/v1`)
- Выполните тестовый запрос через curl: `curl http://localhost:8080/props`

### Ответ обрывается досрочно (Qwen 3.5 с Reasoning)

Если при использовании Qwen 3.5 с включенным Reasoning ответ обрывается:

1. **Увеличьте `--n-ctx` в llama.cpp** до 8192 или больше
2. **Проверьте `max_tokens` в `server/src/services/llm.service.ts`** - должно быть установлено на 999999
3. **Убедитесь, что модель поддерживает указанное контекстное окно**

### Ошибка: "Message too long"

- Увеличьте `--n-ctx` в llama.cpp до 16384 или 32768
- Проверьте размер истории сообщений - возможно, стоит ограничить количество сохраняемых токенов

## Smart History Compression

HomeTavern includes an advanced "Smart History Compression" feature that automatically summarizes long conversation histories to save token usage when approaching context limits.

### How It Works

1. **Automatic Trigger**: When context usage reaches 90% of the available limit, the system automatically compresses the history
2. **Semantic Block Splitting**: The conversation is divided into semantic "chapters" or blocks
3. **Summary Generation**: Each block is summarized by the LLM, creating a concise overview
4. **Translation**: Summaries are translated to English for LLM prompts while displaying Russian versions to users
5. **Flexible Display**: Blocks can be expanded to view original messages or compressed to save tokens

### Features

- **Editable Summaries**: Users can manually edit block titles and summaries
- **Toggle Compression**: Per-block control to use either the summary or original messages in prompts
- **Expand/Collapse**: View original messages within any compressed block
- **Manual Compression**: Select specific message ranges to compress manually
- **Undo Support**: Revert the last compression operation

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/compression/auto` | Automatically compress chat history |
| POST | `/api/compression/select` | Compress selected message range |
| PUT | `/api/compression/block/:id` | Update block (title, summary, is_compressed) |
| DELETE | `/api/compression/block/:id` | Delete a compression block |
| DELETE | `/api/compression/undo/:chatId` | Undo last compression |
| GET | `/api/compression/blocks/:chatId` | Get all compression blocks for a chat |

### Database Schema

New table `chat_blocks` stores compressed history:

```sql
CREATE TABLE chat_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  summary_translation_hash TEXT,  -- Hash for caching translations
  original_message_ids TEXT NOT NULL,  -- JSON array of message IDs
  start_message_id INTEGER,
  end_message_id INTEGER,
  is_compressed INTEGER DEFAULT 1,  -- 0 = use original messages, 1 = use summary
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
```

### Usage in Chat

In the chat interface, compressed blocks appear as styled "chapters" that can be:
- **Expanded** to view original messages
- **Edited** to modify the summary
- **Toggled** to use original messages instead of summary in LLM prompts

## Recent Improvements (2026-03-21)

### Chat Interface Enhancements

1. **Message Scrolling with Animation**
   - When a user sends a message or receives a response from AI, the chat automatically scrolls to the **start** of the new message (not just the end)
   - Smooth scroll animation with fade-in effect for new messages
   - Implemented in [`MessageList.tsx`](client/src/components/chat/MessageList.tsx) and [`ChatPage.tsx`](client/src/pages/ChatPage.tsx)

2. **Mobile Input Modal**
   - On mobile devices, a large modal window opens for message input
   - Textarea with scrolling when content exceeds visible area
   - Smooth transition animation between small input field and modal
   - Implemented in [`MobileMessageInputModal.tsx`](client/src/components/chat/MobileMessageInputModal.tsx)

3. **Fixed Token/sec Calculation for Thinking Mode**
   - When LLM has Thinking/Reasoning mode enabled, tokens generated during reasoning are now included in the calculation
   - Formula: `tokensPerSec = (contentTokens + reasoningTokens) / duration`
   - Fixed in [`server/src/routes/chats.ts`](server/src/routes/chats.ts:161)

4. **Fixed Thinking Toggle During Generation**
   - The "Show/Hide Thinking" button now works correctly during streaming
   - Added `isStreaming` check to prevent state conflicts
   - Implemented in [`StreamingResponse.tsx`](client/src/components/chat/StreamingResponse.tsx:206)

5. **Bidirectional Translation for Messages**
   - Editing a message in Russian automatically updates the English version (and vice versa)
   - User messages: RU = `content` (original), EN = `translated_content` (translation)
   - Assistant messages: EN = `content` (original), RU = `translated_content` (translation)
   - Implemented in [`server/src/routes/messages.ts`](server/src/routes/messages.ts:243) endpoint `PUT /api/chats/:chatId/messages/:id/translate-bidirectional`

6. **Bidirectional Translation for Compression Blocks**
   - Added language switch button to view compression block summaries in English/Russian
   - Editing summary in one language automatically updates the other language
   - Same translation rules apply as for messages

### Bug Fixes

- **Fixed 500 error on `/translate-bidirectional` endpoint** - Added try-catch blocks for translation service calls to gracefully handle translation failures
- **Fixed message not saving after generation** - Now uses real message ID from database after `fetchMessages()` instead of temporary ID
- **Fixed mobile modal not closing after send** - Modal now closes immediately before sending message

## License

MIT
