import { characterRepository } from '../repositories/character.repository';
import { Character, CreateCharacterInput, UpdateCharacterInput, SillyTavernCharacter, CharacterGreeting, CreateCharacterGreetingInput } from '../types';

export class CharacterService {
  /**
   * Получение всех персонажей пользователя
   */
  getAllCharacters(userId: number): Character[] {
    return characterRepository.getCharactersByUserId(userId);
  }

  /**
   * Получение персонажа с проверкой доступа
   */
  getCharacter(id: number, userId: number): Character | null {
    const character = characterRepository.getCharacterById(id);
    if (!character) {
      return null;
    }
    
    // Проверяем, принадлежит ли персонаж пользователю
    if (character.user_id !== userId) {
      return null;
    }
    
    return character;
  }

  /**
   * Создание персонажа
   */
  createCharacter(userId: number, characterData: Omit<CreateCharacterInput, 'user_id'>): Character {
    console.log('[characterService.createCharacter] Received data:', JSON.stringify(characterData, null, 2));
    console.log('[characterService.createCharacter] User ID:', userId);
    
    // Валидация данных
    if (!characterData.name || characterData.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    console.log('[characterService.createCharacter] Passing to repository');
    const character = characterRepository.createCharacter(userId, characterData);

    // Если переданы greetings, создаём их
    if (characterData.greetings && characterData.greetings.length > 0) {
      this.setGreetings(character.id, userId, characterData.greetings);
      // Обновляем first_message первым приветствием
      characterRepository.updateFirstMessageFromGreetings(character.id);
    }

    return character;
  }

  /**
   * Обновление персонажа
   */
  updateCharacter(id: number, userId: number, characterData: UpdateCharacterInput): Character | null {
    // Проверяем, принадлежит ли персонаж пользователю
    if (!characterRepository.isOwnedByUser(id, userId)) {
      return null;
    }

    const updated = characterRepository.updateCharacter(id, characterData);
    if (!updated) {
      throw new Error('Character not found');
    }

    // Если обновлён current_greeting_index — обновляем first_message
    if (characterData.current_greeting_index !== undefined) {
      characterRepository.updateFirstMessageFromGreetings(id);
    }

    return updated;
  }

  /**
   * Удаление персонажа
   */
  deleteCharacter(id: number, userId: number): boolean {
    // Проверяем, принадлежит ли персонаж пользователю
    if (!characterRepository.isOwnedByUser(id, userId)) {
      return false;
    }

    return characterRepository.deleteCharacter(id);
  }

  /**
   * Импорт персонажа (из SillyTavern формата)
   */
  importCharacter(userId: number, characterData: SillyTavernCharacter): Character {
    console.log('[characterService.importCharacter] Received data:', JSON.stringify(characterData, null, 2));
    console.log('[characterService.importCharacter] User ID:', userId);
    
    // Валидация данных
    if (!characterData.name || characterData.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    console.log('[characterService.importCharacter] Passing to repository');
    const character = characterRepository.importCharacter(userId, characterData);

    // Импортируем alternate_greetings если они есть
    const source = characterData.data || characterData;
    if (source.alternate_greetings && source.alternate_greetings.length > 0) {
      console.log(`[characterService.importCharacter] Importing ${source.alternate_greetings.length} alternate greetings`);
      
      // first_message уже импортирован, поэтому alternate_greetings начинаем с индекса 1
      // Но first_mes тоже добавляем как первое приветствие (sort_order=0)
      const greetingsToInsert: Array<{ message: string; sort_order: number }> = [];
      
      // Добавляем first_mes как первое приветствие
      if (source.first_mes) {
        greetingsToInsert.push({ message: source.first_mes, sort_order: 0 });
      }
      
      // Добавляем alternate_greetings
      source.alternate_greetings.forEach((greeting, index) => {
        greetingsToInsert.push({ message: greeting, sort_order: index + 1 });
      });

      characterRepository.upsertAllGreetings(character.id, greetingsToInsert);
      // Set current_greeting_index to 0 and update first_message
      characterRepository.updateCharacter(character.id, { current_greeting_index: 0 });
      characterRepository.updateFirstMessageFromGreetings(character.id);
      console.log(`[characterService.importCharacter] Saved ${greetingsToInsert.length} greetings for character`);
    } else if (source.first_mes) {
      // Если нет alternate_greetings, но есть first_mes — добавляем как единственное приветствие
      const existingGreetings = characterRepository.getAllGreetings(character.id);
      if (existingGreetings.length === 0) {
        characterRepository.upsertAllGreetings(character.id, [
          { message: source.first_mes, sort_order: 0 }
        ]);
        characterRepository.updateCharacter(character.id, { current_greeting_index: 0 });
        characterRepository.updateFirstMessageFromGreetings(character.id);
      }
    }

    return character;
  }

  // ==================== Greeting Management Methods ====================

  /**
   * Получение всех приветствий персонажа
   */
  getAllGreetings(characterId: number, userId: number): CharacterGreeting[] {
    // Проверяем доступ
    if (!characterRepository.isOwnedByUser(characterId, userId)) {
      throw new Error('Character not found or access denied');
    }
    return characterRepository.getAllGreetings(characterId);
  }

  /**
   * Установка (создание/обновление) всех приветствий персонажа
   */
  setGreetings(characterId: number, userId: number, greetings: string[]): CharacterGreeting[] {
    // Проверяем доступ
    if (!characterRepository.isOwnedByUser(characterId, userId)) {
      throw new Error('Character not found or access denied');
    }

    // Фильтруем пустые приветствия
    const filteredGreetings = greetings
      .map(g => g.trim())
      .filter(g => g.length > 0);

    if (filteredGreetings.length === 0) {
      throw new Error('At least one greeting is required');
    }

    // Создаём массив с order
    const greetingsToInsert = filteredGreetings.map((msg, index) => ({
      message: msg,
      sort_order: index
    }));

    characterRepository.upsertAllGreetings(characterId, greetingsToInsert);
    
    // Update current_greeting_index to 0 (first greeting is active) and first_message
    characterRepository.updateCharacter(characterId, { current_greeting_index: 0 });
    characterRepository.updateFirstMessageFromGreetings(characterId);

    return characterRepository.getAllGreetings(characterId);
  }

  /**
   * Добавление нового приветствия
   */
  addGreeting(characterId: number, userId: number, message: string): CharacterGreeting {
    // Проверяем доступ
    if (!characterRepository.isOwnedByUser(characterId, userId)) {
      throw new Error('Character not found or access denied');
    }

    if (!message || message.trim().length === 0) {
      throw new Error('Greeting message cannot be empty');
    }

    // Получаем максимальный sort_order
    const existingGreetings = characterRepository.getAllGreetings(characterId);
    const maxOrder = existingGreetings.reduce((max, g) => Math.max(max, g.sort_order), -1);

    const result = characterRepository.createGreeting({
      character_id: characterId,
      message: message.trim(),
      sort_order: maxOrder + 1
    });
    
    // Если это первое приветствие, установим current_greeting_index = 0
    if (maxOrder === -1) {
      characterRepository.updateCharacter(characterId, { current_greeting_index: 0 });
    }

    return result;
  }

  /**
   * Обновление приветствия
   */
  updateGreeting(id: number, userId: number, data: { message?: string }): CharacterGreeting | undefined {
    const greeting = characterRepository.getGreetingById(id);
    if (!greeting) {
      return undefined;
    }

    if (!characterRepository.isOwnedByUser(greeting.character_id, userId)) {
      throw new Error('Character not found or access denied');
    }

    const updated = characterRepository.updateGreeting(id, { message: data.message });
    if (!updated) {
      throw new Error('Greeting not found');
    }

    // Обновляем first_message если изменилось первое приветствие
    characterRepository.updateFirstMessageFromGreetings(greeting.character_id);

    return updated;
  }

  /**
   * Получение количества приветствий персонажа (для отображения в списке)
   */
  getGreetingCount(characterId: number): number {
    const greetings = characterRepository.getAllGreetings(characterId);
    return greetings.length;
  }

  /**
   * Удаление приветствия
   */
  deleteGreeting(id: number, userId: number): boolean {
    const greeting = characterRepository.getGreetingById(id);
    if (!greeting) {
      return false;
    }

    if (!characterRepository.isOwnedByUser(greeting.character_id, userId)) {
      throw new Error('Character not found or access denied');
    }

    const deleted = characterRepository.deleteGreeting(id);
    
    // Перенумеровать оставшиеся приветствия
    if (deleted) {
      const remainingGreetings = characterRepository.getAllGreetings(greeting.character_id);
      remainingGreetings.forEach((g, index) => {
        characterRepository.updateGreeting(g.id, { sort_order: index });
      });

      // Обновляем first_message
      characterRepository.updateFirstMessageFromGreetings(greeting.character_id);
    }

    return deleted;
  }

  /**
   * Установка активного приветствия (по sort_order)
   */
  setActiveGreeting(characterId: number, userId: number, sortOrder: number): Character | undefined {
    // Проверяем доступ
    if (!characterRepository.isOwnedByUser(characterId, userId)) {
      throw new Error('Character not found or access denied');
    }

    const greeting = characterRepository.getGreetingByOrder(characterId, sortOrder);
    if (!greeting) {
      throw new Error('Greeting not found');
    }

    const updated = characterRepository.updateCharacter(characterId, {
      current_greeting_index: sortOrder
    });

    if (updated) {
      characterRepository.updateFirstMessageFromGreetings(characterId);
    }

    return updated;
  }

  /**
   * Перемещение приветствия (изменение sort_order)
   */
  moveGreeting(id: number, userId: number, newSortOrder: number): CharacterGreeting | undefined {
    const greeting = characterRepository.getGreetingById(id);
    if (!greeting) {
      return undefined;
    }

    if (!characterRepository.isOwnedByUser(greeting.character_id, userId)) {
      throw new Error('Character not found or access denied');
    }

    const updated = characterRepository.updateGreeting(id, { sort_order: newSortOrder });
    
    if (updated) {
      characterRepository.updateFirstMessageFromGreetings(greeting.character_id);
    }

    return updated;
  }
}

export const characterService = new CharacterService();
