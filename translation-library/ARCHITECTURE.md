# Архитектура библиотеки перевода

Эта документация описывает архитектуру библиотеки перевода, основанной на реализации из SillyTavern. Библиотека поддерживает четыре сервиса перевода: Google Translate, Yandex Translate, LibreTranslate и Lingva.

## Обзор архитектуры

Библиотека построена по модульному принципу с четким разделением ответственности между компонентами. Основная идея - абстрагирование работы с различными сервисами перевода через единый интерфейс.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TranslationService                           │
│                    (Основной сервис управления)                      │
└─────────────────────────────────────────────────────────────────────┘
                                      │
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│  GoogleTranslator │     │ YandexTranslator  │     │ LibreTranslator   │
│                   │     │                   │     │                   │
│ - HTTP API        │     │ - HTTP API        │     │ - HTTP API        │
│ - No API key      │     │ - No API key      │     │ - Local server    │
└───────────────────┘     └───────────────────┘     └───────────────────┘
          │                           │                           │
          └───────────────────────────┼───────────────────────────┘
                                      │
                                      ▼
                          ┌───────────────────┐
                          │  BaseTranslator   │
                          │  (Базовый класс)   │
                          │                   │
                          │ - Chunking        │
                          │ - Validation      │
                          │ - Error handling  │
                          │ - Retry logic     │
                          └───────────────────┘
```

## Основные компоненты

### 1. BaseTranslator (Базовый класс)

Базовый класс для всех реализаций переводчиков. Содержит общую функциональность:

#### Свойства
- `ApiKey` - API ключ для аутентификации (опционально)
- `Endpoint` - Endpoint для подключения к сервису
- `Timeout` - Таймаут в миллисекундах для HTTP запросов
- `MaxRetries` - Максимальное количество повторных попыток

#### Методы
- `Translate(text, options)` - Абстрактный метод для перевода текста
- `DetectLanguage(text)` - Абстрактный метод для определения языка
- `GetSupportedLanguages()` - Абстрактный метод для получения списка языков
- `NormalizeLanguageCode(languageCode)` - Нормализация кода языка к ISO 639-1
- `CreateError(message, code, statusCode, details)` - Создание ошибки перевода
- `TranslateWithRetry(translateFunc, options, retryCount)` - Перевод с повторными попытками

### 2. GoogleTranslator

Реализация для Google Translate через публичный endpoint.

#### Особенности
- Работает без API ключа
- Использует endpoint `https://translate.googleapis.com/translate_a/single`
- Поддерживает 109 языков
- Автоматическое определение языка
- Разбивка текста на чанки (5000 символов)

#### API

**Node.js:**
```typescript
new GoogleTranslator(
  apiKey?: string,
  endpoint?: string,
  timeout?: number,
  retries?: number,
  chunkSize?: number
)
```

**Python:**
```python
GoogleTranslator(
    api_key: str = None,
    endpoint: str = None,
    timeout: int = 5000,
    retries: int = 3,
    chunk_size: int = 5000
)
```

### 3. YandexTranslator

Реализация для Yandex Translate через публичный endpoint.

#### Особенности
- Работает без API ключа
- Использует endpoint `https://translate.yandex.net/api/v1/tr.json/translate`
- Поддерживает 53 языка
- Автоматическое определение языка
- Разбивка текста на чанки (5000 символов)

#### API

**Node.js:**
```typescript
new YandexTranslator(
  apiKey?: string,
  endpoint?: string,
  timeout?: number,
  retries?: number,
  chunkSize?: number
)
```

**Python:**
```python
YandexTranslator(
    api_key: str = None,
    endpoint: str = None,
    timeout: int = 5000,
    retries: int = 3,
    chunk_size: int = 5000
)
```

### 4. LibreTranslator

Реализация для LibreTranslate (самостоятельный хостинг).

#### Особенности
- Требует локальный сервер LibreTranslate
- Использует endpoint `http://localhost:5000/translate`
- Поддерживает 56 языков
- Автоматическое определение языка
- Разбивка текста на чанки (5000 символов)

#### API

**Node.js:**
```typescript
new LibreTranslator(
  apiKey?: string,
  endpoint?: string
)
```

**Python:**
```python
LibreTranslator(
    api_key: str = None,
    endpoint: str = 'http://localhost:5000/translate'
)
```

### 5. LingvaTranslator

Реализация для Lingva Translate (бесплатный API).

#### Особенности
- Работает без API ключа
- Использует endpoint `https://lingva.ml/api/v1`
- Поддерживает 109 языков
- Автоматическое определение языка
- Разбивка текста на чанки (5000 символов)

#### API

**Node.js:**
```typescript
new LingvaTranslator()
```

**Python:**
```python
LingvaTranslator()
```

### 6. TranslationService

Основной сервис для управления переводчиками.

#### Свойства
- `_googleTranslator` - Экземпляр GoogleTranslator
- `_yandexTranslator` - Экземпляр YandexTranslator
- `_libreTranslator` - Экземпляр LibreTranslator
- `_lingvaTranslator` - Экземпляр LingvaTranslator
- `_defaultProvider` - Провайдер по умолчанию
- `_defaultEndpoint` - Endpoint по умолчанию

#### Методы

**Node.js:**
```typescript
// Перевод текста
await service.translate(
  text: string,
  sourceLanguage: string | null,
  targetLanguage: string,
  provider?: TranslatorProvider,
  endpoint?: string
): Promise<TranslationResult>

// Определение языка
await service.detectLanguage(
  text: string,
  provider?: TranslatorProvider
): Promise<string>

// Получение списка языков
service.getSupportedLanguages(
  provider?: TranslatorProvider
): string[]
```

**Python:**
```python
# Перевод текста
result = service.translate(
    text: str,
    source_language: str = None,
    target_language: str = None,
    provider: TranslatorProvider = None,
    endpoint: str = None
) -> TranslationResult

# Определение языка
language = service.detect_language(
    text: str,
    provider: TranslatorProvider = None
) -> str

# Получение списка языков
languages = service.get_supported_languages(
    provider: TranslatorProvider = None
) -> List[str]
```

### 7. TextChunker

Алгоритм разбивки текста на чанки для обработки больших текстов.

#### Функции
- `ChunkText(text, chunkSize)` - Разбивка текста на чанки
- `CombineChunks(chunks)` - Объединение чанков
- `ChunkWithLinks(text, chunkSize)` - Разбивка с сохранением ссылок
- `RestoreTextWithLinks(chunks, links)` - Восстановление текста с ссылками

#### Алгоритм
1. Определяет длину текста
2. Если текст больше chunkSize, разбивает его на части
3. Сохраняет ссылки и форматирование
4. Возвращает массив чанков

### 8. Types

Типы данных для опций перевода и результатов.

#### TranslationOptions

**Node.js:**
```typescript
{
  targetLanguage: string;
  sourceLanguage?: string;
  provider?: TranslatorProvider;
  endpoint?: string;
}
```

**Python:**
```python
@dataclass
class TranslationOptions:
    target_language: str
    source_language: Optional[str] = None
    provider: Optional[TranslatorProvider] = None
    endpoint: Optional[str] = None
```

#### TranslationResult

**Node.js:**
```typescript
{
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
  provider: TranslatorProvider;
}
```

**Python:**
```python
@dataclass
class TranslationResult:
    text: str
    source_language: Optional[str] = None
    target_language: str
    provider: TranslatorProvider
```

#### TranslationError

**Node.js:**
```typescript
{
  message: string;
  code: string;
  statusCode?: number;
  details?: any;
}
```

**Python:**
```python
@dataclass
class TranslationError(Exception):
    message: str
    code: str
    status_code: Optional[int] = None
    details: Optional[Any] = None
```

#### TranslatorProvider

**Node.js:**
```typescript
enum TranslatorProvider {
  Google,
  Yandex,
  LibreTranslate,
  Lingva
}
```

**Python:**
```python
from enum import Enum

class TranslatorProvider(Enum):
    GOOGLE = 'google'
    YANDEX = 'yandex'
    LIBRETRANSLATE = 'libretranslate'
    LINGVA = 'lingva'
```

## Поток выполнения

### Перевод текста

```
1. Пользователь вызывает service.translate()
2. TranslationService создает TranslationOptions
3. TranslationService выбирает переводчик на основе provider
4. Вызывается translator.translate(text, options)
5. BaseTranslator валидирует входные данные
6. TextChunker разбивает текст на чанки
7. Для каждого чанка:
   a. Формируется HTTP запрос к API
   b. Выполняется запрос с учетом timeout и retries
   c. Обрабатывается ответ
8. Чанки объединяются через TextChunker.CombineChunks()
9. Возвращается TranslationResult
```

### Определение языка

```
1. Пользователь вызывает service.detectLanguage()
2. TranslationService выбирает переводчик на основе provider
3. Вызывается translator.detectLanguage(text)
4. Формируется HTTP запрос к API
5. Выполняется запрос с учетом timeout и retries
6. Обрабатывается ответ
7. Возвращается код языка
```

## Обработка ошибок

### Типы ошибок

1. **TranslationError** - Ошибка перевода
   - `message` - Сообщение об ошибке
   - `code` - Код ошибки
   - `statusCode` - HTTP статус код
   - `details` - Дополнительные детали

2. **NetworkError** - Сетевая ошибка
   - Возникает при потере соединения
   - Поддерживает повторные попытки

3. **ValidationError** - Ошибка валидации
   - Возникает при некорректных входных данных
   - Пустой текст
   - Неверный код языка

### Механизм повторных попыток

1. При ошибке проверяется количество попыток
2. Если попыток меньше MaxRetries, выполняется задержка
3. Задержка увеличивается экспоненциально: `1000 * (retryCount + 1)`
4. Выполняется повторный запрос
5. Если все попытки исчерпаны, выбрасывается ошибка

## Нормализация языков

### ISO 639-1

Все коды языков нормализуются к формату ISO 639-1 (два символа).

#### Примеры
- `en-US` → `en`
- `en-GB` → `en`
- `ru-RU` → `ru`
- `zh-CN` → `zh`
- `zh-TW` → `zh`

### Специфичные преобразования

#### Google Translate
- `zh` → `zh-CN` (упрощённый китайский)
- `pt` → `pt` (португальский)

#### Yandex Translate
- `zh` → `zh` (китайский)
- `pt` → `pt` (португальский)

## Безопасность

### HTTP запросы

- Все HTTP запросы используют HTTPS (где возможно)
- Таймауты настроены для предотвращения зависаний
- Заголовки User-Agent и Referer устанавливаются для имитации браузера

### Валидация входных данных

- Проверка на пустой текст
- Валидация кодов языков
- Проверка на корректность опций перевода

## Производительность

### Чанкинг

- Размер чанка: 5000 символов
- Параллельная обработка чанков (в будущем)
- Сохранение ссылок и форматирования

### Кэширование

- В текущей реализации кэширование не реализовано
- В будущем возможно добавить кэширование результатов

### Асинхронность

- Все операции асинхронные (async/await в Node.js, asyncio в Python)
- Не блокируют основной поток
- Поддержка Promise (JavaScript/TypeScript)
- Поддержка asyncio (Python)

## Расширяемость

### Добавление нового провайдера

1. Создайте новый класс, наследующийся от BaseTranslator
2. Реализуйте методы:
   - `translate(text, options)`
   - `detectLanguage(text)`
   - `getSupportedLanguages()`
3. Добавьте в `index.ts` (Node.js) или `__init__.py` (Python)
4. Добавьте в `TranslatorProvider` enum
5. Инициализируйте в TranslationService

### Пример нового провайдера (Node.js)

```typescript
class DeepLTranslator extends BaseTranslator {
  private readonly apiUrl = 'https://api.deepl.com/v2/translate';

  async translate(text: string, options: TranslationOptions): Promise<TranslationResult> {
    // Реализация перевода через DeepL API
  }

  async detectLanguage(text: string): Promise<string> {
    // Реализация определения языка через DeepL API
  }

  getSupportedLanguages(): string[] {
    // Возврат списка поддерживаемых языков
  }
}
```

### Пример нового провайдера (Python)

```python
from abc import ABC, abstractmethod

class DeepLTranslator(BaseTranslator):
    def __init__(self, api_key: str = None):
        super().__init__()
        self.api_url = 'https://api.deepl.com/v2/translate'
        self.api_key = api_key

    def translate(self, text: str, options: TranslationOptions) -> TranslationResult:
        # Реализация перевода через DeepL API
        pass

    def detect_language(self, text: str) -> str:
        # Реализация определения языка через DeepL API
        pass

    def get_supported_languages(self) -> List[str]:
        # Возврат списка поддерживаемых языков
        pass
```

## Зависимости

### Node.js
- `google-translate-api-x` - Библиотека для Google Translate
- `node-fetch` - HTTP клиент
- `uuid` - Генерация UUID

### Python
- `deep-translator` - Библиотека для перевода
- `requests` - HTTP клиент

## Тестирование

### Unit тесты

- Тестирование каждого переводчика отдельно
- Тестирование алгоритма чанкинга
- Тестирование нормализации языков

### Integration тесты

- Тестирование реальных запросов к API
- Тестирование обработки ошибок
- Тестирование повторных попыток

## Рекомендации по использованию

1. **Выбор провайдера**
   - Для быстрого прототипирования используйте Google или Yandex
   - Для локального использования настройте LibreTranslate
   - Для бесплатного использования используйте Lingva

2. **Обработка больших текстов**
   - Библиотека автоматически разбивает текст на чанки
   - Не рекомендуется передавать тексты больше 100KB

3. **Обработка ошибок**
   - Всегда используйте try-catch для обработки ошибок
   - Проверяйте код ошибки для определения типа проблемы

4. **Производительность**
   - Используйте кэширование результатов в вашем приложении
   - Избегайте частых запросов к API
   - Используйте асинхронные операции

## Заключение

Эта библиотека предоставляет унифицированный интерфейс для работы с различными сервисами перевода. Архитектура спроектирована с учетом расширяемости, производительности и удобства использования. Все сервисы работают без API ключей (как в SillyTavern), что делает библиотеку готовой к использованию "из коробки".