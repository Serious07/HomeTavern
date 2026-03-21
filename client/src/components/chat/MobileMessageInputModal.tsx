import React, { useState, useEffect } from 'react';

interface MobileMessageInputModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  placeholder?: string;
}

/**
 * Модальное окно для ввода сообщений на мобильных устройствах
 * Предотвращает проблемы с уменьшением/увеличением текстового поля
 * и позволяет листать строки при достижении предела
 */
export const MobileMessageInputModal: React.FC<MobileMessageInputModalProps> = ({
  isOpen,
  value,
  onChange,
  onSend,
  onClose,
  placeholder = 'Введите сообщение...',
}) => {
  const [localValue, setLocalValue] = useState(value);
  
  // Синхронизация с внешним значением при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      setLocalValue(value);
    }
  }, [isOpen, value]);

  // Синхронизация локального значения с внешним при изменении
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  const handleSend = () => {
    if (localValue.trim()) {
      onSend();
      onClose();
    }
  };
  
  const handleClose = () => {
    // Сохраняем текущее значение перед закрытием
    onChange(localValue);
    onClose();
  };

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}>
      {/* Overlay */}
      <div 
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl p-4 transition-transform duration-300 ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="flex flex-col gap-4">
          {/* Handle bar для drag */}
          <div className="flex justify-center">
            <div className="w-12 h-1.5 bg-gray-600 rounded-full" />
          </div>
          
          {/* Textarea с прокруткой */}
          <textarea
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none overflow-y-auto"
            style={{
              minHeight: '150px',
              maxHeight: '50vh',
            }}
            // Отключаем автоматическое исправление на мобильных
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Отмена
            </button>
            <button
              onClick={handleSend}
              disabled={!localValue.trim()}
              className="flex-1 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileMessageInputModal;
