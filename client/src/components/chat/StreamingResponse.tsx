import React, { useEffect, useState, useRef } from 'react';
import { Message } from '../../types';
import { STORAGE_KEYS } from '../../constants/storage';
import { MarkdownRenderer } from '../common/MarkdownRenderer';

interface StreamingResponseProps {
  chatId: number;
  onStop?: () => void;
  onComplete?: (message: Message) => void;
  onError?: (error: string) => void;
  showThinking?: boolean;  // Внешнее состояние showThinking (опционально для обратной совместимости)
  onToggleThinking?: () => void;  // Callback для переключения состояния
}

const StreamingResponse: React.FC<StreamingResponseProps> = ({
  chatId,
  onStop,
  onComplete,
  onError,
  showThinking: externalShowThinking,
  onToggleThinking,
}) => {
  const [isStreaming, setIsStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [reasoningContent, setReasoningContent] = useState('');
  // Локальное состояние только если не передано внешнее
  const [internalShowThinking, setInternalShowThinking] = useState(false);
  
  // Используем внешнее или внутреннее состояние
  const actualShowThinking = externalShowThinking !== undefined 
    ? externalShowThinking 
    : internalShowThinking;
  
  // Ref для отслеживания того, что reasoningContent был получен (чтобы показывать кнопку если есть мысли)
  const hasReasoningContentRef = useRef(false);
  
  // Ref для скролла к стриминговому сообщению и к концу контента
  const streamingMessageRef = useRef<HTMLDivElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageIdRef = useRef<number>(0);
  const translatedTextRef = useRef<string | null>(null);
  const contentRef = useRef<string>('');
  const reasoningContentRef = useRef<string>('');
  
  // Эффект для автоматического скролла к стриминговому сообщению при изменении контента
  useEffect(() => {
    // Скроллим к концу контента при каждом изменении content или reasoningContent
    // Используем contentEndRef чтобы скроллить точно к концу контента, а не к началу сообщения
    const scrollToContentEnd = () => {
      if (contentEndRef.current) {
        // Используем scrollMarginBottom чтобы скролл останавливался чуть выше кнопок внизу
        contentEndRef.current.style.scrollMarginBottom = '80px';
        contentEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      } else if (streamingMessageRef.current) {
        // Fallback к старому поведению если contentEndRef не доступен
        streamingMessageRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    };
    
    // Вызываем скролл с небольшим задержкой чтобы дать браузеру время на рендеринг нового контента
    const timeoutId = setTimeout(scrollToContentEnd, 0);
    return () => clearTimeout(timeoutId);
  }, [content, reasoningContent]);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const url = token 
      ? `/api/chats/${chatId}/stream?token=${token}`
      : `/api/chats/${chatId}/stream`;
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Слушаем named events (server использует format: event: eventName)
    eventSource.addEventListener('reasoning_token', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setReasoningContent((prev) => {
          const newValue = prev + data.token;
          reasoningContentRef.current = newValue;
          hasReasoningContentRef.current = true;
          return newValue;
        });
      } catch (err) {
        // Ignore parse errors
      }
    });

    eventSource.addEventListener('content_token', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setContent((prev) => {
          const newValue = prev + data.token;
          contentRef.current = newValue;
          return newValue;
        });
      } catch (err) {
        // Ignore parse errors
      }
    });

    eventSource.addEventListener('message_id', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        messageIdRef.current = data.messageId;
      } catch (err) {
        // Ignore parse errors
      }
    });

    eventSource.addEventListener('translation', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.translatedText) {
          translatedTextRef.current = data.translatedText;
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    eventSource.addEventListener('done', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE done] Received done event:', data);
        console.log('[SSE done] contentRef.current:', contentRef.current);
        console.log('[SSE done] reasoningContentRef.current:', reasoningContentRef.current);
        setIsStreaming(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Call onComplete with the final message
        if (onComplete) {
          onComplete({
            id: messageIdRef.current || (data.messageId ? parseInt(data.messageId) : 0),
            chat_id: chatId,
            user_id: 0,
            content: contentRef.current,
            role: 'assistant',
            reasoning_content: reasoningContentRef.current,
            translated_content: translatedTextRef.current || data.translatedText || null,
            created_at: new Date().toISOString(),
          } as Message);
        }
      } catch (err) {
        console.error('[SSE done] Error in done handler:', err);
        // Ignore parse errors
      }
    });

    eventSource.onerror = (err) => {
      console.error('SSE Connection Error:', err);
      console.error('EventSource readyState:', eventSource.readyState);
      console.error('EventSource url:', eventSource.url);
      
      setIsStreaming(false);
      eventSource.close();
      eventSourceRef.current = null;

      const errorMessage = 'Ошибка соединения с потоком ответа. Проверьте консоль сервера.';
      setError(errorMessage);

      if (onError) {
        onError(errorMessage);
      }
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [chatId, onComplete, onError]);

  // Функция остановки генерации
  const handleStop = () => {
    console.log('[handleStop] Stopping generation');
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
    
    // Вызываем onComplete с текущим контентом (используем refs)
    if (onComplete && (contentRef.current || reasoningContentRef.current)) {
      console.log('[handleStop] Calling onComplete with partial message');
      onComplete({
        id: messageIdRef.current,
        chat_id: chatId,
        user_id: 0,
        content: contentRef.current,
        role: 'assistant',
        reasoning_content: reasoningContentRef.current,
        translated_content: translatedTextRef.current,
        created_at: new Date().toISOString(),
      } as Message);
    }
    
    if (onStop) {
      console.log('[handleStop] Calling onStop callback');
      onStop();
    }
  };

  return (
    <div ref={streamingMessageRef} className="bg-gray-700/50 rounded-2xl p-4 animate-fadeIn">
      {/* Typing indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></span>
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></span>
            </div>
          <span className="text-sm text-gray-400">Печатает...</span>
        </div>
      )}

      {/* Reasoning content */}
      {reasoningContent && hasReasoningContentRef.current && (
        <div className="mb-3 pb-3 border-b border-gray-600">
          <button
            onClick={onToggleThinking || (() => setInternalShowThinking(!actualShowThinking))}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition"
          >
            <svg
              className={`w-4 h-4 transition-transform ${actualShowThinking ? 'rotate-180' : ''}`}
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
            {actualShowThinking ? 'Скрыть мышление' : 'Показать мышление'}
          </button>
          {actualShowThinking && (
            <div className="mt-2 p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400 whitespace-pre-wrap">
              {reasoningContent}
            </div>
          )}
        </div>
      )}

      {/* Streaming content */}
      <div className="text-white">
        <MarkdownRenderer streaming>{content}</MarkdownRenderer>
      </div>
      {/* Ref для скролла к концу контента */}
      <div ref={contentEndRef} className="scroll-mb-20" />

      {/* Error message */}
      {error && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Stop button и кнопка сворачивания размышлений - внизу сообщения */}
      {isStreaming && (
        <div className="mt-4 flex justify-start gap-2">
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm text-white transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Прервать генерацию
          </button>
          {reasoningContent && hasReasoningContentRef.current && (
            <button
              onClick={onToggleThinking || (() => setInternalShowThinking(!actualShowThinking))}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-sm text-white transition flex items-center gap-2"
            >
              <svg
                className={`w-4 h-4 transition-transform ${actualShowThinking ? 'rotate-180' : ''}`}
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
              {actualShowThinking ? 'Свернуть размышления' : 'Развернуть размышления'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamingResponse;
