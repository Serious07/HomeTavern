import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Message } from '../../types';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { MessageStatsPanel } from './MessageStatsPanel';
import { ChatBlockWithParsedIds } from '../../types/compression';
import { ChatBlock } from './ChatBlock';
import { MessageEditModal } from './MessageEditModal';

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
  onEdit?: (messageId: number, content: string, otherContent?: string, editingTranslated?: boolean) => void;
  onDelete?: (messageId: number) => void;
  onReasoningChange?: (messageId: number, content: string, reasoning: string | null) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
  translationEnabled?: boolean;
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

interface MessageItemProps {
  message: Message;
  onRegenerate?: (messageId: number) => void;
  onEditStart?: (message: Message, isTranslated?: boolean) => void;
  onDelete?: (messageId: number) => void;
  onReasoningChange?: (messageId: number, content: string, reasoning: string | null) => void;
  translatingMessageId?: number | null;
  onTranslate?: (messageId: number) => void;
  translationEnabled: boolean;
  isLastAssistantMessage: boolean;
  messageIndex: number;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionClick?: (messageId: number) => void;
}

const THINKING_LINE_HEIGHT = 20; // text-sm + leading-5 = 20px

/**
 * Локальная модалка редактирования мыслей (reasoning_content).
 * По мотивам MessageEditModal, но проще: только textarea.
 */
const ThinkingEditModal: React.FC<{
  initialReasoning: string;
  onSave: (reasoning: string | null) => void;
  onCancel: () => void;
}> = ({ initialReasoning, onSave, onCancel }) => {
  const [draft, setDraft] = useState(initialReasoning);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isSaving]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave(draft.trim() ? draft : null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-gray-800 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm text-gray-300 flex items-center gap-2">🧠 Редактирование мыслей</span>
          <button onClick={onCancel} disabled={isSaving} className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Текст мыслей модели..."
            className="w-full bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y text-sm leading-relaxed px-3 py-2.5"
            style={{ minHeight: '200px', maxHeight: '50vh' }}
          />
        </div>
        <div className="border-t border-gray-700 px-4 py-3 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white rounded-lg font-medium transition"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition"
          >
            {isSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DragInfo {
  startY: number;
  baseContentLines: number;
  totalLines: number;
  lineH: number;
  contentLines: string[];
  reasoningLines: string[];
}

const MessageItem = memo(({
  message,
  onRegenerate,
  onEditStart,
  onDelete,
  onReasoningChange,
  translatingMessageId,
  onTranslate,
  translationEnabled,
  isLastAssistantMessage,
  messageIndex,
  isSelectionMode,
  isSelected,
  onSelectionClick,
}: MessageItemProps) => {
  const [showOriginal, setShowOriginal] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);

  // ============ Секция мыслей (reasoning_content) ============
  const hasReasoning = message.role === 'assistant' && !!message.reasoning_content;
  const thinkingStorageKey = `hometavern_thinking_collapsed_${message.id}`;
  const [thinkingExpanded, setThinkingExpanded] = useState<boolean>(() => {
    if (!message.reasoning_content) return true;
    return localStorage.getItem(thinkingStorageKey) !== '1';
  });
  const [editingThinking, setEditingThinking] = useState(false);
  // Во время drag рендерим обычный текст (без MarkdownRenderer) для точного позиционирования по Y
  const [dragState, setDragState] = useState<{ content: string; reasoning: string } | null>(null);
  const dragInfoRef = useRef<DragInfo | null>(null);
  const thinkingBoxRef = useRef<HTMLDivElement>(null);

  const isDragging = dragState !== null;
  const dragStateRef = useRef<{ content: string; reasoning: string } | null>(null);

  // Синхронизируем ref с dragState, чтобы handleDragEnd мог прочитать актуальное
  // значение без побочных эффектов внутри updater'а setState
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const toggleThinking = useCallback(() => {
    setThinkingExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(thinkingStorageKey, next ? '0' : '1');
      return next;
    });
  }, [thinkingStorageKey]);

  const handleDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!onReasoningChange) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const contentLines = message.content.split('\n');
    const reasoningText = message.reasoning_content || '';
    const reasoningLines = reasoningText ? reasoningText.split('\n') : [];
    const totalLines = contentLines.length + reasoningLines.length;
    if (totalLines === 0) return;

    // Высота логической строки: измеряем из секции мыслей (она всегда рендерится как pre-wrap текст)
    let lineH = THINKING_LINE_HEIGHT;
    const thinkEl = thinkingBoxRef.current;
    if (thinkEl && reasoningLines.length > 0) {
      const computed = parseFloat(getComputedStyle(thinkEl).lineHeight);
      if (!isNaN(computed) && computed > 0) lineH = computed;
    }

    dragInfoRef.current = {
      startY: e.clientY,
      baseContentLines: contentLines.length,
      totalLines,
      lineH,
      contentLines,
      reasoningLines,
    };
    setDragState({ content: message.content, reasoning: reasoningText });
  }, [onReasoningChange, message.content, message.reasoning_content]);

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const info = dragInfoRef.current;
    if (!info) return;
    e.preventDefault();

    const dy = e.clientY - info.startY;
    const deltaLines = Math.round(dy / info.lineH);
    let splitAt = info.baseContentLines + deltaLines;
    splitAt = Math.max(0, Math.min(info.totalLines, splitAt));

    const combined = info.contentLines.concat(info.reasoningLines);
    const newContent = combined.slice(0, splitAt).join('\n');
    const newReasoning = splitAt < info.totalLines ? combined.slice(splitAt).join('\n') : '';

    setDragState((prev) => (prev ? { content: newContent, reasoning: newReasoning } : prev));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragInfoRef.current = null;
    const prev = dragStateRef.current;
    setDragState(null);
    dragStateRef.current = null;

    if (!prev || !onReasoningChange) return;
    const newReasoning = prev.reasoning.trim() ? prev.reasoning : null;
    const oldReasoning = message.reasoning_content ?? null;
    if (prev.content !== message.content || newReasoning !== oldReasoning) {
      onReasoningChange(message.id, prev.content, newReasoning);
    }
  }, [onReasoningChange, message.id, message.content, message.reasoning_content]);

  const isSystem = message.role === 'system';
  const isUser = message.role === 'user';

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-gray-700/50 rounded-lg px-4 py-2 text-sm text-gray-400">
          {message.content}
        </div>
      </div>
    );
  }

  const toggleOriginal = () => {
    setShowOriginal((prev) => !prev);
  };

  const handleCopy = useCallback(() => {
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

    // Основной метод: Clipboard API с прямым await внутри onClick (сохраняет жест пользователя)
    const performCopy = async () => {
      let success = false;

      // Сначала пробуем современный Clipboard API с await (не .then!)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          success = true;
        } catch {
          // Fallback ниже
        }
      }

      // Fallback для мобильных браузеров и не-HTTPS контекстов
      if (!success) {
        try {
          // Удаляем старые временные элементы копирования (если есть)
          const oldElements = document.querySelectorAll('[data-copy-temp="true"]');
          oldElements.forEach(el => el.remove());

          // Создаем невидимый contenteditable элемент
          const tempDiv = document.createElement('div');
          tempDiv.contentEditable = 'true';
          tempDiv.spellcheck = false;
          tempDiv.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
          tempDiv.setAttribute('data-copy-temp', 'true');
          tempDiv.setAttribute('aria-hidden', 'true');

          // Вставляем текст через textContent (безопасно от XSS)
          const textNode = document.createTextNode(textToCopy);
          tempDiv.appendChild(textNode);

          document.body.appendChild(tempDiv);

          // Фокус на contenteditable элемент
          tempDiv.focus();

          // Создаем range и выделяем весь контент
          const range = document.createRange();
          range.selectNodeContents(tempDiv);

          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }

          // Копируем
          success = document.execCommand('copy');
          
          // Немедленно удаляем временный элемент
          document.body.removeChild(tempDiv);

          if (!success) {
            console.warn('execCommand copy returned false');
          }
        } catch (err) {
          console.error('Copy fallback failed:', err);
          success = false;
        }
      }

      // Обновляем UI после успешного копирования
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), getDisplayDuration());
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    };

    // Запускаем асинхронное копирование — await внутри onClick сохраняет контекст жеста
    performCopy();
  }, [message.content, message.translated_content, message.role, showOriginal]);

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
          className={`relative rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gray-600 text-white rounded-br-md'
              : 'bg-gray-700/80 text-white rounded-bl-md'
          }`}
        >
          {/* Оранжевая стрелка: → = мысли свёрнуты, ↓ (rotate-90) = развёрнуты */}
          {hasReasoning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleThinking();
              }}
              title={thinkingExpanded ? 'Свернуть мысли' : 'Показать мысли'}
              className="absolute -top-2.5 -right-2 z-10 p-1.5 bg-gray-800 text-orange-400 hover:text-orange-300 hover:bg-gray-700 rounded-full shadow transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-300 ease-in-out ${thinkingExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Секция ответа */}
          <div className="whitespace-pre-wrap">
            {isDragging ? (
              <span className="block text-sm leading-5">{dragState!.content}</span>
            ) : (
              <MarkdownRenderer>{getTextToRender()}</MarkdownRenderer>
            )}
          </div>

          {/* Секция мыслей: сворачиваемый wrapper (grid-template-rows 1fr <-> 0fr) */}
          {hasReasoning && (
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{ gridTemplateRows: thinkingExpanded ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden min-h-0">
                {/* Оранжевая пунктирная линия + зона захвата drag (>=44px) — только в развёрнутом состоянии */}
                {thinkingExpanded && (
                  <div
                    className="relative h-11 -my-4 flex items-center cursor-row-resize select-none"
                    style={{ touchAction: 'none' }}
                    onPointerDown={handleDragStart}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                    title="Перетащите линию, чтобы разделить ответ и мысли"
                  >
                    <div className="w-full border-t-2 border-dashed border-orange-400/90" />
                    <div className="absolute left-1/2 -translate-x-1/2 w-10 h-3 rounded-full bg-orange-400/50 shadow" />
                  </div>
                )}
                {/* Заголовок секции мыслей */}
                <div className="flex items-center justify-between px-1 pt-1 pb-1">
                  <span className="text-xs text-gray-500 flex items-center gap-1">🧠 Мысли</span>
                  {thinkingExpanded && onReasoningChange && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingThinking(true);
                      }}
                      title="Редактировать мысли"
                      className="p-1 text-gray-500 hover:text-orange-400 hover:bg-gray-700 rounded transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Текст мыслей (приглушённый) */}
                <div
                  ref={thinkingBoxRef}
                  className="px-1 pb-2 text-sm text-gray-400/80 whitespace-pre-wrap leading-5"
                >
                  {isDragging ? dragState!.reasoning : message.reasoning_content}
                </div>
              </div>
            </div>
          )}

          {/* Модалка редактирования мыслей */}
          {editingThinking && onReasoningChange && (
            <ThinkingEditModal
              initialReasoning={message.reasoning_content || ''}
              onCancel={() => setEditingThinking(false)}
              onSave={(reasoning) => {
                onReasoningChange(message.id, message.content, reasoning);
                setEditingThinking(false);
              }}
            />
          )}
        </div>

        {message.role === 'assistant' && (
          <MessageStatsPanel
            message={message}
            messageIndex={messageIndex}
          />
        )}

        {/* Время отправки + кнопки действий */}
        <div className={`flex items-center gap-2 mt-1 flex-wrap ${isUser ? 'justify-end' : 'justify-start'}`}>
          {/* Время отправки - только для user сообщений, т.к. у assistant время уже есть в MessageStatsPanel */}
          {message.role === 'user' && (
            <span className="text-[10px] text-gray-500 whitespace-nowrap">{formatMessageTime(message.created_at)}</span>
          )}

          {translationEnabled && (
            <>
              {message.role === 'assistant' && translatingMessageId === message.id && (
                <span className="text-xs text-gray-400">Перевод...</span>
              )}

              {message.role === 'assistant' && message.translated_content && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOriginal();
                  }}
                  className="p-1 text-[10px] leading-none text-gray-400 hover:text-white hover:bg-gray-700 rounded transition bg-gray-800/50"
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
                  className="p-1 text-[10px] leading-none text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded transition bg-gray-800/50"
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
                  className="p-1 text-[10px] leading-none text-gray-400 hover:text-white hover:bg-gray-700 rounded transition bg-gray-800/50"
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
                  className="p-1 text-[10px] leading-none text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded transition bg-gray-800/50"
                  title="Перевести на английский"
                >
                  EN
                </button>
              )}
            </>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition active:scale-110"
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

          {onEditStart && (isUser || message.role === 'assistant') && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Determine if we're viewing the translated version
                let isViewingTranslated = false;
                if (message.translated_content) {
                  if (message.role === 'assistant') {
                    // Assistant: by default shows translated, showOriginal toggles to content
                    isViewingTranslated = !showOriginal;
                  } else {
                    // User: by default shows original content, showOriginal toggles to translated
                    isViewingTranslated = showOriginal;
                  }
                }
                onEditStart(message, isViewingTranslated);
              }}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
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
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition"
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
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition"
              title="Удалить"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
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
  onReasoningChange,
  translatingMessageId = null,
  onTranslate,
  translationEnabled = true,
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
  
  // Modal editing state (lifted from MessageItem)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  // Track whether we're editing the translated content (true) or original content (false)
  const [editingTranslated, setEditingTranslated] = useState(false);
  
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

  // Modal editing handlers
  const handleEditStart = useCallback((message: Message, isTranslated?: boolean) => {
    setEditingMessage(message);
    setEditingTranslated(!!isTranslated);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleEditSave = useCallback(async (messageId: number, content: string) => {
    if (onEdit) {
      const msg = messages.find(m => m.id === messageId);
      if (msg) {
        // Determine which field was edited and pass the other for context
        let newContent = content;
        let otherContent: string | undefined;
        if (editingTranslated) {
          // User edited translated_content; pass original content as otherContent
          otherContent = msg.content;
        } else {
          // User edited content; pass translated_content as otherContent
          otherContent = msg.translated_content !== null ? msg.translated_content : undefined;
        }
        onEdit(messageId, newContent, otherContent, editingTranslated);
      }
    }
    setEditingMessage(null);
    setEditingTranslated(false);
  }, [onEdit, messages, editingTranslated]);

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
  const prevMessagesLengthRef = useRef<number>(0);
  // Track if initial scroll has been done for current chat
  const initialScrollDoneRef = useRef<boolean>(false);
  
  // Auto-scroll to bottom when messages are first loaded for a chat
  // This handles the case when switching to a new chat with fewer messages
  useEffect(() => {
    if (messages.length > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      setTimeout(() => {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 50);
    }
  }, [messages.length]);
  
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
                    onEditStart={handleEditStart}
                    onDelete={onDelete}
                    onReasoningChange={onReasoningChange}
                    translatingMessageId={translatingMessageId}
                    onTranslate={onTranslate}
                    translationEnabled={translationEnabled}
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
          onEditStart={handleEditStart}
          onDelete={onDelete}
          onReasoningChange={onReasoningChange}
          translatingMessageId={translatingMessageId}
          onTranslate={onTranslate}
          translationEnabled={translationEnabled}
          isLastAssistantMessage={isLastAssistantMessage}
          messageIndex={actualMessageIndex}
          isSelectionMode={isSelectionMode}
          isSelected={isSelected}
          onSelectionClick={handleSelectionClick}
        />
      );
    }
  }, [expandedBlockMessages, lastAssistantIndex, translationEnabled, isSelectionMode, selectionStart, selectionEnd, onEditBlock, onToggleBlockCompression, onDeleteBlock, handleExpandBlock, handleCollapseBlock, handleEditStart, onRegenerate, onDelete, onReasoningChange, translatingMessageId, onTranslate, handleSelectionClick, editingTranslated]);

  const hasMoreMessages = totalItemCount > displayCount;

  return (
    <>
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

    {/* Message Edit Modal */}
    {editingMessage && (
      <MessageEditModal
        messageId={editingMessage.id}
        content={editingTranslated ? (editingMessage.translated_content || editingMessage.content) : editingMessage.content}
        onSave={handleEditSave}
        onCancel={handleEditCancel}
      />
    )}
    </>
  );
};

export default MessageList;