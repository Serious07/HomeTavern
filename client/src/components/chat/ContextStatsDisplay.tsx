/**
 * ContextStatsDisplay - Компонент отображения статистики использования токенов
 * 
 * Отображает:
 * - Прогресс-бар заполнения контекста
 * - Текст с количеством использованных/доступных токенов и процентом
 * 
 * Компонент интегрируется в верхнюю панель (header) и скрывается вместе с ней
 * на мобильных устройствах при нажатии на кнопку с глазом.
 */

import React from 'react';
import { ContextStats } from '../../services/api';

interface ContextStatsDisplayProps {
  stats: ContextStats | null;
  isLoading?: boolean;
  className?: string;
}

/**
 * Форматирование числа с разделителями тысяч
 */
function formatNumber(num: number): string {
  return num.toLocaleString('ru-RU');
}

/**
 * Определение цвета прогресс-бара на основе процента
 */
function getProgressColor(percentage: number): string {
  if (percentage < 50) {
    return 'bg-green-500';
  } else if (percentage < 75) {
    return 'bg-yellow-500';
  } else if (percentage < 90) {
    return 'bg-orange-500';
  } else {
    return 'bg-red-500';
  }
}

export const ContextStatsDisplay: React.FC<ContextStatsDisplayProps> = ({
  stats,
  isLoading = false,
  className = '',
}) => {
  // Если нет данных или загружаем - показываем заглушку
  if (isLoading) {
    return (
      <div className={`context-stats-loading ${className}`}>
        <div className="w-full h-4 bg-gray-700 rounded overflow-hidden">
          <div className="h-full bg-gray-600 animate-pulse" style={{ width: '30%' }} />
        </div>
        <p className="text-gray-500 text-xs mt-1">Загрузка...</p>
      </div>
    );
  }

  if (!stats || stats.tokensUsed === 0) {
    return null;
  }

  const { tokensUsed: used, contextLimit: total, percentage } = stats;
  const progressColor = getProgressColor(percentage);
  const displayPercentage = Math.min(percentage, 100).toFixed(2);

  return (
    <div className={`context-stats-display w-full ${className}`}>
      {/* Прогресс-бар */}
      <div className="w-full h-3 bg-gray-700/50 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full ${progressColor} transition-all duration-500 ease-out`}
          style={{ width: `${displayPercentage}%` }}
          title={`Использовано: ${formatNumber(used)} из ${formatNumber(total)} токенов`}
        />
      </div>
      
      {/* Текст со статистикой */}
      <p className="text-gray-400 text-xs text-center">
        {formatNumber(used)} t / {formatNumber(total)} t ({displayPercentage}%)
      </p>
    </div>
  );
};

export default ContextStatsDisplay;
