import React, { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { extractStatusBar, normalizeStatusBarPosition } from '../../utils/statusBar';
import { StatusBar } from './StatusBar';

// ==================== Обработка кавычек ====================

/**
 * Оборачивает текст в кавычках в оранжевый span.
 * Игнорирует HTML-теги и inline code.
 * 
 * Поддерживаемые типы кавычек:
 * - "текст в двойных кавычках"
 * - «текст в ёлочках»
 * - „текст в нижних кавычках"
 */
function wrapQuotesInText(text: string): string {
  const htmlTags: string[] = [];
  const codeBlocks: string[] = [];

  let processed = text;

  // Извлекаем HTML-теги
  const htmlPH = (i: number) => `\x01HTML${i}\x01`;
  processed = processed.replace(/<[^>]*>/g, (m) => {
    htmlTags.push(m);
    return htmlPH(htmlTags.length - 1);
  });

  // Извлекаем inline code (бэктики)
  const codePH = (i: number) => `\x02CODE${i}\x02`;
  processed = processed.replace(/`([^`]+)`/g, (_, content) => {
    codeBlocks.push(content);
    return codePH(codeBlocks.length - 1);
  });

  // Оборачиваем кавычки в оранжевый span
  const quotePattern = /(".*?"|«[^»]+?»|„[^"]+?")/g;
  processed = processed.replace(quotePattern, (fullMatch) => {
    return `<span class="text-orange-400 font-medium">${fullMatch}</span>`;
  });

  // Восстанавливаем inline code
  for (let i = 0; i < codeBlocks.length; i++) {
    processed = processed.replace(codePH(i), `\`${codeBlocks[i]}\``);
  }

  // Восстанавливаем HTML-теги
  for (let i = 0; i < htmlTags.length; i++) {
    processed = processed.replace(htmlPH(i), htmlTags[i]);
  }

  return processed;
}

// ==================== Обработка тегов разметки LLM ====================

/**
 * Преобразует специальные теги LLM в HTML-спаны для стилизации.
 * 
 * Нейросеть использует теги для маркирования типов речи:
 * - <speech>...</speech> → прямая речь (оранжевый)
 * - <monologue>...</monologue> → монолог/мысли (оранжевый курсив)
 * - <dialog>...</dialog> → диалог между персонажами (оранжевый)
 * - <narration>...</narration> → описание действий/окружения (обычный текст)
 * 
 * Теги автоматически удаляются после преобразования содержимого.
 */
function processLLMTags(text: string): string {
  // Заменяем теги LLM на стилизованные span
  // Порядок важен: сначала speech, затем monologue, dialog, narration
  
  // <speech> — прямая речь (оранжевый)
  text = text.replace(/<speech>([\s\S]*?)<\/speech>/gi, '<span class="text-orange-400 font-medium">$1</span>');
  
  // <monologue> — монолог/внутренние мысли (оранжевый курсив)
  text = text.replace(/<monologue>([\s\S]*?)<\/monologue>/gi, '<span class="text-orange-400 font-medium italic">$1</span>');
  
  // <dialog> — диалог между персонажами (оранжевый)
  text = text.replace(/<dialog>([\s\S]*?)<\/dialog>/gi, '<span class="text-orange-400 font-medium">$1</span>');
  
  // <narration> — описание/действия (обычный текст, просто удаляем теги)
  text = text.replace(/<narration>([\s\S]*?)<\/narration>/gi, '$1');
  
  return text;
}

// ==================== Главная функция ====================

/**
 * Главная функция обработки текста:
 * 1. Преобразует теги LLM (speech, monologue, dialog, narration) в HTML-спаны
 * 2. Оборачивает текст в кавычках в оранжевый span
 * 
 * Теги LLM используются для маркирования типов речи нейросетью.
 */
function wrapQuotesWithSpan(text: string): string {
  // Шаг 1: Обрабатываем теги LLM (speech, monologue, dialog, narration)
  let withLLMTags = processLLMTags(text);

  // Шаг 2: Оборачиваем кавычки
  let withWrappedQuotes = wrapQuotesInText(withLLMTags);

  return withWrappedQuotes;
}

// ==================== React-компонент ====================

/**
 * Компонент для рендеринга Markdown с поддержкой:
 * - Статус-бара (автоматическое обнаружение и форматирование)
 * - Подсветки текста в кавычках и двойных тире оранжевым цветом
 * - Полной поддержки Markdown (таблицы, списки, код, заголовки и т.д.)
 * Оптимизирован с memo для предотвращения лишних ре-рендеров
 */
const MarkdownRendererInternal: React.FC<{ children: string; streaming?: boolean }> = ({
  children,
}) => {
  const { statusBar, processedContent } = useMemo(() => {
    // Сначала нормализуем позицию статус-блоков (переносим в начало если нужно)
    const { content: normalizedContent, allParsed } = normalizeStatusBarPosition(children);
    
    // Затем извлекаем статус-бар из начала нормализованного текста
    const { statusBar: mainStatusBar, content: extractedContent } = extractStatusBar(normalizedContent);
    
    // allParsed содержит все распаршенные блоки - они уже обработаны и удалены из текста
    // (используется для внутренней логики, визуальное отображение только основного блока)
    void allParsed;
    
    const withSpan = wrapQuotesWithSpan(extractedContent);
    return { statusBar: mainStatusBar, processedContent: withSpan };
  }, [children]);

  // Рекурсивно обходим детей и сбрасываем margin/padding у всех React-элементов
  const resetMarginsInChildren = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) return child;
      
      // Пропускаем style атрибут для span (кавычки), em, strong — у них свои стили
      const currentStyle = (child.props.style as React.CSSProperties) || {};
      const newStyle: React.CSSProperties = {
        ...currentStyle,
        marginTop: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
      
      return React.cloneElement(
        child,
        { style: newStyle },
        resetMarginsInChildren(child.props.children)
      );
    });
  };

  return (
    <div className="markdown-content">
      {/* Inline styles for list formatting */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => <p>{children}</p>,
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
          h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4">{children}</h3>,
          h4: ({ children }) => <h4 className="text-base font-bold mb-2 mt-4">{children}</h4>,
          ul: ({ children }: { children?: React.ReactNode }) => (
            <ul
              className="markdown-ul"
              style={{
                listStyleType: 'disc',
                listStylePosition: 'outside' as const,
                listStyleImage: 'none',
                marginBottom: 0,
                marginLeft: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: 0,
                marginTop: 0,
              }}
            >{children}</ul>
          ),
          ol: ({ children }: { children?: React.ReactNode }) => (
            <ol
              className="markdown-ol"
              style={{
                listStyleType: 'decimal',
                listStylePosition: 'outside' as const,
                marginBottom: 0,
                marginLeft: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                paddingLeft: 0,
                marginTop: 0,
              }}
            >{children}</ol>
          ),
          li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
            <li
              className="markdown-li"
              style={{
                lineHeight: '1.5',
                // marginBottom управляется через CSS класс .markdown-li (0.375rem)
                marginTop: 0,
                paddingTop: 0,
                paddingBottom: 0,
                margin: 0,
                padding: 0,
                display: 'list-item',
              }}
            >{resetMarginsInChildren(children)}</li>
          ),
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
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-600 pl-4 py-2 my-4 bg-gray-800/50 italic text-gray-300">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-gray-700" />,
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
          strong: ({ children }) => <strong className="font-bold text-gray-300">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
          del: ({ children }) => <del className="line-through">{children}</del>,
          br: () => <br />,
          span: ({ children, className }: { children?: React.ReactNode; className?: string | string[] }) => (
            <span className={Array.isArray(className) ? className.join(' ') : className}>
              {children}
            </span>
          ),
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