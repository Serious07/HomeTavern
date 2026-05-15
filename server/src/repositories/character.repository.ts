import db from '../config/database';
import { Character, CreateCharacterInput, UpdateCharacterInput, SillyTavernCharacter, CharacterGreeting } from '../types';

export const characterRepository = {
  /**
   * Получение всех персонажей пользователя
   */
  getCharactersByUserId: (userId: number): Character[] => {
    const stmt = db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId) as Character[];
  },

  /**
   * Получение персонажа по ID
   */
  getCharacterById: (id: number): Character | undefined => {
    const stmt = db.prepare('SELECT * FROM characters WHERE id = ?');
    return stmt.get(id) as Character | undefined;
  },

  /**
   * Создание персонажа
   */
  createCharacter: (userId: number, data: Omit<CreateCharacterInput, 'user_id'>): Character => {
    const stmt = db.prepare(
      `INSERT INTO characters (user_id, name, description, short_description, personality, first_message, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      userId,
      data.name,
      data.description || null,
      data.short_description || null,
      data.personality || null,
      data.first_message || null,
      data.avatar || null
    );
    
    const character = characterRepository.getCharacterById(result.lastInsertRowid as number);
    if (!character) {
      throw new Error('Failed to create character');
    }
    return character;
  },

  /**
   * Обновление персонажа
   * Обновляет только поля, которые содержат непустые значения.
   * Пустые строки и undefined игнорируются, чтобы не перезаписывать существующие данные.
   */
  updateCharacter: (id: number, data: UpdateCharacterInput): Character | undefined => {
    const existing = characterRepository.getCharacterById(id);
    if (!existing) {
      return undefined;
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    // Обновляем поле только если оно существует и не является пустой строкой
    if (data.name !== undefined && data.name.trim() !== '') {
      fields.push('name = ?');
      values.push(data.name.trim());
    }
    if (data.description !== undefined && data.description.trim() !== '') {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.short_description !== undefined && data.short_description.trim() !== '') {
      fields.push('short_description = ?');
      values.push(data.short_description);
    }
    if (data.personality !== undefined && data.personality.trim() !== '') {
      fields.push('personality = ?');
      values.push(data.personality);
    }
    if (data.first_message !== undefined && data.first_message.trim() !== '') {
      fields.push('first_message = ?');
      values.push(data.first_message);
    }
    if (data.avatar !== undefined && data.avatar.trim() !== '') {
      fields.push('avatar = ?');
      values.push(data.avatar);
    }
    if (data.current_greeting_index !== undefined) {
      fields.push('current_greeting_index = ?');
      values.push(data.current_greeting_index);
    }

    // Всегда обновляем updated_at
    fields.push('updated_at = CURRENT_TIMESTAMP');

    const stmt = db.prepare(
      `UPDATE characters SET ${fields.join(', ')} WHERE id = ?`
    );
    stmt.run(...values, id);
    
    return characterRepository.getCharacterById(id);
  },

  /**
   * Удаление персонажа
   */
  deleteCharacter: (id: number): boolean => {
    const stmt = db.prepare('DELETE FROM characters WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Импорт персонажа (из SillyTavern формата)
   */
  importCharacter: (userId: number, data: SillyTavernCharacter): Character => {
    // Логирование сырых данных из SillyTavern формата
    console.log('[importCharacter] Raw data:', JSON.stringify({
      name: data.name,
      has_first_mes: !!data.first_mes,
      first_mes_preview: data.first_mes?.substring(0, 50),
      has_data: !!data.data,
      data_first_mes_preview: data.data?.first_mes?.substring(0, 50),
      alternate_greetings_count: data.alternate_greetings?.length || 0,
    }, null, 2));

    // Для chara_card_v3 данные могут быть во вложенном объекте data
    // Сначала пробуем прочитать из data, затем из корневого уровня
    const source = data.data || data;
    
    // SillyTavern использует "first_mes" вместо "first_message"
    // Приоритет: first_mes -> alternate_greetings[0] -> first_message (альтернативное имя)
    let firstMessage = source.first_mes || null;
    
    console.log('[importCharacter] first_mes from source:', {
      value: firstMessage,
      preview: firstMessage?.substring(0, 50),
    });

    // Если first_mes пусто, пробуем alternate_greetings[0]
    if (!firstMessage && source.alternate_greetings && source.alternate_greetings.length > 0) {
      firstMessage = source.alternate_greetings[0];
      console.log('[importCharacter] Using alternate_greetings[0]:', {
        preview: firstMessage?.substring(0, 50),
      });
    }

    // Если всё ещё пусто, проверяем поле first_message (альтернативное имя)
    if (!firstMessage && 'first_message' in source) {
      firstMessage = (source as any).first_message || null;
      console.log('[importCharacter] Using first_message:', {
        preview: firstMessage?.substring(0, 50),
      });
    }

    // Fallback: если ничего не найдено - пустая строка с предупреждением
    if (!firstMessage) {
      console.warn('[importCharacter] WARNING: first_message is empty, using empty string');
      firstMessage = '';
    }

    const stmt = db.prepare(
      `INSERT INTO characters (user_id, name, description, short_description, personality, first_message, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      userId,
      source.name || data.name,
      source.description || null,
      source.short_description || null,
      source.personality || null,
      firstMessage,
      source.avatar || null
    );
    
    console.log('[importCharacter] Inserted character, lastInsertRowid:', result.lastInsertRowid);
    
    const character = characterRepository.getCharacterById(result.lastInsertRowid as number);
    if (!character) {
      throw new Error('Failed to import character');
    }
    return character;
  },

  /**
   * Проверка, принадлежит ли персонаж пользователю
   */
  isOwnedByUser: (characterId: number, userId: number): boolean => {
    const stmt = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?');
    const result = stmt.get(characterId, userId) as { id: number } | undefined;
    return result !== undefined;
  },

  // ==================== Character Greetings Methods ====================

  /**
   * Получение всех приветствий персонажа
   */
  getAllGreetings: (characterId: number): CharacterGreeting[] => {
    const stmt = db.prepare(
      'SELECT * FROM character_greetings WHERE character_id = ? ORDER BY sort_order ASC, id ASC'
    );
    return stmt.all(characterId) as CharacterGreeting[];
  },

  /**
   * Получение конкретного приветствия
   */
  getGreetingById: (id: number): CharacterGreeting | undefined => {
    const stmt = db.prepare('SELECT * FROM character_greetings WHERE id = ?');
    return stmt.get(id) as CharacterGreeting | undefined;
  },

  /**
   * Получение приветствия по индексу (sort_order)
   */
  getGreetingByOrder: (characterId: number, sortOrder: number): CharacterGreeting | undefined => {
    const stmt = db.prepare(
      'SELECT * FROM character_greetings WHERE character_id = ? AND sort_order = ? ORDER BY id ASC LIMIT 1'
    );
    return stmt.get(characterId, sortOrder) as CharacterGreeting | undefined;
  },

  /**
   * Создание нового приветствия
   */
  createGreeting: (data: { character_id: number; message: string; sort_order: number }): CharacterGreeting => {
    const stmt = db.prepare(
      `INSERT INTO character_greetings (character_id, message, sort_order)
       VALUES (?, ?, ?)`
    );
    const result = stmt.run(data.character_id, data.message, data.sort_order);
    const greeting = characterRepository.getGreetingById(result.lastInsertRowid as number);
    if (!greeting) {
      throw new Error('Failed to create greeting');
    }
    return greeting;
  },

  /**
   * Обновление приветствия
   */
  updateGreeting: (id: number, data: { message?: string; sort_order?: number }): CharacterGreeting | undefined => {
    const existing = characterRepository.getGreetingById(id);
    if (!existing) {
      return undefined;
    }

    const stmt = db.prepare(
      `UPDATE character_greetings
       SET message = COALESCE(?, message),
           sort_order = COALESCE(?, sort_order),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    stmt.run(data.message, data.sort_order !== undefined ? data.sort_order : existing.sort_order, id);
    return characterRepository.getGreetingById(id);
  },

  /**
   * Удаление приветствия
   */
  deleteGreeting: (id: number): boolean => {
    const stmt = db.prepare('DELETE FROM character_greetings WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Удаление всех приветствий персонажа
   */
  deleteGreetingsByCharacterId: (characterId: number): boolean => {
    const stmt = db.prepare('DELETE FROM character_greetings WHERE character_id = ?');
    const result = stmt.run(characterId);
    return result.changes > 0;
  },

  /**
   * Upsert всех приветствий персонажа (удаляет старые, создаёт новые)
   * Используется при импорте из SillyTavern или обновлении через редактор
   */
  upsertAllGreetings: (characterId: number, greetings: Array<{ message: string; sort_order: number }>): void => {
    // Сначала удаляем все существующие приветствия персонажа
    characterRepository.deleteGreetingsByCharacterId(characterId);

    // Затем создаём новые
    if (greetings.length === 0) return;

    const insertStmt = db.prepare(
      `INSERT INTO character_greetings (character_id, message, sort_order)
       VALUES (?, ?, ?)`
    );

    const insertMany = db.transaction((data: Array<{ character_id: number; message: string; sort_order: number }>) => {
      for (const g of data) {
        insertStmt.run(g.character_id, g.message, g.sort_order);
      }
    });

    insertMany(greetings.map(g => ({ character_id: characterId, message: g.message, sort_order: g.sort_order })));
  },

  /**
   * Получение первого сообщения персонажа (из greetings по индексу или из first_message)
   */
  getActiveFirstMessage: (characterId: number, greetingIndex: number | null): string | null => {
    if (greetingIndex !== null && greetingIndex >= 0) {
      const greeting = characterRepository.getGreetingByOrder(characterId, greetingIndex);
      if (greeting) {
        return greeting.message;
      }
    }
    // Fallback: используем first_message
    const character = characterRepository.getCharacterById(characterId);
    return character?.first_message || null;
  },

  /**
   * Обновление количества приветствий в кэше персонажа (для первого сообщения)
   */
  updateFirstMessageFromGreetings: (characterId: number): void => {
    const activeGreeting = db.prepare(
      `SELECT message FROM character_greetings WHERE character_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`
    ).get(characterId) as { message: string } | undefined;

    if (activeGreeting) {
      db.prepare('UPDATE characters SET first_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        activeGreeting.message,
        characterId
      );
    }
  },

  /**
   * Получение количества приветствий персонажа (для отображения в списке)
   */
  getGreetingCountByCharacterId: (characterId: number): number => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM character_greetings WHERE character_id = ?');
    const result = stmt.get(characterId) as { count: number };
    return result.count;
  },
};
