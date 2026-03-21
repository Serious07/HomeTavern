# План улучшений чата HomeTavern V5

## Обзор задач

В этом документе описаны 6 задач по улучшению функциональности чата:

1. **Скроллинг к началу нового сообщения с анимацией**
2. **Модальное окно для ввода на мобильных устройствах**
3. **Исправление расчета токенов/сек с учетом Thinking мода**
4. **Фиксация состояния сворачивания мыслей во время генерации**
5. **Автоматический перевод при редактировании сообщений**
6. **Переключение языков в блоках сжатия**

---

## Задача 1: Скроллинг к началу нового сообщения с анимацией

### Проблема
При отправке сообщения пользователем или получении сообщения от ИИ, скроллинг происходит просто в конец диалога, а не к началу нового сообщения. Нет анимации появления.

### Решение

#### 1.1 Добавить refs для каждого сообщения
В [`MessageItem`](client/src/components/chat/MessageList.tsx:52) компоненте добавить ref для каждого сообщения:

```typescript
const messageRef = useRef<HTMLDivElement>(null);
```

#### 1.2 Добавить пропс для авто-скролла
В [`MessageList`](client/src/components/chat/MessageList.tsx:405) добавить новые пропсы:

```typescript
interface MessageListProps {
  // ... existing props
  autoScrollToMessageId?: number | null;  // ID сообщения, к которому нужно проскроллить
  onScrollComplete?: () => void;  // Callback после завершения скролла
}
```

#### 1.3 Создать функцию плавного скролла с анимацией
В [`ChatPage`](client/src/pages/ChatPage.tsx:69) создать улучшенную функцию скролла:

```typescript
const scrollToMessage = useCallback((messageId: number) => {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageElement) {
    messageElement.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start' 
    });
    
    // Добавить анимацию подсветки
    messageElement.classList.add('animate-message-appearance');
    setTimeout(() => {
      messageElement.classList.remove('animate-message-appearance');
    }, 1500);
  }
}, []);
```

#### 1.4 Добавить CSS анимацию
В [`client/src/index.css`](client/src/index.css) добавить:

```css
@keyframes message-appearance {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-message-appearance {
  animation: message-appearance 0.3s ease-out;
}
```

#### 1.5 Интеграция в ChatPage
В [`ChatPage`](client/src/pages/ChatPage.tsx:69):

- После отправки сообщения пользователя: вызвать скроллинг к новому сообщению
- После получения сообщения от ИИ: вызвать скроллинг к началу сообщения ИИ
- Добавить `data-message-id` атрибут в [`MessageItem`](client/src/components/chat/MessageList.tsx:52)

---

## Задача 2: Модальное окно для ввода на мобильных устройствах

### Проблема
Во время печати текстовое поле ведет себя некорректно, уменьшаясь и увеличиваясь. На смартфонах невозможно листать строки при достижении предела.

### Решение

#### 2.1 Создать компонент MobileMessageInputModal
Создать новый файл [`client/src/components/chat/MobileMessageInputModal.tsx`](client/src/components/chat/MobileMessageInputModal.tsx):

```typescript
import React, { useState, useEffect } from 'react';

interface MobileMessageInputModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  placeholder?: string;
}

export const MobileMessageInputModal: React.FC<MobileMessageInputModalProps> = ({
  isOpen,
  value,
  onChange,
  onSend,
  onClose,
  placeholder = 'Введите сообщение...',
}) => {
  const [localValue, setLocalValue] = useState(value);
  
  // Синхронизация с внешним значением
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  const handleSend = () => {
    onSend();
    onClose();
  };
  
  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}>
      {/* Overlay */}
      <div 
        className={`absolute inset-0 bg-black/50 transition-opacity ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gray-800 rounded-t-2xl p-4 transition-transform ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="flex flex-col gap-4">
          {/* Handle bar для drag */}
          <div className="flex justify-center">
            <div className="w-12 h-1 bg-gray-600 rounded-full" />
          </div>
          
          {/* Textarea с прокруткой */}
          <textarea
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none overflow-y-auto"
            style={{
              minHeight: '150px',
              maxHeight: '50vh',
            }}
          />
          
          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition"
            >
              Отмена
            </button>
            <button
              onClick={handleSend}
              disabled={!localValue.trim()}
              className="flex-1 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

#### 2.2 Обновить MessageInput
В [`MessageInput`](client/src/components/chat/MessageInput.tsx:15) добавить кнопку для открытия модального окна на мобильных:

```typescript
// Добавить пропс
interface MessageInputProps {
  // ... existing props
  showMobileModal?: boolean;  // Показывать кнопку для мобильного модального окна
  onOpenMobileModal?: () => void;  // Callback для открытия модального окна
}

// В JSX добавить кнопку
{showMobileModal && (
  <button
    onClick={onOpenMobileModal}
    className="md:hidden p-3 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
    title="Открыть в полном окне"
  >
    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  </button>
)}
```

#### 2.3 Интеграция в ChatPage
В [`ChatPage`](client/src/pages/ChatPage.tsx:69):

```typescript
const [showMobileInputModal, setShowMobileInputModal] = useState(false);

// В JSX
<MessageInput
  value={messageInput}
  onChange={setMessageInput}
  onSend={handleSendMessage}
  disabled={isSending || isStreaming || !currentChat}
  showMobileModal={true}
  onOpenMobileModal={() => setShowMobileInputModal(true)}
/>

<MobileMessageInputModal
  isOpen={showMobileInputModal}
  value={messageInput}
  onChange={setMessageInput}
  onSend={handleSendMessage}
  onClose={() => setShowMobileInputModal(false)}
/>
```

#### 2.4 Добавить CSS для анимации перехода
В [`client/src/index.css`](client/src/index.css):

```css
@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes slideDown {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}
```

---

## Задача 3: Исправление расчета токенов/сек с учетом Thinking мода

### Проблема
При включенном Thinking моде, количество токенов в секунду рассчитывается неправильно, так как учитываются только токены ответа, а не токены размышления.

### Анализ
В [`server/src/services/llm.service.ts`](server/src/services/llm.service.ts:468):

```typescript
const tokensPerSec = durationSecs > 0 ? contentTokenCount / durationSecs : 0;
```

Проблема: `contentTokenCount` считает только content_token, игнорируя reasoning_token.

### Решение

#### 3.1 Отслеживать оба типа токенов
В [`server/src/services/llm.service.ts`](server/src/services/llm.service.ts:363):

```typescript
async *generateStream(
  userId: number,
  chatId: number,
  userMessage: string
): AsyncGenerator<StreamChunk> {
  const startTime = Date.now();
  let contentTokenCount = 0;
  let reasoningTokenCount = 0;  // Добавить счетчик для reasoning
  let lastUsage: Usage | undefined;

  // ... existing code ...

  // Обрабатываем поток
  for await (const chunk of stream) {
    // ... existing usage code ...

    const delta = chunk.choices[0]?.delta || {};
    const content = delta.content || '';
    const reasoningContent = delta.reasoning_content || '';

    // Отправляем reasoning_token
    if (reasoningContent) {
      reasoningTokenCount++;  // Инкремент reasoning токенов
      yield {
        type: 'reasoning_token',
        token: reasoningContent
      };
    }

    // Отправляем content_token
    if (content) {
      contentTokenCount++;
      yield {
        type: 'content_token',
        token: content
      };
    }
  }

  // Сохраняем информацию о токенах
  if (lastUsage) {
    const totalTokens = lastUsage.total_tokens;
    
    // Логирование метрик генерации с учетом reasoning
    const endTime = Date.now();
    const durationSecs = (endTime - startTime) / 1000;
    
    // Рассчитываем скорость для content токенов
    const contentTokensPerSec = contentTokenCount / durationSecs;
    
    // Рассчитываем общую скорость (content + reasoning)
    const totalTokenCount = contentTokenCount + reasoningTokenCount;
    const totalTokensPerSec = totalTokenCount / durationSecs;
    
    console.log(`[LLMService] Generation stats:`);
    console.log(`  Content tokens: ${contentTokenCount}`);
    console.log(`  Reasoning tokens: ${reasoningTokenCount}`);
    console.log(`  Total tokens: ${totalTokenCount}`);
    console.log(`  Duration: ${durationSecs.toFixed(2)}s`);
    console.log(`  Content tokens/sec: ${contentTokensPerSec.toFixed(2)}`);
    console.log(`  Total tokens/sec: ${totalTokensPerSec.toFixed(2)}`);
  }
}
```

#### 3.2 Обновить интерфейс Message
В [`client/src/types/index.ts`](client/src/types/index.ts:29):

```typescript
export interface Message {
  // ... existing fields ...
  // Добавить поля для reasoning токенов
  reasoning_tokens?: number | null;
  total_tokens?: number | null;  // Уже есть, но нужно заполнить
  generation_duration?: number | null;
}
```

#### 3.3 Обновить MessageStatsPanel
В [`client/src/components/chat/MessageStatsPanel.tsx`](client/src/components/chat/MessageStatsPanel.tsx:13):

```typescript
export const MessageStatsPanel: React.FC<MessageStatsPanelProps> = ({
  message,
  messageIndex,
}) => {
  // Проверяем наличие stats
  const hasStats = message.tokens_per_sec !== undefined && message.tokens_per_sec !== null;
  
  if (!hasStats) {
    return null;
  }
  
  // Вычисляем порядковый номер
  const messageNumber = messageIndex + 1;
  
  // Форматируем время отправки
  const sendTime = new Date(message.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  // Время генерации
  const hasGenerationTime = message.generation_duration !== undefined && message.generation_duration !== null;
  const generationTime = hasGenerationTime ? message.generation_duration!.toFixed(2) : null;
  
  // Количество токенов
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
        
        {/* Количество токенов - показываем отдельно reasoning */}
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
```

#### 3.4 Обновить сохранение сообщения на сервере
В [`server/src/routes/chats.ts`](server/src/routes/chats.ts) (или где сохраняется сообщение после генерации):

Нужно добавить сохранение `reasoning_tokens` в базу данных.

---

## Задача 4: Фиксация состояния сворачивания мыслей во время генерации

### Проблема
Во время генерации LLM сообщения, список мыслей постоянно разворачивается, невозможно свернуть.

### Анализ
В [`StreamingResponse`](client/src/components/chat/StreamingResponse.tsx:14):

```typescript
const [showThinking, setShowThinking] = useState(false);
```

Проблема: состояние `showThinking` управляется внутри компонента, и при каждом новом токене происходит ре-рендер, который может сбрасывать состояние.

### Решение

#### 4.1 Вынести showThinking из StreamingResponse
В [`StreamingResponse`](client/src/components/chat/StreamingResponse.tsx:14) сделать `showThinking` управляемым через props:

```typescript
interface StreamingResponseProps {
  // ... existing props
  showThinking?: boolean;  // Сделать опциональным для обратной совместимости
  onToggleThinking?: () => void;  // Callback для переключения
}

const StreamingResponse: React.FC<StreamingResponseProps> = ({
  // ... existing props
  showThinking: externalShowThinking,
  onToggleThinking,
}) => {
  // Локальное состояние только если не передано внешнее
  const [internalShowThinking, setInternalShowThinking] = useState(false);
  
  // Используем внешнее или внутреннее состояние
  const actualShowThinking = externalShowThinking !== undefined 
    ? externalShowThinking 
    : internalShowThinking;
  
  const handleToggle = () => {
    if (onToggleThinking) {
      onToggleThinking();
    } else {
      setInternalShowThinking(!internalShowThinking);
    }
  };
  
  // ... existing code ...
  
  return (
    <div className="bg-gray-700/50 rounded-2xl p-4 animate-fadeIn">
      {/* Reasoning content */}
      {reasoningContent && (  // Показываем кнопку только если есть content
        <div className="mb-3 pb-3 border-b border-gray-600">
          <button
            onClick={handleToggle}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition"
          >
            <svg
              className={`w-4 h-4 transition-transform ${actualShowThinking ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
            {actualShowThinking ? 'Скрыть мышление' : 'Показать мышление'}
          </button>
          {actualShowThinking && (
            <div className="mt-2 p-3 bg-gray-800/50 rounded-lg text-sm text-gray-400 whitespace-pre-wrap">
              {reasoningContent}
            </div>
          )}
        </div>
      )}
      
      {/* ... existing code ... */}
    </div>
  );
};
```

#### 4.2 Обновить ChatPage
В [`ChatPage`](client/src/pages/ChatPage.tsx:69):

```typescript
// Добавить ref для хранения состояния showThinking для текущего стримингового сообщения
const streamingMessageThinkingRef = useRef<boolean>(false);

const handleStreamingToggleThinking = () => {
  streamingMessageThinkingRef.current = !streamingMessageThinkingRef.current;
  setShowThinking(prev => ({
    ...prev,
    [0]: streamingMessageThinkingRef.current,  // 0 - временный ID для стримингового сообщения
  }));
};

// В JSX
<StreamingResponse
  chatId={parseInt(chatId || '0')}
  onStop={handleStreamingStop}
  onComplete={handleStreamingComplete}
  onError={handleStreamingError}
  onTokenUpdate={scrollToBottom}
  showThinking={streamingMessageThinkingRef.current}
  onToggleThinking={handleStreamingToggleThinking}
/>
```

---

## Задача 5: Автоматический перевод при редактировании сообщений

### Проблема
При редактировании русской версии сообщения не обновляется автоматически английская версия, и наоборот.

### Решение

#### 5.1 Обновить handleEditMessage в ChatPage
В [`ChatPage`](client/src/pages/ChatPage.tsx:69):

```typescript
const handleEditMessage = async (messageId: number, newContent: string) => {
  if (!chatId) return;

  try {
    // Находим редактируемое сообщение
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    
    // Определяем язык оригинала
    const isUserMessage = message.role === 'user';
    const originalLanguage = isUserMessage ? 'ru' : 'en';
    
    // Сохраняем новое содержание
    await chatsApi.updateMessage(parseInt(chatId), messageId, {
      content: newContent,
    });

    // Если сообщение имеет translated_content, автоматически переводим
    if (message.translated_content !== null && message.translated_content !== undefined) {
      // Определяем, какой язык редактируется
      const currentDisplayContent = isUserMessage 
        ? (message.translated_content || message.content)  // Пользователь видит перевод
        : (message.translated_content || message.content);  // Пользователь видит перевод
      
      // Проверяем, был ли изменен оригинал или перевод
      const isEditingOriginal = newContent === message.content;
      
      if (isEditingOriginal) {
        // Редактируется оригинал - нужно перевести на другой язык
        const targetLang = isUserMessage ? 'en' : 'ru';
        
        // Вызываем API перевода
        setTranslatingMessageId(messageId);
        try {
          const response = await chatsApi.translateMessage(parseInt(chatId), messageId);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, translated_content: response.data.translated_content } : m
            )
          );
        } catch (translateErr: any) {
          console.error('Error translating message:', translateErr);
        } finally {
          setTranslatingMessageId(null);
        }
      } else {
        // Редактируется перевод - нужно перевести обратно на оригинал
        // Для этого нужно обновить translated_content и вызвать перевод обратно
        // Это требует дополнительного API endpoint для перевода в обе стороны
      }
    } else {
      // Просто обновляем список
      await fetchMessages();
    }
  } catch (err: any) {
    console.error('Error editing message:', err);
  }
};
```

#### 5.2 Добавить API endpoint для двунаправленного перевода
В [`server/src/routes/messages.ts`](server/src/routes/messages.ts):

```typescript
// Новый endpoint для перевода в обе стороны
router.put('/:chatId/messages/:id/translate-bidirectional', authenticate, async (req, res) => {
  try {
    const { chatId, id } = req.params;
    const { content, translatedContent } = req.body;
    
    const message = messageRepository.getMessageById(parseInt(id));
    if (!message || message.chat_id !== parseInt(chatId)) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Определяем роли и языки
    const isUserMessage = message.role === 'user';
    
    let updatedMessage = { ...message };
    
    if (isUserMessage) {
      // User: RU оригинал, EN перевод
      if (content !== message.content) {
        // Обновлен оригинал (RU) - переводим на EN
        const translation = await translationService.translateToEnglish(content);
        updatedMessage.translated_content = translation;
      }
      if (translatedContent !== message.translated_content && translatedContent) {
        // Обновлен перевод (EN) - переводим обратно на RU
        const translation = await translationService.translateToRussian(translatedContent);
        updatedMessage.content = translation;
      }
    } else {
      // Assistant: EN оригинал, RU перевод
      if (content !== message.content) {
        // Обновлен оригинал (EN) - переводим на RU
        const translation = await translationService.translateToRussian(content);
        updatedMessage.translated_content = translation;
      }
      if (translatedContent !== message.translated_content && translatedContent) {
        // Обновлен перевод (RU) - переводим обратно на EN
        const translation = await translationService.translateToEnglish(translatedContent);
        updatedMessage.content = translation;
      }
    }
    
    // Сохраняем в БД
    messageRepository.updateMessage(parseInt(id), updatedMessage);
    
    res.json(updatedMessage);
  } catch (error) {
    console.error('Error in bidirectional translation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

#### 5.3 Обновить UI для редактирования
В [`MessageItem`](client/src/components/chat/MessageList.tsx:52):

```typescript
const handleEditSave = () => {
  if (editingMessageId && onEdit) {
    // Передаем и оригинал, и перевод
    onEdit(editingMessageId, {
      content: editContent,
      translatedContent: message.translated_content,  // Сохраняем текущий перевод
    });
    setEditingMessageId(null);
    setEditContent('');
  }
};
```

---

## Задача 6: Переключение языков в блоках сжатия

### Проблема
В блоках умного сжатия нет возможности переключения между английским и русским, и нет автоматического перевода при редактировании.

### Решение

#### 6.1 Обновить ChatBlock компонент
В [`ChatBlock`](client/src/components/chat/ChatBlock.tsx:13):

```typescript
import { useState } from 'react';

export const ChatBlock: React.FC<ChatBlockProps> = ({
  block,
  onEdit,
  onToggleCompression,
  onDelete,
  onExpand,
  isExpanded = false,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  
  // Для отображения summary на выбранном языке
  const displaySummary = showOriginal ? block.summary : (block.summary_translation || block.summary);
  
  const handleToggleLanguage = () => {
    setShowOriginal(!showOriginal);
  };
  
  // ... existing handlers ...
  
  return (
    <div className="mb-4 rounded-lg border border-cyan-700 bg-cyan-900/20 p-4">
      {/* Заголовок блока */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-semibold">📚 {block.title}</span>
          <span className="text-xs text-cyan-600">({messageCount} сообщений)</span>
        </div>
        
        {/* Кнопки управления */}
        <div className="flex items-center gap-1">
          {/* Кнопка переключения языка */}
          <button
            onClick={handleToggleLanguage}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-xs"
            title={showOriginal ? 'Показать перевод' : 'Показать оригинал'}
          >
            {showOriginal ? 'EN' : 'RU'}
          </button>
          
          {/* ... existing buttons ... */}
        </div>
      </div>

      {/* Краткий пересказ */}
      <div className="text-sm text-cyan-100/80 mb-3">
        <div className="font-medium text-cyan-300 mb-1">Краткий пересказ:</div>
        <p className="whitespace-pre-wrap">{displaySummary}</p>
      </div>

      {/* ... existing code ... */}
    </div>
  );
};
```

#### 6.2 Обновить тип ChatBlock
В [`client/src/types/compression.ts`](client/src/types/compression.ts):

```typescript
export interface ChatBlock {
  // ... existing fields ...
  summary_translation?: string | null;  // Перевод summary на другой язык
  title_translation?: string | null;    // Перевод заголовка
}
```

#### 6.3 Добавить API endpoint для перевода блока
В [`server/src/routes/compression.ts`](server/src/routes/compression.ts):

```typescript
// Новый endpoint для перевода блока
router.put('/block/:id/translate', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const block = chatBlockRepository.getBlockById(parseInt(id));
    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }
    
    // Переводим summary и title
    const summaryTranslation = await translationService.translateToRussian(block.summary);
    const titleTranslation = await translationService.translateToRussian(block.title);
    
    // Обновляем в БД
    chatBlockRepository.updateBlock(parseInt(id), {
      summary_translation: summaryTranslation,
      title_translation: titleTranslation,
    });
    
    res.json({
      ...block,
      summary_translation,
      title_translation,
    });
  } catch (error) {
    console.error('Error translating block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

#### 6.4 Обновить EditBlockModal
В [`EditBlockModal`](client/src/components/chat/EditBlockModal.tsx:10):

```typescript
export const EditBlockModal: React.FC<EditBlockModalProps> = ({
  block,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(block.title);
  const [summary, setSummary] = useState(block.summary);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Определяем отображаемые значения
  const displayTitle = showOriginal ? block.title : (block.title_translation || block.title);
  const displaySummary = showOriginal ? block.summary : (block.summary_translation || block.summary);
  
  const handleToggleLanguage = async () => {
    const newShowOriginal = !showOriginal;
    setShowOriginal(newShowOriginal);
    
    // Если перевод еще не загружен, запрашиваем его
    if (newShowOriginal && !block.title_translation) {
      setIsTranslating(true);
      try {
        // Вызываем API перевода
        const response = await fetch(`/api/compression/block/${block.id}/translate`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        const data = await response.json();
        
        // Обновляем локальное состояние
        setTitle(data.title);
        setSummary(data.summary);
      } catch (error) {
        console.error('Error translating block:', error);
      } finally {
        setIsTranslating(false);
      }
    }
  };
  
  // ... existing code ...
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Заголовок модального окна */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-cyan-400">✏️ Редактирование блока</h2>
          
          <div className="flex items-center gap-2">
            {/* Кнопка переключения языка */}
            <button
              onClick={handleToggleLanguage}
              disabled={isTranslating}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition text-sm"
            >
              {isTranslating ? '...' : (showOriginal ? 'EN' : 'RU')}
            </button>
            
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-300 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Содержимое */}
        <div className="p-4 space-y-4">
          {/* Поле заголовка */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Заголовок:
            </label>
            <input
              type="text"
              value={displayTitle}
              onChange={(e) => {
                setTitle(e.target.value);
                // Автоматически переводим при изменении
                handleAutoTranslate(e.target.value, 'title');
              }}
              placeholder="Глава 1: Знакомство с персонажем"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              maxLength={100}
            />
          </div>

          {/* Поле краткого пересказа */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Краткий пересказ:
            </label>
            <textarea
              value={displaySummary}
              onChange={(e) => {
                setSummary(e.target.value);
                // Автоматически переводим при изменении
                handleAutoTranslate(e.target.value, 'summary');
              }}
              placeholder="Пользователь встретился с персонажем в таверне и начал диалог..."
              rows={8}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              maxLength={2000}
            />
          </div>

          {/* ... existing code ... */}
        </div>

        {/* ... existing code ... */}
      </div>
    </div>
  );
};
```

---

## Итоговая таблица задач

| Задача | Приоретет | Сложность | Файлы для изменения |
|--------|-----------|-----------|---------------------|
| 1. Скроллинг к началу сообщения | Высокий | Средняя | MessageList.tsx, ChatPage.tsx, index.css |
| 2. Модальное окно для мобильных | Высокий | Средняя | MobileMessageInputModal.tsx (новый), MessageInput.tsx, ChatPage.tsx |
| 3. Исправление расчета токенов/сек | Высокий | Низкая | llm.service.ts, MessageStatsPanel.tsx, types/index.ts |
| 4. Фиксация состояния мыслей | Средний | Низкая | StreamingResponse.tsx, ChatPage.tsx |
| 5. Автоматический перевод при редактировании | Высокий | Высокая | ChatPage.tsx, messages.ts (сервер), MessageList.tsx |
| 6. Переключение языков в блоках | Средний | Высокая | ChatBlock.tsx, EditBlockModal.tsx, compression.ts (сервер), types/compression.ts |

---

## Рекомендации по реализации

1. **Начните с задачи 3** (исправление расчета токенов/сек) - она самая простая и имеет наименьшее влияние на существующий код.

2. **Затем реализуйте задачу 4** (фиксация состояния мыслей) - она также относительно проста и зависит от задачи 3.

3. **Задачи 1 и 2** можно реализовать параллельно, так как они независимы друг от друга.

4. **Задачи 5 и 6** требуют изменений на сервере и клиенте, поэтому их лучше делать в последнюю очередь, после того как базовая функциональность перевода будет проверена.
