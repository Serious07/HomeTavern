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
  
  // Логирование для отладки
  console.log('[MessageStatsPanel] Message:', {
    id: message.id,
    role: message.role,
    tokens_per_sec: message.tokens_per_sec,
    total_tokens: message.total_tokens,
    generation_duration: message.generation_duration,
    created_at: message.created_at,
    generated_at: message.generated_at,
  });
  
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
    <div className="mt-2 pt-2 border-t border-gray-600/50">
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        {/* Порядковый номер */}
        <span className="font-medium text-gray-400">#{messageNumber}</span>
        
        {/* Время отправки */}
        <span>🕐 {sendTime}</span>
        
        {/* Количество токенов - показываем отдельно reasoning если есть */}
        {reasoningTokens > 0 && (
          <span title={`Reasoning: ${reasoningTokens}, Content: ${contentTokens}`}>
            📝 {totalTokens} ток. ({reasoningTokens} reasoning)
          </span>
        )}
        {reasoningTokens === 0 && contentTokens > 0 && (
          <span>📝 {contentTokens} ток.</span>
        )}
        
        {/* Скорость генерации */}
        {message.tokens_per_sec !== undefined && message.tokens_per_sec !== null && (
          <span>⚡ {message.tokens_per_sec.toFixed(1)} ток/сек</span>
        )}
        
        {/* Время генерации */}
        {hasGenerationTime && (
          <span>⏱️ {generationTime}с</span>
        )}
      </div>
    </div>
  );
};
