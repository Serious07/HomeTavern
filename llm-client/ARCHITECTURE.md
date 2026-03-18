# Архитектура LLM Client Library

## Обзор

Эта библиотека предоставляет простой и удобный интерфейс для подключения к LLM через OpenAI API совместимый интерфейс. Основная цель - обеспечить потоковую передачу ответов с корректной обработкой `reasoning_content` (мышление) и `content` (основной ответ).

## Дизайн решения

### 1. Разделение ответственности

Библиотека разделена на три основных компонента:

#### HTTP Client
- Отвечает за отправку HTTP запросов к LLM серверу
- Обрабатывает заголовки, включая авторизацию
- Поддерживает асинхронные запросы
- Использует native `fetch` API Node.js

#### Stream Processor
- Обрабатывает Server-Sent Events (SSE) поток
- Парсит JSON чанки из потока
- Разделяет `reasoning_content` и `content`
- Предоставляет асинхронный итератор для удобного перебора

#### API Layer
- Предоставляет удобный интерфейс для создания запросов
- Абстрагирует детали формата запросов OpenAI API
- Валидирует входные данные

#### History Manager
- Управляет историей чата
- Генерирует уникальные ID для сообщений
- Поддерживает группировку сообщений по картам (cardId)
- Позволяет скрывать сообщения от ИИ

## Структура данных

### Message
```typescript
interface Message {
    role: 'system' | 'user' | 'assistant' | 'function';
    content: string;
    name?: string;
    id?: string;              // Уникальный идентификатор сообщения
    hidden?: boolean;         // Скрыто ли сообщение (не передаётся ИИ)
    cardId?: string;          // ID карты для группировки сообщений
}
```

### MessageWithId
```typescript
interface MessageWithId extends Message {
    id: string;  // Обязательный ID
}
```

### ChatCompletionChunk
```typescript
interface ChatCompletionChunk {
    id: string;
    created: number;
    model: string;
    system_fingerprint?: string;
    object: 'chat.completion.chunk';
    choices: Choice[];
    timings?: {
        cache_n: number;
        prompt_n: number;
        prompt_ms: number;
        prompt_per_token_ms: number;
        prompt_per_second: number;
        predicted_n: number;
        predicted_ms: number;
        predicted_per_token_ms: number;
        predicted_per_second: number;
    };
}

interface Choice {
    index: number;
    delta: Delta;
    finish_reason?: 'stop' | 'length' | 'content_filter' | null;
}

interface Delta {
    role?: 'system' | 'user' | 'assistant' | 'function';
    content?: string;
    reasoning_content?: string;
}
```

### ChatCompletion
```typescript
interface ChatCompletion {
    id: string;
    created: number;
    model: string;
    system_fingerprint?: string;
    object: 'chat.completion';
    choices: Choice[];
    usage: Usage;
    timings?: {
        cache_n: number;
        prompt_n: number;
        prompt_ms: number;
        prompt_per_token_ms: number;
        prompt_per_second: number;
        predicted_n: number;
        predicted_ms: number;
        predicted_per_token_ms: number;
        predicted_per_second: number;
    };
}

interface Choice {
    index: number;
    message: Message;
    finish_reason: 'stop' | 'length' | 'content_filter';
}

interface Usage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
```

## Обработка потоков

### Поток данных

Сервер отправляет данные в формате Server-Sent Events:

```
data: {"choices":[{"delta":{"reasoning_content":"Thinking"}}],...}

data: {"choices":[{"delta":{"reasoning_content":" Process"}}],...}

data: {"choices":[{"delta":{"content":"Привет!"}}],...}

data: {"choices":[{"finish_reason":"stop"}],...}

data: [DONE]
```

### Парсинг

1. Чтение потока построчно
2. Фильтрация строк, начинающихся с `data: `
3. Парсинг JSON из каждой строки
4. Извлечение `delta` из `choices[0]`
5. Разделение `reasoning_content` и `content`

### Итератор

Библиотека предоставляет асинхронный итератор для удобного перебора чанков:

```typescript
for await (const chunk of response) {
    // Обработка каждого чанка
}
```

## Обработка ошибок

### Ошибки сети
- ConnectionError: Невозможно установить соединение
- TimeoutError: Превышен таймаут запроса
- NetworkError: Ошибка сети

### Ошибки API
- APIError: Ошибка от сервера (статус 4xx, 5xx)
- RateLimitError: Превышен лимит запросов
- NotFoundError: Модель не найдена

### Ошибки парсинга
- ParseError: Невозможно распарсить ответ

## Сравнение с SillyTavern

### Реализация в SillyTavern

В SillyTavern используется подход на основе поиска тегов:
- Ответы парсятся как строки
- Ищутся специальные теги для разделения мыслей и контента
- Менее точный подход, зависит от формата вывода модели

### Наша реализация

Мы используем более современный подход:
- Читаем тип токена напрямую из ответа API (`reasoning_content` vs `content`)
- Более точное разделение на мысли и контент
- Поддержка любых моделей, следующих OpenAI API спецификации

## Безопасность

- API ключи передаются через заголовок `Authorization: Bearer {key}`
- Поддержка HTTPS для безопасной передачи данных
- Валидация входных данных для предотвращения инъекций

## Производительность

- Минимальные зависимости (только стандартные библиотеки Node.js)
- Потоковая обработка без буферизации всего ответа
- Поддержка отмены запросов через AbortController

## Расширяемость

Библиотека спроектирована для легкой расширяемости:
- Добавление новых провайдеров через стратегию
- Кастомные обработчики потоков
- Плагины для логирования и мониторинга

## Управление историей чата

### ID сообщений
Каждое сообщение может иметь уникальный ID, генерируемый функцией `generateId()`:
```typescript
const messageId = generateId(); // msg_1234567890_abc123def
```

### Карточки (Cards)
Сообщения могут группироваться по картам через `cardId`:
```typescript
const message: MessageWithId = {
    role: 'user',
    content: 'Привет!',
    cardId: 'card-1'  // Группировка сообщений
};
```

### Скрытие сообщений
Сообщения могут быть помечены как скрытые (не передаются ИИ):
```typescript
const message: MessageWithId = {
    role: 'user',
    content: 'Скрытое сообщение',
    hidden: true  // Не передаётся ИИ
};
```

### Методы управления
- `addMessageToHistoryWithId()` - добавление с генерацией ID
- `editMessage()` - редактирование по ID
- `deleteMessage()` - удаление по ID
- `hideMessage()` / `showMessage()` - скрытие/показ
- `getVisibleMessages()` - получение видимых сообщений
- `getCardIds()` / `getMessagesByCardId()` - работа с картами
- `getLastMessageId()` / `getAllMessageIds()` / `getMessageById()` - работа с ID