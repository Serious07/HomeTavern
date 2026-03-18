# LLM Client Library

Библиотека для простого и удобного подключения к LLM через OpenAI API совместимый интерфейс. Поддерживает потоковую передачу ответов с разделением на `reasoning_content` (мышление) и `content` (основной ответ).

## Особенности

- **Простота использования**: Минимальный код для отправки запросов
- **Потоковая передача**: Поддержка streaming ответов в реальном времени
- **Разделение мыслей и контента**: Корректная обработка `reasoning_content` и `content`
- **Управление историей чата**: Удобные методы для работы с сообщениями
- **Уникальные ID сообщений**: Автоматическая генерация ID для каждого сообщения
- **Группировка по картам**: Поддержка cardId для организации сообщений
- **Скрытие сообщений**: Возможность скрывать сообщения от ИИ
- **Системный и контекстный промпты**: Поддержка системных инструкций и контекстных подсказок
- **Без зависимостей**: Использует только стандартные библиотеки Node.js

## Структура проекта

```
llm-client/
├── README.md              # Документация
├── ARCHITECTURE.md        # Архитектура библиотеки
└── nodejs/                # Реализация для Node.js
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts       # Основной модуль
    │   ├── client.ts      # HTTP клиент
    │   └── types.ts       # Типы данных
    └── test.ts            # Тестовый скрипт
```

## Быстрый старт

### Установка

```bash
cd nodejs
npm install
```

### Базовое использование

```typescript
import { LLMClient } from './src/index';

const client = new LLMClient({
    baseURL: 'http://127.0.0.1:8080/v1',
    apiKey: 'your-api-key' // опционально
});

const response = await client.chatCompletionsCreate({
    model: 'qwen3.5-35b',
    messages: [
        { role: 'user', content: 'Привет, как дела?' }
    ],
    stream: true
});

for await (const chunk of response) {
    if (chunk.choices[0]?.delta?.reasoning_content) {
        console.log('Мышление:', chunk.choices[0].delta.reasoning_content);
    }
    if (chunk.choices[0]?.delta?.content) {
        console.log('Ответ:', chunk.choices[0].delta.content);
    }
}
```

### Использование с системным промптом

**Важно:** Системный промпт должен быть в самом начале списка сообщений!

```typescript
const response = await client.chat({
    model: 'qwen3.5-35b',
    systemPrompt: 'Ты полезный ассистент. Отвечай кратко и по делу.',
    userMessage: 'Привет! Как твои дела?',
    stream: true
});
```

### Использование с историей чата

```typescript
import { LLMClient, generateId } from './src/index';

// Инициализация истории
let history: any[] = [];

// Первый запрос
const response1 = await client.chat({
    model: 'qwen3.5-35b',
    systemPrompt: 'Ты полезный ассистент.',
    userMessage: 'Привет! Как дела?',
    stream: true
});

// Агрегируем ответ
let fullContent = '';
for await (const chunk of response1) {
    if (chunk.choices[0]?.delta?.content) {
        fullContent += chunk.choices[0].delta.content;
    }
}

// Добавляем в историю с ID
history = LLMClient.addMessageToHistory(history, 'user', 'Привет! Как дела?');
history = LLMClient.addMessageToHistory(history, 'assistant', fullContent);

// Второй запрос с историей
const response2 = await client.chat({
    model: 'qwen3.5-35b',
    systemPrompt: 'Ты полезный ассистент.',
    history: history,
    contextPrompt: 'Продолжи наш диалог.',
    userMessage: 'Что ты умеешь?',
    stream: true
});
```

### Использование с ID сообщений

```typescript
import { LLMClient, generateId, MessageWithId } from './src/index';

// Инициализация истории с типом MessageWithId
let history: MessageWithId[] = [];

// Добавление сообщений с автоматической генерацией ID
history = LLMClient.addMessageToHistoryWithId(history, 'user', 'Привет!');
history = LLMClient.addMessageToHistoryWithId(history, 'assistant', 'Привет!');

// Редактирование сообщения
history = LLMClient.editMessage(history, messageId, { content: 'Новый текст' });

// Удаление сообщения
history = LLMClient.deleteMessage(history, messageId);

// Скрытие сообщения от ИИ
history = LLMClient.hideMessage(history, messageId);

// Показ скрытого сообщения
history = LLMClient.showMessage(history, messageId);

// Получение видимых сообщений
const visibleMessages = LLMClient.getVisibleMessages(history);
```

### Группировка сообщений по картам

```typescript
import { LLMClient, MessageWithId } from './src/index';

let history: MessageWithId[] = [];

// Добавление сообщений с cardId
history = LLMClient.addMessageToHistoryWithId(
    history, 
    'user', 
    'Сообщение 1',
    'card-1'  // cardId для группировки
);

history = LLMClient.addMessageToHistoryWithId(
    history, 
    'assistant', 
    'Ответ 1',
    'card-1'
);

// Получение всех cardId
const cardIds = LLMClient.getCardIds(history);

// Получение сообщений для конкретной карты
const cardMessages = LLMClient.getMessagesByCardId(history, 'card-1');
```

### Ограничение истории чата

```typescript
// Ограничиваем историю последними N сообщениями
const limitedHistory = LLMClient.limitHistory(history, 10);
```

## API

### LLMClient

Основной класс клиента для взаимодействия с LLM.

#### Конструктор

```typescript
new LLMClient(options: ClientOptions)
```

Параметры:
- `baseURL` (string): Базовый URL API (например, `http://127.0.0.1:8080/v1`)
- `apiKey` (string, опционально): API ключ для аутентификации
- `timeout` (number, опционально): Таймаут запросов в миллисекундах (по умолчанию 60000)

### chatCompletionsCreate

Создание чат-комплитиона (базовый метод).

```typescript
await client.chatCompletionsCreate({
    model: string,
    messages: Array<{ role: string; content: string }>,
    stream?: boolean,
    temperature?: number,
    max_tokens?: number,
    // ... другие параметры OpenAI API
})
```

### chat

Удобный метод для работы с историей чата.

```typescript
await client.chat({
    model: string,                    // Модель для использования
    systemPrompt?: string,            // Системный промпт (обязательно в начале!)
    contextPrompt?: string,           // Контекстный промпт
    history?: Message[],              // История сообщений
    userMessage?: string,             // Текущее сообщение пользователя
    stream?: boolean,                 // Потоковый режим (по умолчанию true)
    temperature?: number,             // Температура генерации
    top_p?: number,                   // Top-p sampling
    max_tokens?: number | null,       // Максимальное количество токенов
    stop?: string | string[],         // Стоп-последовательности
    frequency_penalty?: number,       // Штраф за частоту
    presence_penalty?: number,        // Штраф за присутствие
})
```

### Статические методы для работы с историей

#### addMessageToHistory

Добавление сообщения в историю чата (без ID).

```typescript
history = LLMClient.addMessageToHistory(history, 'user', 'Привет!');
history = LLMClient.addMessageToHistory(history, 'assistant', 'Привет!');
```

#### addMessageToHistoryWithId

Добавление сообщения в историю с автоматической генерацией ID.

```typescript
import { MessageWithId } from './src/index';

let history: MessageWithId[] = [];

history = LLMClient.addMessageToHistoryWithId(history, 'user', 'Привет!');
history = LLMClient.addMessageToHistoryWithId(history, 'assistant', 'Привет!', 'card-1', false);
//                                    role, content, cardId?, hidden?
```

#### editMessage

Редактирование сообщения по ID.

```typescript
history = LLMClient.editMessage(history, messageId, { content: 'Новый текст' });
```

#### deleteMessage

Удаление сообщения по ID.

```typescript
history = LLMClient.deleteMessage(history, messageId);
```

#### hideMessage

Пометить сообщение как скрытое (не передаётся ИИ).

```typescript
history = LLMClient.hideMessage(history, messageId);
```

#### showMessage

Показать скрытое сообщение.

```typescript
history = LLMClient.showMessage(history, messageId);
```

#### getVisibleMessages

Получение всех видимых сообщений.

```typescript
const visibleMessages = LLMClient.getVisibleMessages(history);
```

#### getCardIds

Получение всех уникальных cardId из истории.

```typescript
const cardIds = LLMClient.getCardIds(history);
```

#### getMessagesByCardId

Получение всех сообщений для определённой карты.

```typescript
const cardMessages = LLMClient.getMessagesByCardId(history, 'card-1');
```

#### limitHistory

Ограничение истории чата последними N сообщениями.

```typescript
const limitedHistory = LLMClient.limitHistory(history, 10);
```

### generateId

Генерация уникального ID для сообщений.

```typescript
import { generateId } from './src/index';

const messageId = generateId();
// Пример: msg_1234567890_abc123def
```

### getLastMessageId

Получение ID последнего сообщения в истории.

```typescript
const lastMessageId = LLMClient.getLastMessageId(history);
// Пример: "msg_1234567890_abc123def"
```

### getAllMessageIds

Получение ID всех сообщений в истории.

```typescript
const allMessageIds = LLMClient.getAllMessageIds(history);
// Пример: ["msg_1234567890_abc123def", "msg_1234567891_def456ghi"]
```

### getMessageById

Получение сообщения по ID.

```typescript
const message = LLMClient.getMessageById(history, messageId);
if (message) {
    console.log('Сообщение:', message.content);
}
```

## Типы данных

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

Сообщение с обязательным ID.

```typescript
interface MessageWithId extends Message {
    id: string;
}
```

### ChatConfig

Конфигурация для метода chat.

```typescript
interface ChatConfig {
    model?: string;
    systemPrompt?: string;
    contextPrompt?: string;
    history?: Message[];
    userMessage?: string;
    stream?: boolean;
    temperature?: number;
    top_p?: number;
    max_tokens?: number | null;
    stop?: string | string[];
    frequency_penalty?: number;
    presence_penalty?: number;
}
```

## Формат ответа

Ответы от LLM могут содержать два типа контента:

1. **reasoning_content**: Внутренние "мысли" модели (если поддерживается)
2. **content**: Основной ответ модели

При потоковой передаче эти типы контента могут приходить в разных чанках, поэтому важно проверять наличие каждого поля.

## Тестирование

```bash
cd nodejs
npm install
npm run test
```

## Примеры использования

### Полный пример с управлением историей

```typescript
import { LLMClient, MessageWithId, generateId } from './src/index';

const client = new LLMClient({
    baseURL: 'http://127.0.0.1:8080/v1',
    timeout: 120000
});

async function chatWithHistory() {
    let history: MessageWithId[] = [];
    
    // Первый запрос
    const response1 = await client.chat({
        model: 'qwen3.5-35b',
        systemPrompt: 'Ты полезный ассистент.',
        userMessage: 'Привет! Как дела?',
        stream: true
    });
    
    let fullContent1 = '';
    for await (const chunk of response1) {
        if (chunk.choices[0]?.delta?.content) {
            fullContent1 += chunk.choices[0].delta.content;
        }
    }
    
    history = LLMClient.addMessageToHistoryWithId(history, 'user', 'Привет! Как дела?');
    history = LLMClient.addMessageToHistoryWithId(history, 'assistant', fullContent1);
    
    // Второй запрос
    const response2 = await client.chat({
        model: 'qwen3.5-35b',
        systemPrompt: 'Ты полезный ассистент.',
        history: history,
        userMessage: 'Что ты умеешь?',
        stream: true
    });
    
    let fullContent2 = '';
    for await (const chunk of response2) {
        if (chunk.choices[0]?.delta?.content) {
            fullContent2 += chunk.choices[0].delta.content;
        }
    }
    
    history = LLMClient.addMessageToHistoryWithId(history, 'user', 'Что ты умеешь?');
    history = LLMClient.addMessageToHistoryWithId(history, 'assistant', fullContent2);
    
    // Ограничение истории
    history = LLMClient.limitHistory(history, 10);
    
    console.log('История чата:', history);
}

chatWithHistory();
```

## Лицензия

MIT