# Установка и использование

## Node.js

### Установка

1. Перейдите в директорию Node.js:
```bash
cd llm-client/nodejs
```

2. Установите зависимости:
```bash
npm install
```

3. Соберите проект:
```bash
npm run build
```

### Использование

```typescript
import { LLMClient, Message } from './dist/index.js';

const client = new LLMClient({
    baseURL: 'http://127.0.0.1:8080/v1',
    timeout: 120000,
});

const response = await client.chatCompletionsCreate({
    model: 'qwen3.5-35b',
    messages: [
        {
            role: 'user',
            content: 'Привет! Расскажи кратко о себе.',
        },
    ],
    stream: true,
});

for await (const chunk of response) {
    const choice = chunk.choices[0];
    
    if (choice.delta.reasoning_content) {
        console.log('Мышление:', choice.delta.reasoning_content);
    }
    
    if (choice.delta.content) {
        console.log('Ответ:', choice.delta.content);
    }
}
```

### Запуск тестов

```bash
npm run test
```

## Python

### Установка

1. Перейдите в директорию Python:
```bash
cd llm-client/python
```

2. Установите зависимости (если есть):
```bash
pip install -r requirements.txt
```

### Использование

```python
from llm_client import LLMClient, Message, ChatCompletionCreateParams, ClientOptions

client = LLMClient(
    ClientOptions(
        base_url="http://127.0.0.1:8080/v1",
        timeout=120000,
    )
)

response = client.chat_completions_create(
    ChatCompletionCreateParams(
        model="qwen3.5-35b",
        messages=[
            Message(
                role="user",
                content="Привет! Расскажи кратко о себе.",
            )
        ],
        stream=True,
    )
)

for chunk in response:
    if chunk.choices:
        choice = chunk.choices[0]
        
        if choice.delta.reasoning_content:
            print('Мышление:', choice.delta.reasoning_content)
        
        if choice.delta.content:
            print('Ответ:', choice.delta.content)
```

### Запуск тестов

```bash
python test.py
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

### chatCompletionsCreate / chat_completions_create

Создание чат-комплитиона.

```typescript
await client.chatCompletionsCreate({
    model: string,
    messages: Message[],
    stream?: boolean,
    temperature?: number,
    max_tokens?: number,
    // ... другие параметры
})
```

## Обработка ошибок

### Node.js

```typescript
try {
    const response = await client.chatCompletionsCreate(params);
    // ... обработка ответа
} catch (error) {
    if (error instanceof APIError) {
        console.error(`API Error: ${error.status}`);
        console.error(error.body);
    } else if (error instanceof NetworkError) {
        console.error('Network error:', error.message);
    } else if (error instanceof TimeoutError) {
        console.error('Request timeout');
    } else {
        console.error('Unknown error:', error);
    }
}
```

### Python

```python
try:
    response = client.chat_completions_create(params)
    # ... обработка ответа
except APIError as e:
    print(f"API Error: {e.status}")
    print(e.body)
except NetworkError as e:
    print(f"Network error: {e}")
except TimeoutError as e:
    print(f"Request timeout: {e}")
except Exception as e:
    print(f"Unknown error: {e}")
```

## Примеры

### Простой запрос без потоковой передачи

```typescript
const response = await client.chatCompletionsCreate({
    model: 'qwen3.5-35b',
    messages: [
        { role: 'user', content: 'Привет!' },
    ],
    stream: false,
});

console.log(response.choices[0].message.content);
```

### Запрос с параметрами

```typescript
const response = await client.chatCompletionsCreate({
    model: 'qwen3.5-35b',
    messages: [
        { role: 'user', content: 'Напиши стихотворение' },
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 500,
});
```

### Обработка только контента

```typescript
let fullContent = '';

for await (const chunk of response) {
    const choice = chunk.choices[0];
    if (choice.delta.content) {
        fullContent += choice.delta.content;
    }
}

console.log(fullContent);
```

### Обработка только мышления

```typescript
let fullReasoning = '';

for await (const chunk of response) {
    const choice = chunk.choices[0];
    if (choice.delta.reasoning_content) {
        fullReasoning += choice.delta.reasoning_content;
    }
}

console.log(fullReasoning);