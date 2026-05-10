import React, { useState } from 'react';
import { charactersApi } from '../../services/api';
import { CharacterGreeting } from '../../types';

interface GreetingsManagerProps {
  characterId: number;
  greetings: CharacterGreeting[];
  onSave: (greetings: CharacterGreeting[]) => void;
  onClose: () => void;
}

const GreetingsManager: React.FC<GreetingsManagerProps> = ({
  characterId,
  greetings,
  onSave,
  onClose,
}) => {
  const [messages, setMessages] = useState<string[]>(
    greetings.map(g => g.message)
  );
  const [isLoading, setIsLoading] = useState(false);

  const updateMessage = (index: number, value: string) => {
    const updated = [...messages];
    updated[index] = value;
    setMessages(updated);
  };

  const addMessage = () => {
    if (messages.length >= 50) return;
    setMessages([...messages, '']);
  };

  const removeMessage = (index: number) => {
    if (messages.length <= 1) return;
    const updated = messages.filter((_, i) => i !== index);
    setMessages(updated);
  };

  const moveMessage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === messages.length - 1) return;
    
    const updated = [...messages];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setMessages(updated);
  };

  const handleSave = async () => {
    // Filter empty messages
    const nonEmptyMessages = messages.map(m => m.trim()).filter(m => m.length > 0);
    
    if (nonEmptyMessages.length === 0) {
      alert('Добавьте хотя бы одно приветствие');
      return;
    }

    setIsLoading(true);
    try {
      const result = await charactersApi.setGreetings(characterId, nonEmptyMessages);
      onSave(result.data);
      onClose();
    } catch (error: any) {
      alert('Ошибка при сохранении: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  const getPreview = (message: string, maxLength: number = 120): string => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-gray-700 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Альтернативные приветствия</h2>
            <p className="text-sm text-gray-400 mt-1">
              {messages.length} из 50 · Первое сообщение используется при начале чата
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`bg-gray-700/50 rounded-lg border transition ${
                index === 0
                  ? 'border-yellow-500/50 shadow-sm'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              {/* Message header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-600/50">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${
                      index === 0
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    {index + 1}
                    {index === 0 && ' · Активное'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Move buttons */}
                  <button
                    onClick={() => moveMessage(index, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Вверх"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveMessage(index, 'down')}
                    disabled={index === messages.length - 1}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Вниз"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {/* Delete button */}
                  {messages.length > 1 && (
                    <button
                      onClick={() => removeMessage(index)}
                      className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                      title="Удалить"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Message textarea */}
              <textarea
                value={message}
                onChange={(e) => updateMessage(index, e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-gray-800/50 border-0 rounded-b-lg focus:outline-none focus:ring-1 focus:ring-gray-500 text-white text-sm resize-none placeholder-gray-500"
                placeholder="Введите текст приветствия..."
              />
              
              {/* Character count */}
              <div className="px-4 py-1.5 border-t border-gray-600/30 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {message.length} символов
                </span>
                {message.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Превью:</span>
                    <span className="text-xs text-gray-400 italic truncate max-w-[200px]">
                      {getPreview(message)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add button */}
          {messages.length < 50 && (
            <button
              onClick={addMessage}
              className="w-full p-4 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-white transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить приветствие
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-500">
            Перетащите сообщения для изменения порядка или используйте кнопки ▲▼
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-6 py-2 bg-gray-500 hover:bg-gray-400 rounded-lg font-medium text-white transition shadow-lg disabled:opacity-50"
            >
              {isLoading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GreetingsManager;