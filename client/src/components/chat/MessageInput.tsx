import React, { memo, useRef, useCallback, useEffect } from 'react';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}

/**
 * Мемоизированный компонент ввода сообщения
 * Оптимизирован для мобильных устройств с debounce и предотвращением лишних ре-рендеров
 */
const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'Введите сообщение...',
}) => {
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number>(0);

  // Debounced авто-ресайз textarea
  const autoResize = useCallback((textarea: HTMLTextAreaElement, _newValue: string) => {
    // Очищаем предыдущий таймаут
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    // Откладываем ресайз на 16ms (1 кадр при 60fps)
    resizeTimeoutRef.current = setTimeout(() => {
      if (!textarea) return;

      // Сбросить высоту чтобы пересчитать
      textarea.style.height = 'auto';

      // Вычисляем новую высоту на основе scrollHeight
      const maxHeight = 200;
      const newHeight = textarea.scrollHeight;

      // Избегаем лишних манипуляций DOM если высота не изменилась
      if (newHeight !== lastHeightRef.current) {
        lastHeightRef.current = newHeight;
        textarea.style.height = `${Math.min(newHeight, maxHeight)}px`;
      }
    }, 16);
  }, []);

  // Очистка таймаута при размонтировании
  useEffect(() => {
    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []);

  // Обработчик изменения значения
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      autoResize(e.target, newValue);
    },
    [onChange, autoResize]
  );

  // Обработчик нажатия клавиши
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

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
          maxHeight: '200px',
          lineHeight: '20px',
        }}
        disabled={disabled}
        // Отключаем автоматическое исправление на мобильных
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
    </div>
  );
};

export default memo(MessageInput);
