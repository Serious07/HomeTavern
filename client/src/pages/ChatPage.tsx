import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chatsApi, charactersApi } from '../services/api';
import { Chat, Message, Character } from '../types';
import MessageList from '../components/chat/MessageList';
import StreamingResponse from '../components/chat/StreamingResponse';

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
  const [messageInput, setMessageInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showThinking, setShowThinking] = useState<Record<number, boolean>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
 const [translatingMessageId, setTranslatingMessageId] = useState<number | null>(null);
 
 const messagesEndRef = useRef<HTMLDivElement>(null);
 const messageInputRef = useRef<HTMLTextAreaElement>(null);

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
        }
      } else if (response.data.length > 0) {
        // Select first chat if none selected
        setCurrentChat(response.data[0]);
        navigate(`/chats/${response.data[0].id}`);
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

  const fetchMessages = useCallback(async () => {
    if (!chatId) return;
    
    try {
      setIsChatLoading(true);
      const response = await chatsApi.getMessages(parseInt(chatId));
      setMessages(response.data);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/login');
      } else {
        console.error('Error fetching messages:', err);
      }
    } finally {
      setIsChatLoading(false);
    }
  }, [chatId, navigate]);

  // Callbacks для StreamingResponse - обернуты в useCallback чтобы избежать пересоздания
  const handleStreamingComplete = useCallback(async (_message: Message) => {
    // Сначала обновляем сообщения, потом устанавливаем isStreaming и isSending в false
    await fetchMessages();
    setIsStreaming(false);
    setIsSending(false);
  }, [fetchMessages]);

  const handleStreamingError = useCallback(async (error: string) => {
    console.error('[ChatPage] Streaming error:', error);
    await fetchMessages();
    setIsStreaming(false);
    setIsSending(false);
  }, [fetchMessages]);

  const handleStreamingStop = useCallback(async () => {
    await fetchMessages();
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
      fetchMessages();
    }
  }, [chatId, fetchMessages]);

  // Функция скролла к концу (используется в onTokenUpdate)
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change or streaming starts
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, isStreaming]);

  // Автофокус на поле ввода после окончания стриминга
  useEffect(() => {
    if (!isStreaming && isSending) {
      messageInputRef.current?.focus();
      setIsSending(false);
    }
  }, [isStreaming, isSending]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !chatId || isSending || isStreaming) return;
    
    setIsSending(true);
    const userMessage = messageInput;
    setMessageInput('');

    try {
      // Optimistically add user message
      const tempId = Date.now();
      const newUserMessage: Message = {
        id: tempId,
        chat_id: parseInt(chatId),
        user_id: 0,
        content: userMessage,
        role: 'user',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newUserMessage]);

      // Send message to backend
      await chatsApi.sendMessage(parseInt(chatId), {
        content: userMessage,
        role: 'user',
      });

      // Fetch updated messages
      await fetchMessages();
      
      // Start streaming response
      setIsStreaming(true);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setIsSending(false);
    }
  };

  const handleRegenerate = async (messageId: number) => {
    if (!chatId || isStreaming) return;
    
    try {
      // Delete the last assistant message
      await chatsApi.deleteMessage(parseInt(chatId), messageId);
      
      // Fetch updated messages
      await fetchMessages();
      
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
      await fetchMessages();
    } catch (err: any) {
      console.error('Error deleting message:', err);
    }
  };

  const handleEditMessage = async (messageId: number, newContent: string) => {
    if (!chatId) return;

    try {
      // Сохраняем отредактированное сообщение
      await chatsApi.updateMessage(parseInt(chatId), messageId, {
        content: newContent,
      });

      // Проверяем, является ли сообщение от assistant - для них делаем перевод
      const message = messages.find((m) => m.id === messageId);
      if (message?.role === 'assistant') {
        setTranslatingMessageId(messageId);
        try {
          // Запрашаем перевод нового текста
          const response = await chatsApi.translateMessage(parseInt(chatId), messageId);
          // Обновляем сообщение в списке локально
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
        // Для user сообщений просто обновляем список
        await fetchMessages();
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

  const handleTranslateMessage = async (messageId: number) => {
    if (!chatId) return;

    setTranslatingMessageId(messageId);
    try {
      const response = await chatsApi.translateMessage(parseInt(chatId), messageId);
      // Обновляем сообщение в списке локально
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, translated_content: response.data.translated_content } : m
        )
      );
    } catch (err: any) {
      console.error('Error translating message:', err);
    } finally {
      setTranslatingMessageId(null);
    }
  };

  const handleSelectChat = (chat: Chat) => {
    setCurrentChat(chat);
    navigate(`/chats/${chat.id}`);
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
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-gray-800/50 border-r border-gray-700 transform transition-transform duration-300 ${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 flex flex-col overflow-hidden`}
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

      {/* Main chat area - flex-col с зафиксированным хедером и полем отправки */}
      <div className="flex-1 flex flex-col h-screen">
        {/* Chat header - зафиксирован сверху */}
        <div className="sticky top-0 z-20 bg-gray-800/50 border-b border-gray-700 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSidebar(true)}
              className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-white">{getCurrentChatTitle()}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/hero')}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
              title="Профиль героя"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a5 5 0 00-5 5h10a5 5 0 00-5-5z" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/characters')}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
              title="Персонажи"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
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

        {/* Messages area - скроллим только историю */}
         <div className="flex-1 overflow-y-auto p-4">
           {!currentChat ? (
             <div className="flex items-center justify-center h-full">
               <div className="text-center">
                 <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
                 </svg>
                 <p className="text-gray-400">Выберите чат или создайте новый</p>
               </div>
             </div>
           ) : isChatLoading ? (
             <div className="flex items-center justify-center h-full">
               <div className="text-center">
                 <svg className="animate-spin h-12 w-12 text-gray-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 <p className="text-gray-400">Загрузка сообщений...</p>
               </div>
             </div>
           ) : messages.length === 0 ? (
             <div className="flex items-center justify-center h-full">
               <div className="text-center">
                 <svg className="w-20 h-20 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h13M8 12l-4-4m4 4l4-4m-4 4v10m-4-10H5a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2h-4" />
                 </svg>
                 <p className="text-gray-400">Начните разговор!</p>
               </div>
             </div>
           ) : (
             <MessageList
                 messages={messages}
                 onRegenerate={handleRegenerate}
                 onEdit={handleEditMessage}
                 onDelete={handleDeleteMessage}
                 showThinking={showThinking}
                 onToggleThinking={handleToggleThinking}
                 translatingMessageId={translatingMessageId}
                 onTranslate={handleTranslateMessage}
               />
           )}
           
           {/* Streaming response - ВНУТРИ скроллируемой области, чтобы скролл работал корректно */}
           {isStreaming && (
             <div
               key={`streaming-${chatId}`}
               className="mt-4 bg-gray-800/30 border-t border-gray-700 p-4"
             >
               <StreamingResponse
                 chatId={parseInt(chatId || '0')}
                 onStop={handleStreamingStop}
                 onComplete={handleStreamingComplete}
                 onError={handleStreamingError}
                 onTokenUpdate={scrollToBottom}
               />
             </div>
           )}
           
           <div ref={messagesEndRef} />
         </div>

         {/* Message input - зафиксировано снизу */}
         <div className="shrink-0 bg-gray-800/50 border-t border-gray-700 p-4">
          <div className="flex items-end gap-4">
            <textarea
              ref={messageInputRef}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Введите сообщение..."
              className="w-full flex-1 bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none min-h-[40px]"
              disabled={isSending || isStreaming || !currentChat}
            />
            <button
              onClick={handleSendMessage}
              disabled={isSending || isStreaming || !messageInput.trim() || !currentChat}
              className="p-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default ChatPage;
