import React, { useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../constants/storage';

interface LLMTranslationModalProps {
  text: string;
  sourceLang: string;
  targetLang: string;
  onComplete: (translatedText: string) => void;
  onCancel: () => void;
}

const LLMTranslationModal: React.FC<LLMTranslationModalProps> = ({
  text,
  sourceLang,
  targetLang,
  onComplete,
  onCancel,
}) => {
  const [displayText, setDisplayText] = useState<string>('');
  const [status, setStatus] = useState<'translating' | 'error' | 'done'>('translating');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const apiBase = (import.meta as any).env?.VITE_API_URL || window.location.origin;

    fetch(`${apiBase}/api/translate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem(STORAGE_KEYS.TOKEN)}`,
      },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
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
                  setDisplayText(data.fullText || '');
                  setStatus('done');
                  onComplete(data.fullText || '');
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
    };
  }, [text, sourceLang, targetLang, onComplete]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
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
        <div className="mb-4 p-3 bg-gray-900/50 rounded-lg border border-blue-800/50 min-h-[100px] max-h-[300px] overflow-y-auto">
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
              onClick={() => {
                // Close and let parent handle retry
                onCancel();
              }}
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
    </div>
  );
};

export default LLMTranslationModal;