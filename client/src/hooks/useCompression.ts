/**
 * Хук для работы с сжатием истории
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatBlock, ChatBlockWithParsedIds, CompressionResult, CompressionSelectedResult, NeedsCompressionResponse, UndoResponse, EditBlockParams, CompressionCompleteEvent, CompressionErrorEvent } from '../types/compression';
import { STORAGE_KEYS } from '../constants/storage';

// Вспомогательная функция для получения заголовков с токеном
const getAuthHeaders = () => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

export interface CompressionProgressState {
  currentBlock: number;
  totalBlocks: number;
  status: string;
  title?: string;
}

export function useCompression(chatId: number | null) {
  const [blocks, setBlocks] = useState<ChatBlockWithParsedIds[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [needsCompression, setNeedsCompression] = useState(false);
  const [compressionPercentage, setCompressionPercentage] = useState(0);
  
  // State для прогресса сжатия (SSE)
  const [compressionProgress, setCompressionProgress] = useState<CompressionProgressState>({
    currentBlock: 0,
    totalBlocks: 0,
    status: '',
  });
  
  // Ref для EventSource (SSE)
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // State для ручного выделения сообщений
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  /**
   * Запустить автоматическое сжатие через SSE (с прогрессом)
   */
  const compress = useCallback(async (): Promise<CompressionResult | null> => {
    if (!chatId) return null;
    
    setIsCompressing(true);
    
    try {
      // Получаем токен для передачи через query parameter
      // (EventSource не поддерживает кастомные заголовки)
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      
      // Создаём SSE соединение для отслеживания прогресса с токеном в query
      const sseUrl = token 
        ? `/api/compression/compress-stream/${chatId}?token=${token}`
        : `/api/compression/compress-stream/${chatId}`;
      
      // Закрываем предыдущее соединение если есть
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;
      
      const result: CompressionResult = await new Promise((resolve, reject) => {
        // Обработка входящих событий
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Игнорируем событие подключения
            if (data.type === 'connected') {
              console.log('[useCompression] SSE connected');
              return;
            }
            
            if (data.type === 'progress') {
              // Обновляем прогресс
              setCompressionProgress({
                currentBlock: data.currentBlock,
                totalBlocks: data.totalBlocks,
                status: data.status,
                title: data.title,
              });
            } else if (data.type === 'complete') {
              // Сжатие завершено
              const completeData = data as CompressionCompleteEvent;
              
              // Обновляем список блоков
              const parsedBlocks: ChatBlockWithParsedIds[] = completeData.blocks.map(block => ({
                ...block,
                original_message_ids: JSON.parse(block.original_message_ids || '[]')
              }));
              setBlocks(parsedBlocks);
              
              // Закрываем SSE соединение
              eventSource.close();
              eventSourceRef.current = null;
              
              resolve({
                success: true,
                blocks: completeData.blocks,
                originalCount: completeData.originalCount,
                compressedCount: completeData.compressedCount,
                tokenSavings: completeData.tokenSavings,
              });
            } else if (data.type === 'error') {
              // Ошибка
              const errorData = data as CompressionErrorEvent;
              
              // Закрываем SSE соединение
              eventSource.close();
              eventSourceRef.current = null;
              
              reject(new Error(errorData.error));
            }
          } catch (parseError) {
            console.error('[useCompression] Error parsing SSE data:', parseError);
          }
        };
        
        // Обработка ошибок соединения
        eventSource.onerror = (error) => {
          console.error('[useCompression] SSE connection error:', error);
          
          // Закрываем SSE соединение
          eventSource.close();
          eventSourceRef.current = null;
          
          reject(new Error('SSE connection error'));
        };
      });
      
      return result;
    } catch (error) {
      console.error('[useCompression] Error compressing:', error);
      return null;
    } finally {
      setIsCompressing(false);
      // Сбрасываем прогресс
      setCompressionProgress({
        currentBlock: 0,
        totalBlocks: 0,
        status: '',
      });
    }
  }, [chatId]);

  /**
   * Запустить сжатие выделенного диапазона через SSE (с прогрессом)
   */
  const compressSelected = useCallback(async (startMessageId: number, endMessageId: number): Promise<CompressionSelectedResult | null> => {
    setIsCompressing(true);
    
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      const sseUrl = token 
        ? `/api/compression/compress-selected-stream/${chatId}?token=${token}&startMessageId=${startMessageId}&endMessageId=${endMessageId}`
        : `/api/compression/compress-selected-stream/${chatId}?startMessageId=${startMessageId}&endMessageId=${endMessageId}`;
      
      // Закрываем предыдущее соединение если есть
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;
      
      const result: CompressionSelectedResult = await new Promise((resolve, reject) => {
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
              console.log('[useCompression] SSE connected for selected compression');
              return;
            }
            
            if (data.type === 'progress') {
              setCompressionProgress({
                currentBlock: data.currentBlock,
                totalBlocks: data.totalBlocks,
                status: data.status,
                title: data.title,
              });
            } else if (data.type === 'complete') {
              const parsedBlock: ChatBlockWithParsedIds = {
                ...data.block,
                original_message_ids: JSON.parse(data.block.original_message_ids || '[]')
              };
              setBlocks(prev => [...prev, parsedBlock]);
              
              eventSource.close();
              eventSourceRef.current = null;
              
              resolve({
                success: true,
                block: data.block as any
              });
            } else if (data.type === 'error') {
              eventSource.close();
              eventSourceRef.current = null;
              
              reject(new Error(data.error));
            }
          } catch (parseError) {
            console.error('[useCompression] Error parsing SSE data:', parseError);
          }
        };
        
        eventSource.onerror = (error) => {
          console.error('[useCompression] SSE connection error:', error);
          eventSource.close();
          eventSourceRef.current = null;
          reject(new Error('SSE connection error'));
        };
      });
      
      return result;
    } catch (error) {
      console.error('[useCompression] Error compressing selected:', error);
      return null;
    } finally {
      setIsCompressing(false);
      setCompressionProgress({
        currentBlock: 0,
        totalBlocks: 0,
        status: '',
      });
    }
  }, [chatId]);

  /**
   * Откат последнего сжатия
   */
  const undoLastCompression = useCallback(async (): Promise<UndoResponse | null> => {
    if (!chatId) return null;
    try {
      const response = await fetch(`/api/compression/undo/${chatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to undo compression');
      }

      const data: UndoResponse = await response.json();
      
      if (data.success) {
        // Удаляем последний блок
        setBlocks(prev => prev.slice(0, -1));
      }
      
      return data;
    } catch (error) {
      console.error('[useCompression] Error undoing:', error);
      return null;
    }
  }, [chatId]);

  /**
   * Запустить режим выделения сообщений
   */
  const startSelection = useCallback(() => {
    setIsSelectionMode(true);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, []);

  /**
   * Отменить режим выделения
   */
  const cancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, []);

  /**
   * Обработать клик по сообщению в режиме выделения
   */
  const handleSelectionClick = useCallback((messageId: number) => {
    if (selectionStart === null) {
      // Первое выделение
      setSelectionStart(messageId);
      setSelectionEnd(messageId);
    } else if (selectionEnd !== null && messageId !== selectionStart) {
      // Второе выделение - запускаем сжатие
      const start = Math.min(selectionStart, messageId);
      const end = Math.max(selectionStart, messageId);
      
      // Сбрасываем выделение
      setIsSelectionMode(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      
      // Запускаем сжатие выделенного диапазона
      compressSelected(start, end);
    }
  }, [selectionStart, selectionEnd, compressSelected]);

  /**
   * Откат последнего сжатия (альтернативное имя)
   */
  const undo = useCallback(async (): Promise<UndoResponse | null> => {
    try {
      const response = await fetch(`/api/compression/undo/${chatId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to undo compression');
      }

      const data: UndoResponse = await response.json();
      
      if (data.success) {
        // Удаляем последний блок
        setBlocks(prev => prev.slice(0, -1));
      }
      
      return data;
    } catch (error) {
      console.error('[useCompression] Error undoing:', error);
      return null;
    }
  }, [chatId]);

  /**
   * Проверка необходимости сжатия
   */
  const checkNeedsCompression = useCallback(async (): Promise<NeedsCompressionResponse | null> => {
    try {
      const response = await fetch(`/api/compression/needs/${chatId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to check compression needs');
      }

      const data: NeedsCompressionResponse = await response.json();
      setNeedsCompression(data.needsCompression);
      setCompressionPercentage(data.percentage);
      
      return data;
    } catch (error) {
      console.error('[useCompression] Error checking needs:', error);
      return null;
    }
  }, [chatId]);

  /**
   * Редактирование блока
   */
  const editBlock = useCallback(async (blockId: number, updates: EditBlockParams): Promise<ChatBlockWithParsedIds | null> => {
    try {
      const response = await fetch(`/api/compression/block/${blockId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update block');
      }

      const updatedBlock = await response.json();
      
      return {
        ...updatedBlock,
        original_message_ids: JSON.parse(updatedBlock.original_message_ids || '[]')
      } as ChatBlockWithParsedIds;
    } catch (error) {
      console.error('[useCompression] Error editing block:', error);
      return null;
    }
  }, []);

  /**
   * Переключение сжатия для блока
   */
  const toggleCompression = useCallback(async (blockId: number, isCompressed: boolean): Promise<ChatBlockWithParsedIds | null> => {
    return editBlock(blockId, { is_compressed: isCompressed });
  }, [editBlock]);

  /**
   * Удаление блока
   */
  const deleteBlock = useCallback(async (blockId: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/compression/block/${blockId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete block');
      }

      const data: { success: boolean } = await response.json();
      
      if (data.success) {
        // Удаляем блок из списка
        setBlocks(prev => prev.filter(block => block.id !== blockId));
      }
      
      return data.success;
    } catch (error) {
      console.error('[useCompression] Error deleting block:', error);
      return false;
    }
  }, []);

  /**
   * Загрузка блоков для чата
   */
  const loadBlocks = useCallback(async (): Promise<ChatBlockWithParsedIds[] | null> => {
    try {
      const response = await fetch(`/api/compression/blocks/${chatId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load blocks');
      }

      const data: ChatBlock[] = await response.json();
      
      // Парсим original_message_ids
      const parsedBlocks: ChatBlockWithParsedIds[] = data.map(block => ({
        ...block,
        original_message_ids: JSON.parse(block.original_message_ids || '[]')
      }));
      
      setBlocks(parsedBlocks);
      
      return parsedBlocks;
    } catch (error) {
      console.error('[useCompression] Error loading blocks:', error);
      return null;
    }
  }, [chatId]);

  /**
   * Сброс всех блоков для чата
   */
  const resetBlocks = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`/api/compression/reset/${chatId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to reset blocks');
      }

      const data: { success: boolean } = await response.json();
      
      if (data.success) {
        setBlocks([]);
      }
      
      return data.success;
    } catch (error) {
      console.error('[useCompression] Error resetting blocks:', error);
      return false;
    }
  }, [chatId]);

  return {
    blocks,
    isCompressing,
    needsCompression,
    compressionPercentage,
    compressionProgress,
    compress,
    compressSelected,
    undoLastCompression,
    undo,
    checkNeedsCompression,
    editBlock,
    toggleCompression,
    deleteBlock,
    loadBlocks,
    resetBlocks,
    // Для ручного выделения
    isSelectionMode,
    selectionStart,
    selectionEnd,
    startSelection,
    cancelSelection,
    handleSelectionClick,
  };
}