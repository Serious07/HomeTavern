import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chatsApi, charactersApi, settingsApi } from '../services/api';
import { compressionApi } from '../services/api';
import { STORAGE_KEYS } from '../constants/storage';
import { Chat, Message, Character } from '../types';
import { CompressionMethod } from '../types/compression';
import { playNotificationSound } from '../utils/notificationSound';
import MessageList from '../components/chat/MessageList';
import StreamingResponse from '../components/chat/StreamingResponse';
import ChatInputArea from '../components/chat/ChatInputArea';
import MobileMessageInputModal from '../components/chat/MobileMessageInputModal';
import ContextStatsDisplay from '../components/chat/ContextStatsDisplay';
import { useContextStats } from '../hooks/useContextStats';
import { useCompression } from '../hooks/useCompression';
import { EditBlockModal } from '../components/chat/EditBlockModal';
import { ChatBlockWithParsedIds } from '../types/compression';
import AppHeader from '../components/common/AppHeader';
import CompressionProgressOverlay from '../components/chat/CompressionProgressOverlay';
import CompressionConfirmModal from '../components/chat/CompressionConfirmModal';
import LLMTranslationModal from '../components/LLMTranslationModal';

/**
 * Форматирование даты последнего сообщения
 * Показывает "Сегодня", "Вчера" или дату для старых сообщений
 * Использует часовой пояс пользователя
 */
function formatLastMessageDate(updatedAt: string): string {
  const date = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Получаем часовой пояс пользователя
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Формат для времени (HH:MM)
  const timeFormat = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone,
  });
  
  // Формат для даты (DD.MM.YYYY)
  const dateFormat = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: timeZone,
  });
  
  // Формат для месяца (DD месяц)
  const monthFormat = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    timeZone: timeZone,
  });
  
  if (diffDays === 0) {
    // Сегодня - показываем время
    return timeFormat.format(date);
  } else if (diffDays === 1) {
    // Вчера - показываем время
    return `Вчера ${timeFormat.format(date)}`;
  } else if (diffDays < 7) {
    // Менее недели - показываем день недели и время
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return `${dayNames[date.getDay()]} ${timeFormat.format(date)}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    // В этом году - показываем день и месяц
    return monthFormat.format(date);
  } else {
    // Старые сообщения - показываем полную дату
    return dateFormat.format(date);
  }
}

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: chatId } = useParams();
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showThinking, setShowThinking] = useState<Record<number, boolean>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHeaderFooter, setShowHeaderFooter] = useState(true);
  const [translatingMessageId, setTranslatingMessageId] = useState<number | null>(null);
  
  // Sound notification setting
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationVolume, setNotificationVolume] = useState<number>(70);
  
  // Translation setting
  const [translationEnabled, setTranslationEnabled] = useState<boolean>(true);
  
  // Translation provider setting
  const [translationProvider, setTranslationProvider] = useState<string>('google');
  
  // LLM translation modal state - используем одно состояние для очереди переводов
  // Приоритет: сообщение пользователя > ответ LLM
  const [userMessageTranslation, setUserMessageTranslation] = useState<{
    text: string;
    sourceLang: string;
    targetLang: string;
    messageId: number;
  } | null>(null);
  const [llmResponseTranslation, setLlmResponseTranslation] = useState<{
    text: string;
    sourceLang: string;
    targetLang: string;
    messageId: number;
  } | null>(null);
  // Ref для хранения ожидающего перевода ответа LLM (пока открыто окно перевода сообщения)
  const pendingLlmResponseTranslationRef = useRef<{
    text: string;
    sourceLang: string;
    targetLang: string;
    messageId: number;
  } | null>(null);
  // Ref для отслеживания текущего состояния перевода сообщения (для использования в замыканиях)
  const userMessageTranslationRef = useRef<typeof userMessageTranslation>(null);
  userMessageTranslationRef.current = userMessageTranslation;
  
  // Состояние для стриминга перевода ответа LLM через SSE (открывает модалку)
  const [streamingTranslation, setStreamingTranslation] = useState<{
    text: string;
    sourceLang: string;
    targetLang: string;
    displayText: string;
    reasoningText: string;
    status: 'translating' | 'done' | 'error';
    errorMessage?: string;
  } | null>(null);
  
  // Состояние для стриминга перевода сообщения пользователя через SSE
  const [userStreamingTranslation, setUserStreamingTranslation] = useState<{
    text: string;
    sourceLang: string;
    targetLang: string;
    displayText: string;
    reasoningText: string;
    status: 'translating' | 'done' | 'error';
    errorMessage?: string;
  } | null>(null);
  
  // Ref для messageId текущего стримингового перевода
  const streamingTranslationMessageIdRef = useRef<number | null>(null);
  // Флаг: серверный стриминг перевода уже запущен (чтобы избежать дубля в handleStreamingComplete)
  const streamingTranslationStartedRef = useRef<boolean>(false);
  // Ref для messageId сообщения пользователя при стриминговом переводе
  const userStreamingTranslationMessageIdRef = useRef<number | null>(null);
  
  // Ref для кастомного callback при редактировании сообщения
  // Позволяет переопределить стандартный onComplete чтобы сохранить результат в правильное поле
  const editTranslationCallbackRef = useRef<{
    messageId: number;
    targetField: 'content' | 'translated_content';
    onComplete: (translatedText: string) => Promise<void>;
  } | null>(null);
  
  // Compression method setting
  const [compressionMethod, setCompressionMethod] = useState<CompressionMethod>('fixed');
  
  // Ref для хранения состояния showThinking для стримингового сообщения
  const streamingMessageThinkingRef = useRef<boolean>(false);
  
  // State для мобильного модального окна ввода
  const [showMobileInputModal, setShowMobileInputModal] = useState(false);
  
  // Значение текста из основного поля ввода при открытии модального окна
  const [mobileModalValue, setMobileModalValue] = useState('');
  
  // Принудительный ре-рендер для обновления StreamingResponse при переключении showThinking
  const [, forceUpdate] = useState(0);
  
  // State для модального окна редактирования блока
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ChatBlockWithParsedIds | null>(null);
  
  // State для модального окна подтверждения сжатия
  const [showCompressionConfirm, setShowCompressionConfirm] = useState(false);
  
  // Context stats for token usage tracking
  const currentChatId = chatId ? parseInt(chatId) : null;
   const { 
    stats: contextStats, 
    isLoading: isContextLoading, 
    sync: syncContextStats,
  } = useContextStats(
    currentChatId,
    { enabled: !!currentChatId }
  );
  
  // Compression hooks
  const {
    blocks,
    isCompressing,
    compressionProgress,
    compress,
    editBlock,
    toggleCompression,
    deleteBlock,
    loadBlocks,
    checkNeedsCompression,
    isSelectionMode,
    selectionStart,
    selectionEnd,
    startSelection,
    cancelSelection,
    handleSelectionClick,
  } = useCompression(currentChatId);
  
  // Ref для хранения последнего ID сообщения для скролла
  const lastMessageIdRef = useRef<number | null>(null);
  // Ref для отслеживания уже запущенных переводов, чтобы избежать дублей
  const translatedMessagesRef = useRef<Set<number>>(new Set());
  // Ref для отслеживания переводов, которые сейчас выполняются (для блокировки повторных)
  const translatingMessagesRef = useRef<Set<number>>(new Set());

  // memoized messages to prevent unnecessary MessageList re-renders (Optimization A)
  const memoizedMessages = useMemo(() => messages, [messages]);

  const fetchChats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await chatsApi.getAll();
      // Сортируем чаты по updated_at DESC (новые сверху)
      const sortedChats = [...response.data].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setChats(sortedChats);
      
      // Select current chat
      if (chatId) {
        const selectedChat = response.data.find((c: Chat) => c.id === parseInt(chatId));
        if (selectedChat) {
          setCurrentChat(selectedChat);
          // Сбрасываем lastMessageIdRef при переключении чата
          lastMessageIdRef.current = null;
        }
      } else if (response.data.length > 0) {
        // Select first chat (most recent due to sorting) if none selected
        setCurrentChat(response.data[0]);
        navigate(`/chats/${response.data[0].id}`);
        // Сбрасываем lastMessageIdRef при выборе нового чата
        lastMessageIdRef.current = null;
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Требуется авторизация');
        navigate('/login');
      } else {
        console.error('Error fetching chats:', err);
        setError(err.response?.data?.message || 'Ошибка при загрузке чатов');
      }
    } finally {
      setIsLoading(false);
    }
  }, [chatId, navigate]);

  const fetchMessages = useCallback(async (showLoading: boolean = true) => {
    if (!chatId) return;
    
    try {
      if (showLoading) {
        setIsChatLoading(true);
      }
      
      const response = await chatsApi.getMessages(parseInt(chatId));
      setMessages(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login');
      } else {
        console.error('Error fetching messages:', err);
      }
    } finally {
      if (showLoading) {
        setIsChatLoading(false);
      }
    }
  }, [chatId, navigate]);


  // Callbacks для StreamingResponse - обернуты в useCallback чтобы избежать пересоздания
  const handleStreamingComplete = useCallback(async (message: Message) => {
    // Сначала сохраняем ID последнего сообщения для скролла
    const messageId = message.id;
    if (messageId) {
      lastMessageIdRef.current = messageId;
    }

    // Затем обновляем сообщения без показа загрузки
    await fetchMessages(false);
    
    // Play notification sound if enabled
    if (soundEnabled) {
      playNotificationSound(notificationVolume);
    }
    
    // Синхронизация контекста после завершения генерации
    syncContextStats();
    // useEffect автоматически скроллит к новому сообщению
    setIsStreaming(false);
    setIsSending(false);
    
    // Возвращаем фокус в поле ввода после завершения генерации
    // Небольшая задержка чтобы DOM успел обновиться
    setTimeout(() => {
      setInputAutoFocus(true);
    }, 100);

    // Автоматический запуск LLM-перевода для ответа LLM (EN -> DisplayLang), если провайдер LLM
    // ВАЖНО: Запускаем ПОСЛЕ всех setState чтобы модалка открылась сразу
    // НО: если сервер уже прислал перевод через SSE (message.translated_content), не запускаем модалку
    const serverTranslation = message.translated_content;
    const hasServerTranslation = serverTranslation && serverTranslation.trim() !== '' && serverTranslation !== message.content;
    
    // Также проверяем флаг серверного стриминга перевода (предотвращает дубль)
    const hasStreamingTranslation = streamingTranslationStartedRef.current;
    
    if (translationEnabled && translationProvider === 'llm' && messageId && !hasServerTranslation && !hasStreamingTranslation) {
      if (!translatedMessagesRef.current.has(messageId)) {
        translatedMessagesRef.current.add(messageId);
        const displayLang = (window as any).__translationDisplayLang || 'ru';
        const translationData = {
          text: message.content,
          sourceLang: 'en',
          targetLang: displayLang,
          messageId,
        };
        
        // Если уже открыто окно перевода сообщения, сохраняем в очередь
        if (userMessageTranslationRef.current) {
          pendingLlmResponseTranslationRef.current = translationData;
        } else {
          setLlmResponseTranslation(translationData);
        }
      }
    }
  }, [fetchMessages, syncContextStats, soundEnabled, translationEnabled, translationProvider]);

  const handleStreamingError = useCallback(async (errorMessage: string) => {
    console.error('[ChatPage] Streaming error:', errorMessage);
    // Не вызываем fetchMessages здесь - ошибка должна оставаться видимой
    // Сообщения из БД не будут затерты, так как при ошибке LLM новое сообщение не создаётся
    setIsStreaming(false);
    setIsSending(false);
  }, []);

  const handleStreamingStop = useCallback(async () => {
    await fetchMessages(false);
    setIsStreaming(false);
    setIsSending(false);
  }, [fetchMessages]);

  const fetchCharacters = useCallback(async () => {
    try {
      const response = await charactersApi.getAll();
      setCharacters(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login');
      } else {
        console.error('Error fetching characters:', err);
      }
    }
  }, [navigate]);

  useEffect(() => {
    fetchChats();
    fetchCharacters();
  }, [fetchChats, fetchCharacters]);

  useEffect(() => {
    if (chatId) {
      // Сбрасываем lastMessageIdRef при изменении chatId
      lastMessageIdRef.current = null;
      fetchMessages();
      // Загружаем блоки сжатия для текущего чата
      loadBlocks();
      // Проверяем необходимость сжатия
      checkNeedsCompression();
    }
  }, [chatId, fetchMessages, loadBlocks, checkNeedsCompression]);

  // Load user settings (including sound notification preference)
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await settingsApi.getAll();
        const data = response.data;
        if (data.sound_enabled !== undefined) {
          setSoundEnabled(data.sound_enabled === 'true');
        }
        if (data.notification_volume !== undefined) {
          setNotificationVolume(parseInt(data.notification_volume) || 70);
        }
        if (data.translation_enabled !== undefined) {
          setTranslationEnabled(data.translation_enabled === 'true');
        }
        if (data.translation_provider) {
          setTranslationProvider(data.translation_provider);
        }
        // Load translation provider from dedicated endpoint - this should take precedence
        try {
          const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
          const transResponse = await fetch('/api/translate/settings', {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
           if (transResponse.ok) {
             const transData = await transResponse.json();
             if (transData?.provider) {
               setTranslationProvider(transData.provider);
             }
             if (transData?.displayLang) {
               // Store for LLM translation
               (window as any).__translationDisplayLang = transData.displayLang;
             }
           }
        } catch (transErr) {
          console.warn('Failed to load translation provider:', transErr);
        }
        if (data.compression_method !== undefined) {
          setCompressionMethod(data.compression_method as CompressionMethod);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };
    loadSettings();
  }, []);

  // Ref для хранения текущего значения ввода (для handleSendMessage)
  const currentInputRef = useRef<string>('');
  
  // Обработчик открытия мобильного модального окна — копирует текущий текст из основного поля
  const handleOpenMobileInputModal = useCallback(() => {
    // Копируем текущее значение из основного поля ввода в состояние модального окна
    setMobileModalValue(currentInputRef.current);
    setShowMobileInputModal(true);
  }, []);
  
  // State для управления очисткой поля ввода и фокусом
  const [inputClearKey, setInputClearKey] = useState(0);
  const [inputAutoFocus, setInputAutoFocus] = useState(false);
  
  const handleSendMessage = useCallback(async () => {
    const messageToSend = currentInputRef.current.trim();
    if (!messageToSend || !chatId || isSending || isStreaming) return;
    
    // Сбрасываем состояние showThinking для нового стримингового сообщения
    streamingMessageThinkingRef.current = false;
    
    setIsSending(true);
    
    try {
      // Отправляем сообщение на сервер
      await chatsApi.sendMessage(parseInt(chatId), {
        content: messageToSend,
        role: 'user',
      });
      // Сбрасываем значение ввода
      currentInputRef.current = '';

      // Fetch updated messages без показа загрузки
      await fetchMessages(false);
      
      // Обновляем статистику токенов после отправки сообщения
      await syncContextStats();
      
      // Start streaming response
      setIsStreaming(true);
      
      // Очищаем поле ввода после отправки (смена key заставит React пересоздать input)
      setInputClearKey(prev => prev + 1);
      // Снимаем фокус во время стриминга
      setInputAutoFocus(false);

      // Примечание: перевод сообщения пользователя выполняется автоматически на сервере
      // в chats.ts (translateForUser). Клиентский перевод здесь не нужен, чтобы избежать дублирования.
    } catch (err: any) {
      console.error('Error sending message:', err);
      setIsSending(false);
    }
  }, [chatId, isSending, isStreaming, fetchMessages, syncContextStats, translationEnabled, translationProvider]);

  // Callback для ChatInputArea
  const handleInputChanged = useCallback((value: string) => {
    currentInputRef.current = value;
  }, []);

  const handleRegenerate = async (messageId: number) => {
    if (!chatId || isStreaming) return;
    
    // Сбрасываем состояние showThinking для нового стримингового сообщения
    streamingMessageThinkingRef.current = false;
    
    try {
      // Delete the last assistant message
      await chatsApi.deleteMessage(parseInt(chatId), messageId);
      
      // Сбрасываем lastMessageIdRef, чтобы useEffect не пытался скроллить к удалённому сообщению
      lastMessageIdRef.current = null;
      
      // Fetch updated messages without showing loading
      await fetchMessages(true);
      
      // Обновляем статистику токенов после удаления сообщения
      await syncContextStats();
      
      // Start streaming response - server will find the last user message from DB
      setIsStreaming(true);
    } catch (err: any) {
      console.error('Error regenerating:', err);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!chatId) return;
    
    try {
      await chatsApi.deleteMessage(parseInt(chatId), messageId);
      // Сбрасываем lastMessageIdRef, чтобы useEffect не пытался скроллить к удалённому сообщению
      lastMessageIdRef.current = null;
      // Fetch updated messages without showing loading
      await fetchMessages(true);
      // Обновляем статистику токенов после удаления сообщения
      await syncContextStats();
    } catch (err: any) {
      console.error('Error deleting message:', err);
    }
  };

  const handleEditMessage = async (messageId: number, newContent: string, otherContent?: string, editingTranslated?: boolean) => {
    if (!chatId) return;

    try {
      // Находим редактируемое сообщение
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      // Для LLM провайдера открываем модальное окно перевода (клиентский стриминг)
      // чтобы пользователь видел процесс перевода в реальном времени
      if (translationProvider === 'llm' && newContent.length >= 3) {
        const displayLang = (window as any).__translationDisplayLang || 'ru';

        // Модель данных:
        // User:      content = DisplayLang (RU),  translated_content = EN
        // Assistant: content = EN,                translated_content = DisplayLang (RU)
        //
        // Пользователь всегда видит свой язык по умолчанию:
        // User:      видит content (RU)
        // Assistant: видит translated_content (RU)
        //
        // editingTranslated=true  → редактируем translated_content
        // editingTranslated=false → редактируем content

        const isUser = message.role === 'user';

        // Определяем:
        // 1) Какое поле было отредактировано (save this immediately)
        // 2) Какое поле нужно заполнить результатом перевода
        // 3) Направление перевода

        let editedField: 'content' | 'translated_content';
        let targetField: 'content' | 'translated_content';
        let sourceLang: string;
        let targetLang: string;

        if (editingTranslated) {
          // Редактируем translated_content
          editedField = 'translated_content';
          targetField = 'content';

          if (isUser) {
            // User edited translated_content (EN) → translate to content (DisplayLang)
            sourceLang = 'en';
            targetLang = displayLang;
          } else {
            // Assistant edited translated_content (DisplayLang) → translate to content (EN)
            sourceLang = displayLang;
            targetLang = 'en';
          }
        } else {
          // Редактируем content
          editedField = 'content';
          targetField = 'translated_content';

          if (isUser) {
            // User edited content (DisplayLang) → translate to translated_content (EN)
            sourceLang = displayLang;
            targetLang = 'en';
          } else {
            // Assistant edited content (EN) → translate to translated_content (DisplayLang)
            sourceLang = 'en';
            targetLang = displayLang;
          }
        }

        // Сохраняем отредактированное поле сразу
        await chatsApi.updateMessage(parseInt(chatId), messageId, {
          [editedField]: newContent,
        });

        translatingMessagesRef.current.add(messageId);

        // Создаем inline-обработчик который сохраняет результат в ПРАВИЛЬНОЕ поле
        const handleEditTranslationComplete = async (translatedText: string) => {
          try {
            await chatsApi.updateMessage(parseInt(chatId), messageId, {
              [targetField]: translatedText,
            });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, [targetField]: translatedText } : m
              )
            );
          } catch (err: any) {
            console.error('Error saving edit translation:', err);
          } finally {
            translatedMessagesRef.current.add(messageId);
            translatingMessagesRef.current.delete(messageId);
            // Закрыть модалку (сбросить оба состояния на случай неясно какое использовалось)
            setUserMessageTranslation(null);
            setLlmResponseTranslation(null);
            setTimeout(async () => {
              await syncContextStats();
            }, 300);
          }
        };

        // Устанавливаем кастомный callback для редактирования
        // чтобы результат перевода был сохранен в ПРАВИЛЬНОЕ поле (content или translated_content)
        editTranslationCallbackRef.current = {
          messageId,
          targetField,
          onComplete: handleEditTranslationComplete,
        };

        // Открываем модалку перевода
        // Используем setLlmResponseTranslation для sourceLang='en' (EN→DisplayLang)
        // и setUserMessageTranslation для sourceLang≠'en' (DisplayLang→EN)
        if (sourceLang === 'en') {
          setLlmResponseTranslation({
            text: newContent,
            sourceLang,
            targetLang,
            messageId,
          });
        } else {
          setUserMessageTranslation({
            text: newContent,
            sourceLang,
            targetLang,
            messageId,
          });
        }

        await fetchMessages(false);
        return;
      }

      // Для не-LLM провайдеров используем серверный перевод (один HTTP запрос)
      setTranslatingMessageId(messageId);
      try {
        const response = await chatsApi.translateMessageBidirectional(parseInt(chatId), messageId, {
          content: newContent,
          translated_content: otherContent,
        });

        // Обновляем сообщение в списке локально
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, ...response.data } : m
          )
        );

        // После перевода сообщения обновляем статистику токенов
        await syncContextStats();
      } catch (translateErr: any) {
        console.error('Error translating message:', translateErr);
        // Если ошибка перевода, пробуем просто обновить сообщение
        await chatsApi.updateMessage(parseInt(chatId), messageId, {
          content: newContent,
        });
        await fetchMessages(false);
      } finally {
        setTranslatingMessageId(null);
      }
    } catch (err: any) {
      console.error('Error editing message:', err);
    }
  };

  const handleToggleThinking = (messageId: number) => {
    setShowThinking((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const handleStreamingToggleThinking = () => {
    streamingMessageThinkingRef.current = !streamingMessageThinkingRef.current;
    // Триггерим ре-рендер ChatPage чтобы обновить prop showThinking в StreamingResponse
    forceUpdate((prev) => prev + 1);
  };

  const handleTranslateMessage = async (messageId: number) => {
    if (!chatId) return;

    // Find the message to translate
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    // To ensure UI is in sync with server settings, we fetch latest provider
    let currentProvider = translationProvider;
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const transResponse = await fetch('/api/translate/settings', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (transResponse.ok) {
        const transData = await transResponse.json();
        if (transData?.provider) {
          currentProvider = transData.provider;
          if (currentProvider !== translationProvider) {
            setTranslationProvider(currentProvider);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to sync translation provider, using local state:', err);
    }

    // Check if LLM provider is active
    if (currentProvider === 'llm') {
      const displayLang = (window as any).__translationDisplayLang || 'ru';
      const sourceLang = message.role === 'user' ? displayLang : 'en';
      const targetLang = message.role === 'user' ? 'en' : displayLang;

      // Используем appropriate state в зависимости от роли сообщения
      if (message.role === 'user') {
        setUserMessageTranslation({
          text: message.content,
          sourceLang,
          targetLang,
          messageId,
        });
      } else {
        setLlmResponseTranslation({
          text: message.content,
          sourceLang,
          targetLang,
          messageId,
        });
      }
      return;
    }

    // Default: use standard translation API
    setTranslatingMessageId(messageId);
    try {
      const response = await chatsApi.translateMessage(parseInt(chatId), messageId);
      // Обновляем сообщение в списке локально
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, translated_content: response.data.translated_content } : m
        )
      );
      // После перевода сообщения обновляем статистику токенов
      await syncContextStats();
    } catch (err: any) {
      console.error('Error translating message:', err);
    } finally {
      setTranslatingMessageId(null);
    }
  };

  // LLM translation callbacks - обрабатывают оба типа переводов
  const handleUserMessageTranslationComplete = async (translatedText: string) => {
    // Проверяем, есть ли кастомный callback для редактирования
    if (editTranslationCallbackRef.current && userMessageTranslation && editTranslationCallbackRef.current.messageId === userMessageTranslation.messageId) {
      const callback = editTranslationCallbackRef.current;
      editTranslationCallbackRef.current = null;
      await callback.onComplete(translatedText);
      setUserMessageTranslation(null);
      return;
    }

    if (!userMessageTranslation || !chatId) return;
    const { messageId } = userMessageTranslation;

    // Update the message with translated content via API
    try {
      await chatsApi.updateMessage(parseInt(chatId), messageId, {
        translated_content: translatedText,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, translated_content: translatedText } : m
        )
      );
    } catch (err: any) {
      console.error('Error saving LLM translation:', err);
    } finally {
      // Помечаем сообщение как переведённое
      translatedMessagesRef.current.add(messageId);
      // Удаляем из списка переводящихся
      translatingMessagesRef.current.delete(messageId);
      
      setUserMessageTranslation(null);
      
      // Синхронизация контекста с задержкой чтобы сервер успел пересчитать токены
      // (избегает гонки: клиент запрашивает stats до обновления сервером контекстного окна)
      setTimeout(async () => {
        await syncContextStats();
      }, 300);
      
      // Проверяем, есть ли ожидающий перевод ответа LLM в очереди
      if (pendingLlmResponseTranslationRef.current) {
        const pendingTranslation = pendingLlmResponseTranslationRef.current;
        pendingLlmResponseTranslationRef.current = null;
        // Небольшая задержка перед открытием следующего окна
        setTimeout(() => {
          setLlmResponseTranslation(pendingTranslation);
        }, 300);
      }
    }
  };

  const handleLlmResponseTranslationComplete = async (translatedText: string) => {
    // Проверяем, есть ли кастомный callback для редактирования
    if (editTranslationCallbackRef.current && llmResponseTranslation && editTranslationCallbackRef.current.messageId === llmResponseTranslation.messageId) {
      const callback = editTranslationCallbackRef.current;
      editTranslationCallbackRef.current = null;
      await callback.onComplete(translatedText);
      setLlmResponseTranslation(null);
      return;
    }

    if (!llmResponseTranslation || !chatId) return;
    const { messageId } = llmResponseTranslation;

    // Update the message with translated content via API
    try {
      await chatsApi.updateMessage(parseInt(chatId), messageId, {
        translated_content: translatedText,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, translated_content: translatedText } : m
        )
      );
    } catch (err: any) {
      console.error('Error saving LLM translation:', err);
    } finally {
      // Помечаем сообщение как переведённое
      translatedMessagesRef.current.add(messageId);
      // Удаляем из списка переводящихся
      translatingMessagesRef.current.delete(messageId);
      
      setLlmResponseTranslation(null);
      
      // Синхронизация контекста с задержкой чтобы сервер успел пересчитать токены
      setTimeout(async () => {
        await syncContextStats();
      }, 300);
    }
  };

  const handleLlmTranslationCancel = () => {
    // Удаляем из списка переводящихся при отмене
    if (userMessageTranslation) {
      translatingMessagesRef.current.delete(userMessageTranslation.messageId);
    }
    if (llmResponseTranslation) {
      translatingMessagesRef.current.delete(llmResponseTranslation.messageId);
    }
    if (streamingTranslation) {
      translatingMessagesRef.current.delete(streamingTranslationMessageIdRef.current || 0);
    }
    
    // Сбрасываем все состояния
    setUserMessageTranslation(null);
    setLlmResponseTranslation(null);
    setStreamingTranslation(null);
    setUserStreamingTranslation(null);
    streamingTranslationMessageIdRef.current = null;
  };

  // Callbacks для стриминга перевода через SSE (от сервера)
  const handleTranslationStart = useCallback((data: { from: string; to: string; text: string }) => {
    // Помечаем что серверный стриминг перевода уже запущен (предотвращает дубль в handleStreamingComplete)
    streamingTranslationStartedRef.current = true;
    // Открываем модалку стримингового перевода
    setStreamingTranslation({
      text: data.text,
      sourceLang: data.from,
      targetLang: data.to,
      displayText: '',
      reasoningText: '',
      status: 'translating',
    });
    // messageId будет установлен в handleStreamingComplete через messageIdRef
  }, []);

  const handleTranslationToken = useCallback((token: string) => {
    setStreamingTranslation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        displayText: prev.displayText + token,
      };
    });
  }, []);

  // Reasoning токены при переводе (мысли модели) — накапливаем отдельно
  const handleTranslationReasoningToken = useCallback((token: string) => {
    setStreamingTranslation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        reasoningText: prev.reasoningText + token,
      };
    });
  }, []);

  const handleTranslationDone = useCallback((translatedText: string) => {
    setStreamingTranslation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        displayText: translatedText,
        status: 'done',
      };
    });
  }, []);

  // === Обработчики перевода сообщения пользователя ===
  const handleUserTranslationStart = useCallback((data: { from: string; to: string; text: string }) => {
    // Находим ID последнего сообщения пользователя для локального обновления
    // (findLast не поддерживается в текущем target, используем обратный проход)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userStreamingTranslationMessageIdRef.current = messages[i].id;
        break;
      }
    }
    setUserStreamingTranslation({
      text: data.text,
      sourceLang: data.from,
      targetLang: data.to,
      displayText: '',
      reasoningText: '',
      status: 'translating',
    });
  }, [messages]);

  const handleUserTranslationToken = useCallback((token: string) => {
    setUserStreamingTranslation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        displayText: prev.displayText + token,
      };
    });
  }, []);

  const handleUserTranslationReasoningToken = useCallback((token: string) => {
    setUserStreamingTranslation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        reasoningText: prev.reasoningText + token,
      };
    });
  }, []);

  const handleUserTranslationDone = useCallback((translatedText: string) => {
    setUserStreamingTranslation(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        displayText: translatedText,
        status: 'done',
      };
    });
  }, []);

  // Callback когда стриминговый перевод завершён (модалка закрывается автоматически)
  const handleStreamingTranslationComplete = useCallback(async (translatedText: string) => {
    if (!chatId) return;
    const messageId = streamingTranslationMessageIdRef.current;
    
    // Сохраняем перевод в БД
    if (messageId) {
      try {
        await chatsApi.updateMessage(parseInt(chatId), messageId, {
          translated_content: translatedText,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, translated_content: translatedText } : m
          )
        );
        translatedMessagesRef.current.add(messageId);
        translatingMessagesRef.current.delete(messageId);
      } catch (err: any) {
        console.error('Error saving streaming translation:', err);
      }
    }
    
    setStreamingTranslation(null);
    streamingTranslationMessageIdRef.current = null;
    streamingTranslationStartedRef.current = false;
    
    // Синхронизация контекста с задержкой чтобы сервер успел пересчитать токены
    setTimeout(async () => {
      await syncContextStats();
    }, 300);
  }, [chatId, syncContextStats]);

  const handleSelectChat = (chat: Chat) => {
    setCurrentChat(chat);
    navigate(`/chats/${chat.id}`);
    // Сбрасываем lastMessageIdRef при переключении чата
    lastMessageIdRef.current = null;
    setShowSidebar(false);
  };

  const handleDeleteChat = async () => {
    if (!currentChat) return;
    
    try {
      await chatsApi.delete(currentChat.id);
      // Remove from chats list
      setChats((prev) => prev.filter((c) => c.id !== currentChat.id));
      // Clear current chat and messages
      setCurrentChat(null);
      setMessages([]);
      // Redirect to chats list
      navigate('/chats');
    } catch (err: any) {
      console.error('Error deleting chat:', err);
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const handleToggleHeaderFooter = () => {
    setShowHeaderFooter((prev) => !prev);
  };

  // Handlers для сжатия истории
  const handleManualCompressClick = useCallback(() => {
    if (!currentChatId) return;
    setShowCompressionConfirm(true);
  }, [currentChatId]);

  const handleManualCompressConfirm = useCallback(async () => {
    setShowCompressionConfirm(false);
    if (!currentChatId) return;
    const result = await compress(compressionMethod);
    // После сжатия обновляем сообщения без показа загрузки
    if (result) {
      await fetchMessages(false);
    }
  }, [currentChatId, compress, fetchMessages, compressionMethod]);

  const handleManualCompressCancel = useCallback(() => {
    setShowCompressionConfirm(false);
  }, []);

  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingBlock(null);
  }, []);

  const handleEditBlock = useCallback((blockId: number, updates: { title?: string; summary?: string }) => {
    // Находим блок по ID и открываем модальное окно
    const blockToEdit = blocks.find((b) => b.id === blockId);
    if (blockToEdit) {
      setEditingBlock({ ...blockToEdit, title: updates.title ?? blockToEdit.title, summary: updates.summary ?? blockToEdit.summary });
      setIsEditModalOpen(true);
    }
  }, [blocks]);

  const handleExpandBlock = useCallback((block: ChatBlockWithParsedIds) => {
    // Этот обработчик будет использоваться MessageList для управления состоянием развертывания
    // Состояние развертывания управляется внутри MessageList
    console.log('Expand block:', block.id);
  }, []);

  const handleToggleBlockCompression = useCallback(async (blockId: number, isCompressed: boolean) => {
    await toggleCompression(blockId, isCompressed);
  }, [toggleCompression]);

  const handleDeleteBlock = useCallback(async (blockId: number) => {
    await deleteBlock(blockId);
  }, [deleteBlock]);

  const handleBlockUpdate = useCallback((_blockId: number, _updatedBlock: ChatBlockWithParsedIds) => {
    // Обновляем блок в списке после перевода
    setMessages((prev) => prev); // Force re-render to pick up updated blocks
  }, []);

  const handleStartSelection = useCallback(() => {
    startSelection();
  }, [startSelection]);

  const handleCancelSelection = useCallback(() => {
    cancelSelection();
  }, [cancelSelection]);

  const handleCompressionSelectionClick = useCallback((messageId: number) => {
    handleSelectionClick(messageId);
  }, [handleSelectionClick]);

  const getCharacterById = (id: number) => {
    return characters.find((c) => c.id === id);
  };

  const getCurrentChatTitle = () => {
    if (!currentChat) return 'Чат';
    const character = getCharacterById(currentChat.character_id);
    return character?.name || currentChat.title || 'Чат';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-white"
          >
            Перейти на страницу входа
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex">
      {/* Sidebar overlay for mobile */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar - статичный список чатов */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-[60] w-72 bg-gray-800/50 border-r border-gray-700 transform transition-transform duration-300 ${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 flex flex-col`}
      >
        {/* Sidebar header */}
        <div className="shrink-0 p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Чаты</h2>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {chats.map((chat) => {
              const character = getCharacterById(chat.character_id);
              const isActive = chat.id === currentChat?.id;
              
              return (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat)}
                  className={`w-full p-3 rounded-lg text-left transition ${
                    isActive
                      ? 'bg-gray-600/30 border border-gray-500'
                      : 'bg-gray-700/30 hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                      {character?.avatar ? (
                        <img
                          src={character.avatar}
                          alt={character.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-white font-bold">
                          {character?.name?.charAt(0).toUpperCase() || 'C'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {character?.name || 'Новый чат'}
                      </p>
                      <p className="text-gray-400 text-sm truncate">
                        {formatLastMessageDate(chat.updated_at)}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Chat header */}
        <div className={`shrink-0 transition-all duration-300 chat-header ${
          showHeaderFooter ? 'block' : 'hidden'
        }`}>
          {/* Панель с кнопками для мобильных (гамбургер + кнопки управления) */}
          <div className="md:hidden flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Кнопка гамбургер для мобильных */}
              <button
                onClick={() => setShowSidebar(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition"
                title="Открыть список чатов"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Кнопка ручного сжатия истории */}
              <button
                onClick={handleManualCompressClick}
                className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded-lg transition"
                title="Сжать историю"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
              {/* Кнопка ручного выделения для сжатия */}
              <button
                onClick={handleStartSelection}
                disabled={isSelectionMode}
                className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded-lg transition disabled:opacity-50"
                title="Выделить сообщения для сжатия"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {currentChat && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition"
                  title="Удалить чат"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {/* Панель с кнопками для десктопа (без гамбургера) */}
          <div className="hidden md:flex md:items-center md:justify-between md:px-4 py-2 border-b border-gray-700/30">
            <div className="flex items-center gap-2">
              {/* Кнопка ручного сжатия истории */}
              <button
                onClick={handleManualCompressClick}
                className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded-lg transition"
                title="Сжать историю"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
              {/* Кнопка ручного выделения для сжатия */}
              <button
                onClick={handleStartSelection}
                disabled={isSelectionMode}
                className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/30 rounded-lg transition disabled:opacity-50"
                title="Выделить сообщения для сжатия"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {currentChat && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded-lg transition"
                  title="Удалить чат"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {/* AppHeader (мобильная и десктопная навигация) */}
          <AppHeader title={getCurrentChatTitle()} />
          {/* Статистика токенов */}
          {currentChat && showHeaderFooter && (
            <div className="w-full px-4 py-2 border-b border-gray-700/30 context-stats-container">
              <ContextStatsDisplay stats={contextStats} isLoading={isContextLoading} />
            </div>
          )}
        </div>

        {/* Messages area - removed overflow-y-auto, MessageList handles its own scrolling */}
        <div className="flex-1 overflow-hidden">
          {!currentChat ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
                </svg>
                <p className="text-gray-400">Выберите чат или создайте новый</p>
              </div>
            </div>
          ) : isChatLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-400">Загрузка сообщений...</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
                </svg>
                <p className="text-gray-400">Начните разговор!</p>
              </div>
            </div>
          ) : (
            <>
               <MessageList
                  key={currentChat?.id}
                  messages={memoizedMessages}
                  onRegenerate={handleRegenerate}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  showThinking={showThinking}
                  onToggleThinking={handleToggleThinking}
                  translatingMessageId={translatingMessageId}
                  onTranslate={handleTranslateMessage}
                  translationEnabled={translationEnabled}
                  // Пропсы для сжатия истории
                  blocks={blocks}
                  onEditBlock={handleEditBlock}
                  onToggleBlockCompression={handleToggleBlockCompression}
                  onDeleteBlock={handleDeleteBlock}
                  onExpandBlock={handleExpandBlock}
                  onBlockUpdate={handleBlockUpdate}
                  isSelectionMode={isSelectionMode}
                  selectionStart={selectionStart}
                  selectionEnd={selectionEnd}
                  onMessageSelectionClick={handleCompressionSelectionClick}
                  onCancelSelection={handleCancelSelection}
                />
              {/* Streaming response */}
              {isStreaming && (
                <div className="shrink-0 mt-4 bg-gray-800/30 border-t border-gray-700 p-4">
                  <StreamingResponse
                    chatId={parseInt(chatId || '0')}
                    onStop={handleStreamingStop}
                    onComplete={handleStreamingComplete}
                    onError={handleStreamingError}
                    showThinking={streamingMessageThinkingRef.current}
                    onToggleThinking={handleStreamingToggleThinking}
                    onTranslationStart={handleTranslationStart}
                    onTranslationToken={handleTranslationToken}
                    onTranslationReasoningToken={handleTranslationReasoningToken}
                    onTranslationDone={handleTranslationDone}
                    onUserTranslationStart={handleUserTranslationStart}
                    onUserTranslationToken={handleUserTranslationToken}
                    onUserTranslationReasoningToken={handleUserTranslationReasoningToken}
                    onUserTranslationDone={handleUserTranslationDone}
                    onMessageId={(id) => { streamingTranslationMessageIdRef.current = id; }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Message input - изолированный компонент с useTransition */}
        <div className={`shrink-0 border-t border-gray-700 p-4 chat-footer ${
          showHeaderFooter ? 'flex' : 'hidden'
        }`}>
          <ChatInputArea
            key={inputClearKey}
            onChange={handleInputChanged}
            onSend={handleSendMessage}
            disabled={isSending || isStreaming || !currentChat}
            placeholder="Введите сообщение..."
            showMobileModal={true}
            onOpenMobileModal={handleOpenMobileInputModal}
            autoFocus={inputAutoFocus}
          />
        </div>
      </div>

     {/* Toggle header/footer button - mobile only */}
        <button
          onClick={handleToggleHeaderFooter}
          className="fixed bottom-[calc(80px+1rem)] right-4 z-50 md:hidden w-12 h-12 rounded-full bg-gray-700/70 hover:bg-gray-600/80 backdrop-blur-sm shadow-lg flex items-center justify-center text-white transition-all duration-300"
          title={showHeaderFooter ? 'Скрыть хедер и футер' : 'Показать хедер и футер'}
        >
          {showHeaderFooter ? (
            // Eye off icon (hide)
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          ) : (
            // Eye on icon (show)
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          )}
        </button>

      {/* Edit block modal */}
       {isEditModalOpen && editingBlock && (
         <EditBlockModal
           block={editingBlock}
           onSave={async (blockId, updates) => {
             await editBlock(blockId, updates);
             handleCloseEditModal();
             // После успешного сохранения обновляем блоки
             await loadBlocks();
           }}
           onCancel={handleCloseEditModal}
           onTranslate={async (bId: number) => {
             try {
               await compressionApi.translateBlock(bId);
               await loadBlocks();
             } catch (error) {
               console.error('[ChatPage] Error translating block:', error);
             }
           }}
         />
       )}

      {/* Mobile message input modal */}
      <MobileMessageInputModal
        isOpen={showMobileInputModal}
        value={mobileModalValue}
        onChange={(val) => {
          // Обновляем текущее значение ввода из модального окна
          currentInputRef.current = val;
        }}
        onSend={handleSendMessage}
        onClose={() => setShowMobileInputModal(false)}
        placeholder="Введите сообщение..."
      />

      {/* Delete confirmation modal */}
        {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-xl font-bold text-white mb-2">Удалить чат?</h3>
            <p className="text-gray-400 mb-6">
              Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteChat}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition"
              >
                Удалить
              </button>
              <button
                onClick={handleCancelDelete}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-white font-medium transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compression confirm modal - показываем только когда нужно */}
      {showCompressionConfirm && (
        <CompressionConfirmModal
          onConfirm={handleManualCompressConfirm}
          onCancel={handleManualCompressCancel}
          isCompressing={isCompressing}
        />
      )}

      {/* Compression progress overlay */}
      <CompressionProgressOverlay
        isOpen={isCompressing}
        progress={compressionProgress}
      />

      {/* LLM Translation Modal - показываем только одно окно за раз
          Приоритет: перевод сообщения пользователя (SSE) > стриминговый перевод ответа > сообщение пользователя > ответ LLM */}
      {userStreamingTranslation ? (
        <LLMTranslationModal
          key={`user-streaming`}
          text={userStreamingTranslation.text}
          sourceLang={userStreamingTranslation.sourceLang}
          targetLang={userStreamingTranslation.targetLang}
          onComplete={(translatedText) => {
            // Перевод сообщения пользователя завершён — закрываем модалку
            // и обновляем конкретное сообщение локально (не вызываем fetchMessages
            // чтобы не увидеть пустое сообщение ассистента до завершения генерации)
            const msgId = userStreamingTranslationMessageIdRef.current;
            if (msgId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msgId ? { ...m, translated_content: translatedText } : m
                )
              );
            }
            setUserStreamingTranslation(null);
            userStreamingTranslationMessageIdRef.current = null;
          }}
          onCancel={() => {
            setUserStreamingTranslation(null);
            userStreamingTranslationMessageIdRef.current = null;
          }}
          externalStream={{
            displayText: userStreamingTranslation.displayText,
            reasoningText: userStreamingTranslation.reasoningText,
            status: userStreamingTranslation.status,
            errorMessage: userStreamingTranslation.errorMessage,
          }}
        />
      ) : streamingTranslation ? (
        <LLMTranslationModal
          key={`streaming-${streamingTranslationMessageIdRef.current}`}
          text={streamingTranslation.text}
          sourceLang={streamingTranslation.sourceLang}
          targetLang={streamingTranslation.targetLang}
          onComplete={handleStreamingTranslationComplete}
          onCancel={handleLlmTranslationCancel}
          externalStream={{
            displayText: streamingTranslation.displayText,
            reasoningText: streamingTranslation.reasoningText,
            status: streamingTranslation.status,
            errorMessage: streamingTranslation.errorMessage,
          }}
        />
      ) : userMessageTranslation ? (
        <LLMTranslationModal
          key={`user-${userMessageTranslation.messageId}`}
          text={userMessageTranslation.text}
          sourceLang={userMessageTranslation.sourceLang}
          targetLang={userMessageTranslation.targetLang}
          onComplete={handleUserMessageTranslationComplete}
          onCancel={handleLlmTranslationCancel}
        />
      ) : llmResponseTranslation ? (
        <LLMTranslationModal
          key={`llm-${llmResponseTranslation.messageId}`}
          text={llmResponseTranslation.text}
          sourceLang={llmResponseTranslation.sourceLang}
          targetLang={llmResponseTranslation.targetLang}
          onComplete={handleLlmResponseTranslationComplete}
          onCancel={handleLlmTranslationCancel}
        />
      ) : null}
    </div>
  );
};

export default ChatPage;