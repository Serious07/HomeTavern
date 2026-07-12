/**
 * Компонент оверлея прогресса сжатия
 * Показывает полосу прогресса и информацию о текущем процессе сжатия
 * Поддерживает оба режима: фиксированный (по N сообщений) и смысловой (по главам)
 */

import React from 'react';

interface LLMTokenState {
  phase: 'chapter_split' | 'block_summary' | 'translation' | '';
  lines: string[];
  hasReasoning?: boolean;
}

interface CompressionProgressOverlayProps {
  isOpen: boolean;
  progress: {
    currentBlock: number;
    totalBlocks: number;
    status: string;
    title?: string;
    startPosition?: number;
    endPosition?: number;
  };
  llmTokenState?: LLMTokenState;
}

const CompressionProgressOverlay: React.FC<CompressionProgressOverlayProps> = ({
  isOpen,
  progress,
  llmTokenState,
}) => {
  if (!isOpen) return null;

  const percentage = progress.totalBlocks > 0
    ? Math.round((progress.currentBlock / progress.totalBlocks) * 100)
    : 0;

  // Определяем тип процесса по статусу и наличию позиций
  const isAnalyzing = progress.status.includes('Формируется список глав') || 
                      progress.status.includes('Анализ') ||
                      progress.status.includes('Анализ истории');
  
  const hasPositionRange = progress.startPosition != null && progress.endPosition != null;
  const isSemantic = hasPositionRange || 
                     progress.status.includes('глав') || 
                     progress.status.includes('Блок') ||
                     progress.status.includes('Сообщения');
  
  const isComplete = progress.status.includes('завершено') || 
                     progress.status.includes('Завершено');

  // Определяем классы на основе статуса (статические для Tailwind)
  // Tailwind требует чтобы все классы были явно написаны в коде
  const spinRingClass = isAnalyzing
    ? 'border-t-amber-400 border-r-amber-400'
    : isComplete
    ? 'border-t-green-400 border-r-green-400'
    : 'border-t-cyan-400 border-r-cyan-400';
  
  const statusTextClass = isAnalyzing
    ? 'text-amber-400'
    : isComplete
    ? 'text-green-400'
    : 'text-cyan-400';
  
  const barGradientClass = isAnalyzing
    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
    : isComplete
    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
    : 'bg-gradient-to-r from-cyan-500 to-blue-500';
  
  const percentTextClass = isAnalyzing
    ? 'text-amber-400'
    : isComplete
    ? 'text-green-400'
    : 'text-cyan-400';
  
  // Определяем тип процесса для UI
  const showAnalysisUI = isAnalyzing;
  const showCompleteUI = isComplete;
  const showSemanticUI = isSemantic;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Центрированная карточка прогресса */}
      <div className="w-full max-w-md mx-4 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl p-8">
        {/* Анимированная иконка */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            {/* Вращающееся кольцо */}
            <div className="w-20 h-20 rounded-full border-4 border-gray-600"></div>
            <div className={`absolute inset-0 rounded-full border-4 border-transparent ${spinRingClass} animate-spin`}></div>
            {/* Иконка в зависимости от статуса */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isAnalyzing ? (
                // Иконка анализа (лупа)
                <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              ) : isComplete ? (
                // Иконка завершения (галочка)
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                // Иконка сжатия
                <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Заголовок */}
        <h3 className="text-xl font-bold text-white text-center mb-2">
          {showCompleteUI ? 'Сжатие завершено!' : showAnalysisUI ? 'Анализ истории...' : 'Сжатие истории...'}
        </h3>

        {/* Статус */}
        <p className={`text-center text-sm mb-6 font-medium ${statusTextClass}`}>
          {progress.status}
        </p>

        {/* Полоса прогресса */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-400">
              {showSemanticUI ? (
                <>
                  Блок {progress.currentBlock} / {progress.totalBlocks}
                  {hasPositionRange && (
                    <span className="ml-2 text-cyan-300 font-semibold">[{progress.startPosition}-{progress.endPosition}]</span>
                  )}
                </>
              ) : showAnalysisUI ? (
                'Анализ...'
              ) : (
                <>
                  Обработано блоков: <span className="text-cyan-400 font-semibold">{progress.currentBlock}</span> / <span className="text-gray-300">{progress.totalBlocks}</span>
                </>
              )}
            </span>
            {!showAnalysisUI && progress.totalBlocks > 0 && (
              <span className={`font-bold ${percentTextClass}`}>{percentage}%</span>
            )}
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${barGradientClass}`}
              style={{ width: `${showAnalysisUI ? 30 : percentage}%` }}
            >
              {/* Анимированный блик на полосе */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Название текущей главы/блока (если есть) */}
        {progress.title && (
          <div className="mt-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <p className="text-xs text-gray-400 mb-1">
              {showSemanticUI ? 'Текущая глава:' : 'Текущий блок:'}
            </p>
            <p className="text-sm text-white font-medium truncate">{progress.title}</p>
            {hasPositionRange && (
              <p className="text-xs text-cyan-400 mt-1">
                Сообщения: {progress.startPosition} — {progress.endPosition}
              </p>
            )}
          </div>
        )}

        {/* LLM токены в реальном времени */}
        {llmTokenState && llmTokenState.lines.length > 0 && !showCompleteUI && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              {/* Иконка фазы */}
              {llmTokenState.phase === 'chapter_split' && (
                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {llmTokenState.phase === 'block_summary' && (
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              )}
              {llmTokenState.phase === 'translation' && (
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
              )}
              <span className="text-xs text-gray-400">
                {llmTokenState.phase === 'chapter_split' && 'Разбиение на главы'}
                {llmTokenState.phase === 'block_summary' && 'Формирование блока'}
                {llmTokenState.phase === 'translation' && 'Перевод'}
                {!llmTokenState.phase && 'Генерация...'}
              </span>
              {/* Индикатор reasoning */}
              {llmTokenState.hasReasoning && (
                <span className="ml-auto text-xs text-purple-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Reasoning
                </span>
              )}
            </div>
            {/* Последние 3 строки токенов */}
            <div className="p-3 bg-gray-900/70 rounded-lg border border-gray-600 font-mono text-xs max-h-24 overflow-y-auto">
              {llmTokenState.lines.map((line, index) => {
                // Проверяем является ли строка reasoning (начинается с 🧠)
                const isReasoningLine = line.startsWith('🧠');
                return (
                  <div
                    key={index}
                    className={isReasoningLine ? 'text-purple-300 truncate' : 'text-gray-300 truncate'}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Предупреждение */}
        <p className="text-xs text-gray-500 text-center mt-6">
          {showCompleteUI ? 'Готово!' : 'Пожалуйста, не закрывайте страницу'}
        </p>
      </div>
    </div>
  );
};

export default CompressionProgressOverlay;
