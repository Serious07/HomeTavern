import React from 'react';
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
  const [editingMessageId, setEditingMessageId] = React.useState<number | null>(null);
  const [editContent, setEditContent] = React.useState('');
  // Состояние для переключения между оригиналом и переводом для каждого сообщения
  // key = messageId, value = true если показывать оригинал (content), false если перевод (translated_content)
  const [showOriginal, setShowOriginal] = React.useState<Record<number, boolean>>({});
  // Состояние для копирования (key = messageId, value = true если показано уведомление)
  const [copiedMessageId, setCopiedMessageId] = React.useState<number | null>(null);

  const handleEditStart = (message: Message) => {
    setEditingMessageId(message.id);
    // Для assistant и user сообщений с переводом используем текущее отображаемое состояние
    if ((message.role === 'assistant' || message.role === 'user') && message.translated_content) {
      // Если показывается оригинал, используем content, иначе translated_content
      setEditContent(showOriginal[message.id] ? message.content : message.translated_content);
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

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  };

  const toggleOriginal = (messageId: number) => {
    setShowOriginal((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const handleCopy = (message: Message) => {
    // Определяем какой текст копировать (оригинал или перевод)
    let textToCopy = message.content;
    
    // Для assistant сообщений с переводом используем текущее отображаемое состояние
    if (message.role === 'assistant' && message.translated_content) {
      textToCopy = showOriginal[message.id] ? message.content : message.translated_content;
    }
    // Для user сообщений с переводом на английский также используем showOriginal
    else if (message.role === 'user' && message.translated_content) {
      textToCopy = showOriginal[message.id] ? message.content : message.translated_content;
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  return (
    <div className="space-y-4">
      {messages.map((message, index) => {
        // Находим первое сообщение assistant
        const firstAssistantMessageIndex = messages.findIndex((m) => m.role === 'assistant');
        // Первое сообщение assistant - это первое сообщение в чате от assistant
        const isFirstMessage = index === firstAssistantMessageIndex && message.role === 'assistant';
        // Находим последнее сообщение assistant
        const lastAssistantMessageIndex = messages.map(m => m.role).lastIndexOf('assistant');
        // Последнее сообщение assistant - это последнее сообщение от assistant в чате
        const isLastAssistantMessage = index === lastAssistantMessageIndex && message.role === 'assistant';
        
        const isUser = message.role === 'user';
        const isSystem = message.role === 'system';
        const isEditing = editingMessageId === message.id;

        if (isSystem) {
          return (
            <div key={message.id} className="flex justify-center">
              <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-gray-400">
                {message.content}
              </div>
            </div>
          );
        }

        return (
          <div
            key={message.id}
            className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fadeIn`}
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
                    ? 'bg-blue-600 text-white rounded-br-md'
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
                        className={`w-4 h-4 transition-transform ${showThinking ? 'rotate-180' : ''}`}
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
                      {showThinking ? 'Скрыть мышление' : 'Показать мышление'}
                    </button>
                    {(showThinking || onToggleThinking === undefined) && (
                      <div className="mt-2 p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400">
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
                       className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[600px]"
                       rows={16}
                     />
                    <div className="flex gap-2">
                      <button
                        onClick={handleEditSave}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
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
                      {/* Показываем перевод для assistant сообщений, если доступен */}
                      {message.role === 'assistant' && message.translated_content ? (
                        <MarkdownRenderer>
                          {showOriginal[message.id] ? message.content : message.translated_content}
                        </MarkdownRenderer>
                      ) : message.role === 'user' && message.translated_content ? (
                        <MarkdownRenderer>
                          {showOriginal[message.id] ? message.content : message.translated_content}
                        </MarkdownRenderer>
                      ) : (
                        <MarkdownRenderer>{message.content}</MarkdownRenderer>
                      )}
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
                       <span className="text-xs text-blue-400 animate-pulse">Перевод...</span>
                     )}
                     {/* Кнопка переключения оригинал/перевод для assistant сообщений с переводом */}
                     {message.role === 'assistant' && message.translated_content && (
                       <button
                         onClick={() => toggleOriginal(message.id)}
                         className="p-1 px-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs font-medium bg-gray-800/50"
                         title={showOriginal[message.id] ? 'Показать перевод' : 'Показать оригинал'}
                       >
                         {showOriginal[message.id] ? 'RU' : 'EN'}
                       </button>
                     )}
                     {/* Кнопка перевода для assistant сообщений без перевода */}
                     {message.role === 'assistant' && !message.translated_content && onTranslate && translatingMessageId !== message.id && (
                       <button
                         onClick={() => onTranslate(message.id)}
                         className="p-1 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition text-xs font-medium bg-gray-800/50"
                         title="Перевести на русский"
                       >
                         RU
                       </button>
                     )}
                     {/* Кнопка переключения оригинал/перевод для user сообщений с переводом */}
                      {message.role === 'user' && message.translated_content && (
                        <button
                          onClick={() => toggleOriginal(message.id)}
                          className="p-1 px-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs font-medium bg-gray-800/50"
                          title={showOriginal[message.id] ? 'Показать оригинал (RU)' : 'Показать перевод (EN)'}
                        >
                          {showOriginal[message.id] ? 'RU' : 'EN'}
                        </button>
                      )}
                      {/* Кнопка перевода для user сообщений без перевода */}
                      {message.role === 'user' && !message.translated_content && onTranslate && translatingMessageId !== message.id && (
                        <button
                          onClick={() => onTranslate(message.id)}
                          className="p-1 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition text-xs font-medium bg-gray-800/50"
                          title="Перевести на английский"
                        >
                          EN
                        </button>
                      )}
                     {/* Кнопка копирования для всех сообщений */}
                     <button
                       onClick={() => handleCopy(message)}
                       className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
                       title="Копировать"
                     >
                       {copiedMessageId === message.id ? (
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
                         onClick={() => handleEditStart(message)}
                         className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
                         title="Редактировать"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 17.293a2 2 0 01-2.828 0l-2.829-2.828a2 2 0 010-2.828l8.486-8.485zM18 17h3" />
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
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m16.518 2.848l-1.518-1.518m0 0L13.5 7.5M19.018 10.5l-1.518-1.518m0 0L16 7.5m-2.5-2.5L12 6.5m0 0L9.5 4m0 0L8 5.5m0 0L6.5 7m0 0L4 8.5m0 0L2.5 10m0 0L1 11.5m0 0L.5 13m0 0L0 14.5m0 0L.5 16m0 0L1 17.5m0 0L2.5 19m0 0L4 20.5m0 0L5.5 22m0 0L7 20.5m0 0L8.5 19m0 0L10 17.5m0 0L11.5 16m0 0L13 14.5m0 0L14.5 13m0 0L16 11.5m0 0L17.5 10m0 0L19 8.5m0 0L20.5 7m0 0L22 5.5m0 0L21 4m0 0L19.5 2.5m0 0L18 1m0 0L16.5 2.5m0 0L15 4m0 0L13.5 5.5m0 0L12 7m0 0L10.5 8.5m0 0L9 10m0 0L7.5 11.5m0 0L6 13m0 0L4.5 14.5m0 0L3 16m0 0L1.5 17.5m0 0L0 19m0 0L.5 20.5m0 0L1 22m0 0L2.5 20.5m0 0L4 19m0 0L5.5 17.5m0 0L7 16m0 0L8.5 14.5m0 0L10 13m0 0L11.5 11.5m0 0L13 10m0 0L14.5 8.5m0 0L16 7m0 0L17.5 5.5m0 0L19 4m0 0L20.5 2.5m0 0L22 1m0 0L20.5 2.5m0 0L19 4m0 0L17.5 5.5m0 0L16 7m0 0L14.5 8.5m0 0L13 10m0 0L11.5 11.5m0 0L10 13m0 0L8.5 14.5m0 0L7 16m0 0L5.5 17.5m0 0L4 19m0 0L2.5 20.5m0 0L1 22" />
                          </svg>
                        </button>
                      )}
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
      })}
    </div>
  );
};

export default MessageList;
