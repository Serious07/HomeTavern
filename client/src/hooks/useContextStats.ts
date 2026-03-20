/**
 * useContextStats - React hook для получения и обновления данных о токенах
 * 
 * Использует polling для периодического обновления данных с сервера
 * Поддерживает принудительную синхронизацию с llama.cpp
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { contextApi, ContextStats } from '../services/api';

export interface UseContextStatsReturn {
  stats: ContextStats | null;
  isLoading: boolean;
  error: string | null;
  sync: () => Promise<void>;
  startAutoSync: (intervalMs?: number) => void;
  stopAutoSync: () => void;
}

/**
 * Hook для получения статистики токенов чата
 * 
 * @param chatId - ID чата для получения статистики
 * @param options - Опции:
 *   - enabled: включить/выключить автоматическое обновление (default: true)
 *   - intervalMs: интервал автообновления в мс (default: 30000 = 30 сек)
 *   - syncOnMount: синхронизировать при монтировании (default: true)
 */
export function useContextStats(
  chatId: number | null,
  options: {
    enabled?: boolean;
    intervalMs?: number;
    syncOnMount?: boolean;
  } = {}
): UseContextStatsReturn {
  const {
    enabled = true,
    intervalMs = 30000, // 30 секунд по умолчанию
    syncOnMount = true,
  } = options;

  const [stats, setStats] = useState<ContextStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Функция синхронизации с сервером
  const sync = useCallback(async () => {
    if (!chatId || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await contextApi.getStats(chatId, true); // force sync
      setStats(response.data);
    } catch (err: any) {
      console.error('[useContextStats] Error syncing:', err);
      setError(err.response?.data?.error || 'Ошибка при синхронизации');
    } finally {
      setIsLoading(false);
    }
  }, [chatId, enabled]);

  // Функция запуска автоматической синхронизации
  const startAutoSync = useCallback((customIntervalMs?: number) => {
    if (!chatId || !enabled) return;

    // Останавливаем предыдущий интервал если есть
    stopAutoSync();

    const effectiveInterval = customIntervalMs || intervalMs;
    
    console.log(`[useContextStats] Starting auto-sync every ${effectiveInterval}ms for chat ${chatId}`);
    
    intervalRef.current = window.setInterval(() => {
      sync().catch((err) => {
        console.error('[useContextStats] Auto-sync error:', err);
      });
    }, effectiveInterval);
  }, [chatId, enabled, intervalMs, sync]);

  // Функция остановки автоматической синхронизации
  const stopAutoSync = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('[useContextStats] Auto-sync stopped');
    }
  }, []);

  // Синхронизация при монтировании
  useEffect(() => {
    if (chatId && enabled && syncOnMount) {
      sync();
    } else {
      setIsLoading(false);
    }

    return () => {
      stopAutoSync();
    };
  }, [chatId, enabled, syncOnMount, sync, stopAutoSync]);

  // Автоматическая синхронизация при переключении чата
  useEffect(() => {
    if (chatId && enabled) {
      // Запускаем авто-синхронизацию через 2 секунды после переключения
      // чтобы не перегружать сервер при быстрой навигации
      const timeoutId = window.setTimeout(() => {
        startAutoSync();
      }, 2000);

      return () => {
        window.clearTimeout(timeoutId);
        stopAutoSync();
      };
    }
  }, [chatId, enabled, startAutoSync, stopAutoSync]);

  return {
    stats,
    isLoading,
    error,
    sync,
    startAutoSync,
    stopAutoSync,
  };
}

/**
 * Hook для использования во время генерации сообщения
 * Обновляет статистику каждые 2 секунды
 */
export function useContextStatsDuringGeneration(
  chatId: number | null,
  isGenerating: boolean
): {
  stats: ContextStats | null;
  sync: () => Promise<void>;
} {
  const [stats, setStats] = useState<ContextStats | null>(null);
  const intervalRef = useRef<number | null>(null);

  const sync = useCallback(async () => {
    if (!chatId) return;

    try {
      const response = await contextApi.getStats(chatId, true);
      setStats(response.data);
    } catch (err: any) {
      console.error('[useContextStatsDuringGeneration] Error syncing:', err);
    }
  }, [chatId]);

  // Запускаем синхронизацию каждые 2 секунды во время генерации
  useEffect(() => {
    if (isGenerating && chatId) {
      // Немедленная синхронизация при начале генерации
      sync();

      intervalRef.current = window.setInterval(() => {
        sync().catch((err) => {
          console.error('[useContextStatsDuringGeneration] Periodic sync error:', err);
        });
      }, 2000);

      return () => {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [isGenerating, chatId, sync]);

  return { stats, sync };
}
