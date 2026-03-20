import React, { useState, useEffect, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { extractStatusBar } from '../../utils/statusBar';
import { StatusBar } from './StatusBar';

/**
 * Функция для обёртки текста в кавычках в span с оранжевым цветом
 * Работает на уровне строки, до рендеринга Markdown
 */
function processQuotedText(text: string): string {
  // Регулярное выражение для поиска текста в кавычках
  // Поддерживает " ", « », „ "
  const quotePattern = /("([^"]+)"|«([^»]+)»|„([^"]+)")/g;
  
  return text.replace(quotePattern, (match, _, inner1, inner2, inner3) => {
    const content = inner1 ?? inner2 ?? inner3 ?? '';
    const quoteChar = match[0];
    const closeQuoteChar = match[match.length - 1];
    return `<span class="quote-wrapper">${quoteChar}<span class="text-orange-400 font-medium">${content}</span>${closeQuoteChar}</span>`;
  });
}

/**
 * Компонент для рендеринга Markdown с поддержкой:
 * - Статус-бара (автоматическое обнаружение и форматирование)
 * - Подсветки текста в кавычках оранжевым цветом
 * - Полной поддержки Markdown (таблицы, списки, код, заголовки и т.д.)
 * Оптимизирован для мобильных устройств с memo и useMemo
 */
const MarkdownRendererInternal: React.FC<{ children: string; streaming?: boolean }> = ({ 
  children, 
  // streaming используется для будущих улучшений потоковой генерации
}) => {
  // useMemo для кэширования обработанного контента - предотвращает повторную обработку при каждом ре-рендере
  const { statusBar, processedContent } = useMemo(() => {
    // Парсим статус-бар при изменении контента
    const { statusBar: parsedStatusBar, content: extractedContent } = extractStatusBar(children);
    // Обрабатываем кавычки на уровне строки
    const processed = processQuotedText(extractedContent);
    return { statusBar: parsedStatusBar, processedContent: processed };
  }, [children]);
  
  return (
    <div className="markdown-content">
      {statusBar && <StatusBar {...statusBar} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          // Блоки кода с подсветкой синтаксиса
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return match ? (
              <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto my-4">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="bg-gray-800 px-2 py-1 rounded text-sm">
                {children}
              </code>
            );
          },
          // Заголовки
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
          h4: ({ children }) => <h4 className="text-base font-bold mb-2 mt-4">{children}</h4>,
          // Списки
          ul: ({ children }) => <ul className="list-disc list-inside mb-4 ml-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-4 ml-4">{children}</ol>,
          li: ({ children }) => <li className="mb-1">{children}</li>,
          // Таблицы
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-700">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-700 px-4 py-2 bg-gray-800 font-bold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-700 px-4 py-2">{children}</td>
          ),
          // Цитаты
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-600 pl-4 py-2 my-4 bg-gray-800/50 italic text-gray-300">
              {children}
            </blockquote>
          ),
          // Горизонтальная линия
          hr: () => <hr className="my-4 border-gray-700" />,
          // Ссылки
          a: ({ href, children }) => (
            <a 
              href={href} 
              className="text-cyan-400 hover:text-cyan-300 underline" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          // Жирный текст
          strong: ({ children }) => <strong className="font-bold text-gray-300">{children}</strong>,
          // Курсив
          em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
          // Зачеркнутый текст
          del: ({ children }) => <del className="line-through">{children}</del>,
          // Разрыв строки
          br: () => <br />,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

// Обертка с memo для предотвращения лишних ре-рендеров при неизменных props
export const MarkdownRenderer = memo(
  MarkdownRendererInternal,
  (prevProps, nextProps) => prevProps.children === nextProps.children && prevProps.streaming === nextProps.streaming
);

MarkdownRenderer.displayName = 'MarkdownRenderer';
