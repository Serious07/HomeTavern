import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '../../types';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { MessageStatsPanel } from './MessageStatsPanel';
import { ChatBlockWithParsedIds } from '../../types/compression';
import { ChatBlock } from './ChatBlock';

const VISIBLE_LIMIT_STORAGE_KEY = 'hometavern_visible_message_limit';
const DEFAULT_VISIBLE_LIMIT = 50;

export function getVisibleMessageLimit(): number {
  const stored = localStorage.getItem(VISIBLE_LIMIT_STORAGE_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_VISIBLE_LIMIT;
}

export function setVisibleMessageLimit(value: number): void {
  localStorage.setItem(VISIBLE_LIMIT_STORAGE_KEY, String(value));
}

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
  blocks?: ChatBlockWithParsedIds[];
  onEditBlock?: (blockId: number, updates: { title?: string; summary?: string }) => void;
  onToggleBlockCompression?: (blockId: number, isCompressed: boolean) => void;
  onDeleteBlock?: (blockId: number) => void;
  onExpandBlock?: (block: ChatBlockWithParsedIds) => void;
  onBlockUpdate?: (blockId: number, updatedBlock: ChatBlockWithParsedIds) => void;
  isSelectionMode?: boolean;
  selectionStart?: number | null;
  selectionEnd?: number | null;
  onMessageSelectionClick?: (messageId: number) => void;
  onCancelSelection?: () => void;
  visibleLimit?: number;
}

const formatMessageTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
};

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
      if (message.role === 'assistant') {
        textToCopy = showOriginal ? message.content : message.translated_content;
      } else {
        textToCopy = showOriginal ? message.translated_content : message.content;
      }
    }
    
    const getDisplayDuration = () => {
      const mediaQuery = window.matchMedia('(pointer: coarse)');
      return mediaQuery.matches ? 3000 : 2000;
    };

    const tryClipboardCopy = (): Promise<boolean> => {
      return navigator.clipboard.writeText(textToCopy)
        .then(() => true)
        .catch(() => false);
    };

    const fallbackCopy = (): boolean => {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      
      try {
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      } catch (err) {
        document.body.removeChild(textarea);
        return false;
      }
    };

    const performCopy = async () => {
      let success = false;
      success = await tryClipboardCopy();
      if (!success) {
        success = fallbackCopy();
      }
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), getDisplayDuration());
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    };

    performCopy();
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
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gray-600 text-white rounded-br-md'
              : 'bg-gray-700/80 text-white rounded-bl-md'
          }`}
        >
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

        {message.role === 'assistant' && (
          <MessageStatsPanel
            message={message}
            messageIndex={messageIndex}
          />
        )}

        <div
          className={`flex items-center gap-2 mt-1 ${
            isUser ? 'flex-row-reverse' : 'flex-row'
          }`}
        >
          <span className="text-xs text-gray-500">
            {formatMessageTime(message.created_at)}
          </span>

          {!isEditing && (
            <div className="flex items-center gap-1">
              {message.role === 'assistant' && translatingMessageId === message.id && (
                <span className="text-xs text-gray-400">Перевод...</span>
              )}
              
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
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition active:scale-110"
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

type RenderItem = 
  | { type: 'block'; block: ChatBlockWithParsedIds; key: string }
  | { type: 'message'; message: Message; key: string };

const MessageList: React.FC<MessageListProps> = ({
  messages,
  onRegenerate,
  onEdit,
  onDelete,
  showThinking = {},
  onToggleThinking,
  translatingMessageId = null,
  onTranslate,
  blocks = [],
  onEditBlock,
  onToggleBlockCompression,
  onDeleteBlock,
  onExpandBlock,
  onBlockUpdate,
  isSelectionMode = false,
  selectionStart = null,
  selectionEnd = null,
  onMessageSelectionClick,
  onCancelSelection,
  visibleLimit: visibleLimitProp,
}) => {
  const [expandedBlockMessages, setExpandedBlockMessages] = useState<ExpandedBlockMessages | null>(null);
  
  const visibleLimit = visibleLimitProp ?? getVisibleMessageLimit();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Track how many items to show (starts at visibleLimit, increases as user scrolls up)
  const [displayCount, setDisplayCount] = useState(visibleLimit);
  
  // Ref to track if user is scrolled near bottom (to avoid auto-scroll when reading history)
  const isScrolledToBottomRef = useRef<boolean>(true);
  
  const handleExpandBlock = useCallback((block: ChatBlockWithParsedIds) => {
    const blockMessages = messages.filter(msg => block.original_message_ids.includes(msg.id));
    setExpandedBlockMessages({ blockId: block.id, messages: blockMessages });
    onExpandBlock?.(block);
  }, [messages, onExpandBlock]);

  const handleCollapseBlock = useCallback(() => {
    setExpandedBlockMessages(null);
  }, []);

  const messageToBlock = useMemo(() => {
    const map = new Map<number, ChatBlockWithParsedIds>();
    for (const block of blocks) {
      block.original_message_ids.forEach(msgId => {
        map.set(msgId, block);
      });
    }
    return map;
  }, [blocks]);

  const renderItems = useMemo(() => {
    const items: RenderItem[] = [];

    for (const msg of messages) {
      const block = messageToBlock.get(msg.id);

      if (block) {
        if (msg.id === block.start_message_id) {
          items.push({ type: 'block', block, key: `block-${block.id}` });
        }
      } else {
        items.push({ type: 'message', message: msg, key: `msg-${msg.id}` });
      }
    }

    return items;
  }, [messages, messageToBlock]);

  const totalItemCount = renderItems.length;

  // Get the items to display (last N items)
  const displayedItems = useMemo(() => {
    if (totalItemCount <= visibleLimit) {
      return renderItems;
    }
    return renderItems.slice(-displayCount);
  }, [renderItems, displayCount, totalItemCount, visibleLimit]);

  const lastAssistantIndex = useMemo(() => {
    const indices = displayedItems
      .map((item, idx) => item.type === 'message' && item.message.role === 'assistant' ? idx : -1)
      .filter(idx => idx !== -1);
    return indices.length > 0 ? indices[indices.length - 1] : -1;
  }, [displayedItems]);

  // Track previous messages length to detect actual new messages
  const prevMessagesLengthRef = useRef<number>(messages.length);
  
  // Reset display count to show all when new messages arrive (length increases)
  // This only triggers when genuinely new messages are added, not on every parent re-render
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      setDisplayCount(visibleLimit);
      // Auto-scroll to bottom when new messages arrive
      // Only if user was already at bottom or it's the initial load
      setTimeout(() => {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 50);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, visibleLimit]);
  
  // Auto-scroll to bottom when displayCount changes (user scrolls up to load older messages)
  // but ONLY if they were at the bottom before
  useEffect(() => {
    if (displayCount > prevMessagesLengthRef.current) {
      // User is loading older messages, don't scroll
      return;
    }
    // If user is at bottom, scroll to bottom after any content change
    if (isScrolledToBottomRef.current) {
      setTimeout(() => {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 50);
    }
  }, [displayCount, messages.length]);

  // Check if user is scrolled near bottom
  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollHeight, scrollTop, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // Consider "at bottom" if within 100px of the bottom
    isScrolledToBottomRef.current = distanceFromBottom < 100;
  }, []);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    checkScrollPosition();
    
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollHeight, scrollTop, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    // If user scrolled up and is near the top of loaded content, load more
    if (distanceFromBottom > clientHeight * 0.8) {
      setDisplayCount(prev => {
        const newCount = prev + visibleLimit;
        return Math.min(newCount, totalItemCount);
      });
    }
  }, [totalItemCount, visibleLimit, checkScrollPosition]);

  // Load more messages when scrolling near top
  const loadMoreMessages = useCallback(() => {
    setDisplayCount(prev => {
      const newCount = prev + visibleLimit;
      return Math.min(newCount, totalItemCount);
    });
  }, [totalItemCount, visibleLimit]);

  const handleSelectionClick = (messageId: number) => {
    if (!onMessageSelectionClick) return;
    
    if (selectionStart === null) {
      onMessageSelectionClick(messageId);
    } else if (messageId > selectionStart) {
      onMessageSelectionClick(messageId);
    } else {
      onMessageSelectionClick(messageId);
    }
  };

  const selectionCount = useMemo(() => {
    if (selectionStart === null || selectionEnd === null) return 0;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return messages.filter(m => m.id >= start && m.id <= end).length;
  }, [selectionStart, selectionEnd, messages]);

  const renderItemContent = useCallback((item: RenderItem, index: number) => {
    if (item.type === 'block') {
      const isExpanded = expandedBlockMessages && expandedBlockMessages.blockId === item.block.id;
      return (
        <React.Fragment key={item.key}>
          <ChatBlock
            block={item.block}
            onEdit={(blockId, updates) => onEditBlock?.(blockId, updates)}
            onToggleCompression={(blockId, isCompressed) => onToggleBlockCompression?.(blockId, isCompressed)}
            onDelete={(blockId) => onDeleteBlock?.(blockId)}
            onExpand={handleExpandBlock}
            isExpanded={!!isExpanded}
            onBlockUpdate={onBlockUpdate}
          />
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
                    messageIndex={messages.findIndex(m => m.id === msg.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </React.Fragment>
      );
    } else {
      // Compute the actual index of the message in the full messages array
      const actualMessageIndex = messages.findIndex(m => m.id === item.message.id);
      const isLastAssistantMessage =
        item.message.role === 'assistant' &&
        index === lastAssistantIndex;
      
      const isSelected = isSelectionMode &&
        selectionStart !== null &&
        selectionEnd !== null &&
        item.message.id >= Math.min(selectionStart, selectionEnd) &&
        item.message.id <= Math.max(selectionStart, selectionEnd);

      return (
        <MessageItem
          message={item.message}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          onDelete={onDelete}
          showThinking={showThinking}
          onToggleThinking={onToggleThinking}
          translatingMessageId={translatingMessageId}
          onTranslate={onTranslate}
          isLastAssistantMessage={isLastAssistantMessage}
          messageIndex={actualMessageIndex}
          isSelectionMode={isSelectionMode}
          isSelected={isSelected}
          onSelectionClick={handleSelectionClick}
        />
      );
    }
  }, [expandedBlockMessages, lastAssistantIndex, isSelectionMode, selectionStart, selectionEnd, onEditBlock, onToggleBlockCompression, onDeleteBlock, handleExpandBlock, onBlockUpdate, handleCollapseBlock, onRegenerate, onEdit, onDelete, showThinking, onToggleThinking, translatingMessageId, onTranslate, handleSelectionClick]);

  const hasMoreMessages = totalItemCount > displayCount;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 pt-4 pb-4"
        onScroll={handleScroll}
      >
        {/* Load more button when user scrolls up */}
        {hasMoreMessages && displayCount > visibleLimit && (
          <div className="flex justify-center py-2 sticky top-0 z-10">
            <button
              onClick={loadMoreMessages}
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm transition"
            >
              Загрузить старше ({totalItemCount - displayCount} сообщений скрыто)
            </button>
          </div>
        )}
        
        {displayedItems.map((item, index) => (
          <React.Fragment key={item.key}>
            {renderItemContent(item, index)}
          </React.Fragment>
        ))}
        
        {/* Bottom spacer to ensure scrollable area matches content */}
        <div ref={messagesEndRef} />
      </div>

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
                    const end = Math.max(selectionStart, selectionEnd);
                    onMessageSelectionClick?.(end);
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