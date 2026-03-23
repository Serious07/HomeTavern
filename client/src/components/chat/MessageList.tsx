import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '../../types';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { MessageStatsPanel } from './MessageStatsPanel';
import { ChatBlockWithParsedIds } from '../../types/compression';
import { ChatBlock } from './ChatBlock';

interface ExpandedBlockMessages {
  blockId: number;
  messages: Message[];
}

interface MessageListProps {
  messages: Message[];
  onRegenerate?: (messageId: number) => void;
  onEdit?: (messageId: number, content: string, translatedContent?: string) => void;
  onDelete?: (messageId: number) => void;
  showThinking?: Record<number, boolean>;
  onToggleThinking?: (messageId: number) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
  // Новые пропсы для сжатия истории
  blocks?: ChatBlockWithParsedIds[];
  onEditBlock?: (blockId: number, updates: { title?: string; summary?: string }) => void;
  onToggleBlockCompression?: (blockId: number, isCompressed: boolean) => void;
  onDeleteBlock?: (blockId: number) => void;
  onExpandBlock?: (block: ChatBlockWithParsedIds) => void;
  onBlockUpdate?: (blockId: number, updatedBlock: ChatBlockWithParsedIds) => void;
  // Для ручного выделения сообщений
  isSelectionMode?: boolean;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  onMessageSelectionClick?: (messageId: number) => void;
  onCancelSelection?: () => void;
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
  messageIndex,
  isSelectionMode,
  isSelected,
  onSelectionClick,
}: {
  message: Message;
  onRegenerate?: (messageId: number) => void;
  onEdit?: (messageId: number, content: string, translatedContent?: string) => void;
  onDelete?: (messageId: number) => void;
  showThinking: Record<number, boolean>;
  onToggleThinking?: (messageId: number) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
  isLastAssistantMessage: boolean;
  messageIndex: number;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionClick?: (messageId: number) => void;
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
      // Передаем и content, и translated_content для двунаправленного перевода
      // Проверяем, что translated_content не null
      const translatedContent = message.translated_content !== null ? message.translated_content : undefined;
      onEdit(editingMessageId, editContent, translatedContent);
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
    if (message.translated_content) {
      // showOriginal = true → копируем оригинал, false → копируем перевод
      textToCopy = showOriginal ? message.content : message.translated_content;
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

  const handleSelectionClick = () => {
    if (isSelectionMode && onSelectionClick) {
      onSelectionClick(message.id);
    }
  };

  return (
    <div
      data-message-id={message.id}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} py-2 ${
        isSelectionMode ? 'cursor-pointer' : ''
      } ${isSelected ? 'bg-cyan-900/30 -mx-4 px-4' : ''}`}
      onClick={handleSelectionClick}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleThinking?.(message.id);
                }}
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

        {/* Message stats panel - отображается под сообщением assistant */}
        {message.role === 'assistant' && (
          <MessageStatsPanel
            message={message}
            messageIndex={messageIndex}
          />
        )}

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
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOriginal();
                  }}
                  className="p-1 px-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs font-medium bg-gray-800/50"
                  title={showOriginal ? 'Показать перевод' : 'Показать оригинал'}
                >
                  {showOriginal ? 'RU' : 'EN'}
                </button>
              )}
              
              {/* Кнопка перевода для assistant сообщений без перевода */}
              {message.role === 'assistant' && !message.translated_content && onTranslate && translatingMessageId !== message.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTranslate(message.id);
                  }}
                  className="p-1 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded transition text-xs font-medium bg-gray-800/50"
                  title="Перевести на русский"
                >
                  RU
                </button>
              )}
              
              {/* Кнопка переключения оригинал/перевод для user сообщений с переводом */}
              {message.role === 'user' && message.translated_content && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOriginal();
                  }}
                  className="p-1 px-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs font-medium bg-gray-800/50"
                  title={showOriginal ? 'Показать перевод (EN)' : 'Показать оригинал (RU)'}
                >
                  {showOriginal ? 'EN' : 'RU'}
                </button>
              )}
              
              {/* Кнопка перевода для user сообщений без перевода */}
              {message.role === 'user' && !message.translated_content && onTranslate && translatingMessageId !== message.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTranslate(message.id);
                  }}
                  className="p-1 px-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded transition text-xs font-medium bg-gray-800/50"
                  title="Перевести на английский"
                >
                  EN
                </button>
              )}
              
              {/* Кнопка копирования для всех сообщений */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditStart();
                  }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerate(message.id);
                  }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(message.id);
                  }}
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
 * Компонент списка сообщений - поддерживает сжатые блоки
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
  // Новые пропсы для сжатия
  blocks = [],
  onEditBlock,
  onToggleBlockCompression,
  onDeleteBlock,
  onExpandBlock,
  onBlockUpdate,
  // Для ручного выделения
  isSelectionMode = false,
  selectionStart = null,
  selectionEnd = null,
  onMessageSelectionClick,
  onCancelSelection,
}) => {
  // State для развернутых блоков
  const [expandedBlockMessages, setExpandedBlockMessages] = useState<ExpandedBlockMessages | null>(null);
  
  // Ref для скролла к концу
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Эффект для автоматического скролла к концу при изменении сообщений
  useEffect(() => {
    // Функция скролла к концу с учетом динамического изменения контента
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        // Используем scrollIntoView с block: 'end' чтобы скроллить к концу видимой области
        // behavior: 'auto' для мгновенного скролла (важно для стриминга)
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    };
    
    // Вызываем скролл с задержкой чтобы дать браузеру время на рендеринг
    const timeoutId = setTimeout(scrollToBottom, 0);
    return () => clearTimeout(timeoutId);
  }, [messages, blocks, expandedBlockMessages]);

  // Обработчик развертывания блока
  const handleExpandBlock = useCallback((block: ChatBlockWithParsedIds) => {
    // Фильтруем сообщения, которые входят в этот блок
    const blockMessages = messages.filter(msg => block.original_message_ids.includes(msg.id));
    setExpandedBlockMessages({ blockId: block.id, messages: blockMessages });
    // Вызываем внешний обработчик если есть
    onExpandBlock?.(block);
  }, [messages, onExpandBlock]);

  // Сворачивание блока
  const handleCollapseBlock = useCallback(() => {
    setExpandedBlockMessages(null);
  }, []);
  // Создаем маппинг message_id -> block для быстрого поиска
  const messageToBlock = useMemo(() => {
    const map = new Map<number, ChatBlockWithParsedIds>();
    for (const block of blocks) {
      block.original_message_ids.forEach(msgId => {
        map.set(msgId, block);
      });
    }
    return map;
  }, [blocks]);

  // Строим список элементов для рендера (чередование блоков и сообщений)
  const renderItems = useMemo(() => {
    const items: Array<{ type: 'block'; block: ChatBlockWithParsedIds } | { type: 'message'; message: Message }> = [];
    const processedMessageIds = new Set<number>();

    // Проходим по сообщениям в порядке created_at
    for (const msg of messages) {
      const block = messageToBlock.get(msg.id);

      if (block) {
        // Если это start_message_id блока, добавляем блок
        if (msg.id === block.start_message_id) {
          items.push({ type: 'block', block });
        }
        // Помечаем сообщения блока как обработанные
        block.original_message_ids.forEach(id => processedMessageIds.add(id));
      } else {
        // Сообщение не в блоке - добавляем как обычно
        items.push({ type: 'message', message: msg });
      }
    }

    return items;
  }, [messages, messageToBlock]);

  // Обработка клика по сообщению в режиме выделения
  const handleSelectionClick = (messageId: number) => {
    if (!onMessageSelectionClick) return;
    
    if (selectionStart === null) {
      // Первое выделение
      onMessageSelectionClick(messageId);
    } else if (messageId > selectionStart) {
      // Второе выделение (конец диапазона)
      onMessageSelectionClick(messageId);
    } else {
      // Обновляем начало выделения
      onMessageSelectionClick(messageId);
    }
  };

  // Вычисляем количество сообщений в выделении
  const selectionCount = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return 0;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return messages.filter(m => m.id >= start && m.id <= end).length;
  }, [selectionStart, selectionEnd, messages]);

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Список сообщений и блоков - скроллируемая область */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <div className="space-y-2">
          {renderItems.map((item, index) => {
            if (item.type === 'block') {
              const isExpanded = expandedBlockMessages && expandedBlockMessages.blockId === item.block.id;
              return (
                <React.Fragment key={`block-fragment-${item.block.id}`}>
                  <ChatBlock
                      block={item.block}
                      onEdit={(blockId, updates) => onEditBlock?.(blockId, updates)}
                      onToggleCompression={(blockId, isCompressed) => onToggleBlockCompression?.(blockId, isCompressed)}
                      onDelete={(blockId) => onDeleteBlock?.(blockId)}
                      onExpand={handleExpandBlock}
                      isExpanded={!!isExpanded}
                      onBlockUpdate={onBlockUpdate}
                    />
                  {/* Отображение развернутых сообщений блока */}
                  {isExpanded && (
                    <div className="ml-4 border-l-2 border-cyan-700 pl-4 py-2 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-cyan-400 font-medium">Оригинальные сообщения ({expandedBlockMessages.messages.length})</span>
                        <button
                          onClick={handleCollapseBlock}
                          className="text-xs text-cyan-400 hover:text-cyan-300 transition"
                        >
                          ▲ Свернуть
                        </button>
                      </div>
                      <div className="space-y-2">
                        {expandedBlockMessages.messages.map((msg) => (
                          <MessageItem
                            key={msg.id}
                            message={msg}
                            onRegenerate={onRegenerate}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            showThinking={showThinking}
                            onToggleThinking={onToggleThinking}
                            translatingMessageId={translatingMessageId}
                            onTranslate={onTranslate}
                            isLastAssistantMessage={false}
                            messageIndex={index}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
               );
           } else {
               // Находим последнее сообщение assistant в renderItems
               const lastAssistantIndex = renderItems.map((i, idx) =>
                 i.type === 'message' && i.message.role === 'assistant' ? idx : -1
               ).filter(idx => idx !== -1).pop();
               
               const isLastAssistantMessage =
                 item.message.role === 'assistant' &&
                 index === lastAssistantIndex;
               
               // Проверяем, выделено ли сообщение
               const isSelected = isSelectionMode &&
                 selectionStart !== null &&
                 selectionEnd !== null &&
                 item.message.id >= Math.min(selectionStart, selectionEnd) &&
                 item.message.id <= Math.max(selectionStart, selectionEnd);

               return (
                 <MessageItem
                   key={item.message.id}
                   message={item.message}
                   onRegenerate={onRegenerate}
                   onEdit={onEdit}
                   onDelete={onDelete}
                   showThinking={showThinking}
                   onToggleThinking={onToggleThinking}
                   translatingMessageId={translatingMessageId}
                   onTranslate={onTranslate}
                   isLastAssistantMessage={isLastAssistantMessage}
                   messageIndex={index}
                   isSelectionMode={isSelectionMode}
                   isSelected={isSelected}
                   onSelectionClick={handleSelectionClick}
                 />
               );
             }
           })}
        </div>
        {/* Ref для скролла к концу - внутри скроллируемой области */}
        <div ref={messagesEndRef} />
      </div>

      {/* Тулбар выделения */}
      {isSelectionMode && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 border border-cyan-700 rounded-lg shadow-xl p-4 z-40">
          <div className="flex items-center gap-4">
            {selectionStart && selectionEnd ? (
              <>
                <div className="text-cyan-300">
                  Выделено сообщений: <span className="font-bold">{selectionCount}</span>
                </div>
                <button
                  onClick={() => {
                    // Запуск сжатия выделенного диапазона
                    const end = Math.max(selectionStart, selectionEnd);
                    onMessageSelectionClick?.(end); // Это вызовет сжатие
                  }}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded transition"
                >
                  Сжать выбранные
                </button>
              </>
            ) : (
              <div className="text-cyan-300">
                Нажмите на первое сообщение для начала выделения
              </div>
            )}
            
            <button
              onClick={onCancelSelection}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageList;
