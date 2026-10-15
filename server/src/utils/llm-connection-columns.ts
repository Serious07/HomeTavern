/**
 * Колонки сэмплирования и защит от повторов в таблице llm_connections.
 *
 * Список вынесен в отдельный модуль без импортов, потому что его используют
 * два места с разным порядком инициализации:
 *   - config/database.ts (миграция для уже существующих баз; в момент выполнения
 *     сам модуль database.ts ещё не экспортирует db, поэтому импортировать
 *     llm-connections-init оттуда нельзя — получится циклический require);
 *   - utils/llm-connections-init.ts (чистая установка: таблица создаётся там же,
 *     и колонки нужно добавить сразу, иначе до следующего перезапуска
 *     LLMService будет молча читать настройки из .env).
 */
export const LLM_CONNECTION_SAMPLING_COLUMNS: Array<[string, string]> = [
  // Параметры сэмплирования. HomeTavern раньше не отправлял ни temperature,
  // ни top_p, и локальные движки (например Strata) по умолчанию декодируют
  // жадно: модель повторяет свой предыдущий ход байт-в-байт.
  // NULL у top_k/min_p означает «не отправлять поле» — это расширения
  // llama.cpp-семейства, и облачные API на них иногда ругаются.
  ['temperature', 'REAL DEFAULT 0.8'],
  ['top_p', 'REAL DEFAULT 0.95'],
  ['top_k', 'INTEGER'],
  ['min_p', 'REAL'],

  // Как управлять режимом размышлений:
  //   'reasoning_effort' (по умолчанию) — никогда не слать enable_thinking:false,
  //     вместо этого слать reasoning_effort (низкие значения дают дешёвое,
  //     но короткое размышление);
  //   'chat_template_kwargs' — историческое поведение: enable_thinking = reasoning;
  //   'none' — не слать ни то, ни другое.
  ['thinking_control', "TEXT DEFAULT 'reasoning_effort'"],

  // Стоп-строки: 'auto' — определять по чат-шаблону движка (/props),
  // 'legacy' — слать \n\nHuman: / \n\nAssistant:, 'none' — не слать.
  ['stop_tokens_mode', "TEXT DEFAULT 'auto'"],

  // Защита от дословных повторов предыдущего хода ассистента
  ['repetition_guard', 'INTEGER DEFAULT 1'],
  ['repetition_auto_retry', 'INTEGER DEFAULT 1'],
];
