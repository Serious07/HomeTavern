/**
 * Компонент оверлея прогресса сжатия
 * Показывает полосу прогресса и информацию о текущем процессе сжатия
 */

import React from 'react';

interface CompressionProgressOverlayProps {
  isOpen: boolean;
  progress: {
    currentBlock: number;
    totalBlocks: number;
    status: string;
    title?: string;
  };
}

const CompressionProgressOverlay: React.FC<CompressionProgressOverlayProps> = ({
  isOpen,
  progress,
}) => {
  if (!isOpen) return null;

  const percentage = progress.totalBlocks > 0
    ? Math.round((progress.currentBlock / progress.totalBlocks) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Центрированная карточка прогресса */}
      <div className="w-full max-w-md mx-4 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8">
        {/* Анимированная иконка */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            {/* Вращающееся кольцо */}
            <div className="w-20 h-20 rounded-full border-4 border-gray-600"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-400 border-r-cyan-400 animate-spin"></div>
            {/* Иконка сжатия в центре */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>

        {/* Заголовок */}
        <h3 className="text-xl font-bold text-white text-center mb-2">
          Сжатие истории...
        </h3>

        {/* Статус */}
        <p className="text-gray-400 text-center text-sm mb-6">
          {progress.status}
        </p>

        {/* Полоса прогресса */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-400">
              Обработано блоков: <span className="text-cyan-400 font-semibold">{progress.currentBlock}</span> / <span className="text-gray-300">{progress.totalBlocks}</span>
            </span>
            <span className="text-cyan-400 font-bold">{percentage}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentage}%` }}
            >
              {/* Анимированный блик на полосе */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Название текущей главы (если есть) */}
        {progress.title && (
          <div className="mt-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <p className="text-xs text-gray-400 mb-1">Текущая глава:</p>
            <p className="text-sm text-white font-medium truncate">{progress.title}</p>
          </div>
        )}

        {/* Предупреждение */}
        <p className="text-xs text-gray-500 text-center mt-6">
          Пожалуйста, не закрывайте страницу
        </p>
      </div>
    </div>
  );
};

export default CompressionProgressOverlay;