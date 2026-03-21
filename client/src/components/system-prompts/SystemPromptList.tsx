import React from 'react';
import { SystemPrompt } from '../../types';

interface SystemPromptListProps {
  prompts: SystemPrompt[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  isLoading?: boolean;
  onCreateNew?: () => void;
}

const SystemPromptList: React.FC<SystemPromptListProps> = ({
  prompts,
  selectedId,
  onSelect,
  isLoading = false,
  onCreateNew,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
      </div>
    );
  }

  if (!Array.isArray(prompts) || prompts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Нет доступных системных промптов</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {onCreateNew && (
        <div className="mb-4">
          <button
            onClick={onCreateNew}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium text-white transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Создать Новый
          </button>
        </div>
      )}
      <ul className="space-y-2">
        {prompts.map((prompt) => (
          <li
            key={prompt.id}
            onClick={() => onSelect(prompt.id)}
            className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${
              selectedId === prompt.id
                ? 'bg-gray-700 border-blue-500'
                : 'bg-gray-800 border-transparent hover:bg-gray-750 hover:border-gray-600'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-white truncate">{prompt.name}</h3>
                {prompt.description && (
                  <p className="text-sm text-gray-400 mt-1 truncate">
                    {prompt.description}
                  </p>
                )}
              </div>
              {prompt.is_active && (
                <span className="ml-2 px-2 py-1 text-xs font-medium bg-green-600 text-white rounded">
                  Активный
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Обновлено: {new Date(prompt.updated_at).toLocaleString('ru-RU')}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SystemPromptList;
