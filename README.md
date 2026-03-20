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

### Hero (Профиль главного героя)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/hero` | Получить все вариации героя |
| GET | `/api/hero/active` | Получить активную вариацию героя |
| GET | `/api/hero/profile` | Получить профиль героя для LLM |
| POST | `/api/hero` | Создать новую вариацию героя |
| PUT | `/api/hero/:id` | Обновить вариацию героя |
| PUT | `/api/hero/:id/activate` | Установить активную вариацию героя |
| DELETE | `/api/hero/:id` | Удалить вариацию героя |

**Описание:**
- **Вариации героя** позволяют создавать несколько профилей главного героя (например, разные персонажи для разных ролевых игр)
- **Активная вариация** используется во всех чатах для контекста LLM
- **Профиль героя** автоматически подставляется в системный промпт персонажей
- Плейсхолдеры `{{user}}`, `{user}` и их варианты в промптах автоматически заменяются на имя активного героя

### Token Usage Tracking (Context Monitoring)

HomeTavern V5 включает встроенный мониторинг использования токенов контекста llama.cpp.

**Возможности:**
- Отображение текущего использования контекста в реальном времени
- Прогресс-бар с цветовой индикацией уровня заполнения
- Автоматическое обновление каждые 30 секунд
- Интенсивное обновление (каждые 2 секунды) во время генерации ответа
- Кэширование значений в базе данных для оптимизации запросов
- **Точный подсчёт токенов** через поле `usage.total_tokens` из ответа LLM

**Как это работает:**
Модуль получает информацию о токенах из поля `usage` в последнем чанке потока ответа LLM (OpenAI-совместимый API `/v1/chat/completions`):
```json
{
  "choices": [...],
  "usage": {
    "prompt_tokens": 25,    // Токены промпта
    "completion_tokens": 50, // Токены ответа
    "total_tokens": 75       // Общее количество
  }
}
```

**API Endpoints:**
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/context/stats/:chatId` | Получить статистику токенов для чата |
| POST | `/api/context/sync/:chatId` | Принудительная синхронизация с llama.cpp |
| GET | `/api/context/slots` | Получить список активных слотов |
| GET | `/api/context/props` | Получить настройки контекста сервера |

**llama.cpp Эндпоинты:**
Модуль использует следующие эндпоинты llama.cpp сервера:
- `GET /props` - Получение максимального контекста (`n_ctx`)
- `GET /slots` - Получение информации о слотах (для мониторинга в реальном времени)

**База данных:**
Таблица `chats` имеет дополнительные поля для кэширования:
- `context_tokens_used` (INTEGER) - количество использованных токенов (накопленное значение из `usage.total_tokens`)
- `context_last_synced` (DATETIME) - время последней синхронизации

**Компоненты:**
- [`ContextStatsDisplay`](client/src/components/chat/ContextStatsDisplay.tsx) - компонент отображения в шапке чата
- [`useContextStats`](client/src/hooks/useContextStats.ts) - React hook для получения данных
- [`context.service.ts`](server/src/services/context.service.ts) - сервис взаимодействия с llama.cpp
- [`llm.service.ts`](server/src/services/llm.service.ts) - извлечение `usage` из потока и сохранение в БД

**Цветовая индикация:**
- **Зелёный** (< 50%) - контекст заполнен менее чем наполовину
- **Жёлтый** (50-75%) - умеренное использование
- **Оранжевый** (75-90%) - высокое использование
- **Красный** (> 90%) - критическое заполнение контекста

**Пример отображения:**
```
56890 t / 131072 t (43.40%)
[████████████░░░░░░░░░░]
```

**Будущее использование:**
Данные о токенах могут использоваться для:
- Суммаризации диалогов (когда контекст приближается к лимиту)
- Автоматической очистки истории
- Оптимизации стоимости запросов

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

## License

MIT
