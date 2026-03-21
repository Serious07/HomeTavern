import db from '../config/database';
import { Character, CreateCharacterInput, UpdateCharacterInput, SillyTavernCharacter } from '../types';

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
   */
  updateCharacter: (id: number, data: UpdateCharacterInput): Character | undefined => {
    const existing = characterRepository.getCharacterById(id);
    if (!existing) {
      return undefined;
    }

    const stmt = db.prepare(
      `UPDATE characters
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           short_description = COALESCE(?, short_description),
           personality = COALESCE(?, personality),
           first_message = COALESCE(?, first_message),
           avatar = COALESCE(?, avatar),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    stmt.run(
      data.name,
      data.description,
      data.short_description,
      data.personality,
      data.first_message,
      data.avatar,
      id
    );
    
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
};
