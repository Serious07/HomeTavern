import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MarkdownRenderer } from '../common/MarkdownRenderer';

interface MessageEditModalProps {
  messageId: number;
  content: string;
  onSave: (messageId: number, content: string) => void | Promise<void>;
  onCancel: () => void;
}

export const MessageEditModal: React.FC<MessageEditModalProps> = ({
  messageId,
  content,
  onSave,
  onCancel,
}) => {
  const [editContent, setEditContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on mount
  useEffect(() => {
    setEditContent(content);
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [content, messageId]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, isSaving]);

  // Prevent touch events from textarea/preview bubbling to the outer overlay
  // This stops scroll gestures in the content area from accidentally closing the modal
  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  const handleContentTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSaving) {
      onCancel();
    }
  }, [onCancel, isSaving]);

  const handleSave = async () => {
    if (isSaving || !editContent.trim()) return;
    setIsSaving(true);
    try {
      await onSave(messageId, editContent);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = useCallback(() => {
    if (!isSaving) {
      onCancel();
    }
  }, [onCancel, isSaving]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
      onClick={handleOverlayClick}
    >
      {/* ============ DESKTOP: Full-viewport modal (≥768px) ============ */}
      <div className="hidden md:flex fixed inset-0 m-[1.5vh_2.5vw_0_2.5vw] bg-gray-800 rounded-xl shadow-2xl flex-col w-[95vw] h-[calc(98.5vh-3vh)] overflow-hidden">
        {/* Top bar with close button only */}
        <div className="flex items-center justify-end px-4 py-2 flex-shrink-0 border-b border-gray-700">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content: preview + textarea */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {/* Preview — compact, no labels */}
          <div className="mb-3">
            <div className="bg-gray-900/50 rounded-lg p-3 max-h-[45vh] overflow-y-auto">
              <div className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">
                <MarkdownRenderer>{editContent}</MarkdownRenderer>
              </div>
            </div>
          </div>

          {/* Divider — thin */}
          <div className="border-t border-gray-700 mb-3" />

          {/* Textarea — full width to edges, with padding inside */}
          <div className="w-full bg-gray-700 border border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-cyan-500 overflow-hidden">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Введите текст сообщения..."
              className="w-full h-full bg-transparent text-white focus:outline-none resize-y text-sm leading-relaxed px-3 py-2.5"
              style={{ minHeight: '180px', maxHeight: '45vh' }}
              onTouchStart={handleContentTouchStart}
              onTouchEnd={handleContentTouchEnd}
            />
          </div>
        </div>

        {/* Buttons — fixed at bottom */}
        <div className="border-t border-gray-700 px-4 py-3 flex-shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white rounded-lg font-medium transition duration-150 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !editContent.trim()}
              className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition duration-150 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Сохранение...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Подтвердить
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ============ MOBILE: Full-screen (<768px) ============ */}
      <div className="flex md:hidden fixed inset-0 z-[200] flex-col bg-gray-800 safe-area-inset-bottom">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0 border-b border-gray-700">
          <h2 className="text-base font-semibold text-white pr-2">Редактирование сообщения</h2>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSaving}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition flex-shrink-0"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content: preview + textarea */}
        <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
          {/* Preview (scrollable) */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-xs text-gray-400 font-medium">Предпросмотр</span>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-3 max-h-[30vh] overflow-y-auto">
              <div className="whitespace-pre-wrap text-sm text-gray-300">
                <MarkdownRenderer>{editContent}</MarkdownRenderer>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700 mb-4" />

          {/* Textarea - fills remaining space with flex */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="text-xs text-gray-400 font-medium">Редактирование</span>
            </div>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Введите текст сообщения..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y text-sm leading-relaxed"
              style={{ minHeight: '180px' }}
              onTouchStart={handleContentTouchStart}
              onTouchEnd={handleContentTouchEnd}
            />
          </div>
        </div>

        {/* Buttons - fixed at bottom with safe area padding */}
        <div className="border-t border-gray-700 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 flex-shrink-0">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSaving}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-800 text-white rounded-lg font-medium transition duration-150 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !editContent.trim()}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition duration-150 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {isSaving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Сохранение...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Подтвердить
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};