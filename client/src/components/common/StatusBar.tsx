import React from 'react';
import { StatusBarData } from '../../utils/statusBar';

/**
 * Компонент для отображения статус-бара
 * Отображает 4 элемента с эмодзи в красивом тёмном блоке
 */
export const StatusBar: React.FC<StatusBarData> = ({ 
  calendar, 
  weather, 
  location, 
  npcs 
}) => {
  return (
    <div className="w-full bg-gray-800/80 rounded-lg px-4 py-3 mb-4 border border-gray-700">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        {/* Calendar */}
        <span className="flex items-center gap-1.5">
          <span className="text-lg">📅</span>
          <span className="text-gray-200">{calendar}</span>
        </span>
        <span className="text-gray-600">|</span>
        {/* Weather */}
        <span className="flex items-center gap-1.5">
          <span className="text-lg">🌤️</span>
          <span className="text-gray-200">{weather}</span>
        </span>
        <span className="text-gray-600">|</span>
        {/* Location */}
        <span className="flex items-center gap-1.5">
          <span className="text-lg">📍</span>
          <span className="text-gray-200">{location}</span>
        </span>
        <span className="text-gray-600">|</span>
        {/* NPCs */}
        <span className="flex items-center gap-1.5">
          <span className="text-lg">👥</span>
          <span className="text-gray-200">{npcs}</span>
        </span>
      </div>
    </div>
  );
};
