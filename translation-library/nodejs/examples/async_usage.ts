/**
 * Примеры асинхронного использования библиотеки перевода
 */

import { TranslationLibrary, TranslatorProvider } from '../index';

/**
 * Асинхронный перевод с использованием Google Translate
 */
async function asyncGoogleTranslation(): Promise<void> {
  console.log('=== Асинхронный перевод Google Translate ===');

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
 * Асинхронный перевод с использованием LibreTranslate
 */
async function asyncLibretranslateTranslation(): Promise<void> {
  console.log('=== Асинхронный перевод LibreTranslate ===');

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
 * Асинхронный перевод нескольких текстов
 */
async function asyncMultipleTranslations(): Promise<void> {
  console.log('=== Асинхронный перевод нескольких текстов ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.LIBRETRANSLATE,
    defaultEndpoint: 'https://libretranslate.de/translate',
  });

  const texts = [
    'Hello, world!',
    'Bonjour le monde!',
    'Hallo Welt!',
    'Ciao mondo!',
  ];

  // Создаём задачи для параллельного перевода
  const tasks = texts.map((text) =>
    library.translate({
      text,
      targetLanguage: 'ru',
    }),
  );

  // Выполняем все задачи параллельно
  const results = await Promise.all(tasks);

  for (let i = 0; i < texts.length; i++) {
    console.log(`${i + 1}. ${texts[i]} -> ${results[i].text}`);
  }
  console.log('');
}

/**
 * Асинхронное определение языка
 */
async function asyncLanguageDetection(): Promise<void> {
  console.log('=== Асинхронное определение языка ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.LIBRETRANSLATE,
    defaultEndpoint: 'https://libretranslate.de/detect',
  });

  const testTexts = [
    'Hello, world!',
    'Привет, мир!',
    'Bonjour le monde!',
    'Hallo Welt!',
  ];

  // Создаём задачи для параллельного определения языка
  const tasks = testTexts.map((text) => library.detectLanguage(text));

  // Выполняем все задачи параллельно
  const results = await Promise.all(tasks);

  for (let i = 0; i < testTexts.length; i++) {
    console.log(`${testTexts[i]} -> ${results[i]}`);
  }
  console.log('');
}

/**
 * Асинхронное получение списка поддерживаемых языков
 */
async function asyncSupportedLanguages(): Promise<void> {
  console.log('=== Асинхронное получение списка поддерживаемых языков ===');

  const library = new TranslationLibrary({
    defaultProvider: TranslatorProvider.LIBRETRANSLATE,
    defaultEndpoint: 'https://libretranslate.de/languages',
  });

  const languages = await library.getSupportedLanguages();

  console.log(`Всего поддерживаемых языков: ${languages.length}`);
  console.log(`Первые 10 языков: ${languages.slice(0, 10).join(', ')}`);
  console.log('');
}

async function main(): Promise<void> {
  await asyncGoogleTranslation();
  await asyncLibretranslateTranslation();
  await asyncMultipleTranslations();
  await asyncLanguageDetection();
  await asyncSupportedLanguages();
}

main().catch(console.error);