# Translation Library for Node.js

Библиотека перевода для Node.js, которая поддерживает следующие сервисы:
- Google Translate
- Yandex Translate
- LibreTranslate (самостоятельный хостинг)

## Установка

```bash
npm install
```

## Зависимости

- `node-fetch` - для HTTP запросов
- `uuid` - для генерации UUID (для Yandex API)

## Использование

### Базовый перевод

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

// Создаём библиотеку
const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
  defaultApiKey: 'your-api-key',
});

// Переводим текст
const result = await library.translate({
  text: 'Hello, world!',
  targetLanguage: 'ru',
});
console.log(result.text); // Привет, мир!
```

### Асинхронный перевод

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

async function main() {
  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.LIBRETRANSLATE,
    defaultEndpoint: 'https://libretranslate.de/translate',
  });

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: 'ru',
  });
  console.log(result.text);

  await library.close();
}

main();
```

### Определение языка

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
});

// Определяем язык
const lang = await library.detectLanguage('Привет, мир!');
console.log(lang); // ru
```

### Получение списка поддерживаемых языков

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
});

// Получаем список языков
const languages = await library.getSupportedLanguages();
console.log(languages);
```

### Использование с Yandex Translate

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.YANDEX,
  defaultApiKey: 'your-yandex-api-key',
});

const result = await library.translate({
  text: 'Hello, world!',
  targetLanguage: 'ru',
});
console.log(result.text);
```

### Использование с LibreTranslate

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.LIBRETRANSLATE,
  defaultEndpoint: 'https://libretranslate.de/translate',
  defaultApiKey: 'your-api-key', // Опционально
});

const result = await library.translate({
  text: 'Hello, world!',
  targetLanguage: 'ru',
});
console.log(result.text);
```

### Перевод с указанием исходного языка

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
});

const result = await library.translate({
  text: 'Hello, world!',
  targetLanguage: 'ru',
  sourceLanguage: 'en',
});
console.log(result.text);
```

### Обработка ошибок

```typescript
import { TranslationLibrary, TranslatorProvider, TranslationError } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
});

try {
  const result = await library.translate({
    text: '', // Пустой текст вызовет ошибку
    targetLanguage: 'ru',
  });
} catch (error) {
  if (error instanceof TranslationError) {
    console.log(`Ошибка перевода: ${error.message}`);
    console.log(`Провайдер: ${error.provider}`);
  }
}
```

### Настройка таймаута и количества попыток

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
  defaultTimeout: 60000, // 60 секунд
  defaultRetries: 5,
});
```

### Перевод с сохранением ссылок

```typescript
import { TranslationLibrary, TranslatorProvider } from './index';

const library = new TranslationLibrary({
  defaultProvider: TranslatorProvider.GOOGLE,
});

const textWithLinks = `
  Привет! Посетите наш сайт [https://example.com](https://example.com)
  Или посмотрите [документацию](https://docs.example.com)
`;

const result = await library.translate({
  text: textWithLinks,
  targetLanguage: 'en',
});

console.log(result.text);
```

## API

### TranslationLibrary

Класс для работы с библиотекой перевода.

#### Конструктор

```typescript
new TranslationLibrary({
  defaultProvider?: TranslatorProvider,
  defaultApiKey?: string,
  defaultEndpoint?: string,
  defaultTimeout?: number,
  defaultRetries?: number,
})
```

#### Методы

- `translate(options: TranslationOptions) -> Promise<TranslationResult>`
  Выполняет перевод текста.

- `detectLanguage(text: string) -> Promise<string>`
  Определяет язык текста.

- `getSupportedLanguages() -> Promise<string[]>`
  Получает список поддерживаемых языков.

- `close() -> Promise<void>`
  Закрывает все ресурсы.

### TranslationResult

Результат перевода.

- `text: string` - Переведённый текст
- `sourceLanguage: string | null` - Исходный язык
- `provider: TranslatorProvider` - Провайдер перевода

### TranslationOptions

Опции перевода.

- `text: string` - Текст для перевода
- `targetLanguage: string` - Целевой язык
- `sourceLanguage?: string` - Исходный язык

### TranslationError

Ошибка перевода.

- `message: string` - Сообщение об ошибке
- `provider: TranslatorProvider | null` - Провайдер перевода
- `statusCode?: number` - Код статуса HTTP
- `details?: any` - Дополнительные детали

### TranslatorProvider

Перечисление провайдеров перевода.

- `GOOGLE` - Google Translate
- `YANDEX` - Yandex Translate
- `LIBRETRANSLATE` - LibreTranslate

## Поддерживаемые языки

### Google Translate

Google Translate поддерживает более 100 языков, включая:
- af, sq, am, ar, hy, az, eu, be, bn, bs, bg, ca, zh-CN, zh-TW, hr, cs, da, nl, en, eo, et, fi, fr, gl, ka, de, el, gu, ht, he, hi, hu, is, id, ga, it, ja, jw, kn, kk, km, ko, ku, ky, lo, la, lv, lt, mk, ms, ml, mt, mi, mr, mn, my, ne, no, fa, pl, pt, pa, ro, ru, sr, sk, sl, es, sw, sv, tl, ta, te, th, tr, uk, ur, uz, vi, cy, yi, zu

### Yandex Translate

Yandex Translate поддерживает более 100 языков, включая:
- af, sq, am, ar, hy, az, be, bn, bg, ca, ceb, co, cs, da, nl, en, eo, et, fi, fr, fy, gl, ka, de, el, gu, ht, ha, haw, he, hi, hmn, hu, is, ig, id, ga, it, ja, jv, kn, kk, km, rw, ko, ku, ky, lo, la, lv, lt, lb, mk, mg, ms, ml, mt, mi, mr, mn, my, ne, no, ny, or, ps, fa, pl, pt, pa, ro, ru, sm, gd, sr, st, sn, sd, si, sk, sl, so, es, su, sw, sv, tg, ta, tt, te, th, tr, tk, uk, ur, ug, uz, vi, cy, xh, yi, yo, zu

### LibreTranslate

LibreTranslate поддерживает языки, доступные на выбранном сервере. Обычно это основные мировые языки.

## Лицензия

MIT License