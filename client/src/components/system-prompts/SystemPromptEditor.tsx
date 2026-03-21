import React, { useState, useEffect } from 'react';
import { SystemPrompt } from '../../types';

interface SystemPromptEditorProps {
  prompt: SystemPrompt | null;
  onSave: (id: number, data: Partial<SystemPrompt>) => void;
  onDelete: (id: number) => void;
  onActivate: (id: number) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({
  prompt,
  onSave,
  onDelete,
  onActivate,
  onCancel,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt_text: '',
  });

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (prompt) {
      setFormData({
        name: prompt.name || '',
        description: prompt.description || '',
        prompt_text: prompt.prompt_text || '',
      });
      setIsDirty(false);
    }
  }, [prompt]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (prompt && isDirty) {
      onSave(prompt.id, {
        name: formData.name,
        description: formData.description,
        prompt_text: formData.prompt_text,
      });
      setIsDirty(false);
    }
  };

  const handleDelete = () => {
    if (prompt && window.confirm(`Вы уверены, что хотите удалить промпт "${prompt.name}"?`)) {
      onDelete(prompt.id);
    }
  };

  const handleActivate = () => {
    if (prompt) {
      onActivate(prompt.id);
    }
  };

  if (!prompt) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Выберите промпт для редактирования</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Редактор промпта</h2>
        <button
          onClick={onCancel}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
          title="Закрыть редактор"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-4">
        {/* Name field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            Название *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-white placeholder-gray-500"
            placeholder="Название промпта"
            disabled={isLoading}
          />
        </div>

        {/* Description field */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
            Описание
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none text-white placeholder-gray-500"
            placeholder="Краткое описание назначения промпта..."
            disabled={isLoading}
          />
        </div>

        {/* Prompt text field */}
        <div>
          <label htmlFor="prompt_text" className="block text-sm font-medium text-gray-300 mb-2">
            Текст промпта *
          </label>
          <textarea
            id="prompt_text"
            name="prompt_text"
            value={formData.prompt_text}
            onChange={handleInputChange}
            rows={15}
            className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-white placeholder-gray-500 font-mono text-sm"
            placeholder="Введите системный промпт..."
            disabled={isLoading}
          />
          <p className="mt-1 text-xs text-gray-500">
            Этот текст будет использован как системный промпт для ИИ
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="pt-4 mt-4 border-t border-gray-700 flex gap-3">
        <button
          onClick={handleDelete}
          className="flex-1 py-3 px-4 bg-red-700 hover:bg-red-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
          disabled={isLoading}
        >
          Удалить
        </button>
        <button
          onClick={handleActivate}
          className="flex-1 py-3 px-4 bg-green-700 hover:bg-green-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
          disabled={isLoading || prompt.is_active}
        >
          {prompt.is_active ? 'Активен' : 'Выбрать'}
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading || !isDirty}
          className="flex-1 py-3 px-4 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg font-semibold text-white transition"
        >
          {isLoading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};

export default SystemPromptEditor;
