import { characterRepository } from '../repositories/character.repository';
import { Character, CreateCharacterInput, UpdateCharacterInput, SillyTavernCharacter } from '../types';

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
    return characterRepository.createCharacter(userId, characterData);
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
    return characterRepository.importCharacter(userId, characterData);
  }
}

export const characterService = new CharacterService();
