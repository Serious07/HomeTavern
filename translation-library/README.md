# Translation Library

Универсальная библиотека перевода, основанная на реализации из SillyTavern. Поддерживает четыре сервиса перевода: Google Translate, Yandex Translate, LibreTranslate и Lingva. Все сервисы работают без API ключей (как в SillyTavern).

## Доступные реализации

- **[Node.js](./nodejs/)** - TypeScript реализация
- **[Python](./python/)** - Python реализация

## Поддерживаемые сервисы перевода

| Сервис | Описание | Работает без API ключа |
|--------|----------|------------------------|
| **Google Translate** | Google Translate через публичный endpoint | ✅ Да |
| **Yandex Translate** | Yandex Translate через публичный endpoint | ✅ Да |
| **LibreTranslate** | Самостоятельный хостинг (требуется локальный сервер) | ✅ Да (при наличии сервера) |
| **Lingva** | Бесплатный API переводчика | ✅ Да |

---

## 🚀 Быстрый старт

### Node.js

```bash
cd translation-library/nodejs
npm install
```

### Python

```bash
cd translation-library/python
pip install -e .
```

---

## 📖 Использование

### Node.js

#### Базовый перевод

```typescript
import { TranslationService, TranslatorProvider } from './src/translation-library';

const service = new TranslationService();

// Перевод текста с английского на русский
const result = await service.translate(
  'Hello, world!',
  'en',
  'ru',
  TranslatorProvider.Google
);

console.log(result.text); // Привет, мир!
console.log(result.sourceLanguage); // en
console.log(result.targetLanguage); // ru
```

#### Перевод с автоматическим определением языка

```typescript
const result = await service.translate(
  'Bonjour le monde!',
  'auto',  // Автоматическое определение языка
  'en',
  TranslatorProvider.Google
);

console.log(result.text); // Hello, world!
console.log(result.sourceLanguage); // fr (определён французский)
```

#### Использование разных провайдеров

```typescript
// Google Translate
const googleResult = await service.translate(
  'Hello, world!',
  'en',
  'ru',
  TranslatorProvider.Google
);

// Yandex Translate
const yandexResult = await service.translate(
  'Hello, world!',
  'en',
  'ru',
  TranslatorProvider.Yandex
);

// LibreTranslate (требует локальный сервер на порту 5000)
const libreResult = await service.translate(
  'Hello, world!',
  'en',
  'ru',
  TranslatorProvider.LibreTranslate
);

// Lingva (бесплатный публичный API)
const lingvaResult = await service.translate(
  'Hello, world!',
  'en',
  'ru',
  TranslatorProvider.Lingva
);
```

#### Определение языка текста

```typescript
const language = await service.detectLanguage(
  'Привет, мир!',
  TranslatorProvider.Google
);

console.log(language); // ru
```

#### Перевод больших текстов

Библиотека автоматически разбивает большие тексты на чанки для обработки.

```typescript
const longText = 'Hello, world! '.repeat(10000);

const result = await service.translate(
  longText,
  'en',
  'ru',
  TranslatorProvider.Google
);

console.log(result.text);
```

#### Обработка ошибок

```typescript
try {
  const result = await service.translate(
    'Hello, world!',
    'en',
    'ru',
    TranslatorProvider.Google
  );
  console.log(result.text);
} catch (error) {
  console.error('Ошибка перевода:', error);
}
```

---

### Python

#### Базовый перевод

```python
from translation_library import TranslationService, TranslatorProvider

service = TranslationService()

# Перевод текста с английского на русский
result = service.translate(
    "Hello, world!",
    "en",
    "ru",
    TranslatorProvider.Google
)

print(result.text)  # Привет, мир!
print(result.source_language)  # en
print(result.target_language)  # ru
```

#### Перевод с автоматическим определением языка

```python
result = service.translate(
    "Bonjour le monde!",
    "auto",  # Автоматическое определение языка
    "en",
    TranslatorProvider.Google
)

print(result.text)  # Hello, world!
print(result.source_language)  # fr (определён французский)
```

#### Использование разных провайдеров

```python
# Google Translate
google_result = service.translate(
    "Hello, world!",
    "en",
    "ru",
    TranslatorProvider.Google
)

# Yandex Translate
yandex_result = service.translate(
    "Hello, world!",
    "en",
    "ru",
    TranslatorProvider.Yandex
)

# LibreTranslate (требует локальный сервер на порту 5000)
libre_result = service.translate(
    "Hello, world!",
    "en",
    "ru",
    TranslatorProvider.LibreTranslate
)

# Lingva (бесплатный публичный API)
lingva_result = service.translate(
    "Hello, world!",
    "en",
    "ru",
    TranslatorProvider.Lingva
)
```

#### Определение языка текста

```python
language = service.detect_language(
    "Привет, мир!",
    TranslatorProvider.Google
)

print(language)  # ru
```

#### Перевод больших текстов

Библиотека автоматически разбивает большие тексты на чанки для обработки.

```python
long_text = "Hello, world! " * 10000

result = service.translate(
    long_text,
    "en",
    "ru",
    TranslatorProvider.Google
)

print(result.text)
```

#### Обработка ошибок

```python
try:
    result = service.translate(
        "Hello, world!",
        "en",
        "ru",
        TranslatorProvider.Google
    )
    print(result.text)
except Exception as e:
    print(f'Ошибка перевода: {e}')
```

---

## 🔧 API Reference

### TranslationService

#### Конструктор

**Node.js:**
```typescript
new TranslationService(
  googleApiKey?: string,
  yandexApiKey?: string,
  defaultProvider?: TranslatorProvider,
  defaultEndpoint?: string
)
```

**Python:**
```python
TranslationService(
    google_api_key: str = None,
    yandex_api_key: str = None,
    default_provider: TranslatorProvider = TranslatorProvider.Google,
    default_endpoint: str = None
)
```

#### Методы

##### `translate(text, sourceLanguage, targetLanguage, provider?, endpoint?)`

Переводит текст с одного языка на другой.

**Параметры:**
- `text` (string) - Текст для перевода
- `sourceLanguage` (string | null) - Язык источника (используйте "auto" для автоматического определения)
- `targetLanguage` (string) - Целевой язык (код ISO 639-1)
- `provider` (TranslatorProvider, опционально) - Провайдер перевода
- `endpoint` (string, опционально) - Кастомный endpoint для LibreTranslate

**Возвращает:** `Promise<TranslationResult>` (Node.js) или `TranslationResult` (Python)

##### `detectLanguage(text, provider?)`

Определяет язык текста.

**Параметры:**
- `text` (string) - Текст для определения языка
- `provider` (TranslatorProvider, опционально) - Провайдер перевода

**Возвращает:** `Promise<string>` (Node.js) или `str` (Python) - Код языка в формате ISO 639-1

##### `getSupportedLanguages(provider?)`

Получает список поддерживаемых языков.

**Параметры:**
- `provider` (TranslatorProvider, опционально) - Провайдер перевода

**Возвращает:** `string[]` (Node.js) или `List[str]` (Python) - Список кодов языков

### TranslationResult

Результат перевода.

**Свойства:**
- `text` (string) - Переведенный текст
- `sourceLanguage` (string | null) - Исходный язык
- `targetLanguage` (string) - Целевой язык
- `provider` (TranslatorProvider) - Провайдер перевода

---

## 🌍 Поддерживаемые языки

### Google Translate (109 языков)

af, sq, am, ar, hy, az, eu, be, bn, bs, bg, ca, ceb, zh-CN, zh-TW, co, hr, cs, da, nl, en, eo, et, fi, fr, fy, gl, ka, de, el, gu, ht, ha, haw, he, hi, hmn, hu, is, ig, id, ga, it, ja, jv, kn, kk, km, rw, ko, ku, ky, lo, la, lv, lt, lb, mk, mg, ms, ml, mt, mi, mr, mn, my, ne, no, ny, or, ps, fa, pl, pt, pa, ro, ru, sm, gd, sr, st, sn, sd, si, sk, sl, so, es, su, sw, sv, tl, tg, ta, tt, te, th, tr, tk, uk, ur, ug, uz, vi, cy, xh, yi, yo, zu

### Yandex Translate (53 языка)

af, sq, am, ar, hy, az, eu, be, bn, bs, bg, ca, zh, hr, cs, da, nl, en, et, fi, fr, ka, de, el, he, hi, hu, is, id, ga, it, ja, kk, ko, lv, lt, mk, no, fa, pl, pt, ro, ru, sr, sk, sl, es, sv, th, tr, uk, ur, vi

### LibreTranslate (56 языков)

af, sq, am, ar, hy, az, eu, be, bn, bs, bg, ca, zh, hr, cs, da, nl, en, et, fi, fr, gl, ka, de, el, gu, ht, he, hi, hu, is, id, ga, it, ja, kn, kk, ko, lv, lt, mk, ms, ml, mt, no, fa, pl, pt, ro, ru, sr, sk, sl, es, sw, sv, ta, te, th, tr, uk, ur, vi, cy

### Lingva (109 языков)

af, sq, am, ar, hy, az, eu, be, bn, bs, bg, ca, ceb, zh-CN, zh-TW, co, hr, cs, da, nl, en, eo, et, fi, fr, fy, gl, ka, de, el, gu, ht, ha, haw, he, hi, hmn, hu, is, ig, id, ga, it, ja, jv, kn, kk, km, rw, ko, ku, ky, lo, la, lv, lt, lb, mk, mg, ms, ml, mt, mi, mr, mn, my, ne, no, ny, or, ps, fa, pl, pt, pa, ro, ru, sm, gd, sr, st, sn, sd, si, sk, sl, so, es, su, sw, sv, tl, tg, ta, tt, te, th, tr, tk, uk, ur, ug, uz, vi, cy, xh, yi, yo, zu

---

## ⚙️ Настройка

### Google Translate

Google Translate работает через публичный endpoint без API ключа.

**Node.js:**
```typescript
const googleTranslator = new GoogleTranslator();
```

**Python:**
```python
from translation_library.translators.google import GoogleTranslator

google_translator = GoogleTranslator()
```

### Yandex Translate

Yandex Translate работает через публичный endpoint без API ключа.

**Node.js:**
```typescript
const yandexTranslator = new YandexTranslator();
```

**Python:**
```python
from translation_library.translators.yandex import YandexTranslator

yandex_translator = YandexTranslator()
```

### LibreTranslate

Требуется локальный сервер LibreTranslate.

**Node.js:**
```typescript
const libreTranslator = new LibreTranslator(null, 'http://localhost:5000/translate');
```

**Python:**
```python
from translation_library.translators.libre import LibreTranslator

libre_translator = LibreTranslator(None, 'http://localhost:5000/translate')
```

### Lingva

Lingva работает через публичный API без API ключа.

**Node.js:**
```typescript
const lingvaTranslator = new LingvaTranslator();
```

**Python:**
```python
from translation_library.translators.lingva import LingvaTranslator

lingva_translator = LingvaTranslator()
```

---

## 📁 Структура проекта

```
translation-library/
├── nodejs/                    # Node.js реализация
│   ├── src/
│   │   └── translation-library/
│   │       ├── chunker.ts     # Алгоритм разбивки текста
│   │       ├── index.ts       # Основной экспорт
│   │       ├── types.ts       # Типы данных
│   │       └── translators/   # Реализации переводчиков
│   │           ├── base.ts    # Базовый класс
│   │           ├── google.ts  # Google Translate
│   │           ├── yandex.ts  # Yandex Translate
│   │           ├── libre.ts   # LibreTranslate
│   │           └── index.ts   # Экспорт переводчиков
│   └── examples/              # Примеры использования
├── python/                    # Python реализация
│   ├── src/
│   │   └── translation_library/
│   │       ├── chunker.py     # Алгоритм разбивки текста
│   │       ├── __init__.py    # Основной экспорт
│   │       ├── types.py       # Типы данных
│   │       └── translators/   # Реализации переводчиков
│   │           ├── base.py    # Базовый класс
│   │           ├── google.py  # Google Translate
│   │           ├── yandex.py  # Yandex Translate
│   │           ├── libre.py   # LibreTranslate
│   │           └── index.py   # Экспорт переводчиков
│   └── examples/              # Примеры использования
└── README.md                  # Эта документация
```

---

## 🔗 Дополнительные материалы

- [Архитектурная документация](./ARCHITECTURE.md) - Подробное описание архитектуры библиотеки
- [Анализ SillyTavern](./SILLYTAVERN_ANALYSIS.md) - Как работает перевод в SillyTavern

---

## 📄 Лицензия

MIT License

---

## 🙏 Благодарности

Эта библиотека основана на реализации перевода из [SillyTavern](https://github.com/SillyTavern/SillyTavern).