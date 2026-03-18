/**
 * Модуль для разбивки текста на чанки
 * Основан на реализации из SillyTavern
 */

import { TranslationError } from './types';

/**
 * Разбивает текст на чанки заданного размера
 * @param text Текст для разбивки
 * @param maxSize Максимальный размер чанка в символах
 * @returns Массив чанков
 */
export function chunkText(text: string, maxSize: number): string[] {
  if (!text || text.length <= maxSize) {
    return [text];
  }

  const chunks: string[] = [];
  let position = 0;

  while (position < text.length) {
    // Пытаемся разбить по предложению или абзацу
    let chunkEnd = Math.min(position + maxSize, text.length);

    // Если это не конец текста, пытаемся найти границу предложения
    if (chunkEnd < text.length) {
      // Ищем точку, восклицательный или вопросительный знак
      const sentenceEnd = text.slice(position, chunkEnd).search(/[.!?]\s/);
      if (sentenceEnd > maxSize * 0.5) {
        chunkEnd = position + sentenceEnd + 1;
      } else {
        // Ищем перенос строки
        const newlineEnd = text.slice(position, chunkEnd).search(/\n\s*/);
        if (newlineEnd > maxSize * 0.5) {
          chunkEnd = position + newlineEnd;
        }
      }
    }

    const chunk = text.slice(position, chunkEnd).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    position = chunkEnd;
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Разбивает текст по предложениям
 * @param text Текст для разбивки
 * @returns Массив предложений
 */
export function splitBySentences(text: string): string[] {
  // Регулярное выражение для разделения по предложениям
  const sentenceRegex = /([^.!?]+[.!?]+["']?|\S+)/g;
  const matches = text.match(sentenceRegex) || [];
  
  return matches.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Объединяет чанки обратно в текст
 * @param chunks Массив чанков
 * @returns Объединённый текст
 */
export function mergeChunks(chunks: string[]): string {
  return chunks.join(' ');
}

/**
 * Сохраняет ссылки на изображения при чанковании
 * @param text Текст для чанкования
 * @param maxSize Максимальный размер чанка
 * @returns Объект с чанками и ссылками
 */
export function chunkWithLinks(text: string, maxSize: number): {
  chunks: string[];
  links: string[];
} {
  // Разделяем текст по ссылкам на изображения
  const imageRegex = /!\[.*?\]\([^)]*\)/g;
  const chunks = text.split(imageRegex);
  const links = [...text.matchAll(imageRegex)].map(m => m[0]);

  const resultChunks: string[] = [];
  const resultLinks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk || chunk.trim().length === 0) {
      continue;
    }

    const chunkChunks = chunkText(chunk, maxSize);
    resultChunks.push(...chunkChunks);

    if (i < links.length) {
      resultLinks.push(links[i]);
    }
  }

  return { chunks: resultChunks, links: resultLinks };
}

/**
 * Восстанавливает текст из чанков с сохранением ссылок
 * @param chunks Массив чанков
 * @param links Массив ссылок
 * @returns Восстановленный текст
 */
export function restoreTextWithLinks(chunks: string[], links: string[]): string {
  let result = '';
  for (let i = 0; i < chunks.length; i++) {
    result += chunks[i];
    if (i < links.length) {
      result += links[i];
    }
  }
  return result;
}

/**
 * Нормализует текст для перевода
 * @param text Текст для нормализации
 * @returns Нормализованный текст
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n') //统一换行符
    .replace(/\t/g, '    ') // Заменяем табы на пробелы
    .replace(/  +/g, ' '); // Убираем множественные пробелы
}

/**
 * Проверка валидности текста для перевода
 * @param text Текст для проверки
 * @returns true если текст валиден
 */
export function isValidText(text: string): boolean {
  return typeof text === 'string' && text.length > 0;
}