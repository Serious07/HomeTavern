import { Message } from '../types';

/**
 * Утилиты экспорта чата в .txt файл (полностью на клиенте, без backend)
 */

/**
 * Очищает строку для использования в имени файла:
 * заменяет недопустимые символы и пробелы на '_', убирает лишние пробельные/подчёркивания.
 */
export function sanitizeFileNamePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') // недопустимые символы в именах файлов
    .replace(/\s+/g, '_') // пробелы -> подчёркивания
    .replace(/_{2,}/g, '_') // сжимаем серии подчёркиваний
    .replace(/^_+|_+$/g, '');
}

/**
 * Форматирует дату в безопасный для имени файла вид: YYYY-MM-DD_HH-MM-SS (локальное время)
 */
function formatDateForFileName(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'no-date';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

/**
 * Форматирует метку времени сообщения в человекочитаемый вид (локальный часовой пояс).
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Строит имя файла экспорта: `Имя_персонажа_2026-09-02_12-34-56.txt`
 * @param characterName название карточки персонажа
 * @param lastMessageAt ISO-дата времени последнего сообщения
 */
export function buildExportFileName(characterName: string, lastMessageAt: string): string {
  const base = sanitizeFileNamePart(characterName) || 'chat';
  return `${base}_${formatDateForFileName(lastMessageAt)}.txt`;
}

/** Подпись роли сообщения */
function getRoleLabel(role: Message['role'], characterName: string): string {
  switch (role) {
    case 'user':
      return 'Пользователь';
    case 'assistant':
      return characterName ? `Персонаж (${characterName})` : 'Персонаж';
    case 'system':
      return 'Система';
    default:
      return 'Сообщение';
  }
}

/**
 * Строит текстовое содержимое экспортируемого .txt файла.
 * Все строки разделяются "\n", текст сообщений сохраняется как есть (без HTML).
 */
export function buildChatExportText(characterName: string, messages: Message[]): string {
  // Гарантируем корректный хронологический порядок
  const sorted = [...messages].sort(
    (a, b) => a.id - b.id || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const lines: string[] = [];
  lines.push(`Чат: ${characterName}`);

  // Дата/время последнего сообщения (если доступно)
  const lastMessage = sorted[sorted.length - 1];
  if (lastMessage) {
    lines.push(`Последнее сообщение: ${formatTimestamp(lastMessage.created_at)}`);
  }
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('');

  for (const msg of sorted) {
    const time = formatTimestamp(msg.created_at);
    const label = getRoleLabel(msg.role, characterName);
    lines.push(`[${label}]${time ? ` — ${time}` : ''}`);
    lines.push(msg.content || '');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Скачивает текст как .txt файл на клиенте через Blob + URL.createObjectURL + <a download>.
 */
export function downloadChatExport(fileName: string, text: string): void {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
