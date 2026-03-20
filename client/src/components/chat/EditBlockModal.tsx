import React, { useState, useEffect } from 'react';
import { ChatBlockWithParsedIds } from '../../types/compression';

interface EditBlockModalProps {
  block: ChatBlockWithParsedIds;
  onSave: (blockId: number, updates: { title: string; summary: string }) => void | Promise<void>;
  onCancel: () => void;
}

export const EditBlockModal: React.FC<EditBlockModalProps> = ({
  block,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(block.title);
  const [summary, setSummary] = useState(block.summary);
  const [error, setError] = useState<string | null>(null);

  // Обновляем состояние при изменении блока
  useEffect(() => {
    setTitle(block.title);
    setSummary(block.summary);
    setError(null);
  }, [block]);

  const handleSave = async () => {
    // Валидация
    if (!title.trim()) {
      setError('Заголовок обязателен');
      return;
    }
    if (title.length > 100) {
      setError('Заголовок не может быть длиннее 100 символов');
      return;
    }
    if (!summary.trim()) {
      setError('Краткий пересказ обязателен');
      return;
    }
    if (summary.length > 2000) {
      setError('Краткий пересказ не может быть длиннее 2000 символов');
      return;
    }

    await onSave(block.id, { title: title.trim(), summary: summary.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Заголовок модального окна */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-cyan-400">✏️ Редактирование блока</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-300 transition"
          >
            ✕
          </button>
        </div>

        {/* Содержимое */}
        <div className="p-4 space-y-4">
          {/* Поле заголовка */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Заголовок:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder="Глава 1: Знакомство с персонажем"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              maxLength={100}
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {title.length}/100
            </div>
          </div>

          {/* Поле краткого пересказа */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Краткий пересказ:
            </label>
            <textarea
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setError(null);
              }}
              placeholder="Пользователь встретился с персонажем в таверне и начал диалог..."
              rows={8}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              maxLength={2000}
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {summary.length}/2000
            </div>
          </div>

          {/* Ошибки */}
          {error && (
            <div className="p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded transition"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};
