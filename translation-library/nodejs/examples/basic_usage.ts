/**
 * Примеры базового использования библиотеки перевода
 */

import { TranslationLibrary, TranslatorProvider } from '../index';

/**
 * Базовый перевод с использованием Google Translate
 */
async function basicGoogleTranslation(): Promise<void> {
  console.log('=== Базовый перевод Google Translate ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
  });

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: 'ru',
  });

  console.log(`Исходный текст: Hello, world!`);
  console.log(`Перевод: ${result.text}`);
  console.log(`Провайдер: ${result.provider}`);
  console.log('');
}

/**
 * Базовый перевод с использованием Yandex Translate
 */
async function basicYandexTranslation(): Promise<void> {
  console.log('=== Базовый перевод Yandex Translate ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.YANDEX,
    // API ключ можно передать здесь или через переменную окружения
    // defaultApiKey: 'your-yandex-api-key',
  });

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: 'ru',
  });

  console.log(`Исходный текст: Hello, world!`);
  console.log(`Перевод: ${result.text}`);
  console.log(`Провайдер: ${result.provider}`);
  console.log('');
}

/**
 * Базовый перевод с использованием LibreTranslate
 */
async function basicLibretranslateTranslation(): Promise<void> {
  console.log('=== Базовый перевод LibreTranslate ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.LIBRETRANSLATE,
    defaultEndpoint: 'https://libretranslate.de/translate',
  });

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: 'ru',
  });

  console.log(`Исходный текст: Hello, world!`);
  console.log(`Перевод: ${result.text}`);
  console.log(`Провайдер: ${result.provider}`);
  console.log('');
}

/**
 * Перевод с указанием исходного языка
 */
async function translationWithSourceLanguage(): Promise<void> {
  console.log('=== Перевод с указанием исходного языка ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
  });

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: 'ru',
    sourceLanguage: 'en',
  });

  console.log(`Исходный текст: Hello, world!`);
  console.log(`Исходный язык: en`);
  console.log(`Перевод: ${result.text}`);
  console.log('');
}

/**
 * Перевод с использованием TranslationOptions
 */
async function translationWithOptions(): Promise<void> {
  console.log('=== Перевод с использованием TranslationOptions ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
  });

  const options = {
    targetLanguage: 'de',
    sourceLanguage: 'en',
  };

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: options.targetLanguage,
    sourceLanguage: options.sourceLanguage,
  });

  console.log(`Исходный текст: Hello, world!`);
  console.log(`Перевод: ${result.text}`);
  console.log('');
}

/**
 * Определение языка текста
 */
async function detectLanguage(): Promise<void> {
  console.log('=== Определение языка текста ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
  });

  const testTexts = [
    'Hello, world!',
    'Привет, мир!',
    'Bonjour le monde!',
    'Hallo Welt!',
  ];

  for (const text of testTexts) {
    const lang = await library.detectLanguage(text);
    console.log(`Текст: ${text} -> Язык: ${lang}`);
  }
  console.log('');
}

/**
 * Получение списка поддерживаемых языков
 */
async function getSupportedLanguages(): Promise<void> {
  console.log('=== Список поддерживаемых языков (первые 10) ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
  });

  const languages = await library.getSupportedLanguages();

  console.log(`Всего поддерживаемых языков: ${languages.length}`);
  console.log(`Первые 10 языков: ${languages.slice(0, 10).join(', ')}`);
  console.log('');
}

/**
 * Обработка ошибок
 */
async function errorHandling(): Promise<void> {
  console.log('=== Обработка ошибок ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
  });

  try {
    // Пустой текст вызовет ошибку
    await library.translate({
      text: '',
      targetLanguage: 'ru',
    });
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Ошибка перевода: ${error.message}`);
    }
  }
  console.log('');
}

/**
 * Настройка таймаута и количества попыток
 */
async function customTimeoutAndRetries(): Promise<void> {
  console.log('=== Настройка таймаута и количества попыток ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.GOOGLE,
    defaultTimeout: 60000, // 60 секунд
    defaultRetries: 5,
  });

  const result = await library.translate({
    text: 'Hello, world!',
    targetLanguage: 'ru',
  });

  console.log(`Перевод: ${result.text}`);
  console.log('');
}

/**
 * Перевод с сохранением ссылок
 */
async function translationWithLinks(): Promise<void> {
  console.log('=== Перевод с сохранением ссылок ===');

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

  console.log(`Исходный текст: ${textWithLinks}`);
  console.log(`Перевод: ${result.text}`);
  console.log('');
}

async function main(): Promise<void> {
  await basicGoogleTranslation();
  // await basicYandexTranslation(); // Требует API ключ
  // await basicLibretranslateTranslation(); // Может быть медленным
  await translationWithSourceLanguage();
  await translationWithOptions();
  await detectLanguage();
  await getSupportedLanguages();
  await errorHandling();
  await customTimeoutAndRetries();
  await translationWithLinks();
}

main().catch(console.error);