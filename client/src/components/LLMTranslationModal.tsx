import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { STORAGE_KEYS } from '../constants/storage';

// Глобальный Map для отслеживания уже запущенных переводов (для внутреннего режима)
const activeTranslations = new Map<string, AbortController>();
const completedTranslations = new Set<string>();

interface LLMTranslationModalProps {
  text: string;
  sourceLang: string;
  targetLang: string;
  onComplete: (translatedText: string) => void;
  onCancel: () => void;
  // Внешний стриминг (от SSE events)
  externalStream?: {
    displayText: string;
    reasoningText?: string;
    status: 'translating' | 'done' | 'error';
    errorMessage?: string;
  };
  // Разрешить отображение reasoning (мыслей модели). По умолчанию true для обратной совместимости.
  reasoningEnabled?: boolean;
}

const LLMTranslationModal: React.FC<LLMTranslationModalProps> = ({
  text,
  sourceLang,
  targetLang,
  onComplete,
  onCancel,
  externalStream,
  reasoningEnabled = true,
}) => {
  const [displayText, setDisplayText] = useState<string>('');
  const [status, setStatus] = useState<'translating' | 'error' | 'done'>('translating');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hasReceivedToken, setHasReceivedToken] = useState(false);
  // Reasoning токены (мысли модели) — отображаются в отдельной секции
  const [reasoningText, setReasoningText] = useState<string>('');
  const [isReasoningCollapsed, setIsReasoningCollapsed] = useState(false);
  // Фаза "размышления" — показывается пока не пришли первые токены
  const [isThinking, setIsThinking] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  const reasoningContainerRef = useRef<HTMLDivElement>(null);
  const translationKey = `${text}|${sourceLang}|${targetLang}`;
  const isRegisteredRef = useRef(false);
  // Для отслеживания внешнего режима
  const isExternalMode = !!externalStream;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // ─── Thinking tag filtering ───────────────────────────────────────────────
  // Некоторые модели (Qwen3 и др.) генерируют <thinking>...</thinking> прямо
  // в content, а не через reasoning_content. Фильтруем на лету при стриминге.
  const rawBufferRef = useRef<string>('');
  const insideThinkingRef = useRef<boolean>(false);

  // Partial tag prefixes to watch for (to avoid showing "<thi" in output)
  const THINKING_OPEN_PARTIALS = ['<t', '<th', '<thi', '<thin', '<think', '<thinki', '<thinkin', '<thinking'];
  const THINKING_CLOSE_PARTIALS = ['</', '</t', '</th', '</thi', '</thin', '</think', '</thinki', '</thinkin', '</thinking'];

  /**
   * Check if text ends with a partial opening/closing thinking tag.
   * Returns the start index of the partial tag, or -1.
   */
  const findPartialTagAtEnd = (text: string, isInsideThinking: boolean): number => {
    const partials = isInsideThinking ? THINKING_CLOSE_PARTIALS : THINKING_OPEN_PARTIALS;
    for (const partial of partials) {
      if (text.endsWith(partial)) {
        return text.length - partial.length;
      }
    }
    return -1;
  };

  /**
   * Process incoming text chunk: split into reasoning (thinking tags) and content.
   * Handles partial tags across chunks via buffering.
   */
  const processToken = useCallback((token: string) => {
    rawBufferRef.current += token;
    const buf = rawBufferRef.current;

    let reasoningChunk = '';
    let contentChunk = '';
    let consumed = 0;

    while (consumed < buf.length) {
      if (insideThinkingRef.current) {
        // Inside a <thinking> block — look for </thinking>
        const closeIdx = buf.indexOf('</thinking>', consumed);
        if (closeIdx !== -1) {
          reasoningChunk += buf.slice(consumed, closeIdx);
          consumed = closeIdx + '</thinking>'.length;
          insideThinkingRef.current = false;
        } else {
          // No closing tag yet — check for partial close tag at end
          const partialIdx = findPartialTagAtEnd(buf.slice(consumed), true);
          if (partialIdx !== -1) {
            // Buffer the partial tag, emit the rest as reasoning
            reasoningChunk += buf.slice(consumed, consumed + partialIdx);
            consumed = consumed + partialIdx;
          } else {
            // No partial tag — buffer everything as reasoning
            reasoningChunk += buf.slice(consumed);
            consumed = buf.length;
          }
          break; // Can't process further without the closing tag
        }
      } else {
        // Outside thinking — look for <thinking>
        const openIdx = buf.indexOf('<thinking>', consumed);
        if (openIdx !== -1) {
          contentChunk += buf.slice(consumed, openIdx);
          consumed = openIdx + '<thinking>'.length;
          insideThinkingRef.current = true;
        } else {
          // No opening tag — check for partial open tag at end
          const partialIdx = findPartialTagAtEnd(buf.slice(consumed), false);
          if (partialIdx !== -1) {
            // Buffer the partial tag, emit the rest as content
            contentChunk += buf.slice(consumed, consumed + partialIdx);
            consumed = consumed + partialIdx;
          } else {
            // No partial tag — emit everything as content
            contentChunk += buf.slice(consumed);
            consumed = buf.length;
          }
          break; // Can't process further without the opening tag
        }
      }
    }

    // Keep unprocessed tail in buffer (partial tags waiting for completion)
    rawBufferRef.current = buf.slice(consumed);

    if (reasoningChunk) {
      setReasoningText((prev) => prev + reasoningChunk);
    }
    if (contentChunk) {
      setDisplayText((prev) => prev + contentChunk);
    }
  }, []);

  /**
   * Flush remaining buffer content when stream ends.
   */
  const flushBuffer = useCallback(() => {
    const remaining = rawBufferRef.current;
    if (!remaining) return;

    if (insideThinkingRef.current) {
      // Unclosed thinking tag — treat as reasoning
      setReasoningText((prev) => prev + remaining);
    } else {
      setDisplayText((prev) => prev + remaining);
    }
    rawBufferRef.current = '';
    insideThinkingRef.current = false;
  }, []);

  const langNames: Record<string, string> = {
    en: 'English',
    ru: 'Русский',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ja: '日本語',
    zh: '中文',
    pt: 'Português',
    it: 'Italiano',
    ko: '한국어',
    tr: 'Türkçe',
    pl: 'Polski',
    uk: 'Українська',
  };

  const sourceLangName = langNames[sourceLang] || sourceLang;
  const targetLangName = langNames[targetLang] || targetLang;

  // Синхронизация с внешним стримингом
  useEffect(() => {
    if (!externalStream) return;
    setDisplayText(externalStream.displayText);
    if (externalStream.reasoningText !== undefined) {
      setReasoningText(externalStream.reasoningText);
    }
    setStatus(externalStream.status);
    setErrorMessage(externalStream.errorMessage || '');
  }, [externalStream?.displayText, externalStream?.reasoningText, externalStream?.status, externalStream?.errorMessage]);

  // Внутренний режим - запускаем свой fetch
  useEffect(() => {
    if (isExternalMode) return; // Внешний режим - не запускаем fetch

    if (activeTranslations.has(translationKey)) {
      return;
    }
    if (completedTranslations.has(translationKey)) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    activeTranslations.set(translationKey, controller);
    isRegisteredRef.current = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiBase = (import.meta as any).env?.VITE_API_URL || window.location.origin;


    // LLM модели с размышлениями (DeepSeek R1 и др.) могут долго генерировать
    // reasoning токены, которые сервер фильтрует. Клиент видит тишину.
    // Таймаут 120с — достаточно для даже самых медленных моделей.
    const timeoutId = setTimeout(() => {
      if (!hasReceivedToken && status === 'translating') {
        setErrorMessage('Перевод не был получен (таймаут). Использован оригинальный текст.');
        setStatus('error');
        controller.abort();
      }
    }, 120000);

    // Через 3с покажем индикатор "размышления" если токены ещё не пришли
    // (только если reasoning включен в настройках)
    const thinkingId = reasoningEnabled ? setTimeout(() => {
      if (!hasReceivedToken) {
        setIsThinking(true);
      }
    }, 3000) : 0;

    fetch(`${apiBase}/api/translate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}`,
      },
      body: JSON.stringify({ text, sourceLang, targetLang }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        if (!reader) throw new Error('No reader');

        const read = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const dataStr = line.slice(6);
              if (dataStr === '[DONE]') continue;
              try {
                const data = JSON.parse(dataStr);
                if (data.done) {
                  // Flush any remaining buffered content
                  flushBuffer();
                  setStatus('done');
                  completedTranslations.add(translationKey);
                  activeTranslations.delete(translationKey);
                  isRegisteredRef.current = false;
                  return;
                }
                // Reasoning токен (мысли модели) — накапливаем отдельно
                // (только если reasoning включен в настройках)
                if (data.reasoningToken && reasoningEnabled) {
                  setHasReceivedToken(true);
                  setIsThinking(false);
                  clearTimeout(timeoutId);
                  clearTimeout(thinkingId);
                  setReasoningText((prev) => prev + data.reasoningToken);
                }
                if (data.token) {
                  setHasReceivedToken(true);
                  setIsThinking(false);
                  clearTimeout(timeoutId);
                  clearTimeout(thinkingId);
                  // Process token through thinking filter
                  processToken(data.token);
                }
              } catch {
                // skip malformed json
              }
            }
          }
        };
        read();
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        clearTimeout(timeoutId);
        clearTimeout(thinkingId);
        setErrorMessage(err.message || 'Ошибка перевода');
        setStatus('error');
      });

    return () => {
      clearTimeout(timeoutId);
      clearTimeout(thinkingId);
      controller.abort();
      if (isRegisteredRef.current) {
        activeTranslations.delete(translationKey);
        isRegisteredRef.current = false;
      }
    };
  }, [text, sourceLang, targetLang, translationKey, isExternalMode, processToken, flushBuffer]);

  // Автоматическое закрытие после завершения перевода
  useEffect(() => {
    if (status === 'done') {
      const timer = setTimeout(() => {
        onCompleteRef.current(displayText);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status, displayText]);

  // Автоматический скролл вниз при появлении нового текста
  useEffect(() => {
    if (translationContainerRef.current && displayText) {
      translationContainerRef.current.scrollTop = translationContainerRef.current.scrollHeight;
    }
  }, [displayText]);

  // Автоматический скролл reasoning контейнера
  useEffect(() => {
    if (reasoningContainerRef.current && reasoningText) {
      reasoningContainerRef.current.scrollTop = reasoningContainerRef.current.scrollHeight;
    }
  }, [reasoningText]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onCancelRef.current();
  };

  // Используем React Portal для рендеринга модалки в document.body
  // Это решает проблему с отображением на мобильных устройствах, где
  // overflow-hidden на родителе может обрезать fixed дочерние элементы
  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
      <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">
            Перевод: {sourceLangName} → {targetLangName}
          </h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-white transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Original text preview */}
        <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
          <p className="text-xs text-gray-500 mb-1">Оригинал:</p>
          <p className="text-sm text-gray-400 line-clamp-3">{text}</p>
        </div>

        {/* Reasoning section (мысли модели) — показывается если есть reasoning токены И включено в настройках */}
        {reasoningEnabled && reasoningText && (
          <div className="mb-4 p-3 bg-amber-900/20 rounded-lg border border-amber-800/50">
            <button
              onClick={() => setIsReasoningCollapsed(!isReasoningCollapsed)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-amber-400 text-sm">💭</span>
              <p className="text-xs text-amber-400 font-medium flex-1">Размышления модели</p>
              <span className="text-xs text-amber-500">{isReasoningCollapsed ? '▶' : '▼'}</span>
            </button>
            {!isReasoningCollapsed && (
              <div ref={reasoningContainerRef} className="mt-2 max-h-[150px] overflow-y-auto">
                <p className="text-xs text-amber-200/70 whitespace-pre-wrap italic font-mono">
                  {reasoningText}
                  {status === 'translating' && (
                    <span className="inline-block ml-1 text-amber-400 animate-pulse">▊</span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Translation output */}
        <div ref={translationContainerRef} className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-blue-800/50 min-h-[100px] max-h-[300px] overflow-y-auto">
          <p className="text-xs text-blue-400 mb-1">Перевод:</p>
          {status === 'translating' && (
            <div>
              <p className="text-sm text-white whitespace-pre-wrap">{displayText}</p>
              <span className="inline-block ml-1 text-blue-400 animate-pulse">▊</span>
            </div>
          )}
          {status === 'done' && (
            <p className="text-sm text-white whitespace-pre-wrap">{displayText}</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-400">{errorMessage}</p>
          )}
          {status === 'translating' && !displayText && !isThinking && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
              </div>
              <span className="text-xs">Перевод...</span>
            </div>
          )}
          {status === 'translating' && !displayText && isThinking && reasoningEnabled && (
            <div className="flex items-center gap-2 text-amber-400">
              <div className="flex gap-1">
                <span className="animate-pulse" style={{ animationDelay: '0ms' }}>💭</span>
                <span className="animate-pulse" style={{ animationDelay: '200ms' }}>💭</span>
                <span className="animate-pulse" style={{ animationDelay: '400ms' }}>💭</span>
              </div>
              <span className="text-xs">Модель размышляет (reasoning)...</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {status === 'error' && (
            <button
              onClick={() => { onCancelRef.current(); }}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-white transition"
            >
              Попробовать снова
            </button>
          )}
          <button
            onClick={handleCancel}
            className="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-gray-300 transition"
          >
            {status === 'error' ? 'Отмена' : 'Отмена'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LLMTranslationModal;