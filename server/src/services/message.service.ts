import { messageRepository, Message, UpdateMessageParams } from '../repositories/message.repository';
import { chatRepository } from '../repositories/chat.repository';
import { translationService } from './translation.service';

export class MessageService {
  /**
   * Получение сообщений чата
   */
  getMessagesByChatId(chatId: number, userId: number): Message[] {
    // Проверка доступа к чату
    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    return messageRepository.getMessagesByChatId(chatId);
  }

  /**
   * Создание сообщения
   */
  createMessage(
    chatId: number,
    userId: number,
    role: string,
    content: string,
    translatedContent?: string
  ): Message {
    // Проверка доступа к чату
    const chat = chatRepository.getChatById(chatId);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    return messageRepository.createMessage(chatId, role, content, translatedContent);
  }

  /**
   * Обновление сообщения
   */
  updateMessage(id: number, userId: number, updates: UpdateMessageParams): Message | undefined {
    // Проверка доступа к сообщению
    const message = messageRepository.getMessageById(id);
    if (!message) {
      return undefined;
    }

    // Проверка доступа к чату
    const chat = chatRepository.getChatById(message.chat_id);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    return messageRepository.updateMessage(id, updates);
  }

  /**
   * Удаление сообщения
   */
  deleteMessage(id: number, userId: number): boolean {
    // Проверка доступа к сообщению
    const message = messageRepository.getMessageById(id);
    if (!message) {
      return false;
    }

    // Проверка доступа к чату
    const chat = chatRepository.getChatById(message.chat_id);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    return messageRepository.deleteMessage(id);
  }

  /**
   * Скрытие сообщения
   */
  hideMessage(id: number, userId: number): Message | undefined {
    // Проверка доступа к сообщению
    const message = messageRepository.getMessageById(id);
    if (!message) {
      return undefined;
    }

    // Проверка доступа к чату
    const chat = chatRepository.getChatById(message.chat_id);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    return messageRepository.hideMessage(id);
  }

  /**
   * Показ сообщения
   */
  showMessage(id: number, userId: number): Message | undefined {
    // Проверка доступа к сообщению
    const message = messageRepository.getMessageById(id);
    if (!message) {
      return undefined;
    }

    // Проверка доступа к чату
    const chat = chatRepository.getChatById(message.chat_id);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    return messageRepository.showMessage(id);
  }

  /**
   * Перевод сообщения на русский язык
   */
  async translateMessage(id: number, userId: number): Promise<Message | undefined> {
    // Проверка доступа к сообщению
    const message = messageRepository.getMessageById(id);
    if (!message) {
      return undefined;
    }

    // Проверка доступа к чату
    const chat = chatRepository.getChatById(message.chat_id);
    if (!chat || chat.user_id !== userId) {
      throw new Error('Chat not found or access denied');
    }

    // Проверяем язык сообщения
    const detectedLang = await translationService.detectLanguage(message.content);

    // Если сообщение уже на русском, возвращаем как есть
    if (detectedLang === 'ru') {
      return message;
    }

    // Переводим на русский
    console.log('[MessageService] Translating message', id, 'from', detectedLang, 'to Russian...');
    const translatedText = await translationService.translateToRussian(message.content);
    
    // Сохраняем перевод
    const updatedMessage = messageRepository.updateMessage(id, { translated_content: translatedText });
    console.log('[MessageService] Saved translation for message', id);
    
    return updatedMessage;
  }
}

export const messageService = new MessageService();
