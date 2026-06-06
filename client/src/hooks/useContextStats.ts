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
  setGenerating: (generating: boolean) => void;
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
  const isGeneratingRef = useRef<boolean>(false);

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

  // Функция остановки автоматической синхронизации (должна быть первой, так как используется setGenerating)
  const stopAutoSync = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Функция запуска автоматической синхронизации
  const startAutoSync = useCallback((customIntervalMs?: number) => {
    if (!chatId || !enabled) return;

    // Останавливаем предыдущий интервал если есть
    stopAutoSync();

    const effectiveInterval = customIntervalMs || intervalMs;

    // ВАЖНО: Не запускаем polling, если идет генерация (чтобы не конфликтовать с длинными запросами к llama.cpp)
    if (isGeneratingRef.current) {
      console.log('[useContextStats] Auto-sync skipped - generation in progress');
      return;
    }

    intervalRef.current = window.setInterval(() => {
      // Проверяем флаг генерации внутри интервала
      if (isGeneratingRef.current) {
        console.log('[useContextStats] Auto-sync skipped - generation in progress');
        return;
      }
      sync().catch((err) => {
        console.error('[useContextStats] Auto-sync error:', err);
      });
    }, effectiveInterval);
  }, [chatId, enabled, intervalMs, sync, stopAutoSync]);

  // Функция установки флага генерации (использует stopAutoSync и startAutoSync)
  const setGenerating = useCallback((generating: boolean) => {
    isGeneratingRef.current = generating;
    if (generating) {
      console.log('[useContextStats] Generation started - pausing context stats polling');
      stopAutoSync();
    } else {
      console.log('[useContextStats] Generation ended - resuming context stats polling');
      startAutoSync();
    }
  }, [stopAutoSync, startAutoSync]);

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

  return {
    stats,
    isLoading,
    error,
    sync,
    startAutoSync,
    stopAutoSync,
    setGenerating,
  };
}

/**
 * Hook для использования во время генерации сообщения
 * НЕ выполняет синхронизацию во время генерации (чтобы избежать лишних API вызовов к llama.cpp)
 * Статистика доступна только после завершения генерации
 */
export function useContextStatsDuringGeneration(
  chatId: number | null,
  isGenerating: boolean
): {
  stats: ContextStats | null;
  sync: () => Promise<void>;
} {
  const [stats, setStats] = useState<ContextStats | null>(null);

  const sync = useCallback(async () => {
    if (!chatId) return;

    try {
      const response = await contextApi.getStats(chatId, true);
      setStats(response.data);
    } catch (err: any) {
      console.error('[useContextStatsDuringGeneration] Error syncing:', err);
    }
  }, [chatId]);

  // НЕ выполняем синхронизацию во время генерации (избегаем лишних API вызовов к llama.cpp)
  // Синхронизация может быть вызвана вручную после завершения генерации
  useEffect(() => {
    // Ничего не делаем во время генерации
  }, [isGenerating, chatId]);

  return { stats, sync };
}
