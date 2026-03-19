import React, { memo, useMemo, useState, useRef, useEffect } from 'react';
import { Message } from '../../types';
import { MarkdownRenderer } from '../common/MarkdownRenderer';

interface MessageListProps {
  messages: Message[];
  onRegenerate?: (messageId: number) => void;
  onEdit?: (messageId: number, content: string) => void;
  onDelete?: (messageId: number) => void;
  showThinking?: Record<number, boolean>;
  onToggleThinking?: (messageId: number) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
}

/**
 * Форматирование времени сообщения
 */
const formatMessageTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
};

/**
 * Мемоизированный компонент для отображения одного сообщения
 * Используется внутри виртуального списка
 */
const MessageItem = memo(({
  message,
  onRegenerate,
  onEdit,
  onDelete,
  showThinking,
  onToggleThinking,
  translatingMessageId,
  onTranslate,
  isLastAssistantMessage,
}: {
  message: Message;
  onRegenerate?: (messageId: number) => void;
  onEdit?: (messageId: number, content: string) => void;
  onDelete?: (messageId: number) => void;
  showThinking: Record<number, boolean>;
  onToggleThinking?: (messageId: number) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
  isLastAssistantMessage: boolean;
}) => {
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  const isSystem = message.role === 'system';
  const isUser = message.role === 'user';
  const isEditing = editingMessageId === message.id;

  // Для system сообщений
  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-gray-400">
          {message.content}
        </div>
      </div>
    );
  }

  const handleEditStart = () => {
    setEditingMessageId(message.id);
    if (message.role === 'assistant' && message.translated_content) {
      setEditContent(showOriginal ? message.content : message.translated_content);
    } else if (message.role === 'user' && message.translated_content) {
      setEditContent(showOriginal ? message.translated_content : message.content);
    } else {
      setEditContent(message.content);
    }
  };

  const handleEditSave = () => {
    if (editingMessageId && onEdit) {
      onEdit(editingMessageId, editContent);
      setEditingMessageId(null);
      setEditContent('');
    }
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const toggleOriginal = () => {
    setShowOriginal((prev) => !prev);
  };

  const handleCopy = () => {
    let textToCopy = message.content;
    if (message.role === 'assistant' && message.translated_content) {
      textToCopy = showOriginal ? message.content : message.translated_content;
    } else if (message.role === 'user' && message.translated_content) {
      textToCopy = showOriginal ? message.translated_content : message.content;
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getTextToRender = (): string => {
    if (message.role === 'assistant' && message.translated_content) {
      return showOriginal ? message.content : message.translated_content;
    } else if (message.role === 'user' && message.translated_content) {
      return showOriginal ? message.translated_content : message.content;
    }
    return message.content;
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} py-2`}
    >
      <div
        className={`max-w-[80%] md:max-w-[70%] lg:max-w-[60%] ${
          isUser ? 'order-1' : 'order-2'
        }`}
      >
        {/* Message bubble */}
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gray-600 text-white rounded-br-md'
              : 'bg-gray-700/80 text-white rounded-bl-md'
          }`}
        >
          {/* Thinking/Reasoning section */}
          {message.reasoning_content && (
            <div className="mb-3 pb-3 border-b border-gray-600">
              <button
                onClick={() => onToggleThinking?.(message.id)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showThinking[message.id] ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
                {showThinking[message.id] ? 'Скрыть мышление' : 'Показать мышление'}
              </button>
              {showThinking[message.id] && (
                <div className="mt-2 p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400 whitespace-pre-wrap">
                  {message.reasoning_content}
                </div>
              )}
            </div>
          )}

          {/* Message content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
                rows={Math.min(16, Math.max(4, editContent.split('\n').length))}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEditSave}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm font-medium transition"
                >
                  Сохранить
                </button>
                <button
                  onClick={handleEditCancel}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm font-medium transition"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">
              <MarkdownRenderer>{getTextToRender()}</MarkdownRenderer>
            </div>
          )}
        </div>

        {/* Message metadata and actions */}
        <div
          className={`flex items-center gap-2 mt-1 ${
            isUser ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <span className="text-xs text-gray-500">
            {formatMessageTime(message.created_at)}
          </span>

          {/* Action buttons */}
          {!isEditing && (
            <div className="flex items-center gap-1">
              {/* Индикатор перевода */}
              {message.role === 'assistant' && translatingMessageId === message.id && (
                <span className="text-xs text-gray-400">Перевод...</span>
              )}
              
              {/* Кнопка переключения оригинал/перевод для assistant сообщений с переводом */}
              {message.role === 'assistant' && message.translated_content && (
                <button
                  onClick={toggleOriginal}
                  className="p-1 px-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs font-medium bg-gray-800/50"
                  title={showOriginal ? 'Показать перевод' : 'Показать оригинал'}
                >
                  {showOriginal ? 'RU' : 'EN'}
                </button>
              )}
              
              {/* Кнопка перевода для assistant сообщений без перевода */}
              {message.role === 'assistant' && !message.translated_content && onTranslate && translatingMessageId !== message.id && (
                <button
                  onClick={() => onTranslate(message.id)}
                  className="p-1 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded transition text-xs font-medium bg-gray-800/50"
                  title="Перевести на русский"
                >
                  RU
                </button>
              )}
              
              {/* Кнопка переключения оригинал/перевод для user сообщений с переводом */}
              {message.role === 'user' && message.translated_content && (
                <button
                  onClick={toggleOriginal}
                  className="p-1 px-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs font-medium bg-gray-800/50"
                  title={showOriginal ? 'Показать перевод (EN)' : 'Показать оригинал (RU)'}
                >
                  {showOriginal ? 'EN' : 'RU'}
                </button>
              )}
              
              {/* Кнопка перевода для user сообщений без перевода */}
              {message.role === 'user' && !message.translated_content && onTranslate && translatingMessageId !== message.id && (
                <button
                  onClick={() => onTranslate(message.id)}
                  className="p-1 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded transition text-xs font-medium bg-gray-800/50"
                  title="Перевести на английский"
                >
                  EN
                </button>
              )}
              
              {/* Кнопка копирования для всех сообщений */}
              <button
                onClick={handleCopy}
                className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
                title="Копировать"
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              
              {/* Кнопка редактирования для user сообщений и всех сообщений assistant */}
              {(isUser || message.role === 'assistant') && onEdit && (
                <button
                  onClick={handleEditStart}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
                  title="Редактировать"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                  </svg>
                </button>
              )}
              
              {/* Кнопка перегенерации только для последнего сообщения assistant */}
              {onRegenerate && isLastAssistantMessage && (
                <button
                  onClick={() => onRegenerate(message.id)}
                  className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition"
                  title="Перегенерировать"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6"></path>
                    <path d="M2 12c0-4.4 3.6-8 8-8 3.3 0 6.1 2 7.3 4.8M22 12c0 4.4-3.6 8-8 8-3.3 0-6.1-2-7.3-4.8"></path>
                  </svg>
                </button>
              )}
              
              {/* Кнопка удаления */}
              {onDelete && (
                <button
                  onClick={() => onDelete(message.id)}
                  className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition"
                  title="Удалить"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

/**
 * Компонент списка сообщений - упрощенная версия без виртуализации
 * Для отладки проблемы с пропаданием сообщений
 */
const MessageList: React.FC<MessageListProps> = ({
  messages,
  onRegenerate,
  onEdit,
  onDelete,
  showThinking = {},
  onToggleThinking,
  translatingMessageId = null,
  onTranslate,
}) => {
  // Находим индекс последнего сообщения assistant
  const lastAssistantMessageIndex = useMemo(() => {
    return messages.map(m => m.role).lastIndexOf('assistant');
  }, [messages]);

  // Простой рендер всех сообщений
  return (
    <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
      <div className="space-y-2">
        {messages.map((message, index) => {
          const isLastAssistantMessage = index === lastAssistantMessageIndex && message.role === 'assistant';
          return (
            <MessageItem
              key={message.id}
              message={message}
              onRegenerate={onRegenerate}
              onEdit={onEdit}
              onDelete={onDelete}
              showThinking={showThinking}
              onToggleThinking={onToggleThinking}
              translatingMessageId={translatingMessageId}
              onTranslate={onTranslate}
              isLastAssistantMessage={isLastAssistantMessage}
            />
          );
        })}
      </div>
    </div>
  );
};

/**
 * Виртуализированный список сообщений
 * Рендерит только видимые сообщения
 */
const VirtualizedList = memo(({
  messages,
  containerHeight: _containerHeight,
  itemHeight,
  lastAssistantMessageIndex,
  onRegenerate,
  onEdit,
  onDelete,
  showThinking,
  onToggleThinking,
  translatingMessageId,
  onTranslate,
}: {
  messages: Message[];
  containerHeight: number;
  itemHeight: number;
  lastAssistantMessageIndex: number;
  onRegenerate?: (messageId: number) => void;
  onEdit?: (messageId: number, content: string) => void;
  onDelete?: (messageId: number) => void;
  showThinking: Record<number, boolean>;
  onToggleThinking?: (messageId: number) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  
  // Отслеживаем скролл
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Вычисляем видимые элементы
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  const endIndex = Math.min(messages.length - 1, Math.ceil((scrollTop + _containerHeight) / itemHeight) + 2);
  const visibleMessages = messages.slice(startIndex, endIndex + 1);
  
  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto relative"
    >
      {/* Пустое пространство для скролла */}
      <div style={{ height: messages.length * itemHeight, position: 'relative' }}>
        {/* Рендерим только видимые сообщения */}
        {visibleMessages.map((message, idx) => {
          const actualIndex = startIndex + idx;
          const isLastAssistantMessage = actualIndex === lastAssistantMessageIndex && message.role === 'assistant';
          
          return (
            <div
              key={message.id}
              style={{
                position: 'absolute',
                top: actualIndex * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight
              }}
            >
              <MessageItem
                message={message}
                onRegenerate={onRegenerate}
                onEdit={onEdit}
                onDelete={onDelete}
                showThinking={showThinking}
                onToggleThinking={onToggleThinking}
                translatingMessageId={translatingMessageId}
                onTranslate={onTranslate}
                isLastAssistantMessage={isLastAssistantMessage}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedList.displayName = 'VirtualizedList';

export default MessageList;
