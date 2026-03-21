import { chatRepository, Chat, ChatWithMessages, UpdateChatParams } from '../repositories/chat.repository';
import { characterRepository } from '../repositories/character.repository';
import { userRepository } from '../repositories/user.repository';
import { messageRepository } from '../repositories/message.repository';
import { translationService } from './translation.service';

export class ChatService {
  /**
   * Получение всех чатов пользователя
   */
  getAllChats(userId: number): Chat[] {
    return chatRepository.getChatsByUserId(userId);
  }

  /**
   * Получение чата с проверкой доступа
   */
  getChat(id: number, userId: number): Chat | undefined {
    const chat = chatRepository.getChatById(id);
    if (!chat) return undefined;
    
    // Проверка доступа: чат должен принадлежать пользователю
    if (chat.user_id !== userId) {
      return undefined;
    }
    
    return chat;
  }

  /**
   * Получение чата по ID без проверки доступа (для внутренних операций)
   */
  getChatById(id: number): Chat | undefined {
    return chatRepository.getChatById(id);
  }

  /**
   * Создание чата
   */
  async createChat(userId: number, characterId: number, title?: string): Promise<Chat> {
    // Проверка существования пользователя
    const user = userRepository.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Проверка существования персонажа
    const character = characterRepository.getCharacterById(characterId);
    if (!character) {
      throw new Error('Character not found');
    }

    // Проверка, что персонаж принадлежит пользователю
    if (character.user_id !== userId) {
      throw new Error('Character does not belong to user');
    }

    // Создаём чат
    const chat = chatRepository.createChat(userId, characterId, title);
    console.log('[ChatService] Created chat', chat.id, 'with updated_at:', chat.updated_at);

    // Если у персонажа есть first_message, добавляем его как первое сообщение с переводом
    if (character.first_message) {
      console.log('[ChatService] Creating chat with first_message:', character.first_message.substring(0, 50) + '...');
      
      // Проверяем язык first_message
      const detectedLang = await translationService.detectLanguage(character.first_message);
      console.log('[ChatService] Detected language for first_message:', detectedLang);
      
      let translatedContent: string | undefined = undefined;
      
      // Если сообщение на английском, переводим на русский
      if (detectedLang === 'en') {
        console.log('[ChatService] Translating first_message from English to Russian...');
        translatedContent = await translationService.translateToRussian(character.first_message);
        console.log('[ChatService] Translated first_message:', translatedContent?.substring(0, 50) + '...');
      }
      
      // Создаём сообщение с переводом
      messageRepository.createMessage(
        chat.id,
        'assistant',
        character.first_message,
        translatedContent
      );
    }

    return chat;
  }

  /**
   * Обновление чата
   */
  updateChat(id: number, userId: number, updates: UpdateChatParams): Chat | undefined {
    // Проверка доступа
    const chat = this.getChat(id, userId);
    if (!chat) {
      return undefined;
    }

    // Если обновляется character_id, проверяем существование персонажа
    if (updates.character_id !== undefined) {
      const character = characterRepository.getCharacterById(updates.character_id);
      if (!character) {
        throw new Error('Character not found');
      }
      if (character.user_id !== userId) {
        throw new Error('Character does not belong to user');
      }
    }

    return chatRepository.updateChat(id, updates);
  }

  /**
   * Удаление чата
   */
  deleteChat(id: number, userId: number): boolean {
    // Проверка доступа
    const chat = this.getChat(id, userId);
    if (!chat) {
      return false;
    }

    return chatRepository.deleteChat(id);
  }

  /**
   * Получение чата с сообщениями
   */
  async getChatWithMessages(id: number, userId: number): Promise<ChatWithMessages | undefined> {
    // Проверка доступа
    const chat = this.getChat(id, userId);
    if (!chat) return undefined;

    // Логирование updated_at
    console.log('[ChatService] Loading chat', id, 'updated_at:', chat.updated_at);

    // Получаем сообщения из БД
    const chatWithMessages = chatRepository.getChatWithMessages(id);
    if (!chatWithMessages) return undefined;

    // Проверяем каждое сообщение на необходимость перевода
    const messages = chatWithMessages.messages;
    let needsTranslation = false;
    
    // Проверяем, есть ли сообщения assistant без перевода
    for (const msg of messages) {
      if (msg.role === 'assistant' && !msg.translated_content && msg.content) {
        needsTranslation = true;
        break;
      }
    }

    if (needsTranslation) {
      console.log('[ChatService] Translating historical messages for chat', id);
      
      for (const msg of messages) {
        if (msg.role === 'assistant' && !msg.translated_content && msg.content) {
          // Проверяем язык сообщения
          const detectedLang = await translationService.detectLanguage(msg.content);
          
          if (detectedLang === 'en') {
            console.log('[ChatService] Translating message', msg.id, 'from English to Russian...');
            const translatedText = await translationService.translateToRussian(msg.content);
            
            // Сохраняем перевод в БД
            messageRepository.updateTranslatedMessage(msg.id, translatedText);
            console.log('[ChatService] Saved translation for message', msg.id);
          } else if (detectedLang !== 'ru') {
            console.log('[ChatService] Message', msg.id, 'detected as', detectedLang, '- skipping translation');
          }
        }
      }
    } else {
      console.log('[ChatService] No translation needed for chat', id);
    }

    return chatWithMessages;
  }
}

export const chatService = new ChatService();
