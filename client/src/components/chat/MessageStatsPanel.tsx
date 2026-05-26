import React from 'react';
import { Message } from '../../types';

interface MessageStatsPanelProps {
  message: Message;
  messageIndex: number;
}

/**
 * Компонент панели статистики сообщения
 * Отображает метрики генерации для assistant сообщений
 */
export const MessageStatsPanel: React.FC<MessageStatsPanelProps> = ({
  message,
  messageIndex,
}) => {
  // Проверяем, что сообщение имеет метрики (только assistant сообщения сгенерированные ИИ)
  const hasStats = message.tokens_per_sec !== undefined && message.tokens_per_sec !== null;
  
  if (!hasStats) {
    return null;
  }
  
  // Вычисляем порядковый номер (индекс + 1, так как индекс начинается с 0)
  const messageNumber = messageIndex + 1;
  
  // Форматируем время отправки (created_at теперь в ISO 8601 UTC формате с 'Z')
  const sendTime = new Date(message.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  // Время генерации берем напрямую с сервера (generation_duration)
  const hasGenerationTime = message.generation_duration !== undefined && message.generation_duration !== null;
  const generationTime = hasGenerationTime ? message.generation_duration!.toFixed(2) : null;
  
  // Количество токенов - разделяем content и reasoning
  const contentTokens = message.total_tokens || 0;
  const reasoningTokens = message.reasoning_tokens || 0;
  const totalTokens = contentTokens + reasoningTokens;
  
  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 text-[10px] text-gray-500">
        {/* Порядковый номер */}
        <span className="font-medium text-gray-400 whitespace-nowrap">#{messageNumber}</span>
        
        {/* Время отправки */}
        <span className="whitespace-nowrap">{sendTime}</span>
        
        {/* Количество токенов - показываем отдельно reasoning если есть */}
        {reasoningTokens > 0 && (
          <span title={`Reasoning: ${reasoningTokens}, Content: ${contentTokens}`} className="whitespace-nowrap">
            🧠 {totalTokens}т. ({reasoningTokens}🤔)
          </span>
        )}
        {reasoningTokens === 0 && contentTokens > 0 && (
          <span className="whitespace-nowrap">🧠 {contentTokens}т.</span>
        )}
        
        {/* Скорость генерации */}
        {message.tokens_per_sec !== undefined && message.tokens_per_sec !== null && (
          <span className="whitespace-nowrap">⚡{message.tokens_per_sec.toFixed(1)}т/с</span>
        )}
        
        {/* Время генерации */}
        {hasGenerationTime && (
          <span className="whitespace-nowrap">⏱{generationTime}с</span>
        )}
      </div>
    </div>
  );
};
