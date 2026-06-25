import React, { useEffect, useRef, useState } from 'react';
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
    status: 'translating' | 'done' | 'error';
    errorMessage?: string;
  };
}

const LLMTranslationModal: React.FC<LLMTranslationModalProps> = ({
  text,
  sourceLang,
  targetLang,
  onComplete,
  onCancel,
  externalStream,
}) => {
  const [displayText, setDisplayText] = useState<string>('');
  const [status, setStatus] = useState<'translating' | 'error' | 'done'>('translating');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const onCompleteRef = useRef(onComplete);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  onCompleteRef.current = onComplete;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const translationKey = `${text}|${sourceLang}|${targetLang}`;
  const isRegisteredRef = useRef(false);
  // Для отслеживания внешнего режима
  const isExternalMode = !!externalStream;

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
    if (externalStream) {
      setDisplayText(externalStream.displayText);
      setStatus(externalStream.status);
      if (externalStream.errorMessage) {
        setErrorMessage(externalStream.errorMessage);
      }
    }
  }, [externalStream]);

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
                  const finalText = data.fullText || '';
                  setDisplayText(finalText);
                  setStatus('done');
                  completedTranslations.add(translationKey);
                  activeTranslations.delete(translationKey);
                  isRegisteredRef.current = false;
                  return;
                }
                if (data.token) {
                  setDisplayText((prev) => prev + data.token);
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
        setErrorMessage(err.message || 'Ошибка перевода');
        setStatus('error');
      });

    return () => {
      controller.abort();
      if (isRegisteredRef.current) {
        activeTranslations.delete(translationKey);
        isRegisteredRef.current = false;
      }
    };
  }, [text, sourceLang, targetLang, translationKey, isExternalMode]);

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
          {status === 'translating' && !displayText && (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
              </div>
              <span className="text-xs">Перевод...</span>
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