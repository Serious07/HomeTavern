import React, { useEffect, useCallback } from 'react';
import { MAX_QUICK_REPLIES } from '../../constants/quickReplies';

interface QuickReplyModalProps {
  isOpen: boolean;
  replies: string[];
  onSelect: (reply: string) => void;
  onClose: () => void;
}

/**
 * Модальное окно «Быстрый ответ».
 * Открывается при нажатии «Отправить» с пустым полем ввода:
 * показывает варианты сообщений (не больше MAX_QUICK_REPLIES),
 * фон при этом затемняется и размывается.
 */
const QuickReplyModal: React.FC<QuickReplyModalProps> = ({
  isOpen,
  replies,
  onSelect,
  onClose,
}) => {
  const visibleReplies = replies.slice(0, MAX_QUICK_REPLIES);

  // Закрытие по Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Быстрый ответ"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isOpen ? '' : 'pointer-events-none'}`}
    >
      {/* Затемнение и блюр фона */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Карточка модального окна */}
      <div
        className={`relative w-full max-w-sm bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl flex flex-col max-h-[80vh] transition-all duration-300 ${
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3 className="text-xl font-bold text-white">Быстрый ответ</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition shrink-0"
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Выберите сообщение для отправки или закройте окно.
        </p>

        <div className="flex flex-col gap-2 overflow-y-auto">
          {visibleReplies.map((reply, index) => (
            <button
              key={`${index}-${reply}`}
              onClick={() => onSelect(reply)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-lg transition text-left"
            >
              <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <span className="break-words">{reply}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full px-4 py-3 bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-lg font-medium transition shrink-0"
        >
          Отмена
        </button>
      </div>
    </div>
  );
};

export default QuickReplyModal;
