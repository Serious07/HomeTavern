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
