/**
 * Модуль для защиты HTML/XML тегов при переводе
 * 
 * Позволяет извлекать теги из текста перед переводом и восстанавливать их после,
 * чтобы переводчик не изменял структуру тегов.
 */

import { chunkText, mergeChunks } from './chunker';

/**
 * Паттерны тегов, которые нужно защищать при переводе
 * Включает как одинарные так и парные теги
 * 
 * ВАЖНО: Паттерны должны включать закрывающую > для парных тегов
 * например <speech> а не просто speech
 */
export const PROTECTED_TAG_PATTERNS = [
  // ====== ОСНОВНЫЕ АНГЛИЙСКИЕ ТЕГИ ======
  // Основные теги для ролей - ОТКРЫВАЮЩИЕ с >
  '<speech>', '<narration>', '<narr>', '<system>', '<system_o>',
  '<description>', '<comment>', '<action>', '<ai>', '<user>', '<you>',
  '<voice>', '<emotion>', '<thought>', '<internal>', '<whisper>',
  '<external>', '<phone>', '<radio>', '<telepathy>', '<flashback>',
  '<dream>', '<italic>', '<bold>', '<b>', '<i>', '<u>',
  '<spoiler>', '<details>', '<summary>', '<code>', '<pre>',
  '<blockquote>', '<p>', '<div>', '<span>', '<mark>', '<quote>',
  '<em>', '<strong>', '<h1>', '<h2>', '<h3>',
  '<ul>', '<ol>', '<li>', '<table>', '<tr>', '<td>', '<th>',
  
  // ====== РУССКИЕ ВАРИАНТЫ ТЕГОВ (переведённые теги) ======
  // <речь> = <speech>
  '<речь>', '<рассказ>', '<повествование>', '<озвуч>', '<закадровый>', '<закадровый текст>', '<перевод>',
  // <рассказ> variants
  '<диалог>', '<реплика>', '<голос>', '<эмоция>', '<мысль>', '<внутренний>', '<шепот>',
  '<внешний>', '<телефон>', '<радио>', '<телепатия>', '<воспоминание>', '<мечта>',
  // Закрывающие русские теги
  '</речь>', '</рассказ>', '</повествование>', '</озвуч>', '</закадровый>', '</закадровый текст>', '</перевод>',
  '</диалог>', '</реплика>', '</голос>', '</эмоция>', '</мысль>', '</внутренний>', '</шепот>',
  '</внешний>', '</телефон>', '</радио>', '</телепатия>', '</воспоминание>', '</мечта>',
  
  // ====== АНГЛИЙСКИЕ ЗАКРЫВАЮЩИЕ ТЕГИ ======
  '</speech>', '</narration>', '</narr>', '</system>', '</system_o>',
  '</description>', '</comment>', '</action>', '</ai>', '</user>', '</you>',
  '</voice>', '</emotion>', '</thought>', '</internal>', '</whisper>',
  '</external>', '</phone>', '</radio>', '</telepathy>', '</flashback>',
  '</dream>', '</italic>', '</bold>', '</b>', '</i>', '</u>',
  '</spoiler>', '</details>', '</summary>', '</code>', '</pre>',
  '</blockquote>', '</p>', '</div>', '</span>', '</mark>', '</quote>',
  '</em>', '</strong>', '</h1>', '</h2>', '</h3>',
  '</ul>', '</ol>', '</li>', '</table>', '</tr>', '</td>', '</th>',
  
  // ====== РУССКИЕ SELF-CLOSING ТЕГИ ======
  '<речь/>', '<рассказ/>', '<повествование/>', '<озвуч/>', '<закадровый/>', '<закадровый текст/>', '<перевод/>',
  '<диалог/>', '<реплика/>', '<голос/>', '<эмоция/>', '<мысль/>', '<внутренний/>', '<шепот/>',
  '<внешний/>', '<телефон/>', '<радио/>', '<телепатия/>', '<воспоминание/>', '<мечта/>',
  
  // ====== АНГЛИЙСКИЕ SELF-CLOSING ТЕГИ ======
  '<speech/>', '<narration/>', '<narr/>', '<system/>', '<system_o/>',
  '<description/>', '<comment/>', '<action/>', '<ai/>', '<user/>', '<you/>',
  '<voice/>', '<emotion/>', '<thought/>', '<internal/>', '<whisper/>',
  '<external/>', '<phone/>', '<radio/>', '<telepathy/>', '<flashback/>',
  '<dream/>', '<italic/>', '<bold/>', '<b/>', '<i/>', '<u/>',
  '<spoiler/>', '<details/>', '<summary/>', '<code/>', '<pre/>',
  '<blockquote/>', '<p/>', '<br/>', '<hr/>', '<div/>', '<span/>',
  '<mark/>', '<quote/>', '<em/>', '<strong/>',
  '<h1/>', '<h2/>', '<h3/>',
  '<ul/>', '<ol/>', '<li/>', '<table/>', '<tr/>', '<td/>', '<th/>',
  '<img/>', '<a/>',
  
  // Одинарные теги с > (самозакрывающиеся в HTML стиле)
  '<br>', '<hr>',
];

/**
 * Структура для хранения информации о тегах
 */
export interface TagInfo {
  /** Полный тег включая скобки, например: <speech> или </speech> */
  tag: string;
  /** Уникальный placeholder для замены тега */
  placeholder: string;
  /** Тип тега: 'opening', 'closing', 'self-closing', или 'attribute' */
  type: 'opening' | 'closing' | 'self-closing' | 'attribute';
  /** Позиция в оригинальном тексте */
  index: number;
}

/**
 * Извлекает все защищаемые теги из текста
 * @param text - Исходный текст
 * @returns Объект с извлечёнными тегами и текстом без тегов
 */
export function extractTags(text: string): { 
  textWithoutTags: string; 
  tags: TagInfo[]; 
  placeholderMap: Map<string, string>;
  originalOrder: Array<{ placeholder: string; tag: string; type: string; index: number }>;
} {
  const tags: TagInfo[] = [];
  const placeholderMap = new Map<string, string>();
  let result = text;
  let placeholderCounter = 0;

  // Генерирует уникальный идентификатор для плейсхолдера
  // Использует только цифры - переводчик точно не тронет
  // Формат: 010000001 (opening) | 020000001 (closing) | 030000001 (self-closing)
  function generatePlaceholderUUID(tagType: string): string {
    placeholderCounter++;
    // Тип тега: 2 цифры на основе типа
    const typeMap: Record<string, string> = {
      'opening': '01',
      'closing': '02',
      'self-closing': '03',
    };
    const typeCode = typeMap[tagType] || '01';
    
    // Уникальный номер: 7 цифр
    const id = String(placeholderCounter).padStart(7, '0');
    
    return typeCode + id;
  }

  // Собираем все позиции тегов с их исходными индексами
  const tagPositionsMap = new Map<number, { tag: string; type: string; length: number }>();

  // Регулярное выражение для поиска всех HTML/XML подобных тегов
  // Ищем <word...> или </word...> или <word.../>
  // Поддерживает латиницу (A-Za-z) и кириллицу (А-Яа-яЁё) в именах тегов
  // Первый символ после < или </ должен быть буквой (латиница или кириллица)
  // Важно: порядок альтернатив имеет значение - сначала проверяем /> (self-closing), затем > (opening/closing)
  const tagRegex = /<\/?[a-zA-Z\u0400-\u04FF][\w\u0400-\u04FF0-9-]*(?:\s+[^>]*)?\/?>|<\/?[a-zA-Z\u0400-\u04FF][\w\u0400-\u04FF0-9-]*\/?>/g;
  
  const foundTags = new Set<string>();
  
  // Сначала собираем все уникальные теги из PROTECTED_TAG_PATTERNS
  for (const pattern of PROTECTED_TAG_PATTERNS) {
    foundTags.add(pattern.toLowerCase());
  }
  
  // Теперь ищем все теги в тексте и проверяем, входят ли они в защищаемые
  let match;
  
  while ((match = tagRegex.exec(text)) !== null) {
    const fullTag = match[0]; // Полный тег как найден в тексте, включая > или />
    const foundIndex = match.index;
    const fullTagLower = fullTag.toLowerCase();
    
    // Проверяем, является ли этот тег защищаемым
    let isProtected = false;
    let protectedPattern = '';
    
    for (const pattern of foundTags) {
      if (fullTagLower === pattern.toLowerCase()) {
        isProtected = true;
        protectedPattern = pattern;
        break;
      }
    }
    
    if (!isProtected) continue;
    
    // Проверяем контекст: тег должен начинаться с правильной позиции
    const beforeChar = foundIndex > 0 ? text[foundIndex - 1] : '';
    
    // Тег может начинаться:
    // - с начала строки/текста
    // - после пробела, переноса строки, tab
    // - после символа < (вложенные теги: <speech><narration>)
    // - после символа > (вложенные закрывающие теги: </speech><narration>)
    // - после любой буквы/символа для закрывающих тегов (content</speech>)
    //   Для закрывающих тегов (<...>) всегда разрешаем, так как они закрывают предыдущий контент
    const isTagStart = foundIndex === 0 
      || /\s|<|>|[\n\r]/.test(beforeChar)
      || fullTag.startsWith('</'); // content</speech> - закрывающий тег всегда допустим
    
    const isTagEnd = true;
    
    if (!isTagStart || !isTagEnd) continue;
    
    // Проверяем, что этот тег не был уже добавлен (избегаем конфликтов на одной позиции)
    if (!tagPositionsMap.has(foundIndex)) {
      let type: 'opening' | 'closing' | 'self-closing' | 'attribute' = 'opening';
      if (fullTag.startsWith('</')) {
        type = 'closing';
      } else if (fullTag.endsWith('/>')) {
        type = 'self-closing';
      }
      
      tagPositionsMap.set(foundIndex, {
        tag: protectedPattern,
        type,
        length: protectedPattern.length
      });
    }
  }

  // Сортируем теги по позиции (от конца к началу для безопасной замены)
  const sortedPositions = Array.from(tagPositionsMap.entries())
    .sort((a, b) => b[0] - a[0]);

  // Создаём плейсхолдеры и заменяем теги (от конца к началу)
  // Формат: [45:0000001] - только цифры, переводчик не тронет
  // 45 = префикс для тегов (фиксированный), далее 7 цифр уникального номера
  for (const [index, pos] of sortedPositions) {
    const id = generatePlaceholderUUID(pos.type);
    const placeholder = `[45:${id}]`;
    placeholderMap.set(placeholder, pos.tag);
    
    tags.push({
      tag: pos.tag,
      placeholder,
      type: pos.type as 'opening' | 'closing' | 'self-closing' | 'attribute',
      index
    });
    
    result = result.substring(0, index) + placeholder + result.substring(index + pos.length);
  }

  // Собираем оригинальный порядок (от начала к концу)
  const originalOrder = tags
    .sort((a, b) => a.index - b.index)
    .map(t => ({
      placeholder: t.placeholder,
      tag: t.tag,
      type: t.type,
      index: t.index
    }));

  return {
    textWithoutTags: result,
    tags,
    placeholderMap,
    originalOrder
  };
}

/**
 * Восстанавливает теги из текста используя карту плейсхолдеров
 * @param text - Текст с плейсхолдерами
 * @param placeholderMap - Карта соответствия плейсхолдер -> тег
 * @returns Текст с восстановленными тегами
 */
export function restoreTags(
  text: string, 
  placeholderMap: Map<string, string>
): string {
  let result = text;
  
  for (const [placeholder, tag] of placeholderMap.entries()) {
    result = result.split(placeholder).join(tag);
  }
  
  return result;
}

/**
 * Переводит текст с защитой HTML/XML тегов
 * 1. Извлекает теги из текста
 * 2. Разбивает текст на чанки
 * 3. Переводит каждый чанк
 * 4. Восстанавливает теги в переведённом тексте
 * 
 * @param text - Текст для перевода
 * @param translateFn - Функция перевода для одного чанка
 * @param chunkSize - Размер чанка для разбивки (по умолчанию 4000)
 * @returns Переведённый текст с сохранёнными тегами
 */
export async function translateWithTagProtection(
  text: string,
  translateFn: (chunk: string) => Promise<string>,
  chunkSize: number = 4000
): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Шаг 1: Извлекаем теги из текста
  const { textWithoutTags, placeholderMap, originalOrder } = extractTags(text);
  
  if (originalOrder.length === 0) {
    // Тегов нет, просто переводим
    return translateFn(text);
  }

  // Шаг 2: Разбиваем текст без тегов на чанки и переводим
  const chunks = chunkText(textWithoutTags, chunkSize);
  const translatedChunks: string[] = [];

  for (const chunk of chunks) {
    if (chunk.trim().length === 0) {
      translatedChunks.push(chunk);
      continue;
    }
    
    const translated = await translateFn(chunk);
    translatedChunks.push(translated);
  }

  // Шаг 3: Объединяем переведённые чанки
  let translatedText = mergeChunks(translatedChunks);

  // Шаг 4: Восстанавливаем теги
  translatedText = restoreTags(translatedText, placeholderMap);

  return translatedText;
}

/**
 * Проверяет, содержит ли текст защищаемые теги
 * @param text - Текст для проверки
 * @returns true если теги найдены
 */
export function hasProtectedTags(text: string): boolean {
  const textLower = text.toLowerCase();
  return PROTECTED_TAG_PATTERNS.some(tag => textLower.includes(tag.toLowerCase()));
}

/**
 * Получает список всех уникальных тегов, найденных в тексте
 * @param text - Текст для анализа
 * @returns Массив найденных тегов
 */
export function getFoundTags(text: string): string[] {
  const foundTags = new Set<string>();
  const textLower = text.toLowerCase();
  
  for (const tag of PROTECTED_TAG_PATTERNS) {
    if (textLower.includes(tag.toLowerCase())) {
      foundTags.add(tag);
    }
  }
  
  return Array.from(foundTags);
}