import React from 'react';

interface QuotedTextProps {
  text: string;
}

/**
 * Компонент для подсветки текста в кавычках оранжевым цветом
 * Поддерживает следующие типы кавычек:
 * - Английские: "текст"
 * - Русские прямые: «текст»
 * - Русские книжные: „текст"
 */
export const QuotedText: React.FC<QuotedTextProps> = ({ text }) => {
  // Регулярное выражение для поиска текста в кавычках
  // Поддерживает " ", « », „ "
  const quotePattern = /("([^"]+)"|«([^»]+)»|„([^"]+)")/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = quotePattern.exec(text)) !== null) {
    // Добавляем текст перед кавычками
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Определяем тип кавычек и контент
    const fullMatch = match[0];
    const content = match[2] ?? match[3] ?? match[4] ?? '';
    const quoteChar = fullMatch[0];
    const closeQuoteChar = fullMatch[fullMatch.length - 1];
    
    // Добавляем открывающую кавычку
    parts.push(<span key={`${match.index}-open`}>{quoteChar}</span>);
    
    // Добавляем контент с оранжевым цветом
    parts.push(
      <span key={`${match.index}-content`} className="text-orange-400 font-medium">
        {content}
      </span>
    );
    
    // Добавляем закрывающую кавычку
    parts.push(<span key={`${match.index}-close`}>{closeQuoteChar}</span>);
    
    lastIndex = match.index + fullMatch.length;
  }
  
  // Добавляем оставшийся текст
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  // Если не нашлось кавычек, возвращаем оригинальный текст
  if (parts.length === 0) {
    return <>{text}</>;
  }
  
  return <>{parts}</>;
};
