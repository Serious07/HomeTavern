/**
 * useContextStats - React hook для получения и обновления данных о токенах
 * 
 * Обновляется только по событиям:
 * - При переключении чата (изменение chatId)
 * - При загрузке первого чата
 * - По ручному вызову sync() (после генерации, отправки, удаления сообщения и т.д.)
 * 
 * НЕ выполняет периодический polling.
 */

import { useState, useEffect, useCallback } from 'react';
import { contextApi, ContextStats } from '../services/api';

export interface UseContextStatsReturn {
  stats: ContextStats | null;
  isLoading: boolean;
  error: string | null;
  sync: () => Promise<void>;
}

/**
 * Hook для получения статистики токенов чата
 * 
 * @param chatId - ID чата для получения статистики
 * @param options - Опции:
 *   - enabled: включить/выключить hook (default: true)
 *   - syncOnMount: синхронизировать при монтировании (default: true)
 */
export function useContextStats(
  chatId: number | null,
  options: {
    enabled?: boolean;
    syncOnMount?: boolean;
  } = {}
): UseContextStatsReturn {
  const {
    enabled = true,
    syncOnMount = true,
  } = options;

  const [stats, setStats] = useState<ContextStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Синхронизация при монтировании / переключении чата
  useEffect(() => {
    if (chatId && enabled && syncOnMount) {
      sync();
    } else {
      setIsLoading(false);
    }
  }, [chatId, enabled, syncOnMount, sync]);

  return {
    stats,
    isLoading,
    error,
    sync,
  };
}

