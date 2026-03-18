/**
 * Тестовый скрипт для проверки работы библиотеки перевода
 */

import { TranslationLibrary, TranslatorProvider } from './src/translation-library/index';

// Короткий текст для перевода
const shortText = 'Hello, world! This is a simple test.';

// Длинный текст для перевода
const longText = `
  Welcome to our comprehensive guide on artificial intelligence. 
  Artificial intelligence (AI) is transforming the way we live and work. 
  From healthcare to finance, AI is being used to solve complex problems 
  and improve efficiency. In this article, we will explore the key concepts 
  of AI, its applications, and the future of this exciting technology.
  
  Machine learning is a subset of AI that enables systems to learn and 
  improve from experience without being explicitly programmed. Deep learning, 
  a further subset of machine learning, uses neural networks with many layers 
  to process complex patterns in data. These technologies are powering 
  breakthroughs in natural language processing, computer vision, and robotics.
  
  The potential applications of AI are vast. In healthcare, AI algorithms 
  can analyze medical images to detect diseases earlier than human doctors. 
  In finance, AI-powered systems can detect fraudulent transactions in real-time. 
  In transportation, autonomous vehicles are being developed to reduce accidents 
  and improve traffic flow.
  
  However, AI also presents challenges. As AI systems become more sophisticated, 
  questions arise about job displacement, privacy, and ethical decision-making. 
  It is important to develop AI responsibly, ensuring that the benefits are 
  shared widely and that potential risks are managed effectively.
  
  For more information, visit our website at https://example.com/ai-guide 
  or check out our documentation at https://docs.example.com/ai.
`;

async function testNodeJs(): Promise<void> {
  console.log('=== Тестирование Node.js библиотеки ===\n');

  // Тест с Google Translate
  console.log('--- Тест с Google Translate ---');
  try {
    const googleLibrary = new TranslationLibrary({
      provider: 'google',
    });

    console.log('\nКороткий текст:');
    console.log(`Исходный: ${shortText}`);
    const shortResult = await googleLibrary.translate(shortText, 'ru');
    console.log(`Перевод: ${shortResult.text}`);

    console.log('\nДлинный текст:');
    console.log(`Исходный: ${longText.substring(0, 100)}...`);
    const longResult = await googleLibrary.translate(longText, 'ru');
    console.log(`Перевод: ${longResult.text.substring(0, 200)}...`);
    console.log(`Всего символов в переводе: ${longResult.text.length}`);
  } catch (error) {
    console.error('Ошибка Google Translate:', error);
  }

  // Тест с LibreTranslate
  console.log('\n--- Тест с LibreTranslate ---');
  try {
    const libreLibrary = new TranslationLibrary({
      provider: 'libre',
      endpoint: 'http://127.0.0.1:5000/translate',
    });

    console.log('\nКороткий текст:');
    console.log(`Исходный: ${shortText}`);
    const shortResult = await libreLibrary.translate(shortText, 'ru');
    console.log(`Перевод: ${shortResult.text}`);

    console.log('\nДлинный текст:');
    console.log(`Исходный: ${longText.substring(0, 100)}...`);
    const longResult = await libreLibrary.translate(longText, 'ru');
    console.log(`Перевод: ${longResult.text.substring(0, 200)}...`);
    console.log(`Всего символов в переводе: ${longResult.text.length}`);
  } catch (error) {
    console.error('Ошибка LibreTranslate:', error);
  }

  // Тест с Yandex Translate
  console.log('\n--- Тест с Yandex Translate ---');
  try {
    const yandexLibrary = new TranslationLibrary({
      provider: 'yandex',
      // API ключ можно добавить здесь
    });

    console.log('\nКороткий текст:');
    console.log(`Исходный: ${shortText}`);
    const shortResult = await yandexLibrary.translate(shortText, 'ru');
    console.log(`Перевод: ${shortResult.text}`);

    console.log('\nДлинный текст:');
    console.log(`Исходный: ${longText.substring(0, 100)}...`);
    const longResult = await yandexLibrary.translate(longText, 'ru');
    console.log(`Перевод: ${longResult.text.substring(0, 200)}...`);
    console.log(`Всего символов в переводе: ${longResult.text.length}`);
  } catch (error) {
    console.error('Ошибка Yandex Translate:', error);
  }
}

testNodeJs().catch(console.error);