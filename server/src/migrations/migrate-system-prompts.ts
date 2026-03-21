/**
 * Миграция: Перенос system_prompt из таблицы characters в таблицу system_prompts
 * 
 * Этот скрипт:
 * 1. Получает все персонажи с непустым system_prompt
 * 2. Создает записи в таблице system_prompts для каждого такого персонажа
 * 3. Устанавливает is_active = 1 для первого промпта пользователя, is_active = 0 для остальных
 * 4. Опционально очищает поле system_prompt в таблице characters (или оставляет как резервную копию)
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Путь к базе данных (относительно корня проекта)
const DB_PATH = path.join(__dirname, '..', '..', '..', 'hometavern.db');

// Проверка существования файла базы данных
if (!fs.existsSync(DB_PATH)) {
  console.error('[Migration] Database file not found:', DB_PATH);
  console.error('[Migration] Please ensure the database exists before running this migration.');
  process.exit(1);
}

const db = new Database(DB_PATH);

// Включаем foreign keys
db.pragma('foreign_keys = ON');

interface CharacterWithPrompt {
  id: number;
  user_id: number;
  name: string;
  system_prompt: string;
}

interface SystemPromptInsert {
  user_id: number;
  name: string;
  description: string;
  prompt_text: string;
  is_active: number;
}

/**
 * Получает все персонажи с непустым system_prompt
 */
function getCharactersWithPrompts(): CharacterWithPrompt[] {
  const query = db.prepare(`
    SELECT id, user_id, name, system_prompt
    FROM characters
    WHERE system_prompt IS NOT NULL AND TRIM(system_prompt) != ''
    ORDER BY user_id, id
  `);
  
  return query.all() as CharacterWithPrompt[];
}

/**
 * Получает количество существующих system_prompts для пользователя
 */
function getExistingPromptsCount(userId: number): number {
  const query = db.prepare(`
    SELECT COUNT(*) as count
    FROM system_prompts
    WHERE user_id = ?
  `);
  
  const result = query.get(userId) as { count: number };
  return result.count;
}

/**
 * Создает запись в таблице system_prompts
 */
function createSystemPrompt(prompt: SystemPromptInsert): number {
  const query = db.prepare(`
    INSERT INTO system_prompts (user_id, name, description, prompt_text, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  const result = query.run(
    prompt.user_id,
    prompt.name,
    prompt.description,
    prompt.prompt_text,
    prompt.is_active
  );
  
  return result.lastInsertRowid as number;
}

/**
 * Обновляет is_active для всех промптов пользователя
 * Первый промпт получает is_active = 1, остальные is_active = 0
 */
function setActiveForUserPrompts(userId: number): void {
  // Сначала сбрасываем is_active для всех промптов пользователя
  db.prepare(`
    UPDATE system_prompts
    SET is_active = 0, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(userId);
  
  // Затем устанавливаем is_active = 1 для первого промпта
  db.prepare(`
    UPDATE system_prompts
    SET is_active = 1, updated_at = datetime('now')
    WHERE user_id = ? AND id = (
      SELECT id FROM system_prompts
      WHERE user_id = ?
      ORDER BY created_at ASC
      LIMIT 1
    )
  `).run(userId, userId);
}

/**
 * Очищает поле system_prompt в таблице characters (опционально)
 */
function clearCharacterPrompts(): void {
  const result = db.prepare(`
    UPDATE characters
    SET system_prompt = NULL, updated_at = datetime('now')
    WHERE system_prompt IS NOT NULL AND TRIM(system_prompt) != ''
  `).run();
  
  console.log(`[Migration] Cleared system_prompt from ${result.changes} characters`);
}

/**
 * Основная функция миграции
 */
function migrate(): void {
  console.log('[Migration] Starting system_prompts migration...');
  console.log('[Migration] Database:', DB_PATH);
  
  // Получаем персонажи с system_prompt
  const characters = getCharactersWithPrompts();
  
  if (characters.length === 0) {
    console.log('[Migration] No characters with system_prompt found. Migration skipped.');
    return;
  }
  
  console.log(`[Migration] Found ${characters.length} characters with system_prompt`);
  
  // Группируем персонажи по user_id
  const promptsByUser = new Map<number, CharacterWithPrompt[]>();
  for (const char of characters) {
    const existing = promptsByUser.get(char.user_id) || [];
    existing.push(char);
    promptsByUser.set(char.user_id, existing);
  }
  
  let totalCreated = 0;
  const errors: Array<{ character: CharacterWithPrompt; error: Error }> = [];
  
  // Обрабатываем каждого пользователя
  for (const [userId, userCharacters] of promptsByUser.entries()) {
    console.log(`[Migration] Processing user ${userId}: ${userCharacters.length} character(s)`);
    
    // Проверяем, сколько промптов уже существует у пользователя
    const existingCount = getExistingPromptsCount(userId);
    console.log(`[Migration] User ${userId} already has ${existingCount} system_prompt(s)`);
    
    // Создаем промпты для каждого персонажа
    for (let i = 0; i < userCharacters.length; i++) {
      const char = userCharacters[i];
      
      // Формируем имя промпта
      const promptName = `Миграция: ${char.name}`;
      const description = `Перенесен из карточки персонажа ${char.name}`;
      
      // is_active = 1 только для первого промпта пользователя (если у него еще не было промптов)
      // Если у пользователя уже были промпты, новый получает is_active = 0
      let isActive = 0;
      if (existingCount === 0 && i === 0) {
        // Первый промпт для пользователя и у него еще не было промптов
        isActive = 1;
      }
      
      try {
        const newId = createSystemPrompt({
          user_id: userId,
          name: promptName,
          description,
          prompt_text: char.system_prompt,
          is_active: isActive
        });
        
        console.log(`[Migration] Created system_prompt #${newId} for character "${char.name}" (user: ${userId})`);
        totalCreated++;
      } catch (error) {
        console.error(`[Migration] Error creating system_prompt for character "${char.name}":`, error);
        errors.push({ character: char, error: error as Error });
      }
    }
    
    // Устанавливаем is_active корректно для всех промптов пользователя
    setActiveForUserPrompts(userId);
    console.log(`[Migration] Set active status for user ${userId} prompts`);
  }
  
  console.log(`[Migration] Created ${totalCreated} system_prompt(s)`);
  
  if (errors.length > 0) {
    console.warn(`[Migration] ${errors.length} error(s) occurred during migration`);
  }
  
  // Опционально: очищаем system_prompt в таблице characters
  console.log('[Migration] Migration complete. system_prompt values in characters table preserved as backup.');
  console.log('[Migration] You can manually clear them later if needed by running:');
  console.log('[Migration] UPDATE characters SET system_prompt = NULL WHERE system_prompt IS NOT NULL;');
  
  db.close();
  console.log('[Migration] Database connection closed.');
}

// Запуск миграции
try {
  migrate();
  console.log('[Migration] Script finished successfully.');
  process.exit(0);
} catch (error) {
  console.error('[Migration] Fatal error:', error);
  db.close();
  process.exit(1);
}
