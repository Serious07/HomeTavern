import React, { useMemo } from 'react';
import { StatusBarData } from '../../utils/statusBar';
import { processLatexSymbols } from '../../utils/latex';

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
  const processed = useMemo(
    () => ({
      calendar: processLatexSymbols(calendar),
      weather: processLatexSymbols(weather),
      location: processLatexSymbols(location),
      npcs: processLatexSymbols(npcs),
    }),
    [calendar, weather, location, npcs],
  );

  return (
    <div className="w-full bg-gray-800/80 rounded-lg px-4 py-3 mb-4 border border-gray-700">
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="text-lg">📅</span>
          <span className="text-gray-200">{processed.calendar}</span>
        </span>
        <span className="text-gray-600">|</span>
        <span className="flex items-center gap-1.5">
          <span className="text-lg">🌤️</span>
          <span className="text-gray-200">{processed.weather}</span>
        </span>
        <span className="text-gray-600">|</span>
        <span className="flex items-center gap-1.5">
          <span className="text-lg">📍</span>
          <span className="text-gray-200">{processed.location}</span>
        </span>
        <span className="text-gray-600">|</span>
        <span className="flex items-center gap-1.5">
          <span className="text-lg">👥</span>
          <span className="text-gray-200">{processed.npcs}</span>
        </span>
      </div>
    </div>
  );
};
