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
 * Извлекает статус-бар из текста и возвращает { statusBar, content }
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
