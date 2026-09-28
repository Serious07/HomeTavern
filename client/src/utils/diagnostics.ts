/**
 * Минимальная самодиагностика клиента.
 *
 * Зачем. «Опаньки…» в Chrome — это падение render-процесса вкладки, а не ошибка
 * React: такой крах не ловится ни try/catch, ни ErrorBoundary, и в консоли после
 * перезагрузки не остаётся ничего. sessionStorage при этом ПЕРЕЖИВАЕТ падение и
 * перезагрузку в той же вкладке, поэтому кольцевой буфер «следов» событий,
 * записанный сюда, даёт шанс увидеть, что происходило в последние секунды до
 * краха.
 *
 * Как посмотреть после краха: открыть консоль вкладки и выполнить
 *     __htDiagDump()
 * Очистить: __htDiagClear()
 *
 * Важно: здесь намеренно нет console.log — сами логи удерживают строки в памяти.
 */

const BUFFER_KEY = 'ht_diag_v1';
const MAX_ENTRIES = 300;
const MAX_MSG = 180;

export interface DiagEntry {
  /** метка времени, Date.now() */
  t: number;
  /** род события: boot | mem | err | rej | react-error | stream-* | send | pagehide */
  k: string;
  /** короткое сообщение (обрезано до MAX_MSG) */
  m?: string;
  /** использованная куча, байты (есть только в Chromium: performance.memory) */
  heap?: number;
  /** размер кучи, байты */
  total?: number;
  /** количество DOM-узлов в момент события */
  dom?: number;
  /** адрес страницы */
  url?: string;
}

interface PerfMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function perfMemory(): PerfMemory | undefined {
  const p = performance as unknown as { memory?: PerfMemory };
  return p.memory;
}

function domNodeCount(): number {
  try {
    return document.getElementsByTagName('*').length;
  } catch {
    return -1;
  }
}

function readBuffer(): DiagEntry[] {
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBuffer(list: DiagEntry[]): void {
  try {
    sessionStorage.setItem(BUFFER_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    // Переполнение квоты sessionStorage или приватный режим — молча игнорируем:
    // диагностика не должна ломать работу приложения.
  }
}

/** Записать один «след» события. */
export function diagLog(kind: string, message?: string, extra?: Partial<DiagEntry>): void {
  const entry: DiagEntry = {
    t: Date.now(),
    k: kind,
    ...(message ? { m: message.slice(0, MAX_MSG) } : {}),
    url: typeof location !== 'undefined' ? location.pathname : undefined,
    ...extra,
  };
  const list = readBuffer();
  list.push(entry);
  writeBuffer(list);
}

/**
 * Периодический «пульс» памяти. Кадровая частота не нужна — важна динамика:
 * растёт ли куча монотонно на длинном чате и сколько узлов в DOM.
 *
 * Подсчёт DOM-узлов обходит дерево, поэтому вызывается редко (по умолчанию 15 с),
 * а не на каждом изменении.
 */
export function startMemoryHeartbeat(intervalMs = 15000): void {
  const w = window as unknown as { __htDiagTimer?: number };
  // При горячей перезагрузке модуля в dev старый интервал остался бы висеть —
  // снимаем его, иначе счётчики удваивались бы после каждой правки кода.
  if (w.__htDiagTimer !== undefined) {
    window.clearInterval(w.__htDiagTimer);
  }
  w.__htDiagTimer = window.setInterval(() => {
    const mem = perfMemory();
    diagLog('mem', undefined, {
      heap: mem?.usedJSHeapSize,
      total: mem?.totalJSHeapSize,
      dom: domNodeCount(),
    });
  }, intervalMs);
}

/** Глобальные обработчики непойманных ошибок и отказов промисов. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    const where = event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : '';
    diagLog('err', `${event.message}${where}`);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason =
      event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : String(event.reason);
    diagLog('rej', reason);
  });

  document.addEventListener('visibilitychange', () => {
    diagLog('visibility', document.visibilityState);
  });

  window.addEventListener('pagehide', (event) => {
    diagLog('pagehide', event.persisted ? 'bfcache' : 'closing');
  });
}

function formatEntry(e: DiagEntry): string {
  const time = new Date(e.t).toISOString().slice(11, 23);
  const parts = [time, e.k];
  if (e.heap !== undefined) parts.push(`heap=${Math.round(e.heap / 1048576)}MiB`);
  if (e.dom !== undefined && e.dom >= 0) parts.push(`dom=${e.dom}`);
  if (e.m) parts.push(e.m);
  if (e.url) parts.push(e.url);
  return parts.join(' | ');
}

/**
 * Доступ из консоли браузера: __htDiagDump() / __htDiagClear().
 * Именно это и нужно после «Опаньки…», чтобы увидеть последние события.
 */
export function exposeDiagnostics(): void {
  const w = window as unknown as {
    __htDiagDump?: () => string;
    __htDiagClear?: () => void;
    __htDiagRaw?: () => DiagEntry[];
  };
  w.__htDiagDump = () => readBuffer().map(formatEntry).join('\n');
  w.__htDiagRaw = () => readBuffer();
  w.__htDiagClear = () => {
    try {
      sessionStorage.removeItem(BUFFER_KEY);
    } catch {
      // ignore
    }
  };
}