import React from 'react';
import { diagLog } from '../../utils/diagnostics';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Ловит ошибки РЕНДЕРА React и показывает вменяемый экран вместо пустой страницы.
 *
 * Про ограничения — честно: падение render-процесса Chrome из-за нехватки памяти
 * («Опаньки…») этот барьер НЕ ловит. Такой крах убивает процесс целиком, и
 * дотянуть до перезагрузки может только то, что уже записано в sessionStorage.
 * Для таких случаев служит кольцевой буфер следов из utils/diagnostics
 * (__htDiagDump в консоли).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const stack = (info.componentStack || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' <- ');
    diagLog('react-error', `${error.name}: ${error.message}${stack ? ` | ${stack}` : ''}`);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-xl p-6 space-y-4">
          <h1 className="text-lg font-semibold">Интерфейс аварийно остановлен</h1>
          <p className="text-sm text-gray-400">
            Переписка сохраняется на сервере по мере отправки, так что сообщения не потеряны.
            Перезагрузите страницу — обычно этого достаточно.
          </p>
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer select-none">Подробности ошибки</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words bg-gray-900 rounded p-3">
              {error.name}: {error.message}
            </pre>
          </details>
          <button
            onClick={this.handleReload}
            className="w-full p-3 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
          >
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;