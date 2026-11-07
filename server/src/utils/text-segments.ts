/**
 * Утилита поабзацного (по строкового) сопоставления оригинала и перевода.
 *
 * Единица сопоставления — строка текста (разделитель — любой перевод строки).
 * Пары хранятся в исходном направлении: a — строка content, b — строка translated_content.
 * Пустые строки считаются структурными разделителями и всегда сопоставляются только с пустыми.
 */

export interface SegmentPair {
  a: string; // строка из content
  b: string; // строка из translated_content
}

export type EditedField = 'content' | 'translated_content';

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function isStructuralLine(line: string): boolean {
  return line.trim() === '';
}

/**
 * Строит пары построчно. Возвращает null, если тексты нельзя сопоставить:
 * разное число строк или несовпадение структурных (пустых) строк.
 */
export function buildPairs(contentLines: string[], translatedLines: string[]): SegmentPair[] | null {
  if (contentLines.length !== translatedLines.length) {
    return null;
  }
  const pairs: SegmentPair[] = [];
  for (let i = 0; i < contentLines.length; i++) {
    const a = contentLines[i];
    const b = translatedLines[i];
    if (isStructuralLine(a) !== isStructuralLine(b)) {
      return null;
    }
    pairs.push({ a, b });
  }
  return pairs;
}

export function tryBuildPairsFromTexts(content: string, translatedContent: string): SegmentPair[] | null {
  return buildPairs(splitLines(content), splitLines(translatedContent));
}

export function serializeSegments(pairs: SegmentPair[]): string {
  return JSON.stringify(pairs.map((p) => [p.a, p.b]));
}

export function parseSegments(raw: string | null | undefined): SegmentPair[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const pairs: SegmentPair[] = [];
    for (const item of data) {
      if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || typeof item[1] !== 'string') {
        return null;
      }
      pairs.push({ a: item[0], b: item[1] });
    }
    return pairs;
  } catch {
    return null;
  }
}

/**
 * Пары валидны, только если точь-в-точь воспроизводят текущие оба поля сообщения.
 */
export function pairsMatchMessage(
  pairs: SegmentPair[],
  content: string,
  translatedContent: string | null | undefined,
): boolean {
  if (translatedContent == null) return false;
  return (
    pairs.map((p) => p.a).join('\n') === content &&
    pairs.map((p) => p.b).join('\n') === translatedContent
  );
}

/**
 * LCS по строкам: возвращает пары индексов [oldIdx, newIdx] совпавших строк
 * в порядке возрастания. Сравнение нормализованное (trim).
 * Для больших текстов (n*m > maxCells) возвращает null — дифф слишком дорогой.
 */
export function lcsAlign(
  oldLines: string[],
  newLines: string[],
  maxCells: number = 250_000,
): Array<[number, number]> | null {
  const n = oldLines.length;
  const m = newLines.length;
  if (n * m > maxCells) return null;

  const keys = (lines: string[]) => lines.map((l) => (isStructuralLine(l) ? '' : l.trim()));
  const oldKeys = keys(oldLines);
  const newKeys = keys(newLines);

  const dp: Int32Array = new Int32Array((n + 1) * (m + 1));
  const idx = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[idx(i, j)] =
        oldKeys[i] === newKeys[j] && oldKeys[i] !== ''
          ? dp[idx(i + 1, j + 1)] + 1
          : Math.max(dp[idx(i + 1, j)], dp[idx(i, j + 1)]);
    }
  }

  const matched: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldKeys[i] === newKeys[j] && oldKeys[i] !== '') {
      matched.push([i, j]);
      i++;
      j++;
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}

/**
 * Результат планирования инкрементального перевода.
 * pairs — новые пары (уже в направлении content/translated_content),
 * translateIdx — индексы строк в pairs, чью OTHER-сторону нужно перевести заново.
 */
export interface IncrementalPlan {
  pairs: SegmentPair[];
  translateIdx: number[];
  reusedCount: number;
}

/**
 * Строит новый набор пар после редактирования одной из сторон.
 * Возвращает null, если инкрементальный путь неприменим (нужен полный перевод).
 * minReuseRatio — минимальная доля переиспользованных непустых строк;
 * ниже неё выгоднее и точнее перевести текст целиком.
 */
export function planIncrementalEdit(
  oldPairs: SegmentPair[],
  editedField: EditedField,
  newText: string,
  minReuseRatio: number = 0.4,
): IncrementalPlan | null {
  const takeOther = (p: SegmentPair): string => (editedField === 'content' ? p.b : p.a);
  const put = (edited: string, other: string): SegmentPair =>
    editedField === 'content' ? { a: edited, b: other } : { a: other, b: edited };

  const oldLines = oldPairs.map((p) => (editedField === 'content' ? p.a : p.b));
  const newLines = splitLines(newText);

  const matched = lcsAlign(oldLines, newLines);
  if (!matched) return null;

  const matchedNew = new Map<number, number>();
  for (const [oi, ni] of matched) {
    matchedNew.set(ni, oi);
  }

  const pairs: SegmentPair[] = [];
  const translateIdx: number[] = [];
  let reusedCount = 0;
  let nonBlankNew = 0;

  for (let ni = 0; ni < newLines.length; ni++) {
    const newLine = newLines[ni];
    if (isStructuralLine(newLine)) {
      pairs.push(put(newLine, ''));
      continue;
    }
    nonBlankNew++;
    const oi = matchedNew.get(ni);
    if (oi !== undefined) {
      pairs.push(put(newLine, takeOther(oldPairs[oi])));
      reusedCount++;
    } else {
      pairs.push(put(newLine, ''));
      translateIdx.push(pairs.length - 1);
    }
  }

  if (nonBlankNew > 0 && reusedCount / nonBlankNew < minReuseRatio) {
    return null;
  }
  return { pairs, translateIdx, reusedCount };
}
