/**
 * Интерфейс для данных статус-бара
 */
export interface StatusBarData {
  calendar: string;
  weather: string;
  location: string;
  npcs: string;
}

/**
 * Парсит статус-бар из текста
 * Возвращает объект с данными или null если формат не распознан
 * 
 * Формат: [Label1: Value1 | Label2: Value2 | Label3: Value3 | Label4: Value4]
 * Ориентируется только на структуру, не на конкретные слова
 */
export function parseStatusBar(text: string): StatusBarData | null {
  // Ищем паттерн [...] в начале текста
  const match = text.match(/^\[([^\]]+)\]/);
  if (!match) return null;
  
  const content = match[1];
  // Разбиваем по " | " (пробел-вертикальная черта-пробел)
  const parts = content.split(/\s*\|\s*/);
  
  // Должно быть ровно 4 части
  if (parts.length !== 4) return null;
  
  // Парсим каждую часть: берем всё после первого двоеточия
  const parsePart = (part: string): string => {
    const colonIndex = part.indexOf(':');
    if (colonIndex === -1) return part.trim();
    return part.substring(colonIndex + 1).trim();
  };
  
  return {
    calendar: parsePart(parts[0]),
    weather: parsePart(parts[1]),
    location: parsePart(parts[2]),
    npcs: parsePart(parts[3]),
  };
}

/**
 * Извлекает статус-бар из начала текста и возвращает { statusBar, content }
 */
export function extractStatusBar(text: string): { 
  statusBar: StatusBarData | null; 
  content: string; 
} {
  const parsed = parseStatusBar(text);
  if (!parsed) {
    return { statusBar: null, content: text };
  }
  
  // Удаляем статус-бар из начала текста
  const content = text.replace(/^\[[^\]]+\]\s*/, '');
  return { statusBar: parsed, content };
}

// ==================== Работа со всеми статус-блоками в тексте ====================

/**
 * Паттерн для поиска статус-блока: [...]
 * where each part has format "Label: Value" separated by " | "
 */
const STATUS_BAR_PATTERN = /\[([^\]]+)\]/;

/**
 * Проверяет, является ли найденный блок статус-баром (имеет правильную структуру)
 */
function isStatusBarBlock(block: string): boolean {
  const match = block.match(/^\[([^\]]+)\]$/);
  if (!match) return false;
  
  const content = match[1];
  const parts = content.split(/\s*\|\s*/);
  return parts.length === 4;
}

/**
 * Находит все статус-блоки в тексте и возвращает их вместе с позициями.
 * Возвращает массив объектов: { block: полный блок строкой, index: позиция в тексте, parsed: распаршенные данные }
 */
export function findAllStatusBarBlocks(text: string): Array<{
  block: string;
  index: number;
  parsed: StatusBarData;
}> {
  const results: Array<{ block: string; index: number; parsed: StatusBarData }> = [];
  let searchFrom = 0;
  
  while (searchFrom < text.length) {
    const match = text.slice(searchFrom).match(STATUS_BAR_PATTERN);
    if (!match) break;
    
    const fullBlock = match[0];
    const absoluteIndex = searchFrom + match.index!;
    
    if (isStatusBarBlock(fullBlock)) {
      const parsed = parseStatusBar(fullBlock);
      if (parsed) {
        results.push({ block: fullBlock, index: absoluteIndex, parsed });
      }
    }
    
    searchFrom = absoluteIndex + fullBlock.length;
  }
  
  return results;
}

/**
 * Нормализует позицию статус-блока в тексте:
 * - Если 0 блоков → возвращает текст без изменений
 * - Если 1 блок не в начале → переносит в начало
 * - Если 1 блок уже в начале → возвращает как есть
 * - Если 2+ блоков и первый уже на позиции 0 → возвращает как есть
 * - Если 2+ блоков и ни один не на позиции 0 → переносит первый найденный в начало
 *
 * ВАЖНО: При стриминге модель может генерировать незавершённые статус-бары.
 * Мы проверяем только наличие незавершённого статус-бара (с ":" и "|" после "["),
 * а не просто наличие "[" после "]". Это позволяет тексту с обычными скобками
 * обрабатываться нормально.
 *
 * Возвращает { content: текст с блоком в начале (или без него), allParsed: все распаршенные блоки }
 */
export function normalizeStatusBarPosition(text: string): {
  content: string;
  allParsed: StatusBarData[];
} {
  const allBlocks = findAllStatusBarBlocks(text);
  
  // Нет блоков — ничего не делаем
  if (allBlocks.length === 0) {
    return { content: text, allParsed: [] };
  }
  
  // Есть хотя бы один блок
  const firstBlock = allBlocks[0];
  const firstBlockIsAtStart = firstBlock.index === 0;
  
  // === ЗАЩИТА ОТ СТРИМИНГ-АРТЕФАКТОВ ===
  // Проверяем только наличие незавершённого статус-бара в конце текста.
  // Незавершённый статус-бар: есть "[" после последней "]", и после "[" есть ":" и "|"
  // (что отличает его от обычной скобки в тексте)
  const lastOpenBracket = text.lastIndexOf('[');
  const lastCloseBracket = text.lastIndexOf(']');
  
  if (lastOpenBracket > lastCloseBracket) {
    // Есть открывающая скобка после последней закрывающей
    // Проверяем, действительно ли это похоже на статус-бар (содержит ":" и "|")
    const afterBracket = text.slice(lastOpenBracket);
    if (afterBracket.includes(':') && afterBracket.includes('|')) {
      // Это незавершённый статус-бар - возвращаем текст как есть
      return { content: text, allParsed: [] };
    }
  }
  
  if (allBlocks.length === 1) {
    // Один блок
    if (firstBlockIsAtStart) {
      // Уже в начале — возвращаем как есть
      return { content: text, allParsed: [firstBlock.parsed] };
    } else {
      // Не в начале — переносим в начало
      const blockText = firstBlock.block;
      const remainingText = text.slice(0, firstBlock.index) + text.slice(firstBlock.index + firstBlock.block.length);
      // Убираем возможные лишние переводы строк в месте удаления
      const cleanedRemaining = remainingText.replace(/^\s*\n\s*/, '\n').replace(/\n\s*\n$/, '\n');
      const content = blockText + '\n\n' + cleanedRemaining.trimStart();
      return { content, allParsed: [firstBlock.parsed] };
    }
  }
  
  // 2+ блоков
  if (firstBlockIsAtStart) {
    // Первый блок уже в начале — удаляем остальные блоки из текста
    let content = text;
    const parsedList = [firstBlock.parsed];
    
    // Удаляем все блоки кроме первого, пересчитывая индексы после каждого удаления
    let totalShift = 0; // Накопительный сдвиг из-за предыдущих удалений
    for (let i = 1; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      const adjustedIndex = b.index - totalShift;
      content = content.slice(0, adjustedIndex) + content.slice(adjustedIndex + b.block.length);
      totalShift += b.block.length;
      parsedList.push(b.parsed);
    }
    
    // Чистим двойные переводы строк
    content = content.replace(/\n{3,}/g, '\n\n').trim();
    
    return { content, allParsed: parsedList };
  } else {
    // Ни один блок не в начале — переносим первый найденный в начало
    const firstFound = allBlocks[0];
    const firstFoundText = firstFound.block;
    
    // Удаляем первый найденный блок из его текущего места
    let remainingText = text.slice(0, firstFound.index) + text.slice(firstFound.index + firstFound.block.length);
    
    // Удаляем остальные блоки, пересчитывая индексы после каждого удаления
    const parsedList = [firstFound.parsed];
    let totalShift = firstFound.block.length; // Сдвиг из-за удаления первого блока
    for (let i = 1; i < allBlocks.length; i++) {
      const b = allBlocks[i];
      const adjustedIndex = b.index - totalShift;
      remainingText = remainingText.slice(0, adjustedIndex) + 
                       remainingText.slice(adjustedIndex + b.block.length);
      totalShift += b.block.length;
      parsedList.push(b.parsed);
    }
    
    // Чистим текст от лишних переводов строк
    remainingText = remainingText.replace(/\n{3,}/g, '\n\n').trim();
    
    const content = firstFoundText + '\n\n' + remainingText;
    return { content, allParsed: parsedList };
  }
}
