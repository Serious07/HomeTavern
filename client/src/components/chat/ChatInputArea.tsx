import React, { useState, useCallback, useRef, useEffect, useTransition, memo } from 'react';

interface ChatInputAreaProps {
  initialValue?: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
  showMobileModal?: boolean;
  onOpenMobileModal?: () => void;
  autoFocus?: boolean;
}

/**
 * Изолированный компонент поля ввода с useTransition для полной
 * производительности ввода текста. Все обновления кроме самого input
 * откладываются через startTransition.
 */
const ChatInputAreaInternal: React.FC<ChatInputAreaProps> = ({
  initialValue = '',
  onChange,
  onSend,
  disabled,
  placeholder = 'Введите сообщение...',
  showMobileModal,
  onOpenMobileModal,
  autoFocus = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const [, startTransition] = useTransition();
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const pendingValueRef = useRef<string>(value);

  // Debounced auto-resize textarea с использованием requestAnimationFrame
  const autoResize = useCallback((textarea: HTMLTextAreaElement) => {
    if (resizeTimeoutRef.current) {
      cancelAnimationFrame(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.style.height = 'auto';
      const maxHeight = 400;
      const newHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(newHeight, maxHeight)}px`;
    });
  }, []);

  // Sync external value changes (e.g., when input is cleared after send)
  useEffect(() => {
    if (value !== initialValue) {
      setValue(initialValue);
      pendingValueRef.current = initialValue;
    }
  }, [initialValue]);

  // Focus input when autoFocus changes or initialValue changes (e.g., after send)
  useEffect(() => {
    if (autoFocus && messageInputRef.current && !disabled) {
      messageInputRef.current.focus();
    }
  }, [autoFocus, disabled]);

  // Ref to track if we just cleared the input to prevent focus steal
  const justClearedRef = useRef(false);
  useEffect(() => {
    if (initialValue === '' && value === '' && messageInputRef.current && !disabled) {
      justClearedRef.current = true;
    }
  }, [initialValue, value, disabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        cancelAnimationFrame(resizeTimeoutRef.current);
      }
    };
  }, []);

  // Initial resize
  useEffect(() => {
    const textarea = messageInputRef.current;
    if (textarea) {
      autoResize(textarea);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    pendingValueRef.current = newValue;
    
    // Обновляем локальное состояние синхронно для мгновенного отображения
    setValue(newValue);
    
    // Передаваемое наружу обновление — через transition (не блокирует input)
    startTransition(() => {
      onChange(newValue);
    });
    
    // Auto-resize в requestAnimationFrame (не блокирует рендеринг)
    autoResize(e.target);
  }, [onChange, autoResize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Focus after send (handled by parent via autoFocus prop)
      onSend();
    }
  }, [onSend]);

  return (
    <div className="flex items-end gap-3 w-full">
      <textarea
        ref={messageInputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-gray-700/30 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none overflow-hidden"
        style={{
          minHeight: '40px',
          maxHeight: '400px',
          lineHeight: '20px',
        }}
        disabled={disabled}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="p-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition shrink-0 flex items-center justify-center"
        aria-label="Отправить сообщение"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
      {showMobileModal && onOpenMobileModal && (
        <button
          onClick={onOpenMobileModal}
          className="md:hidden p-3 bg-gray-600 hover:bg-gray-500 rounded-lg transition shrink-0 flex items-center justify-center"
          title="Открыть в полном окне"
          aria-label="Открыть расширенное вводное окно"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
const ChatInputArea = memo(ChatInputAreaInternal);
ChatInputArea.displayName = 'ChatInputArea';

export default ChatInputArea;