import React, { memo, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { extractStatusBar } from '../../utils/statusBar';
import { StatusBar } from './StatusBar';

const QUOTE_MARKER_START = '\u0001QUOTE_START\u0001';
const QUOTE_MARKER_END = '\u0001QUOTE_END\u0001';

/**
 * Рекурсивный обход дерева AST
 */
function walkAst(node: any, visitor: (node: any) => void) {
  visitor(node);
  if (node.type === 'element' && Array.isArray(node.children)) {
    if (node.tagName === 'code' || node.tagName === 'pre') return;
    for (const child of node.children) {
      walkAst(child, visitor);
    }
  }
}

/**
 * Rehype-плагин для удаления маркеров кавычек из AST.
 * Маркеры вставляются до передачи в ReactMarkdown и удаляются здесь.
 */
function rehypeRemoveQuoteMarkers() {
  return function transform(tree: any) {
    walkAst(tree, (node: any) => {
      if (node.type === 'text' && typeof node.value === 'string') {
        if (node.value.includes(QUOTE_MARKER_START) || node.value.includes(QUOTE_MARKER_END)) {
          node.value = node.value
            .split(QUOTE_MARKER_START)
            .join('')
            .split(QUOTE_MARKER_END)
            .join('');
        }
      }
    });
  };
}

/**
 * Заменяет текст в кавычках на маркеры, которые будут обработаны ReactMarkdown + кастомным компонентом.
 * Игнорирует контент внутри inline code блоков.
 */
function wrapQuotesWithMarkers(text: string): string {
  // Шаг 1: Находим все inline code блоки и заменяем их плейсхолдерами
  const codeBlocks: string[] = [];
  const codePlaceholder = (index: number) => `\x00CODE${index}\x00`;

  let processed = text.replace(/`([^`]+)`/g, (_, content) => {
    codeBlocks.push(content);
    return codePlaceholder(codeBlocks.length - 1);
  });

  // Шаг 2: Находим кавычки и заменяем на маркеры
  const quotePattern = /("([^"]+)"|«([^»]+)»|„([^"]+)")/g;
  processed = processed.replace(quotePattern, (_, __, inner1, inner2, inner3) => {
    const content = inner1 ?? inner2 ?? inner3 ?? '';
    return QUOTE_MARKER_START + content + QUOTE_MARKER_END;
  });

  // Шаг 3: Восстанавливаем inline code блоки
  for (let i = 0; i < codeBlocks.length; i++) {
    processed = processed.replace(codePlaceholder(i), `\`${codeBlocks[i]}\``);
  }

  return processed;
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
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const { statusBar, processedContent } = useMemo(() => {
    const { statusBar: parsedStatusBar, content: extractedContent } = extractStatusBar(children);
    // Оборачиваем кавычки в маркеры
    const withMarkers = wrapQuotesWithMarkers(extractedContent);
    return { statusBar: parsedStatusBar, processedContent: withMarkers };
  }, [children]);

  // После рендеринга заменяем маркеры на span с оранжевым цветом
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const markerStart = '\u0001QUOTE_START\u0001';
    const markerEnd = '\u0001QUOTE_END\u0001';

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.includes(markerStart) || text.includes(markerEnd)) {
          const fragment = document.createDocumentFragment();
          const parts = text.split(markerStart);

          for (let i = 0; i < parts.length; i++) {
            if (i === 0) {
              // Первая часть - обычный текст
              if (parts[i]) {
                fragment.appendChild(document.createTextNode(parts[i]));
              }
            } else {
              // Контент цитаты до markerEnd
              const endIdx = parts[i].indexOf(markerEnd);
              if (endIdx >= 0) {
                const content = parts[i].substring(0, endIdx);
                if (content) {
                  const span = document.createElement('span');
                  span.className = 'text-orange-400 font-medium';
                  span.textContent = content;
                  fragment.appendChild(span);
                }
                // Остаток после markerEnd
                const remainder = parts[i].substring(endIdx + markerEnd.length);
                if (remainder) {
                  const tempDiv = document.createElement('div');
                  tempDiv.textContent = remainder;
                  while (tempDiv.firstChild) {
                    fragment.appendChild(tempDiv.firstChild);
                  }
                }
              } else {
                if (parts[i]) {
                  fragment.appendChild(document.createTextNode(parts[i]));
                }
              }
            }
          }

          node.parentNode?.replaceChild(fragment, node);
        }
      } else {
        let child: Node | null = node.firstChild;
        while (child) {
          const next = child.nextSibling;
          processNode(child);
          child = next;
        }
      }
    };

    // Не рекурсируем в code/pre элементы
    const skipElements = container.querySelectorAll('code, pre');
    const skipSet = new Set(skipElements);

    const processDescendants = (node: Element) => {
      if (skipSet.has(node)) return;
      let child: Node | null = node.firstChild;
      while (child) {
        const next = child.nextSibling;
        processNode(child);
        if (child.nodeType === Node.ELEMENT_NODE) {
          processDescendants(child as Element);
        }
        child = next;
      }
    };

    processDescendants(container as Element);
  }, [processedContent]);

  return (
    <div className="markdown-content" ref={contentRef}>
      {statusBar && <StatusBar {...statusBar} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRemoveQuoteMarkers]}
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